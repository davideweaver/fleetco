---
status: decided
summary: Why AWS-native over Neon. Recorded as ADR-023
created: 2026-10-09
updated: 2026-10-30
tags: [fleetco, architecture, aws, gcp, neon, aurora, rds, evaluation]
source: Claude Code (Xerro)
---

## Overview

Evaluation of whether to keep **Neon** as a separate platform vendor or go **cloud-native** on a
single provider, and which provider.

**Recommendation: AWS cloud-native. Drop Neon. Aurora Serverless v2 for Postgres, S3 for object
storage, Better Auth self-hosted as a library, and no Redis.**

Accepted and recorded as ADR-023 on 2026-10-09: ADR-019 and ADR-020 superseded, and ADR-010's
provider revised to Aurora.

## What Neon Actually Contributes

Stripping the bundle down to what only Neon provides:

| Neon service | Cloud-native equivalent | Who wins |
|---|---|---|
| Postgres | RDS / Aurora / Cloud SQL | **Cloud** — vastly more proven for a decade-long commitment |
| Object storage | S3 / GCS | **Cloud, clearly** — Object Lock and versioning for legal records vs. a months-old product |
| Managed Better Auth | Self-host the same library | **Tie** — it is a library either way; managed saves setup, costs a vendor in the auth path |
| **Database branching** | Aurora fast clone (partial) | **Neon** — this is the genuine differentiator |

**So the whole question is: is per-pull-request database branching worth keeping a vendor in the
critical path?**

## The Case for Dropping Neon

1. **Removes a vendor from the critical path.** Availability is the product of every vendor in the
   request path. Neon currently caps ours regardless of hosting choice — a point already conceded
   in [[Hosting and Deployment]]. With a bus factor of one, fewer vendors between the shop and
   their invoices is a recurring structural win, not a one-time convenience.
2. **Same-VPC private networking.** No public-internet hop to the database. Lower and more
   predictable latency, and a materially better answer when hospital InfoSec asks where their data
   lives: "one cloud account, private subnet" beats "a Databricks subsidiary."
3. **S3 is the right home for legal records.** DVIR records, signed authorizations, and warranty
   documentation have statutory retention (Q9). S3 Object Lock plus versioning is the strongest
   available story. Neon Object Storage reached general availability only recently.
4. **One vendor, one bill, one IAM model, one support contract.**
5. **Aurora fast clone recovers most of what branching gave us** — see below.

**The honest counter:** Neon branching genuinely de-risks migrations, and migrations against a
live shop's data are among the scarier recurring operations on this project. That is a real loss,
and the mitigation below is what makes it acceptable rather than free.

## Postgres: Aurora Serverless v2 vs. RDS

**Caveat: pricing approximate, from knowledge with a May 2026 cutoff, us-east-1. Verify in the
AWS calculator.**

| Option | Spec | Monthly | Notes |
|---|---|---|---|
| RDS `db.t4g.small`, single-AZ | 2 vCPU burstable, 2 GB | ~$30 | No HA. Not suitable for production |
| **RDS `db.t4g.small`, Multi-AZ** | + standby | **~$54** | Standby is idle capacity you pay for |
| **Aurora Serverless v2, min 0.5 ACU** | ~1 GB, autoscaling | **~$45–55** | Storage replicated 6 ways across 3 AZs |
| Aurora Serverless v2, min 1.0 ACU | ~2 GB | ~$87 | If the 0.5 floor proves too small |
| Cloud SQL `db-custom-1-3840` + HA | 1 vCPU, 3.75 GB | ~$100 | GCP equivalent, and no fast-clone answer |

Storage adds roughly $6 for 50 GB on either AWS option.

**Recommendation: Aurora Serverless v2**, and the argument is clean — **it costs the same as RDS
Multi-AZ and hands back database branching.** Also included at that price: storage replicated six
ways across three availability zones, faster failover, and autoscaling for the 7am login spike.

**Two caveats worth recording:**

- **The 0.5 ACU floor is about 1 GB of RAM**, which is small for Postgres `shared_buffers`. A shop
  that is quiet overnight may see a cold cache on the first queries of the morning. If that shows
  up, raise the floor to 1.0 ACU (~$87/month). Start at 0.5 and measure.
