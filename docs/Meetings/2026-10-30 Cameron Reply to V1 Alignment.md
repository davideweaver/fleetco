---
created: 2026-10-30
tags: [fleetco, otc, v1, alignment, quickbooks, decisions]
source: Cameron's written reply to [[V1 Alignment]]
status: portal, in-app email and two-way QBO settled. Dave replied, accounting handoff is Dave's to research
---

# Cameron's Reply to V1 Alignment — 2026-10-30

## The reply, verbatim

> Hey Dave, my goal is to keep V1 simple so we can start using and testing it quickly, then automate
> the manual steps once we know the workflow works. No customer portal or built-in emailing/texting
> in V1. I just need to export the estimate or invoice PDF and copy a customer payment link that I
> can send through our existing email myself. Emailing and texting inside the software can come
> later. Some of my questionnaire answers made the scope bigger than I intended, especially full
> two-way QuickBooks sync. Please don't treat that as a firm requirement. Let's identify the simplest
> practical accounting handoff for launch and discuss any limitations before adding more integration
> work. The priority is a working graphics shop system we can test, with manual steps where they keep
> the initial build manageable.

## The principle he set

**Manual first, automate once the workflow is proven.** This overrides the punch list wherever the
punch list asked for automation, and it's the rule to apply to anything still open: if a manual step
keeps the first build small, take the manual step.

## What it settles

| [[V1 Alignment]] item | Gap | Outcome |
|---|---|---|
| 4.1 Customer portal | G5 | **Out of V1. Settled.** Matches the punch list, overrides the meeting |
| 4.2 One-click approve link | G2 | **Declined for V1.** Approval stays recorded by Cameron |
| — In-app email or texting | G3 | **Out of V1. Settled.** Export PDF + copy payment link, send from existing email |
| 4.5 QuickBooks | G14 | **Two-way sync is not a requirement.** Simplest handoff to be chosen, see below |

G3 is now closed the way the punch list originally read: every outbound document is manual,
including the payment link. The system's job is to produce the PDF and a copyable link, and to
update the invoice balance when the customer pays. Nothing sends.

## What it leaves open

Still unanswered from section 4: **4.3** deposits, **4.4** design proofs, **4.6** signs and walls,
**4.7** WIP definition, **4.8** switchover data entry, **4.9** what done means. Section 5 (sales tax,
invoice numbering, card processing) is unchanged and still blocks go-live.

Two of these shift slightly under his principle:

- **4.3 Deposits.** A deposit link is the same mechanism as an invoice payment link for a partial
  amount, copied and sent the same way. It fits "copy a link and send it myself" exactly. Worth one
  line asking if he wants it, framed that way.
- **G2 Authorization artifact.** With the approve link declined, the cheapest substitute is letting
  Cameron attach the customer's approval email or a screenshot to the job when he marks it approved.
  No new workflow, and the job keeps evidence of who said yes.

## Things the reply changes on Dave's side

- **No transactional email provider in V1.** No sending domain, SPF/DKIM/DMARC or bounce handling.
  One exception to check: auth flows. Password reset and invites normally send email. With two users,
  an Owner-triggered reset (Owner generates a reset link and passes it on) is enough for V1.
- **The "copy link" UX matters.** The payment link has to be one click to copy from the invoice, and
  the PDF should carry the same link (or a QR code) so a customer with only the PDF can still pay.
- **Card surcharge.** The debrief records a 3% card fee passed through to customers today. The
  payment link has to reproduce that, or OTC absorbs it. Folds into section 5 item 3.

---

## The Simplest Practical Accounting Handoff

### What the handoff has to do

Graphics already has its own QuickBooks Online class. Whatever we choose, QBO has to end up with
correct revenue and sales tax for that class, and the Stripe deposits landing in the bank have to be
explainable. The open question is **how much detail QBO needs**: one record per invoice, or a
summary.

### Option A — Invoice export, bookkeeper imports (recommended for launch)

- The app has an **Accounting Export** screen: every invoice finalized and every payment received
  since the last export, as a CSV laid out for QBO's invoice import, plus the invoice PDFs.
- The bookkeeper imports the invoices into QBO under the graphics class, then records payments
  against them, matching the Stripe payouts in the bank feed.
