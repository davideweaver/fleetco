---
status: artifact
summary: The adversarial review prompt that killed the stage environment
created: 2026-11-07
updated: 2026-11-08
tags: [fleetco, review, prompt, aws, stage, prod]
source: Dave + Claude Code (Xerro)
---

> **Outcome, 2026-11-08.** This review killed the design it was pointed at. Its central finding —
> that a safety property the plan relied on did not exist in the code (the outbox dispatcher runs
> in-process, `main.ts:49`) — plus six others all tracing to one cause, led to dropping the `stage`
> environment entirely. See [[Environment Strategy Options]] and ADR-029.
>
> **Findings that survived the strategy change** became cards in [[AWS Buildout]]: the migration
> checker becomes an allowlist (INFRA-032), repo protections (INFRA-047), scheduled-task image
> versioning (INFRA-048), the scrubber (INFRA-049), correcting the process topology (INFRA-050),
> the Data API bound to a read-only role (B17), and host-only session cookies (B18).
>
> **Kept as a template.** The structure — constraints up front, named soft spots, a concrete failure
> scenario required per finding, and a bounded "propose something better" section ordered last —
> is worth reusing.

Paste everything below the line into a fresh agent session with this repository available.

---

You are reviewing an infrastructure design before any of it is built. Your job is to find what is
wrong with it, not to summarise it or tell me what is good about it. I wrote it with an AI agent and
I want a second, adversarial read.

## Read these first

- `docs/Architecture/AWS Buildout.md` — the plan under review. Read all of it.
- `docs/Architecture/Environments.md` — the *older* plan, which this partly supersedes. Useful for
  seeing what changed and whether the change was reasoned or drifted.
- `docs/Architecture/Hosting and Deployment.md` — Fargate, ALB, SSE, the portability rules.
- `docs/Architecture/Operations.md` — recovery objectives, migration discipline, support reality.
- `docs/Architecture/Realtime and Events.md` — the outbox and the dispatcher.
- `docs/Architecture/Auth and Identity.md` — sessions, cookies and origins. **Read the "Cookies and
  Origins" section carefully; I think the new plan may contradict it.**
- `docs/Architecture/Architecture Decisions.md` — ADR-001 through ADR-028.

## The design in one paragraph

Three environments. `prod` is the business. `stage` is the **next release running against
production's own database, buckets and integrations** — a canary serving real users doing real work,
not a sandbox. `dev` is fully separate with synthetic data. `prod` and `stage` share one AWS account,
one VPC, one Aurora cluster and one load balancer, reached on different hostnames. `dev` is in a
second account. Only `prod` runs the background worker; `stage` runs the API only. Every schema
change must be additive, because `stage`'s next-version code runs against production's current
schema. One built artifact is promoted unchanged from `dev` to `stage` to `prod`. Infrastructure is
Terraform; the pipeline is GitHub Actions.

## The constraints that bound it — do not propose solutions that ignore these

- **One part-time operator.** Dave has a full-time job elsewhere. Bus factor is two, and the second
  person (Cameron) is not a developer.
- Replacing a $5,000/month SaaS product for one pilot customer, a heavy-truck repair shop. Target
  spend is a few hundred dollars a month.
- **Essentially all code is written by AI agents and reviewed by one person.** Review capacity, not
  code volume, is the bottleneck. Designs that need constant human vigilance are worse than designs
  that are structurally safe.
- Decided already and not open: AWS ECS Fargate (not Kubernetes), Aurora Postgres, NestJS, SSE fed
  by a transactional outbox, pooled multi-tenancy in one database, Terraform.
- Invoicing and QuickBooks are in scope. Money correctness matters more than uptime.

## What I want from you

**First, one short section: is `stage`-on-production-resources a mistake?** It is decided and I am
not looking to relitigate it at length, but if you think it is wrong, say so in a few sentences with
your strongest reason, then review the plan as designed. Do not spend the review arguing it.

**Then the actual review.** Find the failure modes. For each finding give me:

- A one-line claim.
- **A concrete failure scenario** — specific inputs or sequence of events, leading to a specific
  wrong outcome. "This is risky" is not a finding. "Cameron approves an estimate in stage at 4:58pm
  while the prod deploy is rolling, and X happens" is a finding.
- Severity: does it corrupt data, lose money, cause downtime, or just annoy someone?
- Whether the plan already mitigates it somewhere I may have missed.

Rank by severity. Ten real findings beat forty speculative ones.

## Places I am least confident — probe these hardest

These are my own suspected soft spots. Finding something I have not listed is more valuable than
confirming one I have.