- **Aurora bills I/O separately** ($0.20 per million requests) unless you choose
  **I/O-Optimized**, which folds it into a higher ACU and storage rate. Start standard, switch if
  I/O charges become a meaningful share.

RDS Multi-AZ remains a perfectly defensible fallback if Aurora's product surface feels like more
than the project needs.

## What Replaces Branching in the Dev Workflow

The practical question, and the encouraging finding: **most of the replacement is already on the
[[Infrastructure Checklist]].**

| Tier | Mechanism | Cost | What it covers | Already planned? |
|---|---|---|---|---|
| **1** | Local Postgres in Docker + seed script | Free | Day-to-day schema work, migrations tested before anything else | **Yes — P0** |
| **2** | CI: ephemeral Postgres container, migrate from scratch, seed | Free | Migration-order bugs, clean-install correctness, per-PR isolation | **Yes — P0** |
| **3** | Shared staging, restored from scrubbed production | ~$30 | Real data volumes and real data weirdness | **Yes — P1** |
| **4** | **Aurora fast clone, on demand** | Pennies per use if short-lived | A copy-on-write clone of production for a genuinely scary migration | New |

**Where the gap actually is.** Neon branching's unique value is *production-shaped data, instantly,
per pull request*. Tiers 1 and 2 cover schema correctness. Tier 3 covers data realism. The
remaining gap — data realism *per PR* — matters most when several people are shipping risky
migrations concurrently. With a team of one to three, tiers 1–3 are genuinely sufficient, and tier
4 is there for the migration that warrants it.

**Aurora fast clone specifics:** copy-on-write off the cluster volume, creates in minutes rather
than hours, and you pay only for the clone's compute plus changed pages. Scriptable via the API,
so CI can create and destroy one. Limits: same region and account, maximum 15 clones per cluster.
Slower and pricier per hour than a Neon branch, and entirely adequate at this team size.

## Knock-On Simplification: Redis Disappears

Neon's transaction-mode pooler was a significant reason [[Realtime and Events]] specified Redis
for SSE fanout. **With Aurora or RDS you can hold a session-mode connection, which makes Postgres
`LISTEN/NOTIFY` viable and removes Redis entirely.**

- Each `api` task holds one dedicated connection issuing `LISTEN`
- The `worker` issues `NOTIFY` after dispatching an outbox row
- The 8000-byte payload cap is a non-issue: send the event id and topic, and clients replay from
  the outbox by cursor
- **Durability is unchanged** — it has always lived in the outbox table, never in the transport.
  A missed notification costs nothing because reconnect replays from the cursor

**One constraint to record:** `LISTEN/NOTIFY` requires a direct connection, **not** RDS Proxy in
transaction mode. Route the listener connection directly and let pooled application queries go
through the proxy if one is introduced later.

Net effect: one fewer vendor, $10/month, and one fewer moving part.

## AWS vs. GCP, Resolved

With Dave's experience preference set aside, as requested:

| Factor | Winner | Weight |
|---|---|---|
| **SSE handling** | **AWS** — ALB's timeout is an *idle* timeout, configurable to 4000s and reset by heartbeats, so connections live for hours. Cloud Run has a hard 60-minute request cap that heartbeats cannot defeat | Medium |
| **Object storage for legal records** | **AWS** — S3 Object Lock | Medium |
| **Branching replacement** | **AWS** — Aurora fast clone has no real Cloud SQL equivalent | **High** |
| Compute simplicity and cost | **GCP** — Cloud Run has no ALB or NAT line items | Medium |
| **Kubernetes on-ramp** | **GCP** — GKE Autopilot is the best managed Kubernetes; EKS costs $73/month and is fiddlier | **Low** — see below |
| Database cost | **AWS** — Aurora ~$50 vs. Cloud SQL HA ~$100 | Medium |

**On weighting the Kubernetes on-ramp low:** per ADR-021's trigger list, the most likely trigger
is a second engineer, and resale is a small possibility (Q7). Kubernetes may never happen.
Optimizing the starting point for a destination we probably will not reach is the same error as
adopting Kubernetes early. Also worth noting that both Cloud Run and Fargate run the same
container, so if Kubernetes does arrive, ADR-022's portability rules make the move mechanical from
either cloud — the on-ramp advantage is smaller than it looks.

