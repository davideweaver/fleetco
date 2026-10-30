---
created: 2026-10-09
tags: [fleetco, architecture, environments, staging, iac, aws]
source: Claude Code (Xerro)
---

## Overview

Non-production environments: how many, what each is for, what they cost, and the two
consequences that fall out of having more than one.

**The core tension: you cannot safely change software a business depends on without somewhere to
try it first — but every persistent environment is another thing that breaks, drifts, and consumes
attention that a one-person team does not have.**

**Decision: start with one shared deployed environment. Split into two when Fleetco needs
stability at the same time Dave needs to break things. Never more than two before tenant two.**

## What Each Environment Is Actually For

| Environment | Purpose — the thing only it can do | Persistence |
|---|---|---|
| **Local** | Day-to-day development, offline, free | Per developer |
| **CI** | Catch migration-order and clean-install bugs; run the cross-tenant leak suite | Minutes |
| **`staging`** | Validate against *real AWS infrastructure* — IAM, security groups, ALB, SSE through a real load balancer, S3 permissions, email delivery. Also Fleetco's review surface | Always on |
| **`dev`** | Somewhere for Dave to break things while `staging` stays stable | Always on — **added later** |
| **`production`** | The business runs on it | Always on |

**The most valuable non-production environment is the first deployed one**, and not for the reason
usually given. Its job is not "test the features" — that is what local and CI do. Its job is to
catch **"works locally, breaks on Fargate"**: a missing IAM permission, a security group rule, the
ALB idle timeout killing SSE, an S3 bucket policy, Resend refusing to send. Those are invisible until
something real runs in a real VPC.

## Progression

Deliberately phased, so environments appear when there is a reason rather than up front.

**Phase 0 — building, before Fleetco reviews anything**
Local plus CI only. **Deploy nothing.** Cheapest possible, and nothing to maintain.

**Phase 1 — Fleetco starts reviewing work**
Add **`staging`**: one persistent deployed environment, seeded with realistic synthetic data,
stable enough for Fleetco to click through. Doubles as the infrastructure-validation environment.

**Phase 2 — at or shortly before cutover**
Add **`dev`**. The trigger is a specific friction: a design partner poking at an environment while
you are mid-change is genuinely disruptive, in both directions. At that point `staging` becomes
production-like — scrubbed production data, migration rehearsal, restore drills, release UAT,
training new shop staff — and `dev` is where things get broken.

**Not planned:** a separate demo or training environment. A seeded tenant inside `staging` covers
both. Resale is a small possibility (Q7); revisit only if that changes.

## Per-Pull-Request Preview Environments: Dropped

An earlier plan called for a deployed preview per pull request, which was nearly free when Neon
branching was in the stack. **Dropping Neon (ADR-023) made that expensive, and the honest
conclusion is to drop the previews rather than engineer around their absence.**

On AWS a per-PR preview would need a Fargate service, an ALB target group, and an Aurora clone per
pull request — real cost and real moving parts. And the thing previews are *for* is letting other
people review a change without checking it out. **With one to three people who can all run it
locally, that value is low.**

**What replaces it:**

- **Vercel preview deployments** for the frontend — free, automatic per pull request, and they
  cover the "look at the UI change" case. Point them at `staging`'s API.
- **CI's ephemeral Postgres** covers migration and schema correctness.
- **Aurora fast clone on demand** for a genuinely risky migration.

## The Dev Database Workflow

Four tiers, replacing what Neon branching provided. Three of the four were already planned on the
[[Infrastructure Checklist]].

| Tier | Mechanism | Cost | Covers | Planned? |
|---|---|---|---|---|
| 1 | Local Postgres in Docker + seed script | Free | Everyday schema work | **P0** |
| 2 | CI: ephemeral Postgres, migrate from scratch, seed | Free | Migration-order bugs, clean-install correctness | **P0** |
| 3 | `staging`, restored from scrubbed production | Included | Real data volumes and real data weirdness | **P1** |
| 4 | **Aurora fast clone, on demand** | Pennies if short-lived | Copy-on-write clone of production for a scary migration | New |

The gap Neon uniquely filled was *production-shaped data, instantly, per pull request*. That
matters most when several people ship risky migrations concurrently. At this team size, tiers 1–3
are sufficient and tier 4 covers the exception.

## Cost, and How to Keep It Down

Naively, each persistent non-production environment is its own ALB ($20), its own Aurora cluster
($45), and its own Fargate tasks ($9) — roughly **$75/month each.** Two of those rivals
production, which is absurd for a system this size.

**Four tactics bring it to ~$20–65 total:**

1. **Share one ALB across all non-production environments** using host-based routing —
   `staging.app.fleetco.com` and `dev.app.fleetco.com` to different target groups. Saves $20 per
   environment.
