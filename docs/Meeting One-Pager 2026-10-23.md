---
created: 2026-10-23
tags: [fleetco, meeting, one-pager, client-safe]
status: client-safe handout / on-screen reference for the 2026-10-23 OTC meeting
audience: shareable with Dan and Cam
source: condensed from [[Meeting Brief 2026-10-23]]
---

# OTC — Platform Review & Next Phase

**With:** Dan, Cam · **Date:** 2026-10-23

## Agenda

| | Topic | Min |
|---|---|---|
| 1 | Where things stand — what I reviewed | 10 |
| 2 | Hosting and the monthly number | 10 |
| 3 | The fork, the phased migration, and what V1 means | 25 |
| 4 | Compensation — structure | 15 |
| 5 | FullBay walkthrough (techs, then back office) | 60–90 — **book separately and record** |

The two decisions today are **the fork** and **compensation structure**. Everything else is
information transfer. The walkthrough is the single most valuable session in the project and
deserves its own recorded slot this week.

## 1. Where Things Stand

- **I read the whole app, not a demo.** 17 authenticated routes crawled, then the repo: 203 files,
  ~48,000 lines, 50 tables, 201 row-level security policies, 90 migrations. Cam built something
  real — a proper schema, a genuine permission system, server-side logic kept off the browser, and
  a multi-tenant white-label layer already in place.
- **It is a customer portal, not a FullBay replacement.** No tables for work orders, technicians,
  labor, parts, inventory, estimates, or time clock. The repair still happens in FullBay; the app
  shows the customer what FullBay decided and collects the approval. What it *does* give us is a
  finished specification of the customer experience — the part FullBay does worst.
- **FullBay's API is invoice-only, confirmed from both sides.** Seven endpoints tried; only invoices
  answer usefully. So the vehicle roster has to be inferred from up to two years of invoice history,
  and there is **no write path at all**.
- **The architecture for a replacement is done.** 27 decisions written down with reasoning and
  counter-arguments. Four backend frameworks each built out as a working module and compared;
  NestJS won. Hosting, tenancy, auth, backups, environments, testing, and cost model all settled.
- **The bottleneck is information only OTC has.** That is most of this meeting.

## 2. Hosting — AWS

The real question isn't which vendor. It's **does the browser talk to the database, or to our own
API?** The app today is browser-to-database, with 201 security policies as the only guard and no
automated tests behind them. Shop logic — order state machines, authorization gates, labor rates,
parts markup, invoicing — can't live in database policies at all. So we put our own API in front,
and once you do that, Supabase is reduced to a connection string while still sitting in the most
security-sensitive path.

**What AWS buys:** the database has no public address; write-once storage for DVIRs, signed
authorizations and warranty records with legal retention; production copies in minutes for
rehearsing risky changes; restore to any minute plus an independent off-account backup; one vendor,
one bill, one access model; long-lived connections for live shop status.

**Honest trade-offs:** more setup surface, a better developer experience given up, and the
operations burden lands on me rather than a vendor's on-call team.

### The number

*Approximate, us-east-1, May 2026 pricing snapshot. To be verified in the AWS calculator before any
commitment.*

| | Supabase + Cloudflare | AWS | Difference |
|---|---|---|---|
| Platform only (database, compute, storage, networking) | ~$60–100 | ~$109–174 | **+$50–110/mo** |
| All-in, including non-prod, error tracking, analytics, email/SMS, frontend | ~$150–300 | **$200–400** | **+$50–110/mo** |

**The ask is roughly $100/month — about $1,200/year.** Cost is not the argument for AWS; AWS is the
more expensive option and I'm recommending it anyway. What the money buys is the list above.

**Sequencing:** this only becomes real under Option B. If we deepen the portal instead, it stays
where it is and nothing moves.

## 3. The Fork

Two different projects, not two phases of one.

**Option A — deepen the portal.** FullBay stays the shop system; the customer side gets excellent.
Low risk, each piece ships alone, useful improvements in weeks, the FullBay bill unchanged. You get
the best customer portal in this trade plus compliance and driver-reporting features FullBay doesn't
offer.

**Option B — replace the shop system.** Work orders, estimating, parts, labor and technician time,
then cut the shop over. High risk concentrated on single dates, measured in quarters not weeks,
FullBay bill eventually eliminated. The hard part isn't the database — it's the depth of the screens.

Worth noting: everything that can be built *without* touching technicians, parts, or the ledger is
almost exactly what Cam already built. They found the furthest you can get without a full migration.

## 4. If It's Option B — The Phased Plan

**A one-customer pilot does not work the way we assumed.** Moving one customer's data is fine; their
*work* flows through things the whole shop shares — technicians (one payroll number), parts (one
physical shelf), accounting (one ledger).

