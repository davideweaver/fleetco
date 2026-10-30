---
created: 2026-10-22
tags: [fleetco, meeting, brief, m1, m2, aws, compensation, v1]
status: prep for 2026-10-23 morning meeting with OTC
source: Dave + Xerro
audience: Dave (talking brief); the numbers in §2 and §5 are show-able
---

## The Meeting

**Who's in it:** **Dan** — the owner, Dave's friend, and the person the compensation and fork
decisions belong to. **Cam** (Cameron) — built `myotcfleet.com`, and the person whose work §1 gives
credit to and whose future role is an open question in §6.

Five topics Dave wants to cover: status update, AWS hosting and monthly cost, a guided tour of
FullBay from the OTC side (techs + back office, not the customer portal), V1 and where/when we cut
from FullBay, and compensation.

**The two that cannot get squeezed are the fork (§4) and compensation (§5).** Everything else is
information transfer; those two are decisions, and the V1 plan Dave wants to write is downstream of
the fork.

### Suggested order and timing

| | Topic | Min | Why here |
|---|---|---|---|
| 1 | Where I am — what I looked into | 10 | Lead with credit for Cam's app. It sets the tone for the hard news. |
| 2 | Hosting: AWS vs. Supabase, and the monthly number | 10 | Short. The honest headline is "cost isn't the argument." |
| 3 | **The fork, the phased migration, and what V1 means** (§4 + §4b) | 25 | The decision. Everything else is sequenced behind it. |
| 4 | **Compensation — structure only** | 15 | Before the tour, not after. See the note below. |
| 5 | FullBay tour — techs, then back office | 60–90 | **Schedule this separately and record it.** |

**On the tour.** A real walk through FullBay from the tech and back-office sides is 60–90 minutes of
screen share, and it is the single most valuable hour in the project — it populates the feature
inventory, which *is* the schedule. If this meeting is an hour, do not try to fit it; book it as its
own recorded session this week. If they do insist on touring live today, **cover compensation first**,
because the tour will consume whatever time is left and comp is the thing that gets deferred by
default.

---

## 1. Where I Am

Four things, in plain language.

**I read their app — all of it, not a demo.** The live site crawled authenticated across 17 routes,
then the actual repo: 203 files, ~48,000 lines, 50 tables, 201 row-level security policies, 90
migrations. Cam built something real — a proper schema, a genuine permission system, SSR on
Cloudflare with server-side logic held off the browser, and a multi-tenant white-label layer already
in place. That is not a prototype in the dismissive sense.

**But it is a customer portal, not a FullBay replacement.** There are zero tables for work orders,
technicians, labor, parts, inventory, estimates, or time clock. The table that looks like a work
order (`active_services`) is a pointer at a FullBay document plus a cached total. The repair still
happens in FullBay; the app shows the customer what FullBay decided and collects the approval.

That matters for the money question: FullBay's bill is for shop operations, and the app implements
roughly none of that. What it *does* give us is a finished specification of the customer experience —
the part FullBay does worst.

**FullBay's API is invoice-only, and now confirmed from both sides.** OTC said it; the integration
code proves it. Seven endpoints were tried — customers, units, service orders, PM, PM schedules —
and only invoices answers usefully. Two consequences: the vehicle roster has to be *guessed* by
scanning up to two years of invoice history (a truck not serviced in the window simply does not
exist to the importer), and there is no write-back at all — the one attempt replayed FullBay's public
web form and was switched off because every submission created a brand-new FullBay customer.

**The architecture for a replacement is done.** 27 architecture decisions written down, with the
reasoning and the counter-arguments recorded. Four candidate backend frameworks were each built out
as a working module and read side by side rather than argued about; NestJS won. Hosting, tenancy,
auth, backups, environments, testing strategy, and the cost model are all settled and written. None
of that is the bottleneck.

**What is the bottleneck: information only OTC has.** That is most of this meeting.

---

## 2. Hosting — AWS, and Why Not Supabase

### Lead with this

**We are building a real application that a business runs on, and that needs real infrastructure.**
Not "a cheaper place to put it" — the right place to put it. The price goes up over Supabase, it
goes up by a small amount, and I want you to know the number and the reason rather than find it on
a bill.

Then the substance: the real question is not "which vendor." It is **does the browser talk to the
database, or to our own API?** Everything else follows from that one answer, and it is the same
answer regardless of hosting company.

Their app today is browser-to-Supabase, with **201 row-level security policies as the security
layer and no automated tests behind them.** That is already the highest-priority item in the
codebase — one customer seeing another customer's data is not a bug you recover from with an
apology. The shop side makes it worse, not better: service-order state machines, the authorization
gate, labor rates, parts markup, warranty handling, invoice generation. None of that fits in
database policies, and all of it is money-affecting.

