---
created: 2026-10-11
updated: 2026-10-11
tags: [project, business, fleetco, engagement, compensation, m1, m2]
status: draft — iterating, not yet presented
source: Dave + Xerro, working session on role/compensation
---

## Overview

The engagement-terms document for the OTC Fleet Services (working name: **Fleetco**) project. This is
the artifact for **[[Roadmap#M1 — High-level plan presented to Fleetco|M1]] and [[Roadmap#M2 — Engagement terms agreed in writing|M2]]** — it is the plan *and* the terms in one page.

It is a **working scaffold for iteration**, not a polished proposal. Bracketed `[ ]` items are decisions
still open and the exact numbers are not set. It is not to be presented to OTC until the open items in
[[#Open decisions]] are resolved.

### What this is trying to do

Turn the undefined role question ([[Open Questions#Q3. What is Dave's role and compensation structure?]])
into a clean, written structure with three properties:

1. **Compensation is priced on value, not hours.** The billable-hour model no longer fits — coding
   agents collapsed Dave's effort to a few days, so clock hours no longer track either his effort or the
   value delivered. What is actually scarce is **judgment/taste** (the architecture, the
   [[Architecture/Architecture Decisions|27 ADRs]]), **de-risking** (standing between OTC and a failed
   cutover of a system a business runs on), and **speed-to-value** (off FullBay faster than their own
   prototype would get them). The number is set by a **two-sided test**, not by a market rate and not by
   a clock: see [[#The two-sided test]].
2. **A three-stage lifecycle, split along the seam that already exists in [[Fleetco Overview]].** Only
   stage 1a — plus a bounded bridge — is in near-term scope; the rest is kept in the conversation, off the
   near-term plan and off the near-term pay:
   - **1a — V1 + cutover.** Get OTC's pilot customer(s) off FullBay on a FullBay-parity feature set.
     Bounded, judgment-intensive. **Funded and priced now.**
   - **1b — enhance / mature the product.** After cutover, OTC wants to keep adding functionality beyond
     what FullBay offered. Ongoing, *never-done* work — a whole product-evolution phase. **OTC-staffed
     (their operator + feature dev), not Dave's.** This is the transition where Dave stops being the sole
     dev, and it is also the bridge that must exist before resale is even thinkable.
   - **Part 2 — resale.** Off the near-term plan and near-term pay, per Q7 and Dave's call. Resale comes
     *after* a mature product, so there is a whole mid-term phase (1b) between now and it.
3. **A real fee protects the friendship.** Paying something real is what converts "helping a friend" into
   a professional arrangement the friendship can survive — it buys OTC the right to expect delivery, and it
   buys Dave the right to say no to scope. The 1b staffing question (can OTC fund an operator and a feature
   dev?) is a **planning** question, not a loyalty test: the answer determines whether there is a real exit
   route or whether Dave is the permanent dev by default, which is a thing both sides need to know up front.

### Why custom, and not another SaaS

**The driver is roadmap control, not cost.** OTC does not want a cheaper FullBay — they want to own the
roadmap: add the features *they* think are valuable to their customers and to their own workflows, on their
timing. FullBay falls short there, and so does every available SaaS replacement. That is the premise of the
whole project, and it is worth stating plainly because it pre-answers the obvious cheaper alternative:

- **Switching SaaS doesn't solve it.** Per-asset tools (Fleetio $4–10/asset/mo, RTA Fleet $6–11/asset/mo)
  may well be cheaper than FullBay, but they are fleet-*operator* maintenance trackers — they don't do the
  commercial-shop workflow (service orders, labor, parts, customer invoicing) or the customer-facing portal
  OTC's business actually runs on. And a different vendor's roadmap is still not OTC's roadmap.
- **So the $5k/month is a budget reference, not the ROI case.** It says what OTC already spends on software
  that doesn't do what they want. The value of this project is the roadmap, not the subscription saved.
- **Which also means 1b is the point, not an afterthought.** "Keep adding features" *is* the reason to
  build. That makes the 1b staffing question (below) the most important thing to settle, not a detail.

### Note on the existing prototype

The current state is a real, non-trivial app — **myotcfleet.com** (TanStack Start / SSR, Supabase,
Cloudflare), already carrying a multi-tenant / white-label layer. See [[Product/myotcfleet Recon]]. This
makes resale *more credible* than "aspirational," and makes the app a strong requirements source. It does
**not** change the plan above: resale stays off the near-term plan and near-term pay per Dave's call. The
FullBay side is now clearer too — the API is narrow and invoice-only, with a mobile-first "Fullbay Next"
announced Aug 2026 but no GA date. See [[FullBay/Data Export Feasibility]]. Both are tracked as open items
below, not re-litigated here.

---

## The two-sided test

**This is a conversation, not a quote.** The framing to open with, and to keep: *"let's find a number that's
a no-brainer for you and worth it for me."* Both halves are real constraints, and naming both out loud is
what keeps this from drifting into either a favor or a negotiation.

**OTC's half — is it a no-brainer?** The test is not "is this cheap relative to what Dave could charge."
It is: *for the price of a few months of what you already spend on software you don't control, you get the
system you do control, and a working cutover.* If OTC has to think hard about whether the number is worth
it, the number is wrong.

**Dave's half — is it worth the time?** Honest constraints, stated plainly:

- This is **side work**. The spare time exists; the compensation is what justifies spending it this way
  rather than on family or on Dave's own projects.
- **Not trying to make a fortune here.** The goal is a number that feels fair on both sides, not maximized.
- What the fee has to cover: a few weeks of concentrated attention, plus the **tail** — being the single
  point of failure on a system a business runs on until the handoff is real. The tail is the part that is
  easy to underprice, because it is invisible at signing time.
- The practical form of "worth it": a weekly figure Dave would accept for side work × the realistic number
  of active weeks. Set that first, then sanity-check it against the reference points below.

**What this document deliberately does not do:** argue about how large a discount Dave is giving. The gap
between his number and an agency's is a fact about how he works, not a concession to be priced, tallied, or
leaned on by either side. It is in here as *context for sizing*, nothing more.

### Reference points — what this costs other ways

Useful for sizing the conversation and for answering "what would this cost otherwise?" if it comes up.
**Order-of-magnitude, for discussion — not quotes**, and they update when Q1 / Q5 / inventory depth resolve.
Both a traditional and an AI-leaning firm are shown, since in 2026 a buyer would get quotes of both kinds.

**Sizes (from the [[Product/Domain Model]] and [[Product/Feature Inventory]]):** ~12 functional areas
across ~70 domain entities — a full vertical SaaS.

| | **V1 — traditional firm** | **V1 — AI-leaning firm** | **Full replacement — traditional** | **Full replacement — AI-leaning** |
|---|---|---|---|---|
| Scope | ~8–12 golden modules + platform foundation + portal + 1 light (CSV) integration; one-customer migration | same | All ~12 areas; full inventory, PM, inspections/DVIR, reporting, full mobile, deep integrations, all-customer migration | same |
| Direct engineering | ~1,800–2,300 hrs | ~1,100–1,500 hrs (−35%) | ~4,000–5,500 hrs | ~2,400–3,600 hrs (−35%) |
| + PM, QA, design, cutover, contingency | ~2,700–3,500 (+50%) | ~1,900–2,600 (+70%) | ~6,000–8,000 (+50%) | ~4,100–6,100 (+70%) |
| Calendar (small team) | ~5–8 months | ~4–6 months | ~12–18 months | ~9–14 months |
| Blended rate | $130–160/hr | $150–190/hr (senior-only "AI pod", billed at or above standard) | $130–160/hr | $150–190/hr |
| **All-in** | **~$150k–$350k** (to ~$450k senior-heavy) | **~$110k–$250k** | **~$0.75M–$1.2M+** | **~$0.55M–$0.9M** |

**Why the AI column only drops ~30%, not 10x.** Worth knowing, because the instinct in 2026 is "AI should
make this nearly free," and that instinct will shape what OTC expects *any* bidder to charge. Three reasons
it doesn't hold for a *firm*:

1. **Only code production compresses.** Discovery, data migration, UAT, training, cutover rehearsal, and
   stakeholder time are calendar- and human-bound. They are ~40–50% of a replacement project and AI barely
   touches them.
2. **Review becomes the bottleneck.** Measured at enterprise scale, coding agents raise code volume ~30%
   while review time rises ~49% and revision requests nearly double; aggregate reported productivity gain
   is ~19%, not 10x. A firm must *add* review overhead (hence +70% rather than +50% above) because its
   liability model requires human sign-off on agent output.
3. **Firms don't pass the savings through.** AI-forward shops have moved to value-based pricing and bill
   senior-only pods at standard or premium rates. The efficiency goes to their margin, not the invoice.

**Why Dave's number is structurally different.** Not "AI is cheap" — three things a firm cannot do:
(a) **no review tax** — Dave *is* the architect and the reviewer, so agent output is checked by the person
who set the architecture rather than by a second billable human; (b) **no coordination layer** — no PM, no
handoffs, no spec written for someone else, and he already holds the domain context a firm has to buy
through discovery; (c) **he already knows the business** and has the knowledgebase built. This is why the
reference points above are context and not a benchmark to discount from — the work isn't the same shape.

**The one thing the reference points don't cover: the tail.** A firm *spreads* schedule, quality, and
maintenance risk across people and time, and prices that in. Dave, alone, **absorbs** it — single point of
failure on a system the business runs on, plus an AI-driven, review-limited build unproven at this scale.
So the fixed fee should be sized for *the build plus the tail*, and the bridge retainer and the two-exit
sunset are the mechanisms that keep the tail from being open-ended. Since resale is not the plan
(Dave's call), there is no upside component doing that job — the cash number and the bounded sunset are
the whole arrangement, which is a reason to get both right rather than to lean on either.

**What moves the numbers (all already tracked):**
- **Mobile/offline (Q5)** — the biggest swing. Offline *tablet sync* is a separate subsystem (PowerSync /
  Electric-SQL class) and roughly *doubles* the full-replacement figure; V1 avoids it only if desktop-first.
- **Data migration (Q1 / [[FullBay/Data Export Feasibility]])** — clean export = cheap; the narrow
  invoice-only API = screen-scrape and the schedule roughly *doubles*.
- **Inventory depth** — "can the pilot go live without real stock/count?" is the
  [[Product/Feature Inventory|biggest available V1 reduction]]; it cuts both figures materially.
- **Payments** — handling the customer's own card/ACH/BNPL is complex + PCI/PII; staying CSV/external
  keeps it small.
- **Quality/risk Dave absorbs** — an AI-driven, review-limited build is fast but unproven at scale; the
  risk isn't removed, it is concentrated in one person. This is the "tail" the fixed fee has to account for.

**Rate and productivity basis (checked Oct 2026).** US senior contract devs $150–250/hr; US agency blended
$100–250/hr; mid-complexity SaaS projects $125k–400k; MVP/PoC $25k–75k. AI productivity: Gartner reports a
net ~19.3% average gain with 90% of engineering leaders seeing improvement; a Harvard-cited enterprise study
found agents produce ~30% more code with review time +49% and revision requests nearly doubled; METR found
experienced devs were ~19% *slower* on familiar codebases. AI-forward agencies price on value, not hours, and
avoid productivity-based discounts. Sources: [match.dev](https://www.match.dev/post/custom-software-development-cost/),
[keyssinc](https://keyssinc.com/custom-software-development-cost-2026-usa/),
[Gartner](https://www.gartner.com/en/articles/enterprise-ai-coding-agent-market),
[Harvard study coverage](https://forkast.news/ai-coding-agents-write-30-more-code-and-resolve-zero-additional-issues-harvard-study-finds/),
[AI agency pricing](https://developersmatrix.com/blog/ai-automation-agency-pricing-2026).
FullBay list pricing is ~$188–318/mo base plus $89–119 per additional user, so OTC's $5k/mo implies roughly
**40–50 seats or multiple shop locations** — worth confirming via Q18. Competing SaaS pricing (Fleetio,
RTA Fleet) is in [[#Why custom, and not another SaaS]] and in [[FullBay/Competitive Landscape]]; it is
cheaper than FullBay but doesn't address roadmap control, which is the actual driver.
Sources: [software connect](https://softwareconnect.com/roundups/best-fleet-maintenance-software/),
[shop management comparison](https://wrenchpilot.io/shop-management-software-comparison).

---

## Part 1 — Replace, then evolve

The near-term plan and the near-term compensation live in **1a**. **1b** is the mid-term product phase that
follows cutover; it is OTC-staffed and is why the bridge has two exits. Nothing in Part 2 adds to either.

### 1a — V1 + cutover (funded and priced now)

### Scope

- Fully replace FullBay for **one smaller OTC customer**: OTC's internal staff run that customer's vehicles
  in the new system, and the customer's own people log into the new portal instead of FullBay's.
- Delivered against the [[Product/PRD|PRD]] once [[Roadmap#M4 — Phase-one scope locked|M4]] locks it, with
  an explicit out-of-scope list.
- Milestones: [[Roadmap#M6 — Walking skeleton deployed|M6]] → [[Roadmap#M7 — Phase-one feature build|M7]] →
  [[Roadmap#M8 — Pilot customer cutover|M8]]. Cutover exit criterion: a full billing cycle in the new system
  without falling back.
- **Also delivered for 1a:** a *handoff-ready* system — the knowledgebase (architecture, agent playbooks,
  testing strategy, golden module, ADRs) plus runbooks — so a 1b feature dev can pick it up. Making 1a
  handoff-ready is part of what the fixed fee pays for.

### Compensation — 1a is a fixed fee; the bridge carries OTC to 1b

| Line | What it is | Suggested range* | Notes |
|---|---|---|---|
| **Fixed fee — 1a build** | The bounded project: M6→M8 cutover *and* a handoff-ready system | `[ $20–30k ]` | Set by the [[#The two-sided test\|two-sided test]]: a few months of OTC's current software spend on one side, a few weeks of Dave's concentrated attention plus the SPOF tail on the other. |
| **Bridge retainer / advisory** | Ongoing support while OTC stands up their 1b team; **sunset by design, two conditions** | `[ $2–3k/mo ]` | Sunsets when *both* exit conditions below are met. The *bounded* form of the permanent-obligation concern, not a decade-long on-call. |
| **OTC operator / on-call (their cost)** | Runs and supports the live system — needed at/near cutover | `[ name the number ]` | Staggered: earlier of the two hires. The "cost of running an in-house SaaS"; OTC's line item. Naming it grounds value in dollars. |
| **1b feature dev (their cost)** | Drives new features / product evolution after cutover | `[ name the number ]` | Staggered: later of the two hires — starts when OTC decides to enhance, not at cutover. The role Dave transitions *out* of. |

*Suggested ranges to reason from — not quotes. Dave sets the exact numbers in the conversation. Each is
labeled as an assumption and updates when [[Open Questions#Q18. What exactly makes up the $5,000/month FullBay bill?|Q18]]
(and the forcing function, Q12) return. The fixed fee floors at Dave's cost + premium regardless of Q18.

### 1b — enhance / mature the product (mid-term, OTC-staffed)

*The trap to design around.* 1b is *never done* — "keep adding features beyond FullBay" is an open-ended
stream. Because the system is Dave's architecture and his knowledgebase, OTC has a strong, rational
incentive to keep paying **Dave** for 1b instead of hiring a dedicated dev. Unmanaged, that turns "helping
a friend" into a permanent, part-time, under-compensated CTO role. So 1b must **default to OTC-staffed**,
with Dave's post-cutover role deliberately bounded (advisory / lead / architect-on-call at a premium, or out
entirely — **not** "I'll just keep building features"). Keeping 1b real and OTC-funded also protects
resale: you can't resell an immature product. It protects your family for the same reason.

### The bridge sunset — two exits (this is the exit route)

The retainer covers the transition while Dave is the SPOF on a system OTC's livelihood depends on
(the [[Open Questions#Q15. What are the real support expectations?|Q15]] / [[Architecture/Operations|Operations]]
concern). It ends when **both** hold:

- OTC has **a feature dev** driving 1b, *and*
- OTC has **an operator / on-call** running the live system,
- and the handoff is **real, not aspirational**: the knowledgebase (architecture, agent playbooks, testing
  strategy, golden module, ADRs) plus runbooks/training make those roles genuinely able to, and a
  **fallback** (managed support vendor or second-tier on-call) is in place so a weak/absent role can't
  route incidents back to Dave by default.
- `[ sunset window + OTC's 1b team size: e.g. 6–12 months, shrinking on-call ]` — **set explicitly, up
  front.** This is what protects Dave's family life: the ongoing commitment is bounded by design, not by
  intention.

---

## Part 2 — Resale to other fleet companies

**In the room, off the table.** Not planned for, not paid for, not built into the near-term pay above.

- **Keep it in the conversation.** State plainly that the resale vision exists, and roughly what staffing a
  *resold* SaaS looks like — a support org, feature velocity, eventually a small team. That is a company,
  not an extension of Part 1, and saying so grounds the whole discussion in dollars and tells OTC the two
  are different funding conversations.
- A credible-enough premise exists (the [[Product/myotcfleet Recon|myotcfleet.com app]] already has a
  white-label layer), but per Dave's call resale is not the near-term plan and comp does not depend on it.
- **Re-entry condition (one-liner, optional):** `[ "If resale moves past 'small possibility', we revisit
  structure and ownership — including equity / revenue-share on new tenants." ]` This is the cheapest way
  to keep Part 2 alive without pinning comp on it. If Dave prefers a purely verbal "we'll talk when it's
  real" instead, that is an acceptable substitute — a decision to make before writing M2.

---

## What Dave needs from OTC (the M1 asks)

An explicit list, to be presented first — these gate everything and are the "here's what I need from *you*"
half of M1.

- **Q18** — the real FullBay invoice (line items, shop/user/technician count, any payment-processing
  modules). Sets the value ceiling and the size of the Part-1 fixed fee.
- **Q1** — the data-export situation is now partially known ([[FullBay/Data Export Feasibility]]): narrow,
  invoice-only API, possibly gated behind "Fullbay Connect." Confirm OTC's actual account tier and whether
  a full customer/unit/service-order/parts history can be extracted, or whether migration is manual.
- **Q4** — a read-only FullBay login so a full day can be watched work-by-work, not estimated.
- **Q12** — the forcing function / real deadline (contract renewal, price increase, a customer at risk).
- **Q15** — support expectations (business hours, weekend/evening shop work, downtime cost, intake point).
- **Q13** — who drives and maintains this besides Dave: **two roles, staggered** — an operator/on-call
  (run and support the live system, needed at/near cutover) and a 1b feature dev (drive new features when
  OTC decides to enhance, needed later).
- **Q17** — AWS account: does OTC have one, and in whose name should it and its billing live.

---

## Open decisions (settle these to move past draft)

- **Fixed fee (1a)** — settle it with the [[#The two-sided test|two-sided test]], not against the reference
  table. Do Dave's half first and independently: pick the weekly figure that makes side work worth it,
  multiply by realistic active weeks, add something for the tail. That is the floor, and it holds regardless
  of what Q18 returns. Then check it reads as a no-brainer next to OTC's current spend. Decide before M1.
- **Retainer amount + sunset window** — e.g. 6–12 months, shrinking on-call. The sunset is *two-exit* (both
  a feature dev and an operator hired), so the window must cover both.
- **Dave's role in 1b** — advisory / lead / architect-on-call at a premium, or out entirely. Decide which;
  the default must *not* be "keep building features."
- **1b trigger + OTC's team size** — when OTC decides to enhance, and the size of their feature dev +
  operator. Sets the two-exit sunset.
- **Feature dev + operator costs** — OTC's two ongoing hires; name the numbers and their timing (operator
  at cutover, feature dev on 1b start). Feeds Q13/Q15.
- **Part-2 re-entry trigger** — written one-liner, or verbal.
- **IP ownership** — required for M2, and it becomes urgent the moment resale is any more than theoretical
  (Q3 → Q7).
- **Does Q18 change the denominator?** If the $5k is multi-shop / large-user / includes payment processing,
  the ROI comparison and the fixed-fee scale both shift.

---

## Related

- [[Roadmap]] — the plan of record (M1→M8); this doc is the terms that M1/M2 produce.
- [[Project Brief]] — the situation, players, and Dave's decision criteria.
- [[Open Questions]] — Q1–Q18; the asks and open decisions above map onto them.
- [[Fleetco Overview]] — knowledgebase index; the three-stage (replace / evolve / resel) framing lives here.
- [[Architecture/Operations]] — the permanent support-load concern that the bridge retainer bounds.
- [[Product/myotcfleet Recon]] — the existing app; why resale is more credible than "aspirational."
- [[FullBay/Data Export Feasibility]] — the narrow/invoice-only FullBay API that shapes migration and timeline.