**So this is two complete silos, with no bridge.** FullBay has no import and no write path, so there
is nothing to integrate with. The silo boundary is the customer and it is absolute — no truck half
in each, no split jobs or invoices. People handle the seams by hand and we keep the window short.
"Can't it just sync with FullBay?" has to be a no: a bridge means scraping their screens, which
breaks on their schedule and costs more than the double entry it replaces.

**What it costs:** every advisor and tech logs into two systems daily and has to know which silo a
truck lives in. That routing decision is where mistakes will come from.

### The three shared resources

- **Technicians.** Open question: does FullBay have a plain punch clock separate from clocking
  against a repair order? If yes, techs punch in FullBay all window, payroll stays in one place, and
  the new system records only billable hours. If time is only recorded against an order, the new silo
  needs its own time capture and labor moves into V1. **One of the two biggest scope swings.**
- **Parts.** FullBay keeps the count; the new system just bills the part with cost and markup.
  Weekly, we produce a "parts consumed" list and one batch adjustment gets typed into FullBay. POs
  stay in FullBay. **So no inventory module in V1.**
- **Accounting.** The most tractable of the three. QuickBooks doesn't care how many systems feed it,
  only that every transaction appears exactly once. Five things: (1) **invoice numbering must not
  collide — decide before invoice one**; (2) always write to the existing QuickBooks customer, never
  a new one; (3) invoices by hand or CSV at first is genuinely fine; (4) **sales tax has to be right
  on invoice one**; (5) payments — if customers pay through FullBay today, a migrated customer can't.

### The shape — two cuts, not ten

1. **Shadow run (2–3 weeks).** A handful of real jobs entered in parallel with FullBay, purely as
   practice. FullBay stays the only real invoice. Finds bugs and trains the advisors with nothing on
   the line.
2. **Cut one.** New customers plus one friendly existing customer live in the new silo. Prove a full
   billing cycle end to end.
3. **Cut two.** Everyone else, in one move.

Each cut is a **date**: work stops in FullBay on a Friday, starts in the new system on a Monday,
FullBay read-only behind it.

**The under-appreciated benefit:** phasing trains the back office on a small, forgiving slice of
work instead of teaching everyone a new system at once on the scariest day of the project.

**The honest caveat:** phasing does not get you off the bill faster — it gets you off it more
safely. You pay for both systems for the whole window, and FullBay's bill likely won't drop as
customers leave because it's almost certainly priced per shop and per seat. If "as soon as we can"
means "stop paying FullBay," phasing is the slower path to that. It's the faster path to working
software you control. Worth agreeing which one we mean.

**What makes it fail:** picking a large or parts-heavy pilot customer instead of a simple one; the
window stretching from a quarter into a year; no way to put the pilot back in FullBay if month-end
goes wrong; scope creeping back in; work landing in the wrong silo. **The plan needs a committed end
date for the whole migration, not just a start date for the first customer.**

### What V1 is

Phasing by customer reduces **volume, not functional surface** — a customer in the new silo has to
be fully served there, so the per-job loop must be complete on day one.

**In:** customers, contacts, units · service order lifecycle with three C's on repair lines ·
estimates and the customer authorization gate · parts *billed* on an order · billable labor on a
repair line · invoice generation and PDF · customer portal (see work, authorize, see invoices) ·
staff auth, roles, tenancy, audit log.

**Out:** stock counting and POs · PM automation · DVIR · shop reporting · QuickBooks integration ·
payments · historical data · offline tablets · payroll time, if FullBay's punch clock stands alone.

### Five questions that size it

1. **Is historical data required at go-live?** If FullBay can stay read-only for history and new work
   starts fresh, the hardest part of the project becomes optional. Highest-leverage question here.
2. **Does FullBay's punch clock stand alone, or is time only recorded against a repair order?**
3. Confirm: can we go live without stock counting and POs?
4. **Do technicians need tablets that work offline on day one?** If yes, that's a sync engine rather
   than an app and it roughly doubles the build.
5. Which of FullBay's 38 reports, and how much PM automation, are genuinely day-one?

**I'm not giving a date today.** A date built on an unverified export path and an unvalidated feature
list is a date that moves. After the walkthroughs and the export spike, a date is a real number.

### Work worth starting either way

Portal security hardening (201 data-access rules, no automated tests behind them) · fix staff
impersonation, which temporarily rewrites a staff member's company · close fleet-group scoping gaps
(correct on four screens, not on eight others) · finish or delete the half-built vehicle-lifecycle
and vendor modules · turn on what's already built (13 of 14 modules were disabled on the test
account).