So we put our own API in front. And once you do that — no policies-as-authorization, no
auto-generated API, no edge functions — **Supabase is reduced to a connection string, while still
sitting in the most security-sensitive path in the system.** That is the whole argument. It is not
that Supabase is bad; it is genuinely pleasant to work with. It is that we would be paying a vendor
to be in the critical path for a service we would no longer be using.

### What AWS actually buys

| | Why it matters to OTC specifically |
|---|---|
| **Private networking** | The database has no public address. Nothing crosses the internet to reach it. Better answer when a fleet customer's IT asks where their data lives. |
| **S3 with Object Lock** | DVIRs, signed authorizations, warranty documentation — some of these have legal retention requirements. Write-once storage that nobody, including us, can quietly alter. |
| **Instant database copies** | A copy of production in minutes, for rehearsing a scary change before it touches live data. This is the feature that made dropping the other vendors acceptable. |
| **Point-in-time restore + an off-account backup** | Restore to any minute in the retention window, plus an independent dump in a *separate* account so one compromised login can't take both. |
| **One vendor, one bill, one access model** | Availability is the product of every vendor in the path. With one person operating this, fewer vendors between the shop and their invoices is a structural win every month. |
| **Long-lived connections work properly** | Live status updates in the shop need connections that stay open for hours. AWS's load balancer allows this; some alternatives have a hard cap that can't be worked around. |

### Honest costs of the choice, say them out loud

More setup surface than Supabase — networking, access policies, parameter groups. A one-time cost,
but real. Supabase's developer experience is genuinely better. And the operations burden lands on
Dave rather than on a vendor's on-call team.

### The monthly number — and the increase I want authorized

**Approximate, us-east-1, from a May 2026 pricing snapshot. Verify in the AWS calculator before any
of this is a commitment.**

| Item | Monthly |
|---|---|
| Containers: 2 API + 1 background worker | $27 |
| Load balancer | $20 |
| Network gateway *(optional — avoidable)* | $0–32 |
| Postgres (Aurora Serverless v2, small floor) + 50 GB | $50–60 |
| File storage + transfer | $5–25 |
| Secrets, image registry, logs | $7–10 |
| **AWS subtotal** | **$109–174** |
| Non-production environments (one to two) | $20–65 |
| Frontend hosting | $20 |
| Error tracking | $26 |
| Product analytics + session replay | $0–50 |
| Transactional email + SMS | $20–50 |
| Monitoring, domain, misc. | $5–15 |
| **All-in, through the first production customer** | **$200–400** |

### The increase, stated plainly

Only the platform line actually changes between the two paths. Error tracking, analytics, email,
SMS, and frontend hosting are the same bill either way.

| | Supabase + Cloudflare | AWS | Difference |
|---|---|---|---|
| **Platform only** (database, compute, storage, networking) | ~$60–100 | ~$109–174 | **+$50–110/mo** |
| **All-in**, including non-prod and the shared services | ~$150–300 | **$200–400** | **+$50–110/mo** |

**So the ask is roughly $100 a month. Call it $1,200 a year.** Against ~$60,000 a year in FullBay
it is a rounding error, and against the cost of one cross-tenant data leak it is not a conversation.
What it buys is in the table above: the database off the public internet, write-once storage for
records that have legal retention, point-in-time restore plus an independent off-account backup, and
one fewer company sitting between your shop and your invoices.

**Two things to be straight about:**

1. **Cost is not the argument for AWS — AWS is the more expensive option, and I'm recommending it
   anyway.** Say that out loud. If I led with "it's cheaper" it would fall apart the moment someone
   looked it up, and then every other number I give you is suspect.
2. **$200–400 against $5,000 is only a real comparison if the $5,000 is real.** See §6 — this ask
   has to come back before any ROI slide exists.

### The sequencing point they need to hear

This hosting decision **only becomes real under Option B** (§4). If we deepen the portal instead,
the portal stays where it is on Supabase and Cloudflare, and nothing moves. Nobody is migrating
their app next month. AWS is where the *shop system* lands if we build one.

---

## 3. The FullBay Tour — What to Ask For and What to Watch

The ask: **a screen share, recorded, two sides, roughly 45 minutes each.** Not a demo of features —
a real person doing real work, start to finish, narrating. "Show me yesterday" beats "show me how
it works."

### Session A — the shop floor (a technician, plus whoever assigns work)

- How does work arrive at a tech? Paper, a screen in the bay, a tablet, a shout?
- **Clock on, clock off — show me the actual screens.** Specifically: **is there a plain punch in/out
  for the day that's separate from clocking time against a repair order, or is all time recorded
  against an order?** Who fixes it when it's wrong, and does payroll read FullBay directly? *(This
  answer decides whether labor/time is inside V1 or outside it — one of the two biggest scope swings
  in the project. Don't leave the tour without it.)*
