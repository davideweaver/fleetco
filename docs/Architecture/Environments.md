---
status: current
summary: Two environments, why there is no staging, parity rules
created: 2026-10-09
updated: 2026-11-08
tags: [fleetco, architecture, environments, iac, aws]
source: Claude Code (Xerro)
---

## Overview

How many deployed environments exist, what each is for, and the consequences that fall out.

> **Rewritten 2026-11-08 (ADR-029), superseding ADR-024.** This document previously described a
> phased progression to a persistent `staging` environment on synthetic data, then a `dev`
> environment at cutover. A plan to make `staging` run against *production* resources was then
> written and reviewed, and the review found seven serious problems with it. The outcome of that
> work is a **two-environment** model. Full option analysis in [[Environment Strategy Options]];
> the buildout is [[AWS Buildout]].

**Decision: two deployed environments, `prod` and `dev`. No staging environment.** Next-version work
is exercised by feature flags, a test business inside production, and a clone-and-dry-run gate on
every release.

## What Each Environment Is For

| Environment | Purpose — the thing only it can do | Persistence |
|---|---|---|
| **Local** | Day-to-day development, offline, free | Per developer |
| **CI** | Catch migration-order and clean-install bugs; run the leak suite | Minutes |
| **`dev`** | Validate against *real AWS infrastructure* — IAM, security groups, ALB, SSE through a real load balancer, S3 permissions, email delivery. Also where work is demonstrated and where a link gets sent | Always on, scaled to zero off-hours |
| **`production`** | The business runs on it | Always on |
| **Release-time clone** | A copy-on-write clone of production, created by the release pipeline, migrated against, then destroyed | Minutes |

**The most valuable thing `dev` does is not "test the features"** — local and CI do that. Its job is
to catch **"works locally, breaks on Fargate"**: a missing IAM permission, a security group rule, the
ALB idle timeout killing SSE, an S3 bucket policy, a mail service refusing to send. Those are
invisible until something real runs in a real VPC.

## Why There Is No Staging Environment

A staging environment exists to answer two questions, and each has a cheaper answer here.

**"Can someone try the new thing before everyone gets it?"** → **A feature flag.** The feature ships
to production switched off, then on for Dave, then Cameron, then everyone. Per *feature* rather than
per *release*, which fits incremental delivery better. And **a test business inside production**
gives somewhere to do that without touching OTC's books — see [[AWS Buildout]].

**"Will this migration behave against real data?"** → **The release-time clone.** The pipeline
clones production's database, runs the release's migrations against the copy, records the timing and
destroys it. Aurora cloning is copy-on-write, so this is near-instant and near-free.

**Why the clone is in the normal release path rather than an on-demand tool:** on-demand rehearsal
rots. The realistic failure is a frightening migration arriving, the script being broken from disuse,
and the release shipping unrehearsed because it is already late.

**What a staging environment would uniquely still provide** is a rehearsal for changes that cannot
be flag-gated — a framework major, a large refactor, a dependency bump with real surface area. Those
go to everyone at once, and the mitigation is release hygiene: ship them alone, during business
hours, with the rollback command ready.

## The Deferred Option, And Its Trigger

**A staging environment on a *clone* of production — never on production itself — is deferred, not
rejected.** It is about a day of work to add, because everything it needs gets built anyway:
environment-parameterized Terraform modules, runtime UI config, build-once-promote-the-artifact, and
the clone automation.

**Trigger: the first change that cannot be put behind a flag and that makes Dave nervous.** At that
point it can be ephemeral — applied for a week, then destroyed — because the module will exist.

**Recorded so it is not re-litigated: a staging environment pointed at the *live* production
database is ruled out permanently.** It puts two code versions on one database continuously, and the
compatibility surface is far wider than the schema — data values, constraints, event payloads,
cached reference data, OAuth refresh tokens, scheduled-job versions. Automated checking covers about
a third of that; the rest becomes standing human vigilance, which is the resource this project has
least of.

## Per-Pull-Request Preview Environments: Dropped

A deployed preview per pull request was nearly free when Neon branching was in the stack. **Dropping
Neon (ADR-023) made it expensive, and the honest conclusion is to drop the previews rather than
engineer around their absence.** On AWS a per-PR preview needs a Fargate service, a target group and
a database clone per pull request. And the thing previews are *for* is letting other people review a
change without checking it out — with one developer, that value is low.

**The industry evidence agrees.** Per-PR environments pay off at roughly tens of engineers and tens
of services; the cost cliff is a real database per environment. At one engineer and one deployable
they are pure cost.

**What replaces it:**

- **Per-PR *frontend* previews on CloudFront** — the build uploads to an S3 preview prefix and a bot
  comments the URL. Cheap, no database, covers the "look at the UI change" case.
- **CI's ephemeral Postgres** covers migration and schema correctness.
- **The release-time clone** covers a genuinely risky migration.

## The Dev Database Workflow

Four tiers, replacing what Neon branching provided.

| Tier | Mechanism | Cost | Covers |
|---|---|---|---|
| 1 | Local Postgres in Docker + seed script | Free | Everyday schema work |
| 2 | CI: ephemeral Postgres, migrate from scratch, seed | Free | Migration-order bugs, clean-install correctness |
| 3 | `dev`, with a generated dataset at realistic volume | Included | Query plans and behaviour at scale. Agents can fill it |
| 4 | **The release-time clone of production** | Pennies | Real data volumes and real data weirdness, on every release |

**Tiers 3 and 4 cover different failure modes and both are needed.** Generated data at volume
catches "this query does a sequential scan at 50,000 rows," because Postgres picks plans from row
counts. It will not catch the customer name with an apostrophe, the invoice with 200 lines, or the
NULL that should not exist — synthetic data is too well-behaved. That is what the clone is for.

