---
status: decided
summary: Six environment strategies compared. Recorded as ADR-029
created: 2026-11-07
updated: 2026-11-08
tags: [fleetco, architecture, environments, strategy, options, research]
source: Dave + Claude Code (Xerro), web research 2026-11-07
---

## Overview

Six environment strategies that real teams actually run, with honest pros and cons, scored against
Fleetco's constraints rather than against general best practice.

**Why this exists.** An adversarial review of [[AWS Buildout]] argued that `stage`-on-production-
resources is wrong for V1, and the argument held. Rather than swap one design for another on a single
reviewer's say-so, this is the full option space.

> **Decided 2026-11-08 — ADR-029.** Strategy 5 (progressive delivery by flag) plus strategy 6's
> per-risky-release flavour, with strategy 2 trimmed to a single `dev` environment. Strategy 3 is
> dropped. One refinement emerged after this document was written and improves on its own
> recommendation: **the migration rehearsal runs on *every* release rather than on demand**, because
> rehearsal automation that runs monthly rots. Rehearsing a migration needs a database and the
> migration job, not an environment. See [[AWS Buildout]].

**The one thing to hold on to while reading.** Every one of these strategies is a different answer
to the same question: **where does the next version of the code get exercised, and does it ever
share a database with the current version?** Cost, parity and tooling all follow from that. The
arguments in the industry literature look like they are about staging; they are really about that.

## The Six

### 1. Mono-environment — production only

No deployed non-production environment at all. Local plus CI plus production. The next version is
exercised by tests, then by a flag-gated rollout in production.