- The three C's on a repair line: complaint, cause, correction. Who types them, and when?
- Pulling a part: what happens in software when a part comes off the shelf?
- **Mobile and Wi-Fi, honestly.** Is there a tech-facing app, do they actually use it, and what
  happens when the connection drops mid-inspection? *(This is the single largest architectural
  input still open. Offline tablet sync is a different shape of system and roughly doubles the
  build.)*
- Inspections / DVIR — in FullBay, or on paper?

### Session B — the back office (service advisor, then the person who invoices)

- Intake to invoice on one real order, every tab they touch. *(FullBay's service order page alone
  has 13 tabs and 7 view modes — I want to see which ones they actually open.)*
- Building an estimate, and the authorization conversation: who chases the customer, by what medium?
- Parts ordering and vendor POs.
- **Do you trust your FullBay stock count today?** *(This single answer sizes the whole parts problem
  in §4b. "We eyeball it and count twice a year" makes it nearly free; a tight perpetual count makes
  it a discipline.)*
- **How is sales tax handled on an invoice today?** *(Has to be right on invoice one.)*
- **How do customers actually pay?** Check, ACH, card through FullBay? *(Determines whether a
  migrated customer can still pay the same way.)*
- **What invoice number is FullBay on right now?** *(Needed to pick a non-colliding series.)*
- Month-end: the QuickBooks path, and what breaks.
- PM scheduling — how much is automated versus a person remembering.
- **Which reports do you actually run?** There are 38 built in. If the answer is "four," that is
  schedule returned.
- **What do you hate?** And: what do your customers complain about in the portal? The complaints are
  the product differentiation and they are free to collect.

### What this produces

Every item gets scored into one of five buckets: blocks go-live, needed eventually, nice to have,
**nobody here uses it — don't build it**, or only matters for resale. The fourth bucket is the most
valuable one in the project, and it only gets filled by watching. Tiering it *with them in the room*
rather than alone is what prevents the disagreement later.

**Access asks that go with this:** a read-only staff-level FullBay login, and the `otc_admin` /
`otc_coordinator` side of their own app — I have only ever seen it as a customer.

---

## 4. V1, and Where We Cut From FullBay

### The finding that reframes everything

**A one-customer pilot does not work.** This was the plan, and working through it carefully broke it.
Moving one customer's *data* is fine. Their *work* flows through things the entire shop shares:

| Shared thing | What breaks |
|---|---|
| **Technicians** | A tech clocks into FullBay for one customer's truck and the new system for another's. Only one of those numbers can feed payroll. |
| **Parts inventory** | Parts come off one physical shelf. Two systems each counting their own stock and neither count is true inside a week. |
| **Accounting** | QuickBooks reconciles one set of invoices. Two sources into one ledger and month-end stops closing. |

A customer-by-customer migration does not avoid running two systems. It moves the split from "which
customer" to "which technician, which shelf, which ledger."

**But it's a livable problem rather than a fatal one, if we go in with eyes open about what it
actually is.** FullBay has no import and no write path, so phasing by customer doesn't produce one
system with a shared spine — it produces **two complete silos**, with the back office and the techs
working in both until the last customer is out. The things the whole shop shares get handled by a
person at the seam: a stock adjustment typed in, a few invoices keyed by the bookkeeper. No
integration, because there's nothing to integrate with.

That's §4b, and it's the plan to build V1 around. **Note what it does *not* buy: a thin V1.** A
customer in the new silo has to be fully served there, so the per-job loop has to be complete on day
one. Phasing cuts volume, not functional surface.

### The fork

Two different projects, not two phases of one.

**Option A — deepen the portal.** FullBay stays the shop system. We make the customer side excellent
and expand what fleet customers do for themselves.
- Risk: low. Each piece ships alone; stopping breaks nothing.
- Timeline: useful improvements in weeks.
- The bill: unchanged. FullBay keeps getting paid.
- You get: the best customer portal in this trade, plus compliance and driver-reporting features
  FullBay doesn't offer at all.

**Option B — replace the shop system.** Work orders, estimating, parts, inventory, labor and
technician time, then cut the whole shop over on one date.
- Risk: high, concentrated on a single day.
- Timeline: cannot be honestly dated until we know what FullBay will let us export. Quarters, not
  weeks.
- The bill: eventually eliminated.
- The hard part is not the database — it's the depth of the screens. That depth came from years of
  real users asking for things, and it's what makes software usable rather than merely correct.

**Worth saying out loud:** if you ask what could be built without touching technicians, parts, or
the ledger, the answer is service requests, estimate approval, status visibility, driver-reported
issues, compliance tracking, and invoice presentment. That is almost exactly what Cam already
built. They found the furthest you can get without a full migration. That's a better reason to respect
the work than how it looks.

