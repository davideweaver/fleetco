---
created: 2026-10-28
updated: 2026-11-01
tags: [fleetco, otc, v1, vision, gaps, product, working-doc]
status: living document — iterate with Cameron, then feed the PRD
source: Claude Code (Xerro)
---

**What this is:** the working document for V1. Not the scope list ([[V1 Scope from Punch List]] is
that) and not the contract ([[PRD]] is that, written last). This is where the picture gets argued
with until it holds together, and where the holes get named before they turn into surprises.

**How to use it:** sections 1–4 are the vision — read them as a claim to disagree with. Section 5
is the gap register and it's the part that matters; every gap carries a severity, an owner, and a
**traces-to block** citing the punch list row or transcript timestamp it came from, plus why it
slipped. Section 6 is what's deliberately out. Section 7 is Dave's own build decisions, which
Cameron doesn't need to care about. Log changes at the bottom so iterations are traceable.

**Citation format:** punch list rows are bold numbers like **7.24**, resolvable in
`Meetings/Punchlist From Cam for v1/Full marks JSON.md`. Transcript references are timestamps like
`00:54:26`, resolvable in [[2026-10-23 Cameron Walkthrough Transcript]].

---

## 1. What V1 Is, In One Paragraph

**An internal shop application that runs OTC Fleet Graphix end to end, so graphics can stop using
FullBay entirely.** Cameron quotes a job, the customer says yes, the job gets scheduled and worked
by one installer, time and material costs land against it, and it goes out as an invoice that can be
paid by card. Two user roles. One department. No portal, no mechanical features, no live inventory.
When it works, graphics is off FullBay and the rest of the company isn't affected.

**The test it has to pass:** Cameron runs a full month of graphics work in the new system, invoices
it, gets paid, and closes the books with accounting, without going back to FullBay once.

## 2. What V1 Is Not

Worth stating as plainly as the vision, because every one of these was explicitly deferred and each
will come back as "can we just also":

- **Not a customer portal.** No customer logins, no self-service, no approval links. (Flagged as a
  gap — see G2.)
- **Not a fleet management product.** The QR driver reports, insurance and registration tracking,
  and the subscription tiers all live in `myOTCFleet.com` and stay there.
- **Not the shop system.** Lancaster, mobile, and postal stay on FullBay. Nothing in V1 touches
  their technicians, their parts shelf, or their ledger.
- **Not an inventory system.** No stock counts, no automatic deductions.
- **Not a CRM.** Leads, the sales pipeline, and customer messaging stay in GoHighLevel.
- **Not a replacement for accounting.** QuickBooks Online remains the ledger.

## 3. The Day In The Life

The fastest way to find holes is to walk the two real workdays this system has to carry.

### Cameron's day (Owner)

1. **A lead arrives** by phone, email, or GoHighLevel. Sales conversation happens in GHL.
2. **He builds an estimate.** Customer, vehicle or project, scope, package lines with pricing,
   photos and files attached. Expected hours entered by hand. Internally, the package breaks down
   into vinyl, laminate, labor, and consumable allowances; the customer sees one line and a price.
3. **Design and proof.** *This step has no home in the current scope — see G1.* Somewhere between
   the estimate and production, the customer approves artwork, usually over a revision or two.
4. **The customer approves.** Realistically: over the phone. Cameron records who approved, when, and
   how, or uses Manual Override. If they only approve part of it, declined items stay internal.
5. **Deposit, if needed.** Over $5,000, or any customer without credit terms. Today that means a
   phone call or a fake "50% deposit" counter sale in FullBay. *See G6.*
6. **Convert to a job.** It lands on the Production & Installation Kanban at Ready for Production
   and gets a production date, an installation date, and an assignee on the calendar.
7. **He checks the board** through the week: who's on what, elapsed time, what's scheduled, what's
   stalled. Delays go in job notes.
8. **Materials.** Running low on vinyl, so he raises a vendor PO, downloads the PDF, emails it
   himself, and marks it received when the roll shows up. Last cost updates on receipt.
9. **Review and close.** Jason has marked the install finished with completion photos. Cameron
   reviews, closes the job, and a draft invoice appears unsent.
10. **Invoice.** He finalizes it, exports the PDF, sends it, and the customer pays by card link or
    mails a check. The invoice shows their other unpaid invoices. QuickBooks picks it up.
11. **End of period.** He reviews and approves timesheets, exports payroll hours, and pulls A/R
    aging and revenue reports.

### Jason's day (Technician)

1. **Punches in** for the day. Attendance clock, not a job.
2. **Opens his assigned jobs.** He sees only his own: instructions, photos, attachments, schedule.
   No costs, no markup, no profit.
3. **Starts a job timer.** Switching jobs stops the previous timer automatically.
4. **Works production downstairs**, then installation. Logs condition photos before install, runs
   the quality checklist, uploads completion photos from a phone or iPad.
5. **Non-job time** gets classified: cleanup, meetings, training, general shop work.
6. **Marks the work finished.** Cameron closes it.
7. **Punches out.**

**What this walk exposes:** the loop is complete except for the design proof (G1) and the fact that
nothing in the system actually sends anything to a customer (G3).

## 4. The Surfaces

What has to exist as a screen. Useful for sizing and for spotting the ones nobody has thought about.