2. **Share one small Aurora or RDS instance across non-production**, with a separate *database* per
   environment (`fleetco_staging`, `fleetco_dev`). A runaway query in `dev` could affect `staging`,
   which is acceptable for non-production. Saves ~$45 per environment.
3. **Scale non-production to zero outside business hours.** An EventBridge schedule sets Fargate
   desired-count to 0 at 7pm and 1 at 7am. Saves roughly 60%. **This is the one place scale-to-zero
   is appropriate** — ADR-021 forbids it in production precisely because a 7am cold start is a bad
   daily experience, and non-production has no such constraint.
4. **Right-size hard.** One task each, 0.25 vCPU. Non-production does not need redundancy.

| Item | Monthly |
|---|---|
| Shared ALB for all non-prod | $20 |
| Shared non-prod database (one small instance) | $30 |
| Fargate, both environments, scheduled off-hours | $10–15 |
| **Non-production total** | **$60–65**, or **~$20–30** with only `staging` |

## Three Consequences of Having More Than One

### 1. Infrastructure as Code Becomes Mandatory

**This is the real cost of a second environment, and it is not money.** Two hand-clicked AWS
environments diverge immediately, and then "it works in staging" stops meaning anything.

So: **Terraform or AWS CDK, with the environment as a variable, from the moment the second
environment exists.** One definition, applied N times. This is a new P0 item on the
[[Infrastructure Checklist]] and a genuine argument for starting with exactly one environment —
Phase 0 needs no infrastructure code at all.

### 2. Non-Production Must Not Be Able to Touch the Real World

Every one of these is a real incident that has happened to real teams:

| Risk | Structural guard |
|---|---|
| **Staging emails invoices to real customers** | Hard allowlist of recipient domains, enforced in the mailer, not by configuration. In non-production, default to a catch-all inbox |
| Non-production sends SMS to real phone numbers | Same allowlist mechanism |
| Non-production holds unscrubbed customer PII | Synthetic data by default; scrubbed production data only in `staging`, and **the scrubber is tested like production code** |
| A QuickBooks sync writes to Fleetco's real books | Sandbox credentials only; refuse to start if a production integration key is present in a non-production environment |
| Dropping the production table while believing it is `dev` | **Separate AWS accounts** — see below |

**The mailer guard is the one to build first.** It is the most likely of these to actually happen,
and the cheapest to prevent.

### 3. Separate AWS Accounts for Production

**Recommendation: two AWS accounts — `prod` and `nonprod` — under one Organization, with SSO.**

Accounts are free, and this is the single best protection against the worst solo-operator mistake:
running a destructive command against production while believing you are elsewhere. It also gives
clean blast-radius isolation for credentials and a tidy per-environment bill.

Cost: zero dollars, moderate one-time setup (Organizations, IAM Identity Center, cross-account
deploy roles). Worth it before `production` holds real data.

## Environment Parity: Where It Matters and Where It Does Not

Full parity is expensive and mostly pointless. Be deliberate:

**Must match production:**
- Postgres major version
- Node version and the container image itself
- The ALB idle timeout (or SSE behaves differently and the difference is invisible)
- IAM permission *shape*, so a missing permission surfaces before production
- Migration path — `staging` migrations run from the same files in the same order

**Deliberately different:**
- Instance sizes and task counts — no redundancy needed
- Scale-to-zero schedules
- Data volume, unless specifically load-testing
- Backup retention — non-production needs days, not months
- Alert routing — non-production alerts must never page anyone

## Configuration and Secrets

- One Parameter Store path prefix per environment: `/fleetco/staging/*`, `/fleetco/prod/*`
- **No secret is ever shared between environments.** Separate database credentials, separate API
  keys, separate signing keys
- Config comes entirely from environment variables (ADR-022 rule 2), so the only difference between
  environments is the variable set
- **Sentry environments and separate PostHog projects**, so non-production noise never pollutes
  production error rates or analytics

## Open Questions

- **Does Fleetco want their own sandbox** to experiment in without affecting their real work? Post
  cutover this is a real request, and the cheap answer is a dedicated tenant in `staging` rather
  than another environment.
- **Do the load-bearing integrations offer sandboxes?** QuickBooks does; parts catalogs and
  telematics are unknown. Tied to Q6 — if a vendor has no sandbox, that integration can only be
  tested in production, which changes how it must be built (feature-flagged, dry-run mode).
- **How is scrubbed production data produced?** The scrubber is real work and is load-bearing for
  privacy. Needs an owner before `staging` ever receives production data.

## Related

- [[Hosting and Deployment]] — Fargate, ALB, the shared-ALB routing approach
- [[Infrastructure Checklist]] — IaC, seed data, the mailer guard
- [[Operations]] — migrations, restore drills, deploy pipeline
- [[Platform Choice]] — why per-PR previews became expensive
- [[Architecture Decisions]] — ADR-024, ADR-025, ADR-026
- [[Open Questions]] — Q6 (integrations), Q9 (retention)