**If they pick B — and they probably will — §4b is how it gets done.** The fork is still worth
presenting, because the risk and timeline difference between A and B is enormous and they should
choose it knowingly rather than drift into it. But don't belabor it if the answer is obviously B.

---

## 4b. The Phased Migration — How Option B Actually Gets Done

**Assume they want off FullBay as soon as possible.** This is the plan to walk them through, and it
is the one to build the V1 plan around.

**The shape:** new customers — plus one or two willing existing ones — run *completely* in the new
system. Service orders, estimates, authorizations, invoices and portal, all of it. Prove a full
billing cycle. Then move everyone else.

### Say this plainly: it is two silos, and there is no halfway

FullBay has no usable import and no write path at all. We cannot push a work order from the new
portal into FullBay for a tech to work from, and we cannot push an invoice into it either. So this is
not one system with a shared spine — it is **two complete, independent silos**, and the back office
and the technicians work in both of them until the last customer is out of the old one.

**The silo boundary is the customer, and it is absolute.** A customer is entirely in one silo or
entirely in the other. No truck half in each, no job split, no invoice split. That rule is what keeps
it operable.

**And we are not building a bridge between them.** Any integration would mean screen-scraping
FullBay's UI, which breaks whenever they change a page and becomes a permanent maintenance burden
built for a temporary problem. The answer is no bridge: **people handle the seams by hand, and we
keep the window short.** Everything in this section that sounds like a workaround is a human typing
something, not data moving. That is deliberate.

**Starting new customers in the new silo is the right wedge**, and better than migrating an existing
one. A new customer has no FullBay history to move, no expectation set by the old portal, and no
"it used to work like this." The cheapest possible entry. The caution: new-customer arrival rate
isn't something you control, and a brand-new relationship is the one you least want to experiment
on — so pair it with one friendly existing customer rather than relying on it alone.

**What it costs, said out loud:** every advisor and every tech logs into two systems daily for the
whole window, and has to know which silo a truck lives in before they can start. That routing
decision, made by a person dozens of times a day, is where the mistakes will come from.

### The three shared resources — what survives the silo split, and what doesn't

**Technicians — and this is the one I had wrong.** I said the time clock could stay in FullBay for
everyone and come out of V1. That depends entirely on something we don't know yet: **does FullBay
have a plain punch clock separate from clocking against a repair order?**

- If FullBay has a standalone punch in/out for payroll, then yes — techs punch in FullBay all window
  long, payroll stays in one place, and the new system only records *billable* hours on the repair
  line. (Paid hours and billed hours are already different numbers in any shop, so this split isn't
  artificial.)
- **If FullBay only records time against a repair order, that doesn't work** — there is no FullBay
  repair order for a new-silo job to clock against. Clocking to a dummy order or a generic labor
  bucket destroys job costing. In that case **the new silo needs its own time capture, and labor/time
  moves into V1.**

**So "no time clock in V1" is not a decision yet — it's a question for the tour, and it's one of the
bigger V1 scope swings on the list.** Ask the technician directly: *show me exactly how you start and
stop time on a job.*

- **Watch for:** a design that asks a tech to log labor in the new system *and* punch in FullBay for
  the same job. If that's where it lands, have the advisor key labor off the repair order instead.

**Parts — FullBay keeps the count, the new system just bills the part.** Parts get typed onto a
migrated job with a cost and a markup so the invoice is right. Stock levels, POs and counts stay in
FullBay. Weekly, the new system produces a "parts consumed" list and the parts person makes one
batch adjustment in FullBay.

- **Cost:** one recurring ten-minute task for one person, scaled to new-silo volume. **A stock
  adjustment typed into FullBay's screen is not an integration** — this workaround needs a person,
  not an import path. Same for the bookkeeper keying invoices below.
- **V1 consequence: no inventory module in V1.** This was already flagged as the single biggest
  available scope reduction — the phased plan makes it the obvious call rather than a concession.
  **This one survives the silo split**, because stock counting genuinely isn't per-job.
- **The question that sizes this problem: do you trust your FullBay stock count today?** Worth asking
  in the tour. If the honest answer is "not really, we eyeball it and count twice a year," then
  controlled drift during the window costs nearly nothing and this stops being a blocker. If they run
  a tight perpetual count, the batch adjustment has to be disciplined.
- **Purchase orders stay in FullBay.** The part arrives, gets consumed on a new-system job, and its
  cost gets keyed onto that job. Fine at low volume.

**Accounting — this is the most tractable of the three, not the worst.** QuickBooks genuinely does
not care how many systems feed it. It cares that every transaction appears **exactly once** and that
nothing is **ambiguous**. Five things to get right, and only one of them is hard to fix later:

