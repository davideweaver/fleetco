---
status: current
summary: Fargate, ALB, SSE, portability discipline, deploy pipeline
created: 2026-10-09
updated: 2026-11-08
tags: [fleetco, architecture, hosting, deployment, aws, fargate, kubernetes]
source: Claude Code (Xerro)
---

## Overview

Where the application runs, and what keeps moving it cheap.

**Decision: AWS ECS Fargate.** Google Cloud Run is the equal-footing alternative on the merits;
AWS wins on Dave's existing experience, which is a legitimate tiebreaker for a system one person
will operate. Not Kubernetes yet — deferred with an explicit trigger list rather than rejected.

The application is a plain Docker container configured entirely by environment variables, so the
platform is a deployment target rather than an architectural commitment (ADR-022).

**Pending:** whether Fleetco has an existing cloud account or preference. An existing AWS
relationship settles this; a GCP one would make Cloud Run the better pick. Tracked as Q17 in
[[Open Questions]].

## Why the Compute Layer Can Be This Simple

Because [[Stack Evaluation]] put the stateful services on AWS managed services — Aurora Postgres
and S3 object storage — the hosting layer is reduced to **running two stateless containers.**

That matters more than it sounds. Most of the reason teams reach for Kubernetes is the richer
primitives around state and complex topology: StatefulSets, persistent volume claims, operators,
service meshes. None of that applies here. What remains is "keep two containers running, roll them
over safely, and run a cron job," which is precisely what Fargate does with no cluster of any
kind.

## The Eight Requirements

1. Two or more instances of one Node app behind a load balancer — **not for load**, so that a
   deploy, crash, or memory leak is not an outage
2. **Long-lived SSE connections with graceful draining on deploy** (ADR-015) — the only
   non-trivial requirement, and it disqualifies most serverless models
3. Scheduled jobs — outbox pruning, QuickBooks sync, PM reminders
4. A background worker for the outbox dispatcher
5. Zero-downtime rolling deploys gated on a health check
6. Managed secrets
7. Authenticated networking to Aurora
8. Logs and metrics shipped somewhere searchable

Fargate satisfies all eight with no cluster to operate.

## What "No Downtime" Actually Means Here

**The platform's SLA is not the binding constraint — Dave's availability is.** The gap between
99.9% and 99.95% uptime is about 20 minutes a month. The gap between "the platform healed itself"
and "someone has to notice and intervene" is hours, and only one person can do it.

So the choice optimizes for **never needing manual intervention**: auto-restart on crash,
auto-replace on unhealthy, no cluster or node upgrades, and a rollback that is one command and
always works.

**Honest caveat: availability is the product of every vendor in the path.** Aurora is in that path,
and if Aurora is down the application is down regardless of host. That is not a reason to revisit
ADR-010 — only a reason to keep expectations honest and the status page truthful.

## Maintenance Surface, Ranked

The real differentiator between options — not cost, and not upgrade toil in the way it is usually
described.

| Option | Maintenance surface |
|---|---|
| **Cloud Run** | **Lowest.** Container plus config. No cluster, nodes, manifests, ingress controller, CRDs, or Kubernetes API deprecations. |
| **ECS Fargate** ← chosen | **Very low.** No cluster, no nodes, and **no deprecation treadmill** — AWS has kept the ECS API remarkably stable, so task definitions keep working for years. You own task definitions, ALB config, IAM, and VPC. |
| **GKE Autopilot (Stable channel)** | **Low.** Google manages control plane and nodes and applies upgrades automatically. You still own manifests and Kubernetes API-deprecation risk. |
| EKS Auto Mode | Low-ish. Node lifecycle handled, but cluster version upgrades remain your decision, plus the $73/month control plane. |
| GKE Standard / DOKS / EKS standard | You own materially more. |

### Correcting an Earlier Overstatement

An earlier draft of this document claimed managed Kubernetes meant "a cluster upgrade every 4–8
months forever." **That was too strong.** GKE Autopilot on a Stable release channel genuinely
auto-upgrades both control plane and nodes inside maintenance windows you define. EKS is less
automatic — the control plane is operated by AWS and Auto Mode handles node lifecycle, but the
cluster version upgrade is still your call, and letting a version lapse into extended support
carries roughly a 6x control-plane price penalty.

What managed Kubernetes does **not** remove:

- **Workload compatibility risk.** Kubernetes deprecates APIs between versions. If an auto-upgrade
  drops an API your manifests or an installed controller depend on, it breaks on *the provider's*
  schedule during a maintenance window, rather than when you chose to look.
