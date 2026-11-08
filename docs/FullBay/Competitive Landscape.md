---
status: draft
summary: Who else plays here. Stub
created: 2026-10-08
updated: 2026-10-30
tags: [fleetco, competitive-analysis, market, saas]
source: Claude Code (Xerro)
---

## Overview

Who else sells software to heavy-duty repair shops and fleet maintenance operations. This matters
for two separate reasons, and they pull in different directions:

1. **For the pilot build:** what feature baseline a shop expects, and where the real gaps are.
2. **For the resale play:** whether Fleetco entering this market is credible, and against whom.

**Status: stub.** Enough structure to fill in, with initial leads below. Do this *after*
[[FullBay Analysis]], since FullBay is the only competitor whose details actually gate phase one.

## Why This Deserves Real Work Before Dave Commits

The resale ambition is the main reason to take this project seriously, and it is also the part
most likely to be built on a misreading of the market. "FullBay has stopped innovating" is a
thesis, not a fact — it needs testing against what FullBay actually shipped in the last two years
and against what the rest of the field offers. If three well-funded competitors are already
eating FullBay's lunch with modern products, Fleetco's reseller plan is much weaker, and the
honest recommendation might be "build the internal tool, skip the SaaS dream."

Conversely, if this is a genuinely sleepy category with dated incumbents and sticky customers,
that's an unusually good place to build vertical software.

## Known Leads

Surfaced during initial FullBay research on 2026-10-08. **Unvalidated** — names only, no
assessment yet.

| Product | Category | Notes |
|---|---|---|
| **FullBay** | HD repair shop management | The incumbent. See [[FullBay Analysis]]. |
| **Shop-Ware** | Repair shop management | Comes up in direct head-to-head comparisons with FullBay for HD diesel shops |
| **Mitchell 1** | Labor guides + shop management | Also a FullBay *integration* — both supplier and potential competitor |
| **MOTOR** | Labor guide data | Data supplier, not a direct competitor |
| **Samsara / Motive** | Telematics, expanding into maintenance | Watch these — telematics vendors moving up into maintenance workflow is the real platform threat |
| **Whip Around** | DVIR / inspections | Point solution, FullBay integration partner |

**Not yet researched:** the broader fleet maintenance management (FMMS/CMMS) category, dealer
service systems, and anything purpose-built for the specific verticals FullBay names
(construction, agriculture, emergency vehicles, towing).

## Research Plan

1. **Build the real list.** Search the HD shop management and fleet maintenance categories on
   G2, Capterra, Software Advice, and GetApp. Also ask Fleetco directly — they evaluated
   alternatives before choosing FullBay, and they hear from vendors constantly.
2. **Read reviews adversarially.** One- and two-star reviews across all of them. Recurring
   complaints are the product spec. Pay special attention to complaints that appear for
   *every* vendor — those are either genuinely hard problems or category-wide blind spots.
3. **Check FullBay's actual release velocity.** Changelog, release notes, blog, LinkedIn
   announcements. Does the "stagnant" thesis hold up? The AI note-cleanup and voice features
   suggest they are not fully asleep.
4. **Price the category.** FullBay lists $188–258/month. Where does everyone else sit? This sets
   the revenue ceiling for the resale play.
5. **Map the telematics threat.** Samsara and Motive have far more capital and already own the
   data pipe into the vehicle. If they build maintenance workflow, that reshapes the market.
6. **Identify the wedge.** One thing Fleetco's product does conspicuously better than everyone.
   "Modern UI" is not a wedge — every incumbent gets rewritten eventually. A workflow insight
   from actually running a fleet company is.

## Fleetco's Real Advantage

Worth stating up front so the research has a hypothesis to test: Fleetco **operates** a fleet
management business. Most vendors in this space do not. That's a genuine and defensible
advantage — domain credibility, a real design partner, and a first customer with revenue — but
only if the product encodes operating insight rather than just looking nicer.

## Open Items

- [ ] Build the full competitor list from review sites
- [ ] Ask Fleetco which alternatives they evaluated and why FullBay won
- [ ] Audit FullBay's shipping velocity over the last 24 months
- [ ] Price survey across the category
- [ ] Assess the telematics-vendors-moving-up threat
- [ ] Articulate the wedge in one sentence

## Related

- [[FullBay Analysis]]
- [[Project Brief]]
- [[Feature Inventory]]