1. **Invoice numbering must not collide. Decide this before invoice number one.** FullBay issues from
   its own sequence; the new system needs a visibly separate series — a prefix, or a block starting
   somewhere FullBay will never reach. Trivial now, genuinely painful to unwind after a few hundred
   invoices exist. **This is the one item on the list that is cheap today and expensive in three
   months.**
2. **Write to the *existing* QuickBooks customer, never a new one.** This is exactly the bug that
   killed the FullBay write-back in the current app — every submission created a brand-new FullBay
   customer instead of matching the real one. Same class of mistake, one layer over. Name it, and map
   customers explicitly.
3. **Invoices get in by hand or by CSV at first — and that is genuinely fine.** One or two customers
   is a handful of invoices a week; the bookkeeper enters or imports them. A real QuickBooks
   integration is expensive and becomes necessary only as the migrated share grows. **So it's P1 with
   a clear trigger, not P0** — and the phased plan is what earns that.
4. **Sales tax has to be right on invoice one.** FullBay computes tax today; the new system has to
   produce the same treatment for the same jurisdiction or the ledger is inconsistent and the return
   is wrong. Ask how tax is handled today — it is not a later problem.
5. **Payments.** If customers pay through FullBay's processing today, a migrated customer can't.
   Either they pay by check/ACH outside the system, or the new system takes cards — Cam's app
   already has Stripe in its dependencies, so worth finding out how far that got. **And if payment
   processing is bundled into the $5,000, that's FullBay revenue we aren't currently planning to
   replace at all.**

**Month-end during the window:** the bookkeeper reconciles two A/R agings instead of one. Annoying,
not broken — as long as #1 and #2 above hold.

### Two things about the phased plan they will not expect

**It trains the back office on a small, forgiving slice of work.** A big-bang cutover teaches
everyone a new system at once, on live work, on the scariest day of the project. Phasing means the
advisors are fluent by the time the big customers move. That is a stronger argument for this approach
than the risk reduction, and it is the one to lead with.

**It does not get them off the bill faster — it gets them off the bill more safely.** They pay for
both systems for the entire window, and FullBay's bill likely won't drop at all as customers leave,
because it is almost certainly priced per shop and per seat rather than per customer. **So if "as soon
as we can" means "stop paying FullBay," phasing is the slower path to that, not the faster one.** It
is the faster path to *working software they control*. Make sure which one they mean — those are
different goals and they lead to different plans.

### What makes this fail

- **Picking the wrong pilot customer.** Pick for *simplicity*, not size: predictable work (PM-heavy),
  light on parts, one billing contact, a forgiving relationship, and ideally someone who already
  complains about the FullBay portal so the upgrade is visible to them. Picking a large or
  parts-heavy customer first imports every hard problem into week one.
- **Letting the window stretch.** Two systems is tolerable for a quarter and corrosive for a year,
  because each next customer is never quite urgent enough to move. **The plan needs a stated end date
  for the whole migration, not just a start date for the first customer.**
- **No way back.** If the pilot's month-end goes wrong, we need to be able to put them back in
  FullBay. Keep their FullBay records intact and don't drop seats or data early.
- **Scope creeping back in.** The moment someone says "while we're in there, let's do inventory
  properly," the window stretches. The window is the cost; protect it over everything else.
- **Someone asking for a bridge.** "Can't it just sync with FullBay?" will come up, probably from a
  good place. The answer is no, and the reason is that there's nothing to sync *to* — FullBay has no
  write path, so a bridge means scraping their screens, which breaks on their schedule and costs more
  than the double entry it replaces.
- **Work landing in the wrong silo.** With two systems open all day, someone will start a job in the
  wrong one. Decide early how that gets caught and corrected, because it will happen in week one.

### So what is V1 — and the thing I had backwards

I implied earlier that phasing by customer and shipping a thin V1 were the same decision. **They're
closer to opposites, and this matters before the V1 plan gets written.**

Because the silos don't connect, a customer in the new silo has to be served *entirely* there. There
is no "we'll add estimates next month" — if a job can't be estimated, authorized, worked, and invoiced
in the new system, that customer can't live in it. **Phasing by customer reduces volume, not
functional surface. The per-job loop has to be complete on day one.**

What *can* still be deferred is anything genuinely not per-job: stock counting, purchase orders, shop
reporting, PM automation, multi-location inventory, and — depending on the time-clock answer above —
payroll time. Those stay in FullBay and get handled by a person at the seam.

So the deferral list is real but shorter than I made it sound. V1 is **narrow in volume and complete
in the loop**:

