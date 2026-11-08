---
status: draft
summary: The contract for V1. Written last
created: 2026-10-08
updated: 2026-10-30
tags: [fleetco, prd, product, requirements]
source: Claude Code (Xerro)
---

## Overview

The product requirements document for the Fleetco platform. **Deliberately an outline only.**

A PRD written before [[Open Questions]] and [[Feature Inventory]] are resolved would be fiction —
specifically, it would contain a timeline, and an invented timeline is the thing most likely to
damage both the project and the friendship. Write this last, from evidence.

## Prerequisites

Do not start drafting until these are true:

- [ ] Tier 1 [[Open Questions]] answered — especially Q1 (data export) and Q4 (real feature surface)
- [ ] [[FullBay Analysis]] phases 1–5 complete
- [ ] [[Feature Inventory]] populated and P0 list signed off by Fleetco's owner
- [ ] [[Domain Model]] validated against reality
- [ ] Dave's role and compensation settled ([[Open Questions]] Q3)
- [ ] Dave has decided he actually wants to do this

## Planned Structure

### 1. Problem Statement
What's wrong with the status quo, in Fleetco's own words. Sourced from [[Open Questions]] Q10 and
Q11 — the actual complaints from service advisors, technicians, and portal users, not the owner's
summary of them.

### 2. Goals and Non-Goals
Explicit non-goals carry more weight than goals here. "We are not building X in phase one" is the
sentence that protects the schedule.

### 3. Users and Jobs
The four personas from the shadowing work: service advisor, technician, owner, customer portal
user. What each needs to accomplish, and what currently blocks them.

### 4. Scope by Phase
From [[Feature Inventory]]. Each phase defined by a **go-live criterion**, not a feature list —
"Fleetco works all of the pilot customer's orders in the new system for two weeks with no FullBay
fallback" is a criterion. "Inventory module complete" is not.

### 5. The Central Workflow
The intake-to-payment sequence from [[Domain Model]], specified in detail, with the customer
authorization gate treated as the critical path it is.

### 6. Data Model
Validated version of [[Domain Model]], at schema level.

### 7. Architecture Summary
Condensed from [[Stack Evaluation]], [[Tenancy Model]], and [[Evolution Path]]. The PRD references
those rather than restating them.

### 8. Migration and Cutover Plan
Possibly the riskiest section. Covers what data moves, what stays read-only in FullBay, the
parallel-running period, the rollback plan, and the FullBay contract end date. Note that a cutover
where FullBay remains available as read-only history is dramatically cheaper than a full migration
— see [[Feature Inventory]] question 4.

### 9. Acceptance Criteria
Per phase, testable, and written so that a disagreement about "done" can be settled by reading
this section.

### 10. Risks and Mitigations
Carried forward from [[Project Brief]], plus whatever the research surfaces.

### 11. Timeline and Resourcing
**Written last, and only with real scope data.** Should state assumptions explicitly: hours per
week available, whether Dave is alone, and what happens to the schedule if he isn't.

### 12. Open Decisions
Whatever remains unresolved at the time of writing. A PRD that pretends everything is decided is
less useful than one that names what isn't.

## Note on the Pitch

The vision Dave presents to Fleetco is a **separate, shorter artifact** derived from this PRD —
likely 10–15 slides or a 2-page document. Different audience and different purpose: the PRD is for
building, the pitch is for deciding. Don't conflate them, and don't hand a business owner a PRD.

## Related

- [[Feature Inventory]]
- [[Domain Model]]
- [[Project Brief]]
- [[Open Questions]]
- [[Fleetco Overview]]