| Surface | Notes |
|---|---|
| Jobs list | Active / Completed / All, plus filters for stage, customer, assignee, priority, date |
| Production & Installation Kanban | Six stages, manual moves including backward |
| Job record | The spine. Scope, attachments, photos, schedule, assignments, time, internal costs |
| Estimates list + estimate editor | Package lines, internal breakdown, partial approval, templates |
| Scheduling calendar | Separate production and installation entries, filterable by employee |
| Customers list + customer record | Contacts, terms, PO/reference fields, GHL external IDs |
| Material catalog | Cost and selling price, manually maintained |
| Vendor POs + vendor records | Create, edit unreceived, PDF out, mark received |
| Time: daily punch clock | Attendance |
| Time: job timer | One active at a time |
| Timesheet review | Corrections, period approval, payroll export |
| Live workload view | Who's on what right now |
| Invoices list + invoice editor | Draft on close, finalize, PDF, other-unpaid section |
| Payments | Card link status, manual entry, refunds recorded |
| Reports | Ten of them, each with CSV and print |
| Settings | Roles, activity categories, tax config, invoice numbering, templates |
| Mobile views | Job, photos, time entry, documents |

**Roughly seventeen surfaces, several of them deep.** Worth having this list in front of Dan when
"62 items" comes up.

## 5. The Gap Register

The point of this document. Each gap is something the current scope does not answer, with a severity,
an owner, and **where it came from** so any of them can be traced back to a source.

### Why these gaps exist

They are not random. Four distinct causes, and knowing which one applies changes how you raise it:

| Type | What it means | How to raise it |
|---|---|---|
| **A — Cameron flagged it** | His own punch list note says the answer is missing or unverified | Easy. He already knows. Just needs the conversation |
| **B — Meeting vs. punch list** | Something he asked for on 10/23 that the marks dropped, reworded, or deferred | Careful. Quote both sources and ask which he means |
| **C — Internal contradiction** | Two punch list rows that can't both be true as written | Neutral. A specification problem, not a disagreement |
| **D — Nobody raised it** | Dave's inference. Neither source mentions it | Own it as Dave's finding, not as something he missed |

**The single biggest cause is one decision: the customer portal going to Later.** It took approval
links, the customer hierarchy, and global user accounts with it, and those were things Cameron
actively wanted three weeks ago. That accounts for G2, G5, and part of G6.

**The second cause is structural, and worth understanding.** The punch list was built by walking
**FullBay's** surface, 217 rows of it. So anything graphics does that FullBay *doesn't* had no row
to be marked in the first place. **The design proof cycle is the clearest example** — it is the
heart of a wrap business and there was nowhere on the form to put it. That's G1, and it's a gap in
Dave's instrument as much as in Cameron's answers.

### The register

**G1, G2, G3, and G14 are the ones that would hurt most if they stayed unanswered.**

| # | Gap | Severity | Type | Owner |
|---|---|---|---|---|
| G1 | Design proof approval has no home | **High** | **A** + D | Cameron |
| G2 | Authorization leaves no artifact | **High** | **B** | Cameron + Dave |
| G3 | Nothing in V1 sends email, but payment links need to reach customers. **Dave's position 2026-11-01: email invoices + estimates only, one editable template per email type; raise with Cameron** | **High** | **C** | Dave |
| G4 | Units and assets are undefined | Medium-High | **B** | Dave + Cameron |
| G5 | Customer hierarchy deferred with the portal | Low for V1, **High for the model** | **B** | Dave |
| G6 | Deposits are recorded but not collected | Medium, cheap win | **B** + C | Cameron |
| ~~G7~~ | ~~One package line vs materials / design / labor split~~ **Resolved 2026-10-29.** Estimate itemized, invoice rolled up. Mechanism is spec work | — | **B** | Dave (closed) |
| G8 | Kanban and calendar both own "when" | Medium | **C** | Dave |
| G9 | "WIP" is undefined for graphics | Low-Medium | **D** | Cameron |
| G10 | Taxability of design and labor vs materials | **High** (go-live) | **A** | Accounting |
| G11 | Nobody owns the migration keystrokes | Medium | **D** | Cameron |
| G12 | Customers get hand-copied from GoHighLevel | Low-Medium | **D** | Cameron |
| G13 | Photo volume, upload, and shop wifi | Medium | **A** + D | Dave |
| G14 | Invoice numbering + two-way QBO + open-invoice migration | **High** | **A** + D | Dave + accounting |
| G15 | No agreed cutover criteria | Medium | **D** | Dave + Dan |

**Count by type:** A = 4 · B = 5 · C = 3 · D = 6 (several are hybrids). **Five of fifteen are things
Cameron asked for and the marks walked back** — those are the ones to handle carefully, because he
will not remember having changed his mind.

**Open: 14 of 15.** G7 closed 2026-10-29.

### G1. Design proof approval has no home