- Customers, contacts, units
- Service order lifecycle, three C's on repair lines
- Estimates and the customer authorization gate
- Parts *billed* on an order (no stock, no counts, no POs)
- Billable labor on a repair line (time clock **only if** FullBay's punch clock can't carry it)
- Invoice generation and PDF
- Customer portal: see work, authorize, see invoices
- Staff auth, roles, tenancy, audit log
- **Out:** stock counting and POs, PM automation, DVIR, shop reporting, QuickBooks integration,
  payments, historical data, offline tablets — **and payroll time, if and only if FullBay's punch
  clock stands alone**

Five questions still size it, and they are the real agenda item:

1. **Is historical data required at go-live?** If "FullBay stays read-only for history, new work
   starts fresh" is acceptable, the hardest part of the project becomes optional. **Highest-leverage
   question in the project** — and the phased plan makes "yes, leave it" much easier to accept,
   because FullBay is still running anyway.
2. **Does FullBay's punch clock stand alone, or is time only recorded against a repair order?**
   Decides whether labor/time is in V1 or out. Second-biggest swing after #4.
2b. **Confirm: live without stock counting and POs?** (Expected yes, per above.)
3. **Confirm: accounting by hand or CSV at first?** (Expected yes, per above.)
4. **Do technicians need tablets that work offline on day one?** If yes, that's a sync engine rather
   than an app, and it roughly doubles the build. **The one answer that could still blow this up.**
5. **Which of the 38 reports and how much PM automation are genuinely day-one?**

### When we cut — two cuts, not ten

**Since the cost of two silos is continuous rather than one-time, the goal is the fewest waves
possible, not the most.** "Gradual" is the wrong word for this plan. The right shape is:

1. **A shadow run first — nobody live, no customer at risk.** For two or three weeks, a handful of
   real jobs get entered into the new system *in parallel* with FullBay, purely as practice. FullBay
   stays the only real invoice. This finds the bugs and trains the advisors with nothing on the line.
   The cost is deliberate double entry on a few jobs, and it is the cheapest rehearsal available.
2. **Cut one:** new customers plus one friendly existing customer go live in the new silo. Prove a
   full billing cycle end to end.
3. **Cut two:** everyone else, in one move.

Two real cuts keeps the double-operation window short and bounded, and still buys the rehearsal that
a pure big-bang never gets. Ten waves means living in the two-silo world for a year because each next
customer is never quite urgent enough to move.

**Be honest about where the trade turns.** Three months with 10% of the work in the new silo is cheap
and the rehearsal is worth a lot. Eighteen months at half and half is miserable, and they'd have been
better off with one big cutover. **So this plan's viability depends entirely on a committed, short
window — that is the thing to get agreement on, more than the start date.**

Each cut is a **date**: work stops in FullBay on a Friday and starts in the new system on a Monday,
with FullBay read-only behind it. Three things have to be true before the *first* date gets promised:

1. The export question is answered — and under this plan it matters much less, which is a real
   benefit worth pointing out. If history stays in FullBay and only open work moves, a one-customer
   migration might be a few dozen records keyed in by hand. **The phased plan partly de-risks the
   project's biggest unknown.**
2. The V1 list above is signed off in writing, with the out-of-scope list signed off too.
3. Exit criterion agreed: **one full billing cycle for that customer in the new system without
   falling back.** That is the gate for moving the second wave.

**I am not going to give a date in this meeting** — not stalling, but a date built on an unverified
export path and an unvalidated feature list is a date that moves, and a date that moves is how these
projects lose trust. After the walkthroughs and the export spike, a date is a real number.

### The no-regret work that starts regardless

Valuable on either path, which makes it the right first move while the fork gets decided:

- **Security hardening of the portal** — 201 data-access rules, zero automated tests behind them.
  Highest-priority item in the codebase.
- **Fix staff impersonation** — when OTC staff "open" a customer account the system temporarily
  rewrites that staff member's company. It works; an interrupted session can leave someone pointed
  at the wrong customer.
- **Close the fleet-group gaps** — departments inside a large customer are scoped correctly on four
  screens and not on eight others. That's an access-control gap, not a missing feature.
- **Finish or delete the half-built modules** — vehicle lifecycle and the vendor module are
  scaffolded and unused.
- **Turn on what's already finished** — 13 of 14 modules were disabled on the test account.

---

## 5. Compensation, and the Deposit

### The frame to open with

> *"Let's find a number that's a no-brainer for you and worth it for me."*

Both halves are real constraints and naming both out loud is what keeps this from drifting into
either a favor or a negotiation. **Their half:** for the price of a few months of what they already
spend on software they don't control, they get the system they do control. If they have to think
hard about whether it's worth it, the number is wrong. **Dave's half:** this is side time, the goal
is fair rather than maximized, and the fee has to cover not just the build but **the tail** — being
the single point of failure on a system a business runs on until the handoff is real. The tail is
the part that's easy to underprice because it's invisible at signing.

### Today is about structure, not numbers — say so up front