- **Everything above the cluster** — manifests, Helm charts, CRDs, operators, RBAC, network
  policies, PodDisruptionBudgets.
- **The debugging surface** — CrashLoopBackOff, evictions under resource pressure, a PDB blocking
  a node drain. Dave's fluency genuinely lowers this cost, but it remains a far larger surface
  than "the new task revision did not go healthy."

**So the decision is closer than first presented, and GKE Autopilot is a legitimate choice.** The
surviving argument is **conceptual surface area**: with exactly one deployable, Kubernetes' real
payoff goes unused while its surface is still carried. Fewer moving parts means fewer things that
can force a 6am decision.

### Triggers That Would Justify Kubernetes

- A customer contractually requires deployment into their own cloud or VPC
- More than roughly four or five distinct deployables
- The chosen platform's pricing or reliability stops working
- **A second engineer who also knows Kubernetes** — removes the bus-factor objection entirely and
  is the most likely real trigger (Q13)

## Process Topology

> **Corrected 2026-11-08.** This section described two ECS services. **The code has one.** The
> outbox dispatcher starts inside the API process (`fleetco-nestjs-vehicles/src/main.ts:49`); there
> is no worker entrypoint, and `platform/outbox/dispatcher.ts` records that the handler registry is
> not written yet. [[Realtime and Events]] said "dispatched in-process" all along, so this document
> was the one out of step. An adversarial review of [[AWS Buildout]] caught it when a safety
> argument had been built on the two-service topology.

**For V1, one ECS service from one image:**

```
api      ← HTTP + SSE + the in-process outbox dispatcher.
           2 tasks minimum, behind an ALB.  (framework: ADR-027)
```

Two tasks means two dispatchers, which is **safe** — `FOR UPDATE SKIP LOCKED` guarantees each outbox
row is claimed exactly once (see [[Realtime and Events]]) — and it removes a deployable.

**Split the worker out when a handler does real outbound work** — a QuickBooks sync, bulk email.
At that point the original argument applies and is still right: keeping a slow vendor call out of
the request path stops it inflating request latency, and a crash in one does not take down the
other. It just is not true yet, and a diagram describing a service that does not exist is worse
than no diagram. INFRA-050.

## AWS Specifics Worth Getting Right

| Item | Note |
|---|---|
| **ALB idle timeout** | **Default is 60 seconds, which will kill SSE connections constantly.** Raise it (3600s) or SSE appears mysteriously broken. The single most likely configuration bug in this stack. |
| ALB deregistration delay | Set to exceed the app's graceful-shutdown window so draining actually completes (ADR-022, rule 7) |
| **NAT Gateway** | **Decided 2026-11-08 ([[AWS Buildout]] B6): one NAT in `prod` (~$32/month), public subnets in `dev` ($0).** The difference is not whether an attacker can reach a task today — it is what one wrong security-group rule costs. In a public subnet it exposes the application; in a private subnet there is no route, so the same mistake is inert. `prod` is the only environment anyone audits. **VPC interface endpoints are *not* the cheap alternative** — about $7.30/month each per AZ, and five are needed, so ~$73 against $32. |
| Fargate platform version | Pin `LATEST` and AWS patches the substrate — this is the "no maintenance" property |
| Secrets | **SSM Parameter Store SecureString is free**; Secrets Manager is $0.40/secret/month. For a handful of secrets, Parameter Store is the better call. **One exception:** the RDS Data API requires a Secrets Manager secret ([[AWS Buildout]] B17) |
| Scheduled jobs | EventBridge Scheduler invoking a one-off ECS task. Plain commands per ADR-022 rule 6 |
| CloudWatch Logs | $0.50/GB ingested — **set a retention policy**, do not keep forever |
| ECR | Set a lifecycle policy to expire old images, or storage creeps |
| Fargate Spot | Not for `api`, which now carries the dispatcher as well. Revisit if the worker is ever split out |
| **CloudFront** | Static UI only. **Do not route the API through it** — SSE holds a connection for an hour and CloudFront applies its own origin read timeout. ADR-033 |
| Region | Must match the Aurora cluster's region. Latency to the database matters more than latency to users |

## Cost

**Caveat: approximate, from knowledge with a May 2026 cutoff. Verify in the AWS calculator.**

Two sizings, `api` ×2, always on (the dispatcher runs in-process):

