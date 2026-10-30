---
created: 2026-10-09
tags: [fleetco, architecture, operations, backup, oncall, migrations, sre]
source: Claude Code (Xerro)
---

## Overview

What it takes to *run* this system once a real shop depends on it. For a replacement project
this is an architectural requirement, not an afterthought — the day Fleetco turns FullBay off,
their ability to invoice becomes Dave's operational responsibility.

**The uncomfortable headline: a bus factor of one on software a business runs on is not a
viable end state, and every mitigation below is a partial answer to that single problem.**

See Q13 in [[Open Questions]].

## The Blunt Version of the Risk

FullBay, whatever its faults, has a support organization. The moment Fleetco cuts over, they
trade a stagnant product with a help desk for a better product with **one part-time person who
has a full-time job at ServiceTitan.**

That trade can be worth it. It cannot be made accidentally. Three consequences:

1. The system must degrade gracefully and fail loudly, because nobody is watching it at 3am.
2. Recovery procedures must be written down and executable by someone who is **not** Dave.
3. The support expectation needs to be in writing before cutover — see [[Project Brief]].

## Recovery Objectives

Proposed targets, to be confirmed with Fleetco. These numbers drive real cost, so they deserve
a conversation rather than an assumption.

| Objective | Target | Note |
|---|---|---|
| **RPO** (acceptable data loss) | **< 5 minutes** | Postgres PITR covers this |
| **RTO** (acceptable downtime) | **< 4 hours** on a business day | Honest for a one-person operation |
| Degraded-mode tolerance | Read-only access during an incident | A shop can look things up while writes are broken |

**The question to ask Fleetco:** what does an hour of total downtime actually cost you, in
dollars and in customer trust? If the answer is "we cannot be down during business hours at
all," the architecture is fine but the *staffing* is not, and that changes the project.

## Backup and Restore

- **Point-in-time recovery** via Aurora's continuous backup. Set the retention window to **at
  least 7 days**, ideally 30.
- **An independent logical backup.** `pg_dump` nightly to S3 in a **separate AWS account**
  (ADR-025). Aurora's own backups do not protect against account compromise, a billing lapse, or
  a destructive command run with real credentials — which is the realistic failure mode here.
- **S3 versioning and Object Lock** on the bucket holding defect photos and signed
  authorizations. Those are legal records (Q9) and a bad delete must be recoverable.
- **Restore drills, quarterly, written up.** An untested backup is a hope. The drill must
  include: restore to a fresh database, point a staging API at it, verify invoice totals match.
- **Document the restore procedure as a runbook someone else can follow.** This is the single
  highest-value operational artifact in the project.

## Migrations

The discipline here was accepted as a consequence of choosing Postgres (ADR-002). It got
considerably easier when ADR-006 resolved to a single shared database.

- **Migrations as plain SQL files** in the repository, applied by Drizzle, versioned, forward-only
- **Every migration must be backward-compatible with the currently deployed code** — expand,
  deploy, contract. Never a breaking schema change and a code deploy in one step.
- **No destructive migration without a backup taken immediately prior**, enforced in the deploy
  script rather than by memory
- **A tested rollback path** for every release. "Roll forward only" is a reasonable policy but
  it has to be a *decision*, with a plan for the case where forward is broken.
- **One database, one migration run.** ADR-006 settled on pooled deployment, which removes the
  fan-out migration tooling, per-tenant version tracking, and partial-failure handling that siloed
  deployment would have required before tenant two. Schema drift across N databases was the
  likeliest 6am incident on this project, and it is now simply not possible.

## Observability

Minimum viable, and genuinely minimum — the goal is knowing something is broken before Fleetco
phones. The full phased inventory lives in [[Infrastructure Checklist]]; this section covers only
what matters for running the system day to day.

| Concern | Tool | Note |
|---|---|---|
| Errors | **Sentry** | Non-negotiable. Alerts to phone, not email. |
| Uptime | Any external checker | Hits a real `/health` that touches the database |
| Logs | Provider-native, structured JSON | With a request id on every line |
| Request tracing | A request id threaded through | Not distributed tracing — see [[Evolution Path]] non-goals |
| Business-level alarms | Custom checks | **The important ones.** See below. |

**Business-level alarms matter more than infrastructure alarms** on a system like this. CPU
being fine is not interesting. These are:

- No invoice has posted in 4 business hours
- The outbox dispatcher has a growing backlog or anything in dead-letter
- Any authentication failure spike, or any cross-tenant authorization denial (should be zero)
- A QuickBooks sync has failed repeatedly
- Any 5xx rate above baseline

## Environments

Full treatment in [[Environments]]. The short version:

- **Phase 0** — local plus CI only, nothing deployed
- **Phase 1** — add `staging`, one persistent deployed environment on synthetic data
- **Phase 2** — add `dev` at cutover, so `staging` stays stable for Fleetco and migration rehearsal
- **Never more than two** non-production environments before tenant two

Production runs **two Fargate tasks minimum** behind the ALB from the first customer. Not for load
— so that a deploy, a crash, or a memory leak is not an outage.

Three rules that matter operationally: **separate AWS accounts for production and non-production**
(ADR-025 — the best protection against a destructive command run in the wrong place),
**infrastructure as code from the second environment onward** (ADR-026 — hand-clicked environments
diverge and then "it works in staging" means nothing), and **non-production must be structurally
unable to email real customers.**

Platform choice, process topology, and the portability rules are in [[Hosting and Deployment]].

## Deploys

- Push to main, CI runs tests, deploy on green
- **The cross-tenant leak suite is a required gate.** No override.
- Health check must pass before the old instance drains
- Deploy during business hours deliberately, while someone is awake to notice — a 2am deploy
  with nobody watching is worse than a 2pm one
- **Never deploy on a Friday afternoon** unless fixing something actively broken

## Support

The part most likely to be skipped, and the part that determines whether this project stays
pleasant.

- **One intake channel**, not texts to Dave's personal phone. A shared mailbox or a Slack
  channel, so there is a record and so a second person could eventually cover it.
- **A written severity scale** with response expectations attached. "Cannot invoice" and "a
  column is in the wrong order" are not the same call at 7am.
- **A documented escalation path** for when Dave is unreachable — on vacation, in a meeting, or
  simply asleep. Today the honest answer is "there isn't one," and naming that is more useful
  than pretending otherwise.
- **Impersonation with an audit trail** for support. Being able to see
  what the user sees converts most support calls from 30 minutes to 3. This is why the Better
  Auth admin plugin matters — see [[Auth and Identity]].
- **A status page**, even a trivial one, once there is more than one tenant.

## Security Operations

- Dependency scanning via Dependabot or Renovate, with **auto-merge on patch versions** so
  security patches do not queue behind attention
- Secrets in the hosting provider's secret store. Never in the repository; a pre-commit scanner
  to enforce it
- Quarterly review of who has production database access, with the expectation that it is one
  or two people
- An incident log — what broke, why, what changed as a result. Three entries in, patterns appear

## Cost of Doing This Properly

Already reflected in the [[Stack Evaluation]] model: Sentry at $26, uptime monitoring free to
$10, independent backup storage a few dollars. **Under $50/month** for the whole operational
posture.

The real cost is not money. It is the **standing time commitment** — roughly a few hours a month
when things are healthy, and an unbounded amount when they are not. That is the number that
belongs in the Q3 compensation conversation.

## Open Operational Questions

- **Who is the second person?** (Q13) Until there is an answer, cutover carries a
  single-point-of-failure risk that no architecture fixes.
- **What are Fleetco's actual business hours**, and is there weekend or evening shop work? It
  determines what "off hours" means for deploys and on-call. Tracked as Q15 in [[Open Questions]].
- **What retention do DOT and warranty records legally require?** (Q9) It drives backup
  retention cost and the audit log design.
- **Does Fleetco want to run this themselves eventually?** If so, operational documentation is a
  deliverable rather than a courtesy, and that belongs in the Q3 scope conversation.

## Related

- [[Open Questions]] — Q9 (compliance retention), Q13 (who else maintains this)
- [[Project Brief]] — the support-load risk, named up front
- [[Tenancy Model]] — the pooled deployment decision that simplified this document
- [[Realtime and Events]] — dispatcher monitoring and dead-letter alarms
- [[Auth and Identity]] — impersonation for support
- [[Stack Evaluation]] — cost model
- [[Infrastructure Checklist]] — what has to exist, phased P0/P1/P2
- [[Hosting and Deployment]] — platform choice, process groups, deploy pipeline
- [[Environments]] — non-production topology, IaC, the real-world guards