Open with it so nobody feels stonewalled later in the conversation:

> *"I want to talk about how this is structured today, and land the actual numbers once we have the
> V1 plan. The V1 price depends on what the walkthroughs and the export attempt turn up — I'd be
> guessing right now, and a guess that's too low turns into resentment while a guess that's too high
> loses the project. Let's agree on the shape, and I'll bring you real numbers in a few weeks."*

That is a strong position, not a dodge. It says the number will be *derived* rather than negotiated.

### The structure to propose

Four stages. The thing to get agreement on today is the shape and the fact that each number gets set
when it can be set honestly.

| Stage | Shape | When the number gets set |
|---|---|---|
| **Phase 0 — discovery and de-risk** | Fixed fee, paid up front. 4–6 weeks. | **This can be set now.** It's the only one that can. |
| **V1 build + first cutover** | Fixed fee, paid in tranches — at start, at a working end-to-end slice, at a completed billing cycle | At the end of Phase 0, when scope is real |
| **Remaining migration waves** | Per wave, or folded into the retainer | After the first cutover teaches us what a wave costs |
| **Post-cutover support** | **Monthly retainer, with a written sunset** | At the end of Phase 0 |

**On "upfront then monthly retainer" specifically** — that's close to right, with one adjustment
worth making. Use **fixed fees for the build work** and put the **retainer on the support tail**,
where it belongs. A monthly retainer funding an open-ended build is the shape that quietly becomes a
part-time job with no finish line: there's no moment where anyone has to say "this phase is done."
Fixed fee per phase creates that moment on purpose. Tranche payments inside the V1 fee solve the cash
flow problem that the monthly would have solved.

### What Phase 0 is, and why it's the thing to fund now

4–6 weeks, one fixed number, and it produces the four things everything else is waiting on:

1. The recorded walkthroughs, and a feature list scored and signed off by OTC.
2. **The export spike** — a real FullBay export loaded and reconciled, or a definitive "there isn't
   one." The highest-risk unknown in the project.
3. **The portal security hardening** — the 201 untested access rules, the impersonation fix, the
   fleet-group gaps. Real shipped value no matter which way the fork goes.
4. A costed V1 scope and a migration plan with dates in it.

What Phase 0 explicitly does **not** commit to: a V1 date, a V1 price, or a build.

Both sides come out better. They get paid-for progress on the actual blocker instead of a quote built
on guesses; Dave gets compensated for weeks that are about to be spent either way; and the number
that matters most gets set with information.

### What to do with the deposit

They offered money before any numbers were discussed. That's goodwill, and it's also a trap if taken
loosely: **money accepted without a written scope makes every later scope conversation harder, and
does it with a friend.**

**Take it as the Phase 0 upfront, against a one-page scope.** That gives the deposit a job. If they
want to send it before Phase 0 is written up, the thing to say is: *"Yes — let me put one page around
what it buys first, so we both know what I owe you."*

**Mechanics that set the tone:** an invoice, not a payment app. One page listing what Phase 0
delivers, what it doesn't, the number, and the date it ends. Lightweight is fine; written is not
optional.

### The full shape, for when it comes up