**AWS wins**, and notably it now wins on merits rather than on familiarity. Aurora fast clone is
the deciding factor, because it is what makes dropping Neon tolerable.

## Revised Cost Model

| Item | Monthly |
|---|---|
| Fargate: `api` ×2 + `worker` ×1 (right-sized) | $27 |
| ALB | $20 |
| NAT gateway *(optional — see [[Hosting and Deployment]])* | $0–32 |
| **Aurora Serverless v2**, 0.5 ACU floor + 50 GB | $50–60 |
| S3 + requests + egress | $5–25 |
| Parameter Store, ECR, CloudWatch Logs | $7–10 |
| **AWS subtotal** | **$109–174** |
| Non-production environments *(see [[Environments]])* | $20–50 |
| Vercel (frontend) | $20 |
| Sentry | $26 |
| PostHog (analytics + session replay) | $0–50 |
| Resend + Twilio | $20–50 |
| Uptime monitoring | $0–10 |
| ~~Redis (Upstash)~~ | ~~$10~~ — **eliminated** |
| **Total** | **$200–385** |

Compared with the Neon-based plan **as costed at the time of this evaluation (~$200–360)**:
slightly cheaper, one fewer vendor in the critical path, and one fewer moving part. **Still under
8% of FullBay's $5,000/month.**

> **Both figures above are historical.** They are the numbers this evaluation was decided on, kept
> so the comparison still makes sense. The current cost model lives in [[Stack Evaluation]] and is
> **$200–400** — it moved after non-production environments were reconciled. Do not cite this
> section's totals as current.

## What Would Have to Change

If accepted:

- **ADR-010** (plain managed Postgres, not Supabase) — amend: the provider becomes Aurora, and the
  reasoning that rejected Supabase is unchanged and still applies
- **ADR-019** (Neon platform services) — supersede entirely
- **ADR-020** (Neon-managed Better Auth) — supersede; Better Auth is self-hosted per ADR-012,
  and **Q16 closes without needing an answer**
- **ADR-015 / [[Realtime and Events]]** — Redis replaced by `LISTEN/NOTIFY`, with the
  direct-connection constraint recorded
- **[[Stack Evaluation]]** — stack table, vendor inventory, and cost model
- **[[Infrastructure Checklist]]** — add the four-tier dev-database workflow explicitly
- **[[Operations]]** — backup strategy becomes Aurora PITR plus an independent `pg_dump` to S3 in
  a separate account
- **Q17** narrows from "which cloud" to "does Fleetco have an existing AWS account"

## Arguments Against This Proposal

Recorded honestly, since the recommendation is a reversal:

1. **Neon branching is genuinely better** than the four-tier substitute. Aurora fast clone is
   minutes rather than seconds and costs real money per hour. This is a real downgrade in
   developer experience, accepted in exchange for structural simplicity.
2. **Aurora is a more complex product than Neon**, with ACU scaling behavior and I/O pricing to
   understand. Neon is genuinely pleasant to use.
3. **More AWS surface to configure** — VPC, subnets, security groups, IAM, parameter groups. A
   one-time cost, but real, and more than Neon's "paste a connection string."
4. **Vendor concentration.** Everything in one AWS account means one compromised set of credentials
   or one billing lapse affects all of it. Mitigated by the independent off-account backup already
   required in [[Operations]].

None of these outweigh removing a vendor from the critical path, in my assessment — but they are
the real costs, and the decision should be made with them visible.

## Related

- [[Stack Evaluation]] — the stack this would revise
- [[Hosting and Deployment]] — Fargate, ALB, SSE constraints
- [[Realtime and Events]] — the Redis-to-`LISTEN/NOTIFY` change
- [[Infrastructure Checklist]] — the dev-database tiers
- [[Operations]] — backup implications
- [[Architecture Decisions]] — ADR-010, ADR-015, ADR-019, ADR-020
- [[Open Questions]] — Q9 (retention), Q16 (closes), Q17 (narrows)