1. **Session cookies across hostnames.** `Auth and Identity.md` deliberately settled on a *single*
   hostname and names shared-parent-domain cookies as a bug class it removed. The new plan adds
   `next.app.fleetco.com` and `dev.app.fleetco.com`. Does this reintroduce what that document closed?
   Note `dev` is a **different AWS account with a different database** — what happens if a cookie
   scoped to the parent domain is sent there?
2. **Two code versions against one database, continuously.** The plan only reasons about *schema*
   compatibility. What else breaks when two versions run concurrently and permanently — connection
   pool sizing, Aurora capacity, advisory locks, idempotency keys, cached reference data, enum
   handling, optimistic concurrency, `LISTEN/NOTIFY` payload shapes?
3. **The additive-only migration checker.** What destructive or dangerous patterns would a parser
   plausibly miss? Data-modifying statements, triggers, changed defaults, dropped indexes, a unique
   index that fails on existing duplicates, a check constraint, a changed collation, a sequence
   reset.
4. **One worker, two producers.** `stage`'s API writes to the outbox; only `prod`'s worker drains it.
   Beyond unknown event types, what goes wrong? Ordering, idempotency, event payloads written by
   newer code, a scheduled job that assumes one API version.
5. **SSE with two versions.** A client connected to `stage` receives events produced by work done in
   `prod`, and vice versa. Can a client receive an event shape it cannot parse? What happens during a
   rolling deploy to a held connection?
6. **Feature flags.** LaunchDarkly, free tier. Should `stage` share production's flag environment or
   have its own? Both answers seem wrong in a different way — flipping a flag affects both versions,
   or the canary is not testing the real configuration.
7. **Telling the two apart in monitoring.** Same database, same buckets, same account. Can I answer
   "did `prod` or `stage` cause this error / this slow query / this bad row" at 7am? What is missing
   from the plan to make that possible?
8. **The irreversible stuff.** The plan claims `stage` cannot produce a side effect production's code
   would not have produced, because `stage` has no worker. Is that actually true? Find a path where
   `stage` code causes an email, SMS, QuickBooks write or file deletion directly.
9. **`stage` is a single task with no redundancy.** What is the user-visible consequence when it dies
   mid-session, and does anything alert on it?
10. **The RDS Data API decision.** It is enabled on production so SQL can be run from a browser. I
    think that is a good trade for a two-person operation. Argue the other side properly.
11. **Rollback.** The API rolls back by image digest and the UI by S3 prefix — two independent
    artifacts. Can they skew? What happens if one rolls back and the other does not?
12. **The expand → backfill → contract sequence.** Is the five-step column-change table in the doc
    actually correct and complete, or does it have a hole?

## Also tell me

- **What is missing entirely** from the plan — not wrong, absent. I care more about this than about
  refinements.
- **What is over-engineered** for one shop and one operator. I would rather cut something than carry it.
- **Any place the plan contradicts one of the existing architecture documents or ADRs** without
  acknowledging it. Quote both sides.
- **The top three things you would do differently**, with the trade-off each costs.

## Last — and only after you have finished the findings above

**Do the findings first and commit to them before reading this part.** Do not revise a finding
because it makes a different design look better.

**If you believe there is a materially better overall strategy for getting a change from my laptop
to a shop that runs on this software, propose it.** One section, at the end. But only if it clears
this bar:

- **It beats the current plan on the constraints above**, not on general best practice. One
  part-time operator, a non-developer as the second person, AI-written code reviewed by one person,
  a few hundred dollars a month, money correctness over uptime.
- **You name what it is worse at.** Every alternative here trades something. If you cannot say what
  yours costs, you have not finished thinking about it.
- **You say which of your own findings it actually fixes**, by number, and which ones it does not
  touch.
- **It does not add a standing component someone has to maintain** unless you name the specific
  incident that justifies it.
- **It is a strategy, not a refinement.** Fixing the cookie scoping is a finding, not an
  alternative strategy. Tell me if the answer is "the plan is basically right, fix the findings" —
  that is a useful and acceptable conclusion, and I would rather hear it than read an invented
  alternative.

**If your proposal is one of the well-known options** — a conventional staging environment on cloned
or scrubbed data, or no `stage` environment at all with feature flags and in-production canary
routing doing the work instead — **say so plainly and argue it on the merits.** Do not present a
standard approach as a novel insight. I want to know whether the obvious option is better than what
I chose, and why I talked myself out of it.

**If you do not have one, say "no better strategy" and stop.** An empty section here is a real
answer and costs you nothing.

## Do not

- Do not rewrite the document or produce an improved version.
- Do not restate the plan back to me.
- Do not open with what is good about it. If something is genuinely well handled, one line at the end
  is plenty.
- Do not suggest Kubernetes, a service mesh, a second staging database, per-pull-request deployed
  backends, or anything that adds a standing component someone has to maintain, unless you can name
  the specific incident it prevents.
- Do not pad. If you only have six real findings, give me six.