## 5. Compensation — Structure Today, Numbers Later

Goal: *a number that's a no-brainer for you and worth it for me.* For the price of a few months of
software you don't control, you get the system you do.

**Today is about structure.** The V1 price depends on what the walkthroughs and the export attempt
turn up. I'd rather derive that number in a few weeks than guess at it now.

| Stage | Shape | When the number gets set |
|---|---|---|
| **Phase 0 — discovery and de-risk** (4–6 weeks) | Fixed fee, paid up front | Can be set now |
| **V1 build + first cutover** | Fixed fee, paid in tranches: at start, at a working end-to-end slice, at a completed billing cycle | End of Phase 0 |
| **Remaining migration waves** | Per wave, or folded into the retainer | After the first cutover |
| **Post-cutover support** | Monthly retainer with a written sunset | End of Phase 0 |

Fixed fees for build work, retainer only on the support tail — a retainer funding an open-ended
build has no moment where a phase is done.

**Phase 0 delivers the four things everything else waits on:** (1) recorded walkthroughs and a
feature list scored and signed off by OTC; (2) the **export spike** — a real FullBay export loaded
and reconciled, or a definitive "there isn't one"; (3) the portal security hardening, which is real
value either way the fork goes; (4) a costed V1 scope and a migration plan with dates. It does not
commit to a V1 date, a V1 price, or a build.

**The support sunset.** The retainer ends when OTC has both a feature developer and an operator, and
the handoff is real — documentation, runbooks, training, and a fallback so an absent role doesn't
route incidents back to me by default. Worth setting that window explicitly up front (6–12 months,
shrinking on-call). This is a planning question about whether an exit route exists.

**Resale:** the white-label layer makes the vision credible, but a resold product is a company —
support org, feature velocity, a team. Different conversation; nothing here depends on it.

**Why custom at all:** per-asset tools like Fleetio or RTA run $4–11 per asset per month and may
well be cheaper than FullBay, but they're fleet-*operator* maintenance trackers. They don't do
commercial-shop workflow or the customer portal your business runs on — and another vendor's roadmap
still isn't yours. **The driver is roadmap control, not cost.**

## 6. What I Need From You

1. **An actual FullBay invoice** — line items, shop count, user and technician counts, and whether
   payment processing is bundled in. Published pricing is roughly $188–318/month base plus $89–119
   per additional user, which puts $5,000 at something like 40–50 seats or multiple locations. This
   needs settling before any ROI number is worth presenting.
2. **Export capability** — your FullBay account tier, and whether full customer / unit / service
   order / parts history can be extracted. Any report, CSV, or dump. The API can't supply history.
3. **A read-only staff-level FullBay login**, plus the OTC-internal side of your own app.
4. **The forcing function** — contract renewal, a price increase, a customer at risk. Real deadline,
   or "when it's ready"?
5. **Support expectations** — business hours vs. evening and weekend shop work, what an hour of
   downtime costs, and who at OTC is the intake point. A shared channel rather than texting me.
6. **Who maintains this besides me** — an operator/on-call at cutover, and a feature developer when
   you decide to enhance.
7. **Cam's role going forward**, and in what capacity. It changes the engagement shape considerably.
8. **AWS account** — do you have one, and whose name should it and its billing be in? Worth settling
   in writing before production holds real data.

## The Walkthrough — What to Line Up

A recorded screen share, two sides, roughly 45 minutes each. Not a feature demo — a real person
doing real work start to finish, narrating. "Show me yesterday" beats "show me how it works."

**Session A — shop floor** (a technician, plus whoever assigns work): how work arrives at a tech ·
**clock on and clock off, the actual screens** · the three C's on a repair line, who types them and
when · what happens in software when a part comes off the shelf · **mobile and Wi-Fi honestly** — is
there a tech app, is it used, what happens when the connection drops mid-inspection · inspections
and DVIR, in FullBay or on paper.

**Session B — back office** (service advisor, then whoever invoices): intake to invoice on one real
order, every tab they touch · building an estimate and the authorization conversation · parts
ordering and vendor POs · **do you trust your FullBay stock count today?** · **how is sales tax
handled?** · **how do customers actually pay?** · **what invoice number is FullBay on right now?** ·
month-end and the QuickBooks path · PM scheduling, automated vs. remembered · **which of the 38
reports do you actually run?** · what do you hate, and what do customers complain about in the
portal?

Every item gets scored into one of five buckets: blocks go-live, needed eventually, nice to have,
**nobody here uses it — don't build it**, or only matters for resale. The fourth bucket is the most
valuable one in the project, and it only gets filled by watching. Scoring it together in the room is
what prevents disagreement later.
