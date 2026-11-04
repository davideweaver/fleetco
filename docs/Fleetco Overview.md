---
created: 2026-10-08
updated: 2026-11-01
tags: [project, business, fleetco, fullbay, architecture]
status: evaluating
source: Claude Code (Xerro)
---

## Overview

**Fleetco** (placeholder name) is a fleet management company owned by a friend of Dave's. They
currently run their business on **FullBay** (https://www.fullbay.com/), a SaaS platform for
heavy-duty repair shops. FullBay is adequate but stagnant — not shipping modern updates.

Fleetco has been prototyping a replacement and wants Dave's help getting it off the ground.

**Immediate goal (revised 2026-10-28):** completely replace FullBay for **the graphics
department** — Cameron plus one installer, running its own customers, estimates, time, parts,
invoices, and portal on the new system. Previously framed as "one of Fleetco's smaller customers";
Cameron proposed the department cut instead, and it avoids the shared-resource problem.

**Possible future:** Fleetco resells the platform to *other fleet management companies* as a
competing SaaS offering.

**Dave's status:** evaluating whether to take this on. This knowledgebase exists to (a) answer
that question honestly and (b) if the answer is yes, become the vision he presents to Fleetco.

## Current State of Thinking

| Question | Working answer | Confidence |
|---|---|---|
| Architecture to start | Modular monolith, Node/TS, Postgres | High |
| Backend provider | **AWS-native** — Aurora Serverless v2 + S3. Neon dropped. | High |
| Fanout / Redis | Postgres `LISTEN/NOTIFY` — **Redis eliminated** | High |
| Environments | One non-prod to start, two at cutover. Separate AWS accounts. | High |
| Own API or direct-to-database? | Own Node API in front. Not BaaS. | High |
| Database | Postgres, not MongoDB | High |
| Microservices now? | No — wrong cost *and* wrong boundaries | High |
| API style | REST + OpenAPI generated from Zod. GraphQL rejected. | High |
| Auth | Better Auth **self-hosted** behind our own authN port | Medium-High |
| Object storage | **S3** with versioning + Object Lock (statutory records) | High |
| Hosting | **AWS ECS Fargate** — `api` ×2 + `worker` ×1. Not Fly. | Medium-High |
| Kubernetes | Deferred with an explicit trigger list | High |
| Sessions | Opaque tokens in Postgres, not JWTs | High |
| Realtime | Server-owned SSE, fed by the outbox | Medium — gated on Q5 |
| Who is the tenant? | The fleet management company. Not its customers. | High |
| Isolation for resale | **Pooled — one shared database.** Resolved. | High |
| Tenant routing | Single hostname, no subdomains | High |
| Resale ambition | **A small possibility** — not worth complicating for | Confirmed |
| Offline / mobile | **Not needed for V1** — one installer on a browser. Reopens at the shop cutover (Q5) | Medium |
| **What is V1?** | **The graphics department**, not a pilot customer. Cameron's proposal, 2026-10-23 | High |
| **Historical migration in V1?** | **Probably not needed** — graphics is in its first year | Medium-High |
| Running cost | $200–400/month (incl. non-prod) vs. FullBay's $5,000 | Medium |
| FullBay cost | $5,000/month — **composition still unverified.** $45/user/month confirmed, but 20 techs × $45 = $900. See Q18 | **Low — do not use in comparisons** |
| Why OTC is doing this | **Growth, not cost savings.** FullBay covers ~30% of what they want | Confirmed 2026-10-23 |
| Who maintains it | **Cameron** — tier-1 support, then high-level ownership (Q13) | Confirmed 2026-10-23 |
| Compensation | Structure floated (upfront fee + tapering retainer). **No numbers. Needs Dan** | — |
| API framework | **NestJS** — chosen by spike 2026-10-13 (ADR-027) | High |
| Delivery model | **Agent fleet, Dave reviews.** No hand-written code | Confirmed |
| Real bottleneck | **Review/verification capacity**, not code volume | High |
| How the build runs | **Software factory** of Claude Code agents, gated on M2. See [[Software Factory]] | High |
| UI approach | **Design system first**, approved by Dave then OTC, before any screen is built on it | Confirmed 2026-11-03 |
| Timeline pressure | None — client has no alternative | Confirmed |
| Is the project worth doing? | **Undecided** — gated on [[Open Questions]] | — |

**Changed 2026-10-28, from the 2026-10-23 walkthrough with Cameron.** The pilot moved from a
*customer* to a *department*. Graphics — Cameron plus one installer — would leave FullBay entirely,
and because it doesn't share technicians, a parts shelf, or a QuickBooks class with the service
shops, the shared-resource problem that broke the one-customer pilot mostly doesn't apply. Graphics
is also in its first year, so history probably doesn't migrate, which demotes the export question
from "biggest risk to the project" to "biggest risk to the shop cutover." The project's motive was
also corrected: this is a growth play to get from ~30% to 100% coverage, not a cost-savings play.
Twelve open questions moved; see [[2026-10-23 Cameron Walkthrough Debrief]].

**Changed 2026-10-09 (two passes).** *Second pass:* Dave assessed reselling as a small
possibility and asked that it not complicate the system before it is real. That resolved the
deployment question to **pooled** (one shared database), **withdrew subdomain tenant routing**
along with the cookie-scoping hazard it created, and deferred the separate vendor-plane
application to tenant two — roughly a few weeks out of phase one. What was kept despite looking
like resale scaffolding: `tenant_id` on every table (the customer portal forces the same scoping
machinery regardless), the membership and identity tables, and the outbox.

*First pass:* Supabase was dropped as the backend provider. Following its own lock-in
policy honestly — no RLS-as-authorization, no PostgREST, no Edge Functions — left it supplying
little beyond a connection string, while putting a vendor in the most security-sensitive path in
the system. Its Realtime feature also turned out to be unusable under the "own API" decision. The
architectural conclusions never depended on the vendor and are unchanged. See [[Stack Evaluation]].

## Knowledgebase Index

### Decision & Framing
- [[Roadmap]] — **the plan of record.** Milestones M1–M8, what gates each, question-to-milestone map
- [[Project Brief]] — the situation, the players, scope, and how Dave decides yes or no
- [[Open Questions]] — the unknowns that gate the decision, Q1–Q22

### Meetings
- [[2026-10-23 Cameron Walkthrough Debrief]] — **the most recent primary source.** Twelve open
  questions moved, and the pilot changed from a customer to the graphics department
- [[2026-10-23 Cameron Walkthrough Transcript]] — the raw recording
- [[Meeting Brief 2026-10-23]] — the prep doc for that meeting (Dan did not attend)

Working queue: `xerro todo list -p Fleetco`

### Architecture
- [[Stack Evaluation]] — options analysis, why not Supabase, cost modeling
- [[Architecture Decisions]] — ADR-style log of what's been decided and why. **26 ADRs.**
- [[Tenancy Model]] — who the tenants are, isolation strategy, the resale architecture
- [[Auth and Identity]] — authN port, sessions, the identity model, the SSO plan
- [[Realtime and Events]] — the outbox as audit log, event bus, and live-update substrate
- [[Evolution Path]] — monolith → services, and the three rules that make it cheap
- [[Operations]] — backup, migrations, observability, support, and the bus-factor problem

### Build Discipline (agent-driven delivery)
- [[Software Factory]] — **how V1 actually gets built.** The agent factory, its gates, the four
  candidate shapes, and the design-system track. Starts at M2
- [[Work Cards]] — the unit of agent work: format, lifecycle, and the eight rules for writing one
- [[Rule Coverage Gate]] — making [[Rules Catalog]] machine-checkable, so the spec reviews the agents
- [[UI Vocabulary]] — the shared names for the parts of a screen, mapped to the components
- [[Design System Backlog]] — what the design system still has to define, and what is done
- [[Framework Evaluation]] — **decided 2026-10-13: NestJS** (ADR-027), chosen by spike over Fastify and AdonisJS
- [[Testing Strategy]] — the verification layer; spec-not-implementation rule
- [[Code Standards and Guardrails]] — branded types, lint rules, the enforcement hierarchy
- [[Agent Playbooks]] — step-by-step recipes for recurring tasks
- [[Infrastructure Checklist]] — the cross-cutting infra inventory, phased P0/P1/P2
- [[Hosting and Deployment]] — where it runs, why not Kubernetes yet, portability rules
- [[Platform Choice]] — the Neon vs. AWS-native evaluation (**decided: AWS-native**)
- [[Environments]] — non-production topology, IaC, parity, and the real-world guards

### FullBay
- [[FullBay Analysis]] — what FullBay does, research plan, unverified working knowledge
- [[Competitive Landscape]] — who else plays here, and what that means for the resale play

### Product
- [[V1 Vision and Gaps]] — **the working doc.** What V1 is, the day in the life, the 17 surfaces,
  and a 15-item gap register. Iterate here
- [[V1 Scope from Punch List]] — **the scope of record.** Cameron's 217 marks: 62 V1, 127 Later,
  28 do-not-build
- [[Domain Model]] — entities, relationships, and the vocabulary of heavy-duty repair
- [[Feature Inventory]] — the surface area to replace, scored by necessity. Superseded for graphics
- [[PRD]] — the product requirements doc. Written last, from everything above.

## Roadmap

Superseded by [[Roadmap]], which carries the full milestone sequence, gates, and deliverables.

The short version: **the architecture is done and the project is now entirely gated on information
only Fleetco has.**

| | Milestone | Status |
|---|---|---|
| M1 | High-level plan presented to Fleetco | **Half done** — walked through with Cameron 2026-10-23; **Dan has not heard it** |
| M2 | Engagement terms agreed in writing | **Raised, deferred to Dan.** Structure floated, no numbers |
| M3 | Feature inventory validated by Fleetco | **In progress** — 217-item punch list is with Cameron |
| M4 | Phase-one scope locked (the [[PRD]]) | Blocked on M3 |
| M5 | Data migration feasibility proven | **Downgraded for V1** — graphics likely starts fresh. Full dump requested from FullBay |
| M6 | Walking skeleton deployed to `staging` | Not started |
| M7 | Phase-one feature build | Not started |
| M8 | Pilot customer cutover | Not started |

## Naming Note

"Fleetco" is a placeholder. Replace with the real company name once Dave confirms whether this
knowledgebase should carry it.