**Production data is only ever restored into nonprod scrubbed** (INFRA-049), and a scrubbed restore
is also how the quarterly restore drill is performed.

## Cost, and How to Keep It Down

With one non-production environment there is nothing to share an ALB with, so the sharing tactics in
the earlier version of this document no longer apply. What remains:

1. **Scale `dev` to zero outside business hours.** An EventBridge schedule sets the Fargate desired
   count to 0 at 7pm and 1 at 7am. **This is the one place scale-to-zero is appropriate** — ADR-021
   forbids it in production precisely because a 7am cold start is a bad daily experience.
2. **Aurora Serverless v2 at a 0 ACU floor in `dev`**, so the database auto-pauses when idle.
3. **Right-size hard.** One task, 0.25 vCPU. Non-production needs no redundancy.
4. **Release clones are copy-on-write and destroyed**, so they cost pennies.

| Item | Monthly |
|---|---|
| `dev` — ALB, Aurora auto-paused, Fargate off-hours, CloudFront | **$41–51** |
| Release-time clones | ~$1 |

Full model in [[AWS Buildout]].

## Three Consequences

### 1. Infrastructure as Code Becomes Mandatory

**This is the real cost of a second environment, and it is not money.** Two hand-clicked AWS
environments diverge immediately, and then "it works in staging" stops meaning anything.

So: **Terraform, with the environment as a variable, from the moment the second environment
exists.** One definition, applied twice. A P0 item on the [[Infrastructure Checklist]]. The
Terraform-versus-CDK question is settled in [[AWS Buildout]] (B3): `terraform plan` is a legible
diff of real resources, which makes the plan the artifact Dave reviews instead of the agent's
reasoning.

### 2. Non-Production Must Not Be Able to Touch the Real World

**And neither must a test business.** The guards below apply to `dev` as written. A **test business
inside production** needs the same protections applied per business rather than per environment — an
`is_test` flag enforced in the mailer and the integration adapters, not in configuration. Business
isolation is a *data* boundary; it buys nothing against side effects. See [[AWS Buildout]].

Every one of these is a real incident that has happened to real teams:

| Risk | Structural guard |
|---|---|
| **`dev` or a test business emails invoices to real customers** | Hard allowlist of recipient domains, enforced in the mailer, not by configuration. In non-production, default to a catch-all inbox |
| Non-production sends SMS to real phone numbers | Same allowlist mechanism |
| Non-production holds unscrubbed customer PII | Synthetic or generated data by default; production data only ever restored **scrubbed**, and **the scrubber is tested like production code** (INFRA-049) |
| A QuickBooks sync writes to Fleetco's real books | Sandbox credentials only; refuse to start if a production integration key is present in a non-production environment |
| Dropping the production table while believing it is `dev` | **Separate AWS accounts** — see below |
| A test business inside production emails a real customer | The same allowlist, keyed on the business's `is_test` flag and enforced in the adapters |

**The mailer guard is the one to build first.** It is the most likely of these to actually happen,
and the cheapest to prevent.

### 3. Separate AWS Accounts for Production

**Decision: three AWS accounts — a management account, `prod` and `nonprod` — under one
Organization, with IAM Identity Center.** With no staging environment, nothing deployed in the
production account is anything other than production, so the account boundary is a complete guard
rather than a partial one.

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
- Migration path — the release clone runs migrations from the same files in the same order

**Deliberately different:**
- Instance sizes and task counts — no redundancy needed
- Scale-to-zero schedules
- Data volume, unless specifically load-testing
- Backup retention — non-production needs days, not months
- Alert routing — non-production alerts must never page anyone

## Configuration and Secrets

- One Parameter Store path prefix per environment: `/fleetco/dev/*`, `/fleetco/prod/*`
- **No secret is ever shared between environments.** Separate database credentials, separate API
  keys, separate signing keys
- Config comes entirely from environment variables (ADR-022 rule 2), so the only difference between
  environments is the variable set
- **Sentry environments and separate PostHog projects**, so non-production noise never pollutes
  production error rates or analytics
- **One exception to Parameter Store**: the RDS Data API requires a Secrets Manager secret. Recorded
  in [[AWS Buildout]] (B17) rather than left as a silent contradiction with
  [[Hosting and Deployment]]

## Open Questions

- **Does OTC want a sandbox** to experiment in without affecting real work? Answered by the model
  above: a **test business inside production**, with `is_test` enforced in the integration adapters.
- **Do the load-bearing integrations offer sandboxes?** QuickBooks does; parts catalogs and
  telematics are unknown. Tied to Q6 — if a vendor has no sandbox, that integration can only be
  tested in production, which changes how it must be built (flag-gated, dry-run mode).
- **How is scrubbed production data produced?** The scrubber is real work and load-bearing for
  privacy. It now has a card and an owner — INFRA-049 — because production data is only ever restored
  into nonprod scrubbed.

## Related

- [[AWS Buildout]] — the buildout, the pipeline, and the decision log
- [[Environment Strategy Options]] — the six strategies considered
- [[Hosting and Deployment]] — Fargate, ALB, SSE
- [[Infrastructure Checklist]] — IaC, seed data, the mailer guard
- [[Operations]] — migrations, restore drills, deploy pipeline
- [[Platform Choice]] — why per-PR previews became expensive
- [[Architecture Decisions]] — ADR-029 (supersedes ADR-024), ADR-025, ADR-026
- [[Open Questions]] — Q6 (integrations), Q9 (retention)