| Line | What it is | Range | Note |
|---|---|---|---|
| **Phase 0** | Discovery, export spike, portal hardening, costed V1 recommendation | `[ the one number to settle before the meeting ]` | The deposit lands here. 4–6 weeks. |
| **Fixed fee — V1 + first cutover** | The bounded project through one customer's full billing cycle, *and* a handoff-ready system | `[ don't quote yet — priced after Phase 0 ]` | Paid in tranches. Includes runbooks and documentation so someone else can pick it up; that's part of what it pays for. |
| **Migration waves** | Moving the remaining customers after the first cutover proves out | `[ after wave one ]` | Per wave, or folded into the retainer. |
| **Bridge retainer** | Support while OTC stands up their own team; **sunsets by design** | `[ priced after Phase 0 ]` | Ends when *both* exits below are met. |
| **Their operator / on-call** | Runs and supports the live system | *their cost* | Needed at or near cutover. |
| **Their feature developer** | Drives new features after cutover | *their cost* | Starts when they decide to enhance. The role Dave transitions out of. |

**The two-exit sunset, and why it protects both sides.** The retainer ends when OTC has a feature
developer *and* an operator, and the handoff is real rather than aspirational — documentation,
runbooks, training, and a fallback so an absent role can't route incidents back to Dave by default.
Set the window explicitly up front (6–12 months, shrinking on-call). Open-ended by intention is how
"helping a friend" becomes a permanent, part-time, under-compensated CTO job.

**Say the hard part plainly:** "keep adding features beyond FullBay" is never done, and because this
would be my architecture, you'd have a rational incentive to keep paying me instead of hiring. I
need that to default to your staff, not to me. That is a planning question about whether an exit
route exists — not a loyalty test.

**Resale: in the room, off the table.** The vision exists and the white-label layer in Cam's app
makes it more credible than aspirational. But a resold product is a company — support org, feature
velocity, a team — not an extension of this. Different funding conversation. Comp here does not
depend on it. Optional one-liner: *if resale moves past "small possibility," we revisit structure
and ownership.*

**Mechanics that set the tone:** an invoice, not a payment app. One page describing what Phase 0
delivers, what it doesn't, and the number. Lightweight is fine; written is not optional.

### Why custom at all — pre-answer the cheaper alternative

If someone asks "why not just switch to a cheaper SaaS": per-asset tools (Fleetio, RTA) run $4–11
per asset per month and may well be cheaper than FullBay, but they're fleet-*operator* maintenance
trackers. They don't do commercial-shop workflow — service orders, labor, parts, customer invoicing
— or the customer portal OTC's business runs on. And a different vendor's roadmap is still not OTC's
roadmap. **The driver here is roadmap control, not cost. The $5,000 is a budget reference, not the
ROI case.**

---

## 6. The Asks — Say These Early, Not at the End

These gate everything, and a plan without "here's what I need from you" invites scope creep by
default.

1. **An actual FullBay invoice**, with line items, shop count, user and technician counts, and
   whether payment processing is bundled in. *FullBay's published price is roughly $188–318/month
   base plus $89–119 per additional user, which puts $5,000 at something like 40–50 seats or
   multiple locations. The cost comparison is the headline of any plan, and an unverified number
   does not survive five minutes of scrutiny. **Settle this before any ROI number gets presented.***
2. **Export capability** — their actual FullBay account tier, and whether a full customer / unit /
   service-order / parts history can be extracted. Any report, CSV, or data dump. The API can't
   supply history, so this is the only path.
3. **A read-only staff-level FullBay login**, plus the OTC-internal side of their own app.
4. **The forcing function** — contract renewal, a price increase, a customer at risk. Is there a
   real deadline, or is this "when it's ready"?
5. **Support expectations** — business hours, evening and weekend shop work, what an hour of
   downtime costs, and who at OTC is the intake point. *A shared channel, not texting Dave.*
6. **Who maintains this besides me** — two roles, staggered: an operator/on-call at cutover, and a
   feature developer when they decide to enhance.
7. **Cam's role going forward.** They built something good. Whether they continues, and in what
   capacity, changes the engagement shape considerably. Ask it as a question, not a position.
8. **AWS account** — do they have one, and whose name should it and its billing be in? *This is a
   compensation question in disguise: if they own it, Dave needs durable access; if Dave owns it,
   their business depends on infrastructure in someone else's name. Settle in writing before
   production holds real data.*

---

## Before Walking In — Dave's Decisions

1. **The Phase 0 number — the only number you might need tomorrow.** Do this half independently and
   first: pick the weekly figure that makes side work worth it, multiply by realistic active weeks,
   add something for the tail. That's the floor and it holds regardless of what the FullBay invoice
   says. Then sanity-check that it reads as a no-brainer next to their current spend. Decide whether
   you're willing to say it out loud tomorrow or whether even that waits for the one-pager.
2. **Whether to name a V1 range if pushed.** Recommendation: no. Say the shape, say what gates the
   number, and let Phase 0 produce it. Naming a range before the export answer anchors a number that
   may have to move, and moving it later costs more trust than withholding it now.
3. **Live tour or separate session.** If the meeting is 60 minutes, book the tour separately and
   protect §4/§4b and §5.
4. **One thing to decide even if nothing else lands: the invoice number series.** It's free today and
   expensive in three months. If the phased plan is the direction, get FullBay's current invoice
   number before anyone writes code.

### One framing note

Walk in leading with what is **good** — the app, the schema, the portal experience, the QR reporting
idea. The hard news in §1 and §4 lands very differently after genuine credit than it does cold, and
all of that credit is real.

---

## Related

- [[Next Phase Discussion]] — the longer M1 draft this brief compresses
- [[Engagement Terms]] — the full comp structure, the two-sided test, the reference points
- [[Roadmap]] — M1–M8, and the note that M8's premise broke
- [[Open Questions]] — Q1, Q4, Q5, Q12, Q13, Q15, Q17, Q18 are the §6 asks
- [[Architecture/Stack Evaluation]] · [[Architecture/Platform Choice]] — the §2 argument and cost model
- [[Architecture/myotcfleet Codebase]] · [[Product/myotcfleet Recon]] — the §1 evidence
- [[FullBay/Data Export Feasibility]] — the invoice-only API
- [[Product/Feature Inventory]] — the scoring buckets for the tour
- `interview-session-1-shop-floor.html` — the walkthrough instrument for §3
