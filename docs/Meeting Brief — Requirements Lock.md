---
status: draft
summary: Topics for the meeting that locks the requirements the V1 review changed, each grounded in the review's own wording
created: 2026-11-10
updated: 2026-11-10
tags: [fleetco, otc, v1, meeting, requirements, highlevel, proofs]
source: Claude Code (Xerro)
---

# Meeting Brief — Requirements Lock

**Why.** The [[2026-11-09 Cameron V1 Review]] changed or added about fifteen things. Some are easy
because FullBay already does them. Some are net new and need a picture before anything gets built. A
few are direction calls rather than requirements.

**Shape.** About an hour. Each topic below quotes the line in the review it came from, so it's clear
what prompted the question.

**Useful sorting question** for anything on this list: does FullBay do this today, and does it work?
If yes, we copy it. If no, we design it.

---

## 1. Proofs and permission to print

> "Store which proof version was approved and pair it with the matching print files. Before
> releasing work to print, require all applicable items: the production files, color approval, signed
> proof and required deposit. Any missing required item blocks printing. A new proof version must be
> signed before that version can be released." — §2.5
>
> "Keep large production files in Box and signed proofs in Box Sign… Test whether completed Box Sign
> proofs can automatically attach to the right job and proof version." — §2.5

Net new. Nothing in FullBay to copy, which is why the guide could only ask the question.

- Where artwork lives now, and how many revisions a typical job takes
- Who signs, and what gets kept afterward
- What color approval is, who gives it, and on what
- What stops a wrong version printing today
- Box and Box Sign: what's already set up, who administers it, whether it's the whole company or just
  graphics
- Whether all four print-release requirements are truly mandatory, or some are warnings

## 2. Email — why it lives outside the app

> "Export the PDF and send it through our existing email or HighLevel." — §1.3
>
> "Use HighLevel or our existing email to send customer messages, quote PDFs, deposit links, and
> invoice PDFs with the Pay This Invoice link." — §8.1, 8.2 and 8.4
>
> "Email the invoice as a PDF attachment with a Pay This Invoice link." — §4.3

The last quote is the opening: an email does need to go out. The question is only who sends it.

- Confirm the reason: replies landing where they get watched, the follow-up automations already
  built, the warm sending domain, or all three
- Option worth putting on the table: the shop app builds the PDF and the pay link, then sends it
  **through** HighLevel so it lands in the customer's existing thread. One click, no second inbox, no
  new email system for us
- What customers should see as the sender

## 3. The HighLevel handoff — direction call

> "Moving an opportunity to Print Production should create the job from its linked quote." — overall
> assessment
>
> "Proposed handling for Dave to verify: if the same card triggers twice, create only one job or
> fleet job group. If the quote link or required details are missing, flag the handoff for review and
> keep it out of the print queue." — §2.1–2.4

This is the item the guide had on the other side of the line: leads and sales stay in HighLevel and
approved jobs get typed in. It's now an integration.

- Which pipeline and which stage triggers the job, and who moves cards
- What should happen when a card gets moved back out of Print Production
- Who owns the HighLevel account — an agency account with sub-accounts, or one standalone account
- Who can create an API token for it
- HighLevel charges per webhook call as a premium action. Whether that cost matters

## 4. From graphics to fleet and trailers — direction call

> "Keep V1 graphics-only and browser-based." — §8.1, 8.2 and 8.4

Not otherwise in the review, which is the point — the review is a graphics document, and these
answers set patterns the other businesses inherit.

- Do fleet and trailers ever use HighLevel? Today they're on Univerge for calls and texts. If they
  never adopt it, the app needs its own way to send for those businesses, and that changes what gets
  built now
- Which business is next after graphics, and roughly when
- The Lancaster service manager has still never been interviewed. He's the heaviest FullBay user in
  the company and he sizes everything after V1

### Which of these tools do you expect to still be paying for in three years?

Never asked, and the record points both ways. The punch list says *"the preferred architecture
continues to use GoHighLevel for messaging rather than building a duplicate texting platform"* — that
reads permanent. But row 11.12 marks two-way texting **Later**, and the October 30 reply says
*"emailing and texting inside the software can come later"* — that reads like eventually ours. Both
are fair, and we can't build from both.

Worth sorting each one into permanent, stepping stone, or haven't thought about it. The third pile is
the useful output.

- **GoHighLevel** — permanent system of record for customer conversation, or does the app take it
  over once it can?
- **Box and Box Sign** — brand new in the review and never declared either way
- **Email sending** — through HighLevel forever, or does the app send on its own later?
- **QuickBooks** — assumed permanent, worth confirming out loud
- **myOTCFleet** — fleet features stay there, but its backend was supposed to move onto the new
  platform. Still the plan?