> **Traces to — Type A + D.** Punch list **1.5** (Cameron's own note): *"Graphics estimating remains
> part of the custom shop software; the detailed estimate/proof handoff still needs clarification."*
> Also **1.5** assigns *"sales/design pipeline tracking"* to GoHighLevel.
> Meeting: design appears only as a **billable line** (`00:28:50` *"Charge them an amount for
> design"*, `00:29:21` color samples for new customers). **The proof cycle itself never came up.**
> **Why it slipped:** there was no row for it. The punch list enumerates FullBay's surface, and
> FullBay has no design-proof feature, so the question was never asked. A gap in the instrument.

**Cameron's own note on the Kanban row says it:** *"the detailed estimate/proof handoff still needs
clarification."* Nothing in the 62 covers artwork, proofs, revisions, or design approval.

This is the core of a wrap business. The customer doesn't just approve a price, they approve a
design, usually after a round or two of changes, and then production can start. Today that presumably
happens over email or in GoHighLevel. If it stays outside the system, then the job record has no
record of which proof was approved, and that is the single most likely source of an expensive
mistake in this business: printing the wrong version.

**The question for Cameron:** walk me through a real proof cycle. Where does the artwork live, how
many revisions typically, who signs off, and what do you keep? Then: does V1 need proof versions
attached to the job with an approved flag, or is a file attachment and a note enough?

**Cheapest version that probably suffices:** proof files attached to the job, versioned, with one
marked approved, plus who approved and when. Not a design review tool.

### G2. Authorization leaves no artifact

> **Traces to — Type B.** Punch list **2.12**: *"No customer approval links in V1; portal approvals
> are Later."* Same in **1.2**. All 20 section-8 portal rows are Later.
> Meeting, against that: `00:29:49` Cameron demos the FullBay button — *"This will send it to the
> contact from the Whitmer Group. That'll send him an email to approve or decline the estimate"* —
> then at `00:30:19` explains he self-authorizes because *"a lot of my customers aren't inclined to
> press authorize or decline."*
> **Why it slipped:** he reasoned from his own habit. He self-authorizes, so approval links felt
> optional, so they went to Later with the portal. The thing he didn't price in is that FullBay's
> link is what creates the **record** on the jobs where a customer does click it.

With no portal and no approval links, every authorization in V1 is Cameron typing "customer approved
by phone." That matches how he actually works, and for small jobs it's fine.

For a $5,000-plus wrap it is an unsigned agreement. **FullBay today is better at this** — it at
least emails an approve/decline link and records the customer's own click. V1 as marked is a step
backward on the one thing that protects him in a dispute.

**The cheap fix, and it's genuinely cheap:** a tokenised approve/decline link on the emailed estimate
PDF. No login, no portal, no account. One URL, one click, recorded with a timestamp and an IP. This
is a day or two of work, not a portal, and it closes the gap without reopening section 8 of the punch
list.

**Recommend offering this.** It's the highest value-per-hour item in the whole scope.

### G3. Nothing in V1 sends email, but payment links need to reach customers

> **Traces to — Type C.** A contradiction inside the punch list itself.
> Manual side: **3.12** *"downloadable PDF for manual sending through existing email"* · **1.2**
> *"PDF export/manual delivery"* · **2.15** *"Staff manually mark the exported estimate PDF as
> sent… not automatic delivery"* · **7.1** *"export a customer-facing PDF for manual sending."*
> Automatic side: **7.6** *"customers can pay invoices by credit/debit card through a customer
> payment link"* · **7.19** *"payments made through an invoice-linked provider payment link must
> automatically update the correct invoice balance."*
> Meeting: FullBay emails everything today — `00:32:32` *"everything I use is through the email
> chains that they have."*
> **Why it slipped:** the rows were marked one at a time. "Send it myself" is the right answer for a
> PO and the wrong answer for a payment link, and nothing in the form put those two rows side by
> side.

Every outbound document in the scope is marked manual: POs are *"downloadable PDF for manual sending
through existing email,"* estimates are *"PDF export/manual delivery"* with a manual sent flag,
invoices are *"export a customer-facing PDF for manual sending."*

But 7.6 wants an invoice-linked hosted payment link and 7.19 wants that payment to automatically
update the balance. **A payment link has to get to the customer somehow.** Either the system sends
email, or Cameron copies links into Gmail by hand forever.

**This needs a deliberate decision, because it's also an architecture decision:** transactional email
means a provider, a sending domain, SPF/DKIM/DMARC, bounce handling, and the outbox already in the
design. It's not hard, but it's not free either, and "manual sending" everywhere suggests nobody has
priced it.

**Recommendation:** V1 sends invoices and estimates (with the G2 approve link) from the system, and
keeps POs manual as marked. One sending path, two document types.

#### Dave's position (2026-11-01) — to raise with Cameron

Cameron wants V1 tight. Dave's position: **support email in V1, but only where leaving it out makes
the workflow cumbersome.** Everything else about email stays out. The pitch to Cameron is that this
resolves the 7.6 / 7.19 contradiction above rather than adding a feature.

**The test for whether something gets email in V1:** would doing it by hand mean copying something
out of the system into Gmail on every occurrence, or lose a record we need? If yes, the system sends
it. If a downloaded PDF is fine, it stays manual.

**In V1 — system-sent, from editable templates:**

| Email | Why it passes the test |
|---|---|
| Invoice, with PDF attached and the card payment link (7.6, 7.19) | The payment link has to reach the customer. Manual means pasting a link per invoice, forever |
| Estimate, with PDF attached and the G2 approve/decline link | The customer's click is the approval record on $5k+ jobs. Manual sending loses it |
| Auth emails: password reset, invite, email verification | Better Auth needs them regardless of this decision |

**Templates are in, kept simple:** one template per email type (invoice, estimate) that Cameron
can edit (subject, body text, signature, logo) without a deploy, with merge fields like customer
name, document number, amount, and link. The sender can tweak the message before it goes. Same
engine as the PDF templates (§7 item 6).

Supporting pieces that come with it: send screen with recipient/CC, a send log (who, when, to whom)
replacing the manual "sent" flag, bounce/complaint flagging on the contact, reply-to set to
Cameron's inbox, and the non-production recipient allowlist (ADR-025).

**Out of V1, explicitly fenced:**

- Template variants per business unit (graphics vs mechanical vs mobile), per customer, or per
  sending method — one template set at launch. Revisit when a second department comes on
- Multiple ways of sending the same document (e.g. link-only vs attachment vs portal variants)
  — one send path per document type
- Rich template designer, conditional blocks, A/B or per-recipient branding
- Automated reminders, overdue/dunning sequences, scheduled sends
- Emailing POs to vendors (stays download-and-send, as 3.12 marks it)
- Inbound email, reply threading, an in-app inbox
- Marketing or bulk email (stays in GoHighLevel, per 11.12)

**Rough size:** ~5–7 days for the email slice, +1–2 days for the G2 approve link. Unmeasured
estimate; review, testing, and deliverability checks don't compress the way code does.

**Risks of including it:**

1. **Deliverability** — invoices in spam fail silently; they just don't get paid. Needs DMARC
   reporting and test sends to Gmail and Outlook before go-live.
2. **DNS is an external dependency** — Fleetco controls the domain, likely with existing Workspace
   or M365 records. A bad SPF edit can break their normal email. Most likely schedule slip.
3. **Wrong recipient** — contacts are hand-copied from GoHighLevel (G12) and migrated from FullBay.
   Mitigated by bounce flagging and a preview before send.
4. **Scope creep** — reminders, template variants, PO email are each small and add up. The fence above is
   the defense.
5. **Replies** — customers will reply. Reply-to goes to Cameron; no inbound handling.

**Risks of leaving it out:**

1. Cameron pastes payment links by hand on every invoice, indefinitely.
2. A step backward from FullBay, which emails everything today (`00:32:32`), on top of graphics
   customers losing the portal at cutover.
3. No customer-side approval record on large jobs (G2).
4. "Sent" depends on Cameron remembering a checkbox, so A/R follow-up has nothing reliable.
5. Only ~3–4 days are actually saved: the provider, sending domain, and allowlist are needed for
   auth emails anyway.

**What does argue for deferring:** the outbox already exists and lists email as a consumer, so
adding it after launch is additive, not a rework. If the V1 date is fixed, deferral is defensible on
cost; the price is the manual link-pasting and the missing approval record.

**Do now regardless of the decision:** ask Fleetco who controls DNS for the sending domain.

**Still to check:** whether Stripe can email the payment link itself. That might cover the "pay"
half without our mailer, but not estimates or approvals, and Stripe-side invoices may conflict with
two-way QBO sync (G14).

### G4. Units and assets are undefined

> **Traces to — Type B.** Meeting, and it was explicit: `01:01:48` *"whenever I want to create an
> estimate and quote somebody, it forces you to select which vehicle"* → `01:02:03` *"In graphics, I
> wrap walls too. I do signs. A sign isn't a vehicle, so I'll create something called sign in that
> customer account."* Recorded as **R3** in the debrief and called a V1 blocker.
> Punch list: **no units or assets row is marked V1.** The language quietly became *"customer and
> vehicle/project information"* (**2.1**) and *"customer/project details"* (**1.3**).
> **Why it slipped:** "project" reads like it solves the problem, and for graphics it does. It
> doesn't say whether an asset *record* exists, which is the part that matters for the mechanical
> phase.

FullBay forces every estimate onto a vehicle, which is why Cameron creates fake units named "sign."
The meeting flagged non-vehicle units as a V1 blocker. The punch list language shifted to *"customer
and vehicle/project information,"* which reads like "project" quietly replaced the forced unit.

**So: is there an asset record in V1, or is the vehicle just text on the job?**

For graphics alone, free text would work. But the mechanical phase needs real units with VINs, meter
readings, and service history, and **retrofitting an asset table under thousands of existing jobs is
exactly the kind of migration that costs weeks.** [[Domain Model]] already has
`customers.units`.

**Recommendation:** keep a real asset record in V1 with a type field (vehicle, trailer, sign, wall,
building, other) and only require the fields graphics needs. Cheap now, and it means the mechanical
phase inherits a model instead of rebuilding one.

### G5. Customer hierarchy deferred with the portal

> **Traces to — Type B.** Meeting, at length — this is the longest single explanation Cameron gives
> anywhere in two hours. `01:27:11` through `01:29:05` on Penn Medicine's departments, then
> `01:28:13`: *"Treated as individual customers, which is inconvenient. So our system needs to put
> that all into one."* At `01:37:51` Dave asks if that's really FullBay's downside and Cameron
> answers *"Yeah, I would say that's the downside."* Recorded as **R1** and **R2** in the debrief,
> ranked his #1 gap.
> Punch list: nothing. It lives in section 8, and all 20 rows went Later.
> **Why it slipped:** collateral damage. Hierarchy is only *visible* through a portal, so deferring
> the portal deferred it, even though the **schema** consequence is permanent.

Parent customers with sub-customer departments, and global users assignable to several of them, was
**Cameron's single biggest complaint about FullBay** in the walkthrough. It landed in Later because
every portal row did, and hierarchy mostly matters to the portal.

For graphics that's correct: a few hundred small direct customers, no departments.

**But the data model should carry it now.** A nullable `parent_customer_id` and roll-up-aware
queries cost almost nothing today. Discovering later that every invoice, job, and report assumed a
flat customer list is a painful rewrite, and the fleet-management product OTC actually wants to sell
is built on this.

### G6. Deposits are recorded but not collected

> **Traces to — Type B + C.** Meeting, and it is his single loudest complaint: `00:26:26` *"I hate
> our deposit structure with FullBay. It's ridiculous how hard they make it"* → `00:30:55` *"For jobs
> over five thousand, I take deposits"* → `00:31:43` the fake-part workaround, a counter sale with a
> part named *"fifty percent deposit"* → `00:32:12` *"that would be a great spot to put that, right
> on the request authorization. As soon as they press approve, enter in your deposit information
> right there."* Recorded as **R4** in the debrief.
> Punch list: **7.5** scopes it to *"Record customer deposits/prepayments collected through existing
> payment tools… Recording a deposit does not imply collecting/transmitting money through the new
> software."* Meanwhile **7.6** and **11.13** put a hosted card provider in V1 and **11.13**
> explicitly mentions *"recorded deposits and manual entries for payments collected elsewhere."*
> **Why it slipped:** his own `00:32:12` answer put deposit collection **on the approval screen** —
> and the approval screen went to Later with the portal. The deposit followed it down. The payment
> provider stayed. That's almost certainly an accident.

7.5 scopes deposits as *recording* a prepayment taken elsewhere. But 7.6 puts a hosted card payment
provider in V1 anyway.

Once the provider is wired for invoices, **collecting a deposit by link is nearly free** — it's the
same integration pointed at a different amount. And "I can't take a deposit by link" was Cameron's
loudest, most specific FullBay complaint in the meeting, with a fake-part workaround to prove it.

**Likely a marking artifact rather than a real preference.** Worth asking directly, because it's a
small build that fixes something he actively hates.

### G7. One package line vs materials / design / labor split

> **RESOLVED 2026-10-29 by Dave.** Not a contradiction, two views of the same data. **The estimate
> is itemized, the invoice is rolled up.** Cameron builds a job from the full material list (inks,
> vinyl, laminate, solvents, and the dozen-plus items that go into one wrap) and the customer sees a
> high-level line per vehicle with the components collapsed under it.
>
> Two candidate mechanisms, to be chosen during V1 specification:
> 1. **Reusable material groups.** Cameron defines a group once ("two-door car wrap"), adds the
>    group to an estimate, and it populates every component. The group is what prints on the invoice.
> 2. **A per-item display flag.** Items are marked "not shown on the invoice unless called out,"
>    and roll up into the parent line by default.
>
> Not a question for Cameron. Design work for the spec, with alternatives to weigh then.
>
> **Mechanism chosen 2026-11-05 by Dave — both, and neither as originally framed.** The estimate
> is a **flat list of rows**: catalog material, custom item, labor, allowance, or **package**. Only
> a package has contents, and contents are the only thing hidden from a customer document. So
> mechanism 1 (reusable groups) is the package, mechanism 2 (a display flag) is unnecessary —
> a material the customer should see is simply left at the top level rather than put in a package.
> A package can also be built inside one estimate and live only there. Written up as EST-002 and
> EST-014 … EST-018 plus PUR-011 in [[Rules Catalog]], Proposed pending Cam (D-C19, D-C20).

**Three things this resolution carries forward:**

- **It is already mostly in scope, which is lucky.** Punch list **1.20** (reusable templates with
  preset line items) plus **1.21** (one customer-facing package line, internal breakdown retained)
  together describe mechanism 1 almost exactly. What Cameron marked **Later** in 1.21 was *"reusable
  material/parts bundles and automatic inventory deduction from rollup components"* — the
  **inventory deduction** half. So groups that populate lines and costs are V1; groups that decrement
  stock are not, which is consistent with **3.2** (no live stock counts).
- **Catalog size is a real decision.** Dave's framing imagines a few hundred material records.
  Cameron's 1.21 note asks for the opposite on consumables: *"Use estimated cost allowances for
  consumables such as ink and cleaning products rather than requiring precise inventory measurement
  of each supply."* So the catalog probably needs **real records for vinyl and laminate** and
  **allowance lines for ink, alcohol, and Goo Gone**, not 300 ink SKUs. Worth confirming when the
  spec is written, not now.
- **It makes G10 load-bearing.** One collapsed invoice line can carry exactly one tax treatment. If
  Pennsylvania taxes vinyl as goods and treats design or labor differently, the roll-up forces a
  choice about how that line is taxed. **Get the tax answer before the invoice layout is built**,
  not after.

> **Original gap, retained for the trail — Type B.** The cleanest contradiction of the fifteen, and
> both sides are quotable.
> Meeting: Dave proposes a single rolled-up line and Cameron pushes back twice — `00:54:26` *"I
> would want it separated. I would want separated by parts and labor. That's it. How much I'm
> charging for material and labor"* → `00:55:12` *"that would be a separate line item. So parts,
> like the material I'm using, materials, design, and labor would be all three separate things."*
> Punch list **1.21**: *"Allow one customer-facing estimate/invoice package line, such as Full
> Vehicle Wrap… The customer invoice shows the single package description and selling price."*
> **Why it slipped:** both are reasonable and they were answered a week apart in different framings.
> The meeting question was "what do you want the customer to see"; the punch list question was
> "do you want part kits." Different questions, opposite answers.

In the meeting Cameron said: *"materials, design, and labor would be all three separate things."*
Punch list 1.21 specifies one customer-facing package line such as "Full Vehicle Wrap" with the
breakdown internal only.

These are reconcilable — three package lines instead of one — but **the invoice layout has to be
pinned down**, because it drives the line-item model, the PDF, and how tax applies per line (which
connects to G10).

**Question for Cameron:** show me two real invoices, a small job and a full wrap, laid out the way
you want them to look.

### G8. Kanban and calendar both own "when"

> **Traces to — Type C.** Two punch list rows that overlap. **1.5**: Kanban cards show *"scheduled
> date and graphics priority."* **1.24**: a calendar with *"separate production and installation
> entries linked to the same underlying job… Each entry can have its own date/time."*
> Meeting: **neither existed.** The Kanban is entirely new in the punch list, and scheduling came
> up only as a need — `00:34:59` *"For me, though, I would need scheduling. For graphics, because
> that's all over the place"* — with no shape attached.
> **Why it slipped:** both rows are new and were marked independently. Nobody has had to reconcile
> them yet because neither has been designed. This one is cheap to fix *now* and annoying later.

Both are V1. The Kanban has stages and the cards show a scheduled date; the calendar has separate
production and installation entries with their own dates and assignees.

Without one rule they will disagree within a week, and then nobody trusts either.

**Proposed rule:** the **job record** is the single source of truth. The **calendar** owns time
(production entry, installation entry, assignees). The **Kanban** owns state and nothing else, and
its card simply displays the next scheduled date from the calendar. Moving a card never changes a
date; changing a date never moves a card.

### G9. "WIP" is undefined for graphics

> **Traces to — Type D.** Dave's inference. Punch list **9.18** (WIP Details) and **9.20** (WIP
> Summary) are both marked V1 with **no note at all** — two of the few V1 rows Cameron left bare.
> Meeting: WIP never comes up. What does come up is the production room — `00:21:43` *"a lot of our
> time spent in the graphics production room right below us, weeding material and prepping all of
> it for the vehicle"* — which is where the unfinished value physically sits.
> **Why it slipped:** it's a FullBay report name. He recognised it as useful and marked it V1
> without anyone asking what it should mean for a graphics job.

Two WIP reports are in V1. In a mechanical shop, WIP means open orders with costs accrued. For
graphics, is a job WIP when it's authorized? When material is cut? When it's printed and sitting on
the rack?

That rack is the real question: **printed vinyl for an unfinished job is real money sitting in the
shop**, and it's probably what Cameron actually wants to see.

**Needs a one-sentence definition tied to a Kanban stage.**

### G10. Taxability of design and labor vs materials

> **Traces to — Type A.** Cameron's own note on **7.23**: *"Exact rates/settings have not been
> supplied and must be verified with accounting before launch; do not guess tax rates or
> taxability."* He flagged it himself and correctly refused to answer it.
> Meeting: tax appears once, and only on the vendor side — `00:59:19` *"if we receive parts from a
> lot of our customers, we're tax exempt because we're selling it to the customer."*
> **Why it's still a gap:** he answered it as honestly as he could. The part neither source covers
> is that the **G7 decision changes the tax question** — one collapsed package line has to be given
> a single tax treatment, where three lines can each carry their own.

7.23 says match the current configuration, and the rates were not supplied. This is already
[[Open Questions]] Q25, but it belongs here too because it interacts with G7.

In Pennsylvania, goods and some services are taxed differently. **Vinyl is goods. Design is arguably
a service. Installation labor is a third question.** If the invoice collapses all three into one
package line, the tax treatment of that line has to be decided deliberately rather than inherited.

**Do not guess this.** Get the current FullBay tax settings and a real invoice from accounting, and
mirror them.

### G11. Nobody owns the migration keystrokes

> **Traces to — Type D.** Dave's inference, from an omission rather than a conflict. Punch list
> **11.2** defines *what* migrates — *"relevant graphics customers and open work, including active
> estimates/jobs and unpaid invoices/balances"* — and assigns **nobody** to do it.
> Meeting: the conversation was entirely about getting data *out* of FullBay (`01:05:53`, the data
> dump ask). Nobody asked who types it *in*.
> **Why it slipped:** it isn't a feature, so there was no row for it. It's a task, and tasks don't
> appear on a punch list.

Migration scope is open work only: active estimates and jobs, unpaid invoices and balances. Probably
a few dozen records.

But it has to happen in the window between "the system works" and "we're live," **while Cameron is
still running the business**, and nobody has agreed who types it or when. This is the kind of small
task that silently delays a cutover by three weeks.

**Needs a named person, a date, and a frozen cutoff.**

### G12. Customers get hand-copied from GoHighLevel

> **Traces to — Type D.** Dave's inference, from a decision Cameron made deliberately. Punch list
> **1.5**: *"Approved work will be entered into the shop system manually. No GoHighLevel API
> integration, synchronization or cross-app automatic advancement in V1."* Repeated in **1.8** and
> **11.12**. He also asked for external ID storage *"for future compatibility,"* which shows he was
> thinking about the seam.
> Meeting: **GoHighLevel is never mentioned once.** This entire subsystem was new information in the
> punch list.
> **Why it slipped:** he solved the integration question and not the data-hygiene consequence. Two
> systems, one typist, no reconciliation.

No GHL integration in V1, so approved work is typed in by hand. That means customer records get
created twice, in two systems, by a person, with no reconciliation.

Day one that's fine. By month six there are duplicates and mismatched names on invoices.

**Mitigation, not a feature:** store the GHL contact and opportunity IDs on the customer and job
records from the start (already tracked as Q24), and add a duplicate-name warning on customer
create. Cheap, and it keeps the later integration honest.

### G13. Photo volume, upload, and shop wifi

> **Traces to — Type A + D.** Cameron's own note on **10.3** admits half of it: *"No detailed
> measured assessment of bay Wi-Fi was supplied; do not invent one"* — while still concluding
> *"Online-only V1 is acceptable."* Meanwhile **1.11** makes completion photos **mandatory** to
> close a job, **6.3** adds condition and quality-check photos, and **10.1**/**10.5** put all of it
> on phones and iPads.
> Meeting: photos never come up. Wi-Fi never comes up.
> **Why it slipped:** the offline question was asked and answered at the level of *"do you need an
> offline app,"* which is correctly no. Nobody asked the narrower question — **what happens when a
> 40-photo upload dies at photo 31 on shop wifi** — which is the only place online-only actually
> bites.

Graphics is a photo-heavy business: condition shots before install, proofs, completion photos,
quality checks. Jason uploads from a phone or iPad in a shop and in the production room downstairs.

Nothing in the scope sizes this. S3 is already the decision, but **resizing, EXIF handling, upload
retry, and what happens when a 40-photo upload fails at photo 31** are all unspecified.

This is also the one place "online-only" might actually bite, and it's worth noting that the
offline question was answered in general terms (10.3) rather than specifically about photo upload.

**Minimum:** client-side resize, resumable or chunked upload, a clear per-photo failure state, and a
sanity check on how many photos a wrap job really produces. Ask Jason, not Cameron.

### G14. Invoice numbering + two-way QBO + open-invoice migration

> **Traces to — Type A + D.** Cameron's notes flag all three pieces **individually**, which is why
> this is worth showing him: he half-saw it.
> **7.17**: *"prevent collisions with existing invoice/accounting records during migration and
> ongoing use."* **7.18**: *"Verify the current invoice range and set a noncolliding starting
> sequence… Do not guess a starting number."* **11.2**: *"Coordinate open invoice/payment migration
> with QuickBooks Online to avoid duplicate accounting records."* **7.24** adds that the
> bookkeeper and developer must define *"ownership/edit rules, conflict handling, duplicate
> prevention and treatment of existing open invoices before implementation."*
> Meeting: the QuickBooks conversation was about the sync **breaking** (`00:45:13`, postal hand-keying
> a day's backlog), not about record ownership.
> **Why it's still a gap:** three correct cautions in three different rows, and nothing that puts
> them together. The failure mode only appears when you read all three at once.

Three requirements that are each fine alone and hostile together:

- Invoice numbers must be unique, carry the OTC prefix, and not collide with FullBay's range (7.17,
  7.18)
- QuickBooks Online sync is two-way, so payments and invoice changes made in QBO flow back (7.24)
- Open unpaid invoices migrate out of FullBay, and migration must not create duplicate accounting
  records (11.2)

**Any two of these can quietly corrupt the third.** Migrate an open FullBay invoice, have QBO
already holding it from the FullBay sync, and now there are two records for one debt, with a payment
that could land against either.

**This needs a written plan before a single invoice is issued from the new system**, agreed with the
bookkeeper: which system owns which record, how migrated invoices are marked, what the starting
number is, and what happens to a payment that arrives during cutover. It is the highest-risk
sequence in V1 and it is not a coding problem.

### G15. No agreed cutover criteria

> **Traces to — Type D.** Neither source. It comes from **Dave's own prep doc** —
> [[Meeting Brief 2026-10-23]] §4b proposed *"one full billing cycle for that customer in the new
> system without falling back"* as the gate, plus a two-or-three-week shadow run.
> Meeting: never raised. The 10/23 conversation ran out of time on compensation and the portal
> walkthrough.
> Punch list: there is no row for it, because it isn't a FullBay feature.
> **Why it's a gap:** it was Dave's idea, it never got said out loud, and it's the kind of thing
> that only has force if it's agreed **before** the date is set rather than after the first wobble.

The working definition from the brief was "one full billing cycle in the new system without falling
back." For graphics that's roughly a month. **Nobody has agreed it**, and a cutover without a
written exit criterion is how a pilot becomes permanent.

Also unagreed: whether there's a shadow period where a few jobs get entered in both systems as
practice. For a two-person department that's cheap rehearsal and probably worth it.

## 6. Deliberately Out, With The Reason

So these don't get relitigated every meeting:

| Out of V1 | Why |
|---|---|
| Customer portal, customer logins | All 20 rows marked Later. Graphics customers mostly phone Cameron. (But see G2.) |
| Live inventory, stock counts | Cameron tracks visually today and explicitly confirmed launching without it |
| Preventive maintenance | Zero of 12 rows. Mechanical concern |
| DVIR, Whip Around | Not needed. One job checklist survives (6.3) |
| Labor guides, MOTOR, Mitchell 1, VMRS | Not needed. Mechanical reference data |
| Vendor portal, vendor payments, marketplace | Not needed. Zero vendors use FullBay's portal |
| Native mobile app | Not needed. Mobile web, bookmarkable |
| Multi-shop switcher | Later. One department at launch |
| ACH payments | Later. Card link plus manually recorded checks at launch |
| Historical data migration | Open work only. FullBay stays readable for history |
| GoHighLevel integration | Later. Manual entry at launch |
| Offline capture | Confirmed not required. Online-only accepted |
| Per-business-unit email template variants, multiple send methods, reminders/dunning, PO emailing, inbound email | Proposed fence around G3. V1 sends invoices and estimates only, one editable template each |

## 7. Dave's Open Build Decisions

Cameron doesn't need to weigh in on these, but they block starting.

1. **API framework.** ~~Still open~~ **Decided 2026-10-13: NestJS**, chosen by spike (ADR-027).
   See [[Framework Evaluation]]. The spikes are in `projects/fleetco/spikes/`.
2. **Estimate and job: one table or two?** The punch list insists on *"the same underlying job
   record"* and *"the same underlying estimate structure."* Leaning one record with a lifecycle
   status, because partial approval and mid-job scope changes both need the estimate to stay alive
   after work starts.
3. **How the package roll-up is modeled.** A customer-facing line with internal child components is
   a parent/child line-item tree. Needs to handle three visibility rules: customer-visible,
   internal-cost-only, and technician-visible-but-cost-hidden (3.30).
4. **Time entries as events or rows.** One active timer per employee, auto-stop on switch, manual
   corrections, and an approval state. An append-only event log with a derived timesheet is more
   auditable and makes "manager corrected this" provable. Slightly more work.
5. **Permission model shape.** Two roles now, but Office/Manager/Accounting and per-user
   Inherit/Allow/Deny are explicitly Later. **Roles must be data, not hardcoded enums.**
6. **PDF generation.** Estimates, invoices, POs, and printable reports all need it. One path, server
   side, with templates Cameron can restyle without a deploy.
7. **QBO sync shape** — pending the pushback in [[V1 Scope from Punch List]] §2.

## 8. What To Do Next

1. **Confirm the three big items** with Cameron: portal out, QBO two-way in, GoHighLevel's role.
2. **Walk the gap register with him** — G1, G6, G7, G9, G11, G12 are all his to answer, and G1 is
   the one that could change the shape of the job record.
3. **Offer the G2 approve link and G6 deposit link.** Both are small, both fix things he complained
   about, and both make V1 visibly better than FullBay rather than merely equivalent.
4. **Raise the G3 email position** — email for invoices and estimates only, everything else fenced
   out. Ask who controls Fleetco's DNS at the same time.
5. **Get the accounting answers** (G10, G14, and Q25–Q27).
6. **Then write the [[PRD]]**, which is finally possible.

### Proposed V1 adds — to raise with Cameron (2026-11-01, unpruned)

Small additions that make V1 noticeably less cumbersome. Captured in full; Dave will prune before
the conversation. Estimates are rough and unmeasured.

| # | Add | Why | Size | Depends on |
|---|---|---|---|---|
| A1 | **Email invoices and estimates** from the system, one editable template each (G3) | Payment links must reach customers; manual means pasting links forever | ~5–7 days | DNS access from Fleetco |
| A2 | **Deposit collection by card link** (G6) | Cameron's loudest FullBay complaint — the fake "50% deposit" part (`00:26:26`, `00:31:43`). Same Stripe integration as invoices, different amount | ~1–2 days | A1, Stripe (7.6) |
| A3 | **Approve/decline link on emailed estimates** (G2) | Creates the customer's own approval record on $5k+ jobs. Highest value-per-hour item in scope | ~1–2 days | A1 |
| A4 | **Proof versions + customer proof approval** (G1) | Records which artwork version was approved; guards against printing the wrong one. Reuses the A3 link mechanism | ~2–3 days | **Only if** proofs go back and forth by email today, not inside GoHighLevel. Ask Cameron to walk a real proof cycle |
| A5 | **Resilient photo upload** (G13) — client-side resize, retry, per-photo failure state | Completion photos are mandatory to close a job (1.11); a failed batch on shop wifi blocks Jason | ~2 days | Ask Jason how many photos a typical wrap produces |
| A6 | **Duplicate-customer warning + stored GHL contact ID** (G12) | Customers are hand-copied from GoHighLevel; duplicates accumulate by month six | Hours | — |

A5 and A6 are arguably not adds but things V1 needs to avoid feeling broken; listed here so the
whole picture is in one place.

## Change Log

| Date | Change |
|---|---|
| 2026-10-28 | Created from [[V1 Scope from Punch List]] and [[2026-10-23 Cameron Walkthrough Debrief]]. 15 gaps registered. |
| 2026-10-28 | Added provenance to every gap — a traces-to block with punch list rows, transcript timestamps, and why each one slipped. Added the four-type taxonomy (A flagged by Cameron, B meeting vs. punch list, C internal contradiction, D nobody raised it). Two root causes identified: the portal deferral, and the punch list being shaped by FullBay's surface. |
| 2026-11-01 | Added §8 "Proposed V1 adds" table (A1–A6): email, deposit link, approve link, proof approval, resilient photo upload, duplicate-customer warning. Unpruned. |
| 2026-11-01 | §7 item 1: framework marked decided (NestJS, 2026-10-13, ADR-027) instead of open. |
| 2026-11-01 | G3: recorded Dave's position — V1 emails invoices and estimates only, from one editable template each; per-business-unit template variants, multiple send methods, reminders, PO email, and inbound out. Added effort, risks both ways, and the in/out fence. Added to §6 and §8. |

## Related

- [[V1 Scope from Punch List]] — the 62 V1 items, as Cameron marked them
- [[2026-10-23 Cameron Walkthrough Debrief]] — how the business actually runs
- [[PRD]] — write it from this document
- [[Domain Model]] · [[Feature Inventory]] · [[Open Questions]] · [[Architecture Decisions]]