| Item | Right-sized (0.25–0.5 vCPU) | Comfortable (1 vCPU / 2GB) |
|---|---|---|
| Fargate compute | ~$27 | ~$90 |
| ALB (base + low LCU) | ~$20 | ~$20 |
| NAT Gateway *(if private subnets)* | ~$32 | ~$32 |
| Parameter Store, ECR, CloudWatch Logs | ~$7 | ~$10 |
| **Total with NAT** | **~$86** | **~$152** |
| **Total without NAT** (public subnets) | **~$54** | **~$120** |

For comparison: Cloud Run lands around **$70** right-sized and **$125** comfortable, with no load
balancer or NAT line items at all.

**An earlier version of this document said $30–50. That was optimistic and is corrected here.**

### Cost Is Not the Differentiator

Worth recording plainly, because it is a tempting argument in both directions:

| Kubernetes option | Monthly |
|---|---|
| DOKS (DigitalOcean) | ~$50 |
| GKE Standard (one zonal cluster, fee waived) | ~$55–70 |
| GKE Autopilot | ~$70–110 |
| **EKS** | **~$150–200** — almost entirely the $73 control plane |

At always-on sizing, Kubernetes on DOKS or GKE is **cost-competitive with or cheaper than**
managed containers. The reason: Cloud Run and Fargate price per-second for compute that never
idles, which is serverless's worst case, while Kubernetes buys raw nodes that are cheaper at
constant utilization.

**So the case for deferring Kubernetes is operational surface, not money.** We are choosing to pay
a modest premium to avoid carrying a platform we would not use. That is the actual trade, and it
should be stated that way rather than dressed up as a cost saving.

Both AWS and GCP give new accounts $300 in credits, which covers several months outright.

## Portability Discipline

See ADR-022 for the full rule set. In short: a plain Dockerfile, all config from environment
variables, no local filesystem state, JSON logs to stdout, no proprietary platform services for
anything structural, scheduled jobs as plain commands, and a real health endpoint with `SIGTERM`
draining.

Follow these and the platform is genuinely interchangeable. Skip them and the first migration
becomes the work that never gets prioritized.

## Deploy Pipeline

Full treatment in [[AWS Buildout]]; the shape:

1. Open a pull request. CI runs typecheck, lint, tests, **the leak suite as a required gate**, a
   from-scratch migration, the two flag gates, and `terraform plan` for both environments.
2. Merge to `main`. **One API image and one UI bundle are built, and never rebuilt** — everything
   downstream promotes those two artifacts by digest and by S3 prefix (ADR-031).
3. `dev` deploys itself: migrate, roll the service, smoke test.
4. Tag a release and start the production workflow by hand, naming the artifacts.
5. **Clone production's database, run the release's migrations against the clone, record the timing,
   destroy it.** This is the dress rehearsal that replaces a staging environment (ADR-029).
6. Additive-only check, snapshot, migrate.
7. Roll the API tasks one at a time, health-gated, draining. **Then the UI** — a new UI against an
   old API fails on endpoints that do not exist yet.
8. Smoke check, tag the release. Destructive migrations wait for `contract.yml`, one release later.

Rollback is re-running the workflow with the previous artifacts — **UI first, API second**. Because
migrations are additive, the previous image always works against the current schema.

**Deploy during business hours**, deliberately, while someone is awake to notice.

## Recorded So It Is Not Re-Litigated

**"You are on AWS — why not a managed Postgres platform like Neon or Supabase for the developer
experience?"** The fair challenge, and it was asked and answered. Both were evaluated and both were
rejected: Supabase because banning RLS-as-authorization, PostgREST, and Edge Functions left a
convenience bundle; Neon because once its branching was the only unique contribution, it did not
justify a vendor in the critical path. Full reasoning in [[Platform Choice]] and
[[Stack Evaluation]]; decision in ADR-023.

**"Why Aurora rather than RDS?"** Aurora Serverless v2 at a 0.5 ACU floor costs roughly what RDS
Multi-AZ costs and returns database branching via fast clone, which is what made dropping Neon
tolerable. ADR-023.

## Related

- [[AWS Buildout]] — the buildout, the pipeline, and the decision log
- [[Stack Evaluation]] — the full stack and cost model
- [[Operations]] — deploys, rollback, migrations, incident response
- [[Infrastructure Checklist]] — graceful shutdown, health endpoints, secrets
- [[Realtime and Events]] — why SSE constrains the hosting model
- [[Evolution Path]] — why Kubernetes is a non-goal for now
- [[Architecture Decisions]] — ADR-021, ADR-022
- [[Open Questions]] — Q17 (Fleetco's cloud preference)