Two reasons it matters now rather than after V1:

1. It decides whether the HighLevel work is an investment or scaffolding. Permanent means integrate
   deliberately and never duplicate their surface. Stepping stone means keep the seam thin. Same
   hour of work, opposite design.
2. Box has teeth. If the signed proof lives only in Box Sign, the artifact that settles a "you
   printed the wrong version" dispute isn't ours. Ten years of FullBay data just had to be pulled
   out a file at a time because the vendor wouldn't supply an export — same failure mode.

The position worth bringing: keeping HighLevel, Box and QuickBooks forever is probably right.
Rebuilding a CRM, an e-signature service and a general ledger isn't what this project is for. What's
worth avoiding is accidental permanence — nobody decides, and the architecture gets settled by
whatever got wired first.

Either answer is protected by one rule, which costs almost nothing now and is unrecoverable later:
**own the record, reference the file.** Our database holds the proof version, who signed, when, and
what it covers, plus a vendor reference. Leaving Box later becomes a file migration instead of a loss
of history.

## 5. QuickBooks — direction call

> "One-way only. Post finalized invoices, payments and deposits from the shop app to QuickBooks using
> the mappings accounting approves… show any failed posting so it can be retried safely." — §4.5

The October 30 reply landed somewhere else: the simplest practical handoff for launch, which was an
export the bookkeeper imports, with automatic posting coming later once the workflow was proven.

- Export now and automatic later, or automatic now
- Worth saying out loud: automatic adds real work before cutover, and the export is not wasted — its
  format is the spec for the automatic version

## 6. Things FullBay already does — confirm and copy

- **Work with no vehicle.** How a sign or decal sale gets quoted and invoiced today
  > "Let us quote, sell and invoice work without a vehicle… A VIN or installation appointment should
  > be optional." — §1.5
- **A ten-van job.** One service order or ten, one invoice or ten
  > "Fleet units need their own dates and status while sharing a quote and, when needed, one final
  > invoice." — §2.1–2.4
- **Account terms and balances.** Whether COD and Net 30 are used in FullBay now
  > "Keep account-level balances and credit terms, including COD for first-time customers and Net 30
  > for approved accounts." — §4.1 and 4.4
- **Other open invoices on an invoice.** Whether FullBay's version works the way it should
  > "Give each old invoice its own link to open and pay it." — §4.2
- **Partial payment on one invoice.** Whether it's possible today and how often it happens
  > "Let customers pay part or all of a single invoice." — §4.3
- **Priority.** Whether Normal, High and Rush mean the same as FullBay's
  > "Keep Normal, High Priority and Rush." — §2.1–2.4
- **Internal vs. customer work.** How OTC's own work is told apart today
  > "Give us an internal versus external customer-work tag so we can compare the two." — §7.1 and 7.3

## 7. Pre-wrap inspection

> "Every inspection goes to the Owner for internal review, including inspections with no damage.
> Installation can move forward after the Owner clears it." — §3.5
>
> "The Owner chooses whether to send the inspection to the customer for approval. If the Owner
> requests customer approval, record it before clearing the job." — §3.5

- What happens step by step when damage is found
- When the customer needs to see it, and what happens if they don't answer
- Whether a clean inspection really needs review before install, or just a record

## 8. Deposits

> "Keep the $149 design deposit separately identifiable. Printing stays blocked until a required
> deposit is satisfied." — §1.4

- Whether the $149 design deposit is separate from the 50% or part of it
- Refundable, applied to the final invoice, or kept

## 9. Moving off FullBay

> "Dave handles the trial import, duplicate matching and the final move… Preserve the old invoice
> numbers and link records already in QuickBooks so they are posted only once. Agree on the actual
> switch date after the trial import checks out." — §8.3

Plus, from the covering email: ten years of FullBay data downloaded a file at a time, because FullBay
would not supply a master export.

- What actually got downloaded, and a look at the folder
- What counts as an active job and an open invoice at cutover
- Rough switch date

## Not this meeting

> "Accounting will confirm the exact legal biller, remit-to details, correct QuickBooks company, tax
> rates, taxable items and exemptions." — §4.2

That list, plus Stripe fees, invoice numbering and cutover balances, is a separate conversation with
the bookkeeper. It blocks go-live, not the build.

## Related

- [[2026-11-09 Cameron V1 Review]] — what changed, marked up
- [[V1 Vision and Gaps]] — the gap register
- [[Open Questions]] — Q1 FullBay export
