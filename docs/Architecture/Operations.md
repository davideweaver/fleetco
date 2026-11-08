---
status: current
summary: Running it: backup, restore, migrations, support, incidents
created: 2026-10-09
updated: 2026-11-08
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
- **Restore drills, quarterly, written up.** An untested backup is a hope. The drill must include:
  restore a scrubbed snapshot into the non-production account, point a `dev` API at it, verify
  invoice totals match. **The release-time clone exercises the same machinery on every release**, so
  the quarterly drill is a verification rather than a first attempt.
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
- **Additive-only is enforced as an allowlist, not a denylist** — a denylist misses
  `ADD CONSTRAINT ... NOT VALID`, a new unique index, `DROP INDEX`, `ALTER COLUMN SET DEFAULT`, DML
  inside a migration file, and sequence resets. And **a new constraint ships in the release after
  the code that satisfies it**, which reverses the usual expand order.
- **`lock_timeout` and `statement_timeout` on the migration connection.** Without them a migration
  that cannot get its lock holds the queue and every write in the application piles up behind it.
- **Data backfills are not migrations.** They are worker commands — idempotent, resumable, batched,
  observable — run between expand and contract. A deploy never waits on one.
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
| **Write attribution** | `application_name` = `<env>@<sha>` per connection | Near-free, and it is what lets a data-repair script be scoped after a bad release |
| Business-level alarms | Custom checks | **The important ones.** See below. |

**Business-level alarms matter more than infrastructure alarms** on a system like this. CPU
being fine is not interesting. These are:

- No invoice has posted in 4 business hours
- The outbox dispatcher has a growing backlog or anything in dead-letter
- Any authentication failure spike, or any cross-tenant authorization denial (should be zero)
- A QuickBooks sync has failed repeatedly
- Any 5xx rate above baseline

## Environments

Full treatment in [[Environments]] and [[AWS Buildout]]. The short version, **revised 2026-11-08
(ADR-029)**:

- **Two deployed environments: `prod` and `dev`.** No staging environment.
- Next-version work is exercised by **feature flags**, a **test business inside production**, and a
  **clone-and-dry-run gate** on every release.
- A staging environment on a *clone* of production is deferred with a trigger; on *live* production
  resources it is ruled out permanently.

Production runs **two Fargate tasks minimum** behind the ALB from the first customer. Not for load —
so that a deploy, a crash, or a memory leak is not an outage. Both tasks also run the in-process
outbox dispatcher, which is safe because `FOR UPDATE SKIP LOCKED` claims each row once.

Three rules that matter operationally: **separate AWS accounts for production and non-production**
(ADR-025 — and with no staging environment this is a complete guard, since nothing deployed in the
production account is anything but production), **infrastructure as code** (ADR-026/030), and
**neither `dev` nor a test business may reach the real world** — a mailer allowlist, sandbox
integration credentials, and an `is_test` flag enforced in the adapters rather than in
configuration.

Platform choice, process topology, and the portability rules are in [[Hosting and Deployment]].

## Deploys

- Push to `main`, CI runs, `dev` deploys on green
- **The leak suite is a required gate.** No override
- Production is a **manual, `v*`-tagged dispatch** naming the artifact built earlier — never a
  rebuild (ADR-031)
- **The release clones production's database and runs the migrations against the copy first**, and
  records the timing. A migration that misbehaves does so against a throwaway clone
- Health check must pass before the old task drains
- **Deploy the API before the UI; roll the UI back before the API.** A new UI against an old API
  fails on endpoints that do not exist yet
- Deploy during business hours deliberately, while someone is awake to notice — a 2am deploy with
  nobody watching is worse than a 2pm one
- **Never deploy on a Friday afternoon** unless fixing something actively broken
- **Ship changes that cannot be flag-gated on their own** — a framework major, a large refactor, a
  dependency bump with real surface area. Those are the releases with no dress rehearsal, so they
  get a release to themselves and the rollback command ready

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
- [[AWS Buildout]] — the buildout, the pipeline, rollback scenarios
- [[Hosting and Deployment]] — platform choice, process groups, deploy pipeline
- [[Environments]] — non-production topology, IaC, the real-world guards