The clearest statement of the case is Tom Phillips' [*Staging is a wasteful lie*](https://www.tomwphillips.co.uk/2026/01/staging-is-a-wasteful-lie-the-case-for-the-mono-environment/),
whose team of six runs 30+ production deploys a day. [Signadot](https://www.signadot.com/blog/its-time-to-kill-staging-the-case-for-testing-in-production/)
and others make the same argument at larger scale; Facebook and Twitter are the usual cited examples.

| Pros | Cons |
|---|---|
| **Nothing drifts, because there is nothing to drift from** | **Every mistake is a production mistake.** There is no dress rehearsal, ever |
| Cheapest possible — one of everything | Demands genuinely rigorous tests. Phillips' own preconditions are TDD, no flaky tests, and pairing on risky changes |
| Smallest review surface of any option | **A migration gets no rehearsal on real data volume** unless you build that separately |
| Feedback is real, because the users are real | Flag discipline becomes load-bearing — see the permutation problem below |
| No "works in staging" conversations | Hard to show anyone unreleased work |

**Fit for Fleetco: close, but the migration gap is disqualifying on its own.** Phillips concedes
expand-and-contract needs careful orchestration; for a shop whose invoices are the business, "no
rehearsal" is the wrong answer for the one operation that can lose data.

### 2. Classic three-tier — dev → staging → prod, synthetic or scrubbed data

The conventional default, and what [[Environments]] originally described. A persistent staging
environment with its own database, seeded or restored from scrubbed production.

| Pros | Cons |
|---|---|
| **The dress rehearsal is real** — migrations, upgrades, restores, all on production-shaped data | **Passing in staging means less than it looks.** Different load, different data, different config |
| A safe place to show unreleased work | A second full stack to pay for and maintain |
| No two-version-on-one-database problem at all | **It drifts.** This is the single most common complaint in the literature |
| Everybody already understands it | The scrubber is real, load-bearing code that has to be tested like production |
| Restore drills have an obvious home | Becomes a queue when more than one change is in flight |

**Fit for Fleetco: solid and boring.** The drift objection is weaker here than usual because
everything is Terraform and there is one person. The scrubber cost is real but [[Infrastructure Checklist]] already requires it.

### 3. Prod-adjacent canary — the next version on production's own resources

What [[AWS Buildout]] currently specifies. A second deployment, one version ahead, sharing the
production database, buckets and integrations, on its own hostname.

| Pros | Cons |
|---|---|
| **The test is unambiguously real** — real data, real volume, real integrations | **Two versions share one database permanently**, not for the minutes of a rolling deploy |
| Almost free — one extra task, ~$12/month | **The compatibility surface is far wider than the schema**: data values, constraints, event payloads, caches, OAuth refresh tokens, scheduled-job versions |
| No scrubber needed for the canary itself | Automated checking covers maybe a third of that surface. The rest is human review |
| Early access for a design partner is a genuine product feature | **Mistakes corrupt real data.** No deploy undoes that |
| Forces expand/contract discipline, which you want anyway | Migrations must land in production before the canary's code runs |
| | Every column change becomes a six-step dance across three releases |

**Fit for Fleetco: this is the one under review.** The structural objection is that the permanent
two-version window converts a tooling problem into a standing vigilance problem, and vigilance is
the resource Fleetco has least of.

### 4. Blue/green — two identical production stacks, swap all traffic

Both stacks are production-grade. Deploy to the idle one, verify, swap the load balancer, keep the
old one warm for instant rollback.

| Pros | Cons |
|---|---|
| **Rollback is a traffic switch**, seconds, no redeploy | **Double the production infrastructure** |
| Verification happens on production infrastructure before any user arrives | **The database is not blue/green.** Both stacks share it, so you still need backward-compatible schema — the hard part is not solved |
| The cleanest story for a change that cannot tolerate two versions at once | Long-lived SSE connections make "swap all traffic" messy — held connections have to drain anyway |
| Well-understood, well-tooled | Two versions still coexist during the swap window |

**Fit for Fleetco: no.** It doubles the cost of the only environment that matters to solve a rollback
problem that expand/contract plus image promotion already solves in five minutes. Its real use case
— a schema change needing a hard cutover — is exactly what additive-only migrations remove.

### 5. Progressive delivery — one deployment, rolled out by audience

One production deployment. The new code ships to everyone but is *off*, and exposure grows by
audience: internal, then a named pilot user, then a percentage, then everyone. "Ring deployment" is
this with named rings rather than percentages. Canary-by-traffic-split is the same idea at the load
balancer instead of in the code.

| Pros | Cons |
|---|---|
| **The two-version window collapses to the minutes of a rolling deploy** | **Only works for changes you can put behind a flag.** A refactor, a dependency bump, a framework upgrade or a migration cannot be gated |
| **The code that writes a new value is the same version that reads it** — this kills a whole bug class structurally, not by vigilance | **Flags multiply test permutations.** Three flags is eight combinations, and [the test suite has to cover both sides of every flag](https://dev.to/puneet_khandelwal_429a72e/feature-flags-arent-a-staging-environment-3fik) |
| No extra environment, no extra hostname, no extra database role | Code behind a flag is still shipped code. A bug in the shared path hits everyone |
| Exposure is per *feature*, which is finer-grained than per *release* | Flags left on forever become permanent branches in the code |
| "Ring 1 = Cameron" is a one-line targeting rule | Still no migration rehearsal |

**Fit for Fleetco: strong for features, useless for everything else.** This is the mechanism that
delivers what Dave actually asked for — hand the new thing to OTC Fleet before everyone else — at a
fraction of the cost of an environment.

### 6. Ephemeral on-demand environments

Nothing persistent beyond production. Environments are created from Terraform when needed — per pull
request, or per risky release — and destroyed after.

The literature is consistent that the per-PR version pays off at scale, not below it: [roughly 50
engineers and 25 services](https://www.signadot.com/guide-to-ephemeral-environments-kubernetes/) is
the commonly cited crossover, and [the cost cliff is a real database per
environment](https://instadevops.com/blog/ephemeral-preview-environments-guide/).

| Pros | Cons |
|---|---|
| **Nothing drifts, because nothing persists** | **All the cost is up front**, in automation that has to work reliably |
| You pay only while it exists | **Anything not torn down keeps billing.** TTL enforcement is mandatory |
| The *per-risky-release* variant gives a dress rehearsal with no standing cost | Per-PR is over-engineering below roughly 50 engineers — the literature says so, and so does [[Environments]] |
| Same Terraform module as production, so parity is structural | A database per environment is the expensive part, and the thing you actually need |
| Forces the restore-and-scrub path to be automated and therefore tested | Not somewhere a design partner can live for a week |

**Fit for Fleetco: the per-PR flavour, no. The per-risky-release flavour, yes** — it is the missing
piece under every other option, and it is the only one that makes the scrubber and the restore path
exercised rather than aspirational.

## Scored Against Fleetco's Actual Constraints

Not generic criteria. These are the things [[Operations]], [[Software Factory]] and the engagement
reality actually impose.

| | 1. Prod only | 2. Three-tier | 3. Prod canary | 4. Blue/green | 5. Progressive | 6. Ephemeral |
|---|---|---|---|---|---|---|
| **Review surface** (scarcest resource) | **Best** | Medium | **Worst** | Poor | **Best** | Good |
| Two versions on one database | Minutes | **Never** | **Permanent** | Minutes | Minutes | **Never** |
| Cameron sees the next thing early | No | Yes | Yes | No | **Yes** | Partly |
| Rehearses a risky migration on real-shaped data | **No** | **Yes** | No | No | **No** | **Yes** |
| Irreversible side effects contained | Flag-gated | **Fully** | **No** | No | Flag-gated | **Fully** |
| Monthly cost | $0 | ~$45 | ~$12 | ~$150 | $0 | ~$0 idle |
| Standing components to maintain | **None** | One stack | One service | Two stacks | **None** | **None** |
| Works with a bus factor of two, one non-developer | Risky | **Yes** | Risky | No | Yes | Yes |
| Needs the scrubber to exist | No | **Yes** | No | No | No | **Yes** |

## What The Research Actually Says, Stripped Of Advocacy

Three conclusions worth keeping, because they cut across all six:

1. **The anti-staging argument is an argument about *persistent* non-production, not about rehearsal.**
   Every serious version of it concedes you need local or ephemeral environments and careful
   migration orchestration. Nobody credible argues against rehearsing a risky migration — they argue
   against paying for a second stack to sit idle between rehearsals.
2. **Feature flags are not a staging environment, and the people selling flags say so.** The cost is
   that every flag doubles the test matrix and the suite has to cover *both* sides. That makes flags
   excellent for a handful of short-lived gates and bad as a general substitute for an environment.
   It also argues for a hard rule: flags are deleted after rollout.
3. **Per-pull-request environments are a scale play.** The crossover is tens of engineers and tens of
   services. At one engineer and one deployable, they are pure cost — which is what [[Environments]]
   concluded independently, and a reason to cut INFRA-038.

## Recommendation

**Combine 5 and 6, keep a small 2, and drop 3.** None of the six is right alone, and the reason is
that "where does the next version get exercised" has two different answers depending on whether the
change can be flag-gated.

| What | Which strategy | Why |
|---|---|---|
| **`prod`** | — | The business |
| **`dev`** — one persistent, synthetic data, publicly reachable with a login | 2, trimmed | Where everything is built. Catches works-locally-breaks-on-Fargate. Somewhere to send a link |
| **Canary for anything flag-gatable** | 5 | Cameron gets the new feature first, on production, by a targeting rule. One line, no environment |
| **Ephemeral rehearsal for anything not flag-gatable** — migrations, upgrades, framework bumps | 6 | Stand up a stack against a restored scrubbed snapshot, rehearse, destroy. Same Terraform module |
| ~~Permanent `stage` on production resources~~ | ~~3~~ | **Dropped.** The permanent two-version window is a standing vigilance cost, and vigilance is the scarce resource |

**What this gives up, stated plainly.** There is no week-long period where Cameron works on the next
version while Jason stays on the current one. He sees each new *feature* early rather than each new
*release* early. If OTC genuinely wants release-level early access — a real possibility worth asking
about — then strategy 2 at full strength is the honest answer, at roughly $45/month and a scrubber,
and it is a much safer way to buy that than strategy 3.

**The trigger to revisit.** At shop cutover with twenty technicians, "deploy while Cameron watches"
gets thinner, and a persistent staging environment on scrubbed data starts earning its keep. That is
a scale trigger, and it is far away.

## Related

- [[AWS Buildout]] — the plan this feeds back into; B1 and B7 are the decisions at stake
- [[Environments]] — the original progression, and the per-PR reasoning that still holds
- [[Operations]] — recovery objectives and migration discipline
- [[Infrastructure Checklist]] — the scrubber, feature flags, and what phase each belongs to
- [[Architecture Decisions]] — ADR-024 through ADR-026