- The app stamps each invoice and payment as exported, so nothing is sent twice.
- **One rule replaces all of two-way sync: the shop app is the source of truth.** Corrections are
  made in the app (void, credit, re-issue) and go out in the next export. Nobody edits graphics
  invoices in QBO.

**Limitations to say out loud:**
- Payments are entered twice: once automatically in the app (Stripe), once by hand in QBO. QBO's
  spreadsheet import covers invoices, not payments, so this stays manual. **To verify against
  current QBO before promising.**
- QBO is only as current as the last export. Weekly is probably right for graphics volume.
- Customer names must match between the app and QBO or the import creates duplicates. The export
  should carry the QBO customer name exactly.
- Stripe pays out in batches net of fees. The bookkeeper needs a payout report from the app (or
  Stripe) to split one bank deposit into invoice payments plus a fee expense.

### Option B — Monthly summary journal entry

- Once a month the app produces one journal entry for the graphics class: revenue by type, sales tax
  collected, payments received, card fees. The bookkeeper posts it.
- **Least work for the bookkeeper and for the build.** But QBO no longer knows individual graphics
  invoices or which customers owe money. Customer balances live only in the app.
- Only works if nobody uses QBO to chase graphics receivables or produce customer statements.

### Option C — One-way API push (later, not launch)

The app pushes invoices and payments to QBO automatically. Removes the double entry in Option A but
brings OAuth, customer and item mapping, tax code mapping, and error handling back into scope. **This
is the natural "automate it once it works" step after Option A,** and Option A's export format is
effectively the spec for it.

### Recommendation

**Launch on Option A, fall back to Option B if the bookkeeper is happy with summaries, move to C once
the workflow is proven.** Either way, build now:

- `exported_at` / export batch on invoices and payments
- a nullable QBO ID on customers, invoices and payments, unused until Option C
- a payouts report tying Stripe payouts to invoice payments and fees

### Questions for the bookkeeper (one short call)

1. Does QBO need each graphics invoice, or is a monthly summary enough? (Picks A or B.)
2. Roughly how many graphics invoices and payments a month?
3. Who records Stripe payouts and card fees today, and how?
4. Sales tax rates and what's taxable (section 5 item 1, still blocking).
5. Current invoice numbering, so the app's OTC-prefixed range doesn't collide (section 5 item 2).
6. How are open graphics invoices that are already in QBO from FullBay's sync handled at cutover?
   Recommendation: they stay in QBO and get paid there, and only new work goes through the app. That
   removes the duplicate-record risk in G14 entirely.

---

## Dave's reply (sent 2026-10-30)

> Thanks. That sounds good. I'll look into the accounting options.

Sent instead of the draft below. So the accounting handoff is now Dave's to research before going
back to Cameron with a recommendation. **Not yet asked:** the deposit link question, the rest of
section 4 (4.4, 4.6–4.9), and a call with the bookkeeper. Carry those into the next message.

## Draft reply to Cameron (not sent)

> Thanks Cam, that's clear and it makes V1 meaningfully smaller. Locked in: no portal, no emailing
> or texting from the system. You export the PDF and copy a payment link, and the invoice balance
> updates when the customer pays.
>
> For QuickBooks, my suggestion for launch is a simple export. The system produces a file of new
> invoices and payments each week, your bookkeeper imports it into QuickBooks under the graphics
> class, and the shop system stays the master copy. The main limitation is that card payments get
> recorded in QuickBooks by hand. If your bookkeeper only needs monthly totals for graphics, it gets
> even simpler. Could I get 20 minutes with them to pick between those and get the sales tax and
> invoice numbering answers?
>
> Two quick ones while I have you. Since you'll be copying payment links anyway, do you want the same
> thing for deposits, a link for a partial amount? And the rest of section 4 (proofs, signs and walls,
> WIP, who does the switchover data entry, and the one month bar for done) is still open whenever you
> get a chance.

## Related

- [[QuickBooks Integration Research]] — FullBay-equivalent push, what it adds to V1

- [[V1 Alignment]] — the document this replies to
- [[V1 Scope from Punch List]] — the 62 V1 items
- [[V1 Vision and Gaps]] — G2, G3, G5, G6, G14
