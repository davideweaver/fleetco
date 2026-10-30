---
created: 2026-10-08
tags: [fleetco, fullbay, competitive-analysis, research]
source: Claude Code (Xerro)
confidence: mixed — see confidence markers per section
---

## Overview

What FullBay is, what it does, and the plan for the deeper analysis Dave wants. This is the
system being replaced, so a thorough inventory here directly becomes [[Feature Inventory]].

**Confidence note:** everything in "Verified" came from FullBay's own marketing site and
third-party review aggregators on 2026-10-08. Everything in "Working Knowledge" is general
heavy-duty-repair domain knowledge and **must be confirmed against the real application.**

## What FullBay Is

Web-based shop management software for **heavy-duty** truck, trailer, and equipment repair — not
general automotive. Targets two distinct buyers, which matters because Fleetco sits in both camps:

- **Independent repair shops** servicing other people's vehicles
- **Fleet operators** maintaining their own assets

Target verticals named: heavy-duty trucks, trailers, emergency vehicles, agricultural equipment,
construction equipment, RVs, and towing.

## Verified Feature Surface

### Shop-facing modules
| Module | Notes |
|---|---|
| Repair workflow / service orders | The spine of the product |
| Estimates, invoicing, payments | Includes digital approval workflows |
| Parts and inventory management | Multi-location, vendor ordering, **core credit** tracking |
| Technician tools | Time tracking, productivity monitoring |
| Customer communications | |
| Shop reporting | |
| Canned jobs | Templates for frequent repairs |
| AI service order notes | Note cleanup, voice-to-text (Elite tier) |

### Fleet-facing modules
| Module | Notes |
|---|---|
| Work order management | |
| Asset management | |
| Preventive maintenance | Triggered by **mileage, engine hours, or calendar time** |
| DVIR and defect tracking | Defect-to-service-request automation |
| Predictive maintenance | |
| Fleet reporting | |

### Named integrations
QuickBooks · Mitchell 1 · MOTOR (labor guides) · Samsara · Motive · Whip Around · generic
accounting · telematics/GPS providers.

**This list is the integration scope conversation.** QuickBooks and a labor guide (MOTOR or
Mitchell 1) are almost certainly load-bearing for Fleetco. Telematics may or may not be.
Confirm via [[Open Questions]] Q6.

### Pricing (public, 2026-10-08)
| Tier | Price | Notes |
|---|---|---|
| Basic | $188/mo | |
| Pro | $258/mo | Additional users |
| Elite | Quote | Pro + AI notes, AI voice, QuickBooks, MOTOR labor guide |
| Enterprise | Quote | |

**Why this matters for the resale play:** if the entry price is ~$188–258/month per shop, that
sets the realistic ceiling on what Fleetco could charge other fleet companies. It's a real but
modest number — it means the resale business needs volume, and that volume means the pooled
tenancy model in [[Tenancy Model]] eventually matters. Note also that AI features and the
QuickBooks integration sit behind the top tier, which is a plausible source of Fleetco's
frustration and a clear differentiation opening.

## Working Knowledge — Unverified, Needs Confirmation

Standard concepts in heavy-duty repair that FullBay is very likely built around. Flagged because
getting these wrong would distort [[Domain Model]].

- **The three C's** — Complaint, Cause, Correction. The standard structure for documenting a
  repair line in heavy-duty work. Almost certainly how FullBay models service order detail.
- ~~**VMRS coding**~~ — **Resolved: not in use, do not build.** Vehicle Maintenance Reporting
  Standards is the industry taxonomy for system/assembly/component codes, and fleet customers
  *can* require VMRS-coded history. Fleetco's contact was unfamiliar with it and the live
  configuration was empty, so it is CRUFT for this project. Revisit only if a future fleet
  customer demands it.
- **Customer authorization** — the distinguishing workflow versus general auto repair. A shop
  diagnoses, quotes, and must get the fleet's explicit approval *before* proceeding, often with
  dollar thresholds and per-line approval. This is a workflow, not a form, and it's where a lot
  of the product's real complexity lives.
- **Units** — heavy-duty shops track "units" (tractors, trailers, reefers) rather than "vehicles,"
  and a unit may have serialized major components (engine, transmission) tracked separately.
- **Core charges / core credits** — confirmed present in FullBay. Rebuildable parts carry a
  deposit refunded when the old part is returned. This has real accounting implications.
- **Warranty work** — repairs covered by OEM or shop warranty bill differently or not at all, and
  OEM claim submission is its own workflow.
- **Labor guides** — MOTOR and Mitchell 1 supply standard repair times used for estimating. The
  integration is a paid data feed, which is a cost line and a potential moat.

## Research Plan

The deep analysis Dave wants, in order. **Reading the marketing site is not the analysis** — most
of what matters is invisible from outside.

### Phase 1 — Get access
Ask Fleetco for a read-only FullBay login, or screen-share sessions. Without this, everything
downstream is guesswork. ([[Open Questions]] Q4)

### Phase 2 — Shadow real users
Separately observe, because they'll say different things:
- A **service advisor** working intake through invoice
- A **technician** on the shop floor, on whatever device they actually use
- The **owner** on reporting and month-end
- A **customer** using the portal

For each: what screens, how often, what's painful, what gets worked around in spreadsheets.
The spreadsheet workarounds are the highest-value product signal available.

### Phase 3 — Screen-by-screen inventory
Enumerate every screen and field. Produce [[Feature Inventory]] scored as:
- **Must have for pilot customer**
- **Must have for any shop**
- **Nice to have**
- **Cruft nobody uses** ← expect this to be a large bucket, and it's where the scope savings are

### Phase 4 — Data model reverse-engineering
From exports, API responses, and URL structures, infer FullBay's entities and relationships.
Feeds [[Domain Model]] and the migration plan.

### Phase 5 — Export and migration assessment
Answer [[Open Questions]] Q1 definitively. What can come out, in what format, how complete is the
history, and what has to be re-entered by hand.

### Phase 6 — Gap and differentiation analysis
Where FullBay is genuinely weak, and what "modern" concretely means here. Candidates to test:
mobile technician experience, portal quality, reporting flexibility, speed, and whether AI
features being top-tier-only is a real irritation.

## Open Items

- [ ] Secure read-only FullBay access
- [x] **Resolved 2026-10-09** (logged-in pass): the three C's are **Concern**/Cause/Correction; **VMRS is not in use** by Fleetco and its live config was empty; authorization is per-line *plus* four named delegate contacts. See [[Feature Inventory Draft]] and [[Domain Model]].
- [ ] Pull the actual pricing page and confirm per-user vs flat pricing
- [ ] Determine which of the named integrations Fleetco actually uses
- [ ] Test the data export path hands-on
- [ ] Collect FullBay complaints in users' own words ([[Open Questions]] Q10, Q11)

## Sources

- [Fullbay](https://www.fullbay.com/)
- [Fullbay Pricing](https://www.fullbay.com/pricing/)
- [Fullbay on GetApp](https://www.getapp.com/retail-consumer-services-software/a/fullbay/)
- [Fullbay on Software Advice](https://www.softwareadvice.com/cmms/fullbay-maintenance-profile/)
- [Fullbay vs Shop-Ware for Heavy-Duty Diesel Shops (2026)](https://wrenchpod.com/blog/fullbay-vs-shop-ware-for-heavy-duty-diesel-shops-an-independent-owner-s-honest-breakdown-2026)

## Related

- [[Competitive Landscape]]
- [[Feature Inventory]]
- [[Domain Model]]
- [[Open Questions]]
