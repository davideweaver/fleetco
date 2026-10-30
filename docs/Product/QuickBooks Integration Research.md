---
created: 2026-10-30
tags: [fleetco, otc, v1, quickbooks, accounting, integration, research]
source: FullBay's QuickBooks explainer PDFs (read in full), Intuit developer docs and blog (via search), vendor help centers, the 2026-10-23 walkthrough transcript, and Cameron's 2026-10-30 reply
status: research complete. Decision pending — export at launch vs. FullBay-equivalent push in V1
---

# QuickBooks Online Integration — Research and V1 Impact

**Question:** OTC runs QuickBooks Online. If the new graphics system connects to it alongside
FullBay, how does that work, what would it take to do exactly what FullBay does, and what does that
add to V1?

**Short answer:**

1. **FullBay's integration is a one-way push, not two-way sync.** FullBay is where invoices and
   payments happen. It pushes customers, invoices, credits, payments and vendor bills into QuickBooks
   for accounting. Nothing in the evidence shows QuickBooks changes flowing back, and Cameron
   described it the same way: *"payments and stuff happens… here. It's just for reporting."* Our
   earlier docs called it "two-way". That was wrong: FullBay's own explainer describes export only.
2. **Two systems feeding one QuickBooks company is normal and safe** if four rules hold: separate
   invoice numbers, a shared customer list matched rather than duplicated, a fixed class, and each
   system only ever touching its own transactions.
3. **Matching FullBay is a contained piece of work: about seven new screens or panels and one
   background sync worker.** It is much smaller than the two-way sync in the punch list, because
   none of the conflict handling exists. The hard part is not the code. It is getting sales tax,
   payment deposits and card fees to land the way the bookkeeper already expects, and that needs
   one session with them before the build starts.

---

## 1. How OTC uses QuickBooks today

From the 2026-10-23 walkthrough (`00:43:38`–`00:46:46`) and [[Open Questions]] Q6:

- **One QuickBooks Online company for everything.** Business units are separated by **class**:
  graphics, Keystone, Lancaster service, mobile, postal. *"Everything's going through one channel,
  but it's all separated by class."*
- **FullBay pushes invoices automatically.** *"When it's working, it's automatic… you just go into
  QuickBooks and see the new invoices."*
- **QuickBooks is reporting-only.** Billing and payments happen in FullBay; QBO is the ledger.
- **The sync drops for a day or two a few times a year**, and postal hand-keys the backlog. No lost
  business, real pain.
- Cameron: *"I can get access to the API connection from QuickBooks, and we'll use that to
  connect."* He is expecting the new system to connect the same way FullBay does.

## 2. What FullBay's integration actually does

From FullBay's own integration explainers (two PDFs on `www2.fullbay.com`, read in full) and its
QuickBooks product page. FullBay's help centre is behind a login. **Confidence is high on what
syncs and in which direction.** Section 9 covers the details only OTC's own setup can show.

FullBay describes itself as *"a managerial accounting system, not a financial accounting system."*
That is the whole design: FullBay runs the shop, QuickBooks keeps the books, and transactions
**export** one way. With QuickBooks Online, *"any Fullbay transactions created will immediately
export into your QuickBooks company file upon creation."*

| What | Direction | Detail, in FullBay's words where quoted |
|---|---|---|
| Customers | Linked, optionally created | Lists are *"directly linked or mapped"* once QBO lists are imported into FullBay, *"with the click of a button."* New customers get a **Create In QuickBooks** option, which is *"permission based and can be turned on or off"* by user role. Not automatic |
| Vendors | Linked | Same linking as customers. No create option mentioned |
| Customer invoices | FullBay → QBO | *"with full repair detail and vehicle information."* Lines use QBO **items** |
| Customer payments | FullBay → QBO | *"automatically applies and reconciles open invoices"* |
| Customer credits | FullBay → QBO | Credit memos |
| Vendor bills | FullBay → QBO | Lines use QBO **accounts** |
| Vendor credits | FullBay → QBO | |
| Inventory adjustments | FullBay → QBO | *"Creates a journal entry to adjust accounts to record when inventory is used."* Not relevant to graphics |
| Anything back from QBO | **None** | Every FullBay description is export only |

**Mapping.** *"Fullbay accounts drive what goes on a vendor bill, while items drive what goes on a
customer invoice."* FullBay's suggested setup:

- **Income accounts:** labor, parts, sublet, shop supplies, service call
- **Cost of goods sold:** labor, parts, parts (tax), sublet, shop supplies, service call
- **Functional accounts:** Accounts Receivable, **Undeposited Funds**, Inventory Asset
- **Default invoice items:** Labor, Parts, Sublet labor, Sublet parts, Shop Supplies, Service Call,
  Mileage, Miscellaneous

**Undeposited Funds is on the required list, so FullBay payments almost certainly land there.**
Someone then groups them into bank deposits in QBO. That's the bookkeeper's existing routine, and
ours should feed the same one.

**Class and location.** FullBay can *"track classes using a hierarchy applied to specific
transactions,"* with location tracking as an option on QBO. That's how each shop's work lands in
its own class today.

**Sales tax. FullBay calculates tax itself; it does not let QuickBooks do it.** It keeps its own
*"tax locations… to match any tax rates set up in QuickBooks,"* including combined or group rates,
which *"drop into a corresponding rate in your QuickBooks sales tax liability report."* Rates are
assigned by shop, customer, unit type or unit. That is the model to copy (section 4).

**Requirements.** QuickBooks Online **Essentials or Plus**. Class tracking needs Plus or higher, so
OTC is on Plus or Advanced.

**Still unknown, and only OTC's own QBO can answer:** whether card processing fees and the 3%
surcharge are posted by FullBay or by the bookkeeper, how FullBay handles a voided or edited invoice
after export, and which tax rates and agencies are set up.

**FullBay Payments** is powered by Stripe, so OTC's card money today probably arrives as Stripe
payouts. That is also the provider V1 names.

## 3. Two systems feeding one QuickBooks company

QuickBooks doesn't care how many apps write to it. Each app gets its own OAuth connection to the
same company. What it cares about is that **every transaction appears exactly once and nothing is
ambiguous.** The failure cases in other vendors' help centres come down to four things.

### Rule 1 — Separate invoice number series

QBO either auto-numbers invoices or, if *Custom transaction numbers* is on, accepts the app's
number. A clash is API error **6140, Duplicate Document Number**. Intuit's own guidance for apps is
a prefix plus a serial, which is exactly what the punch list asked for (7.17, 7.18). Set the prefix
and starting number before invoice one. Check `Preferences.SalesFormsPrefs.CustomTxnNumbers` on
connect.

### Rule 2 — Match customers, never duplicate them

Duplicate customers are the most common multi-app problem in every source found, and the same bug
that broke the old myotcfleet write-back to FullBay. A fleet customer can buy both graphics and
shop service, so **the QBO customer likely already exists from FullBay.**

- Before a customer's first invoice syncs, it must be linked to an existing QBO customer or
  explicitly created. No silent auto-create.
- Store the QBO customer ID on our customer. Match on it from then on, never on name.
- QBO customer display names must be unique, so "create" fails loudly if the name already exists.
  That's useful: it forces a link instead of a duplicate.
- Merging duplicates in QBO is permanent. Prevent them instead.

### Rule 3 — Fixed class (and location, if used)

Every graphics transaction carries the **Graphics class**. QBO tracks class either once per
transaction or on each line, as a company-wide setting. Read it on connect and set `ClassRef` in
the right place. If OTC also uses *Locations*, that is a separate field (`DepartmentRef` in the
API; confirm against the reference before relying on it).

### Rule 4 — Each system owns only its own transactions

- Our app creates and updates only records it created (tracked by stored QBO IDs).
- FullBay keeps its own. Open graphics invoices already in QBO from FullBay **stay in FullBay and
  get paid there.** Only new work goes through the new system. This removes the duplicate-record
  risk in G14 entirely.
- After cutover, nobody creates graphics jobs in FullBay, so FullBay stops writing to the Graphics
  class on its own.

### Money movement, the part people get wrong

Two payment processors will feed the same bank account: FullBay's (for the shops) and ours (for
graphics). Stripe pays out in batches **net of fees**, so a bank deposit rarely equals any single
payment.

- Payments from our app should land in a holding account, either **Undeposited Funds / Payments to
  deposit** or a dedicated **Stripe clearing** account, never straight to the bank.
- Each Stripe payout then becomes one bank deposit: the payments it contains, minus a fee line to a
  card-fees expense account.
- **Do not also install a Stripe-to-QBO connector** (Intuit's *Stripe Connector*, or Synder,
  PayTraQer etc.) on the same Stripe account while our app is posting payments. That double-counts
  revenue. Pick one writer per Stripe account.
- The 3% card surcharge OTC passes through has to land somewhere. Either as an income item on the
  invoice or as an offset to the fees account. Bookkeeper's call.

## 4. The integration, if we do exactly what FullBay does

A **one-way push** from the shop app to QBO, triggered when records are finalized. The app is the
source of truth. QBO is the ledger. Same contract the business already runs with FullBay.

### Connection

- An **Intuit developer app**, registered as a private app for one company. Production keys are
  issued after Intuit's app assessment questionnaire, which applies to private apps too. Reported
  turnaround is minutes once submitted.
- **OAuth 2.0.** Access tokens last an hour. Refresh tokens rotate on use and must be overwritten
  every time. Intuit's 2026 release notes put a five-year maximum on refresh tokens, replacing the
  old rolling 100-day window. The connection still drops if someone disconnects the app in QBO or
  the authorizing user loses admin rights, so the app needs a **Reconnect** button and a visible
  disconnected state.
- **Cost.** Under Intuit's App Partner Program (2025), writes are uncapped and free; reads are
  metered, with 500,000 a month free on the free Builder tier. Graphics volume is a few hundred
  invoices a year. **Effectively free.** Builder blocks rather than bills beyond the cap.
- **Sandbox caveat:** QBO sandbox companies do **not** run Automated Sales Tax. Tax behaviour can
  only be verified against the real company. Plan a supervised first-invoice test.

### What gets pushed

| Our record | QBO entity | When | Mapping |
|---|---|---|---|
| Customer | `Customer` | On link, or explicit create | Name, billing address, email, phone. Store QBO ID |
| Invoice | `Invoice` | On finalize | `DocNumber` = our prefixed number · `ClassRef` = Graphics · `CustomerRef` · dates and terms · one line per **customer-facing** line, each mapped to a QBO item · tax (below) |
| Invoice payment (Stripe) | `Payment` | Stripe webhook confirms | `LinkedTxn` → the invoice · `DepositToAccountRef` = Undeposited Funds or Stripe clearing |
| Payment taken elsewhere (check, ACH, cash) | `Payment` | When recorded in app | Same, deposit account per method |
| Deposit / prepayment | `Payment` with no invoice (unapplied), later applied | On receipt, and on final invoice | See deposits below. Needs the bookkeeper's preference |
| Credit / adjustment | `CreditMemo` | On issue | Linked to the customer, applied via a `Payment` line |
| Refund | `RefundReceipt` or credit + refund | When recorded | Refunds are executed in Stripe and recorded in the app, per V1 scope |
| Void | Void on `Invoice` | On void in app | QBO clears the linked payments on void |
| Received PO (optional) | `Bill` | On "received" | Only if the bookkeeper wants bills from the shop system. FullBay does this today |
| Stripe payout (optional) | `Deposit` | Stripe payout webhook | Moves payments from clearing to bank, fee line to expense |

**Lookups only, no writes:** items, accounts, classes, tax codes, terms and preferences are read
from QBO to fill the mapping screens.

### Line items and the roll-up

QBO income is categorized by **item**, and each item points at an income account. Our invoices show
one customer-facing line per package ("Full Vehicle Wrap") with the materials breakdown internal
(G7). What we push is the customer-facing line, mapped to a QBO item by its category, e.g.
*Graphics – Wraps*, *Graphics – Signs*, *Graphics – Design*, *Graphics – Install labor*.

> **Decision for the bookkeeper:** do they want graphics revenue split by type (wraps, signs,
> design, labor) or one *Graphics Sales* item? A split needs a category on every line. One item
> needs nothing.

### Sales tax — the riskiest part

**Copy FullBay's model: the shop app calculates tax, and QBO records it against a matching rate.**
FullBay keeps its own tax locations mapped to QBO's rates (section 2). We do the same: tax rates in
our app, each mapped to the QBO tax code or rate it corresponds to, chosen per customer (and per
shop address).

The complication is QBO's **Automated Sales Tax (AST)**, on by default for US companies created
after November 2017. With AST on, QBO picks the tax code from addresses and overrides any tax code
an app sends. An app can still override the **amount** with `TxnTaxDetail.TotalTax`, which Intuit
says is honoured, though developers report cases where AST recalculated anyway. Whether OTC is on
AST, and how FullBay gets its rates to land, is the first thing to look at in OTC's QBO settings.

Either way, our invoice has already shown the customer a total. **QBO must record the same tax we
charged.** So:

1. Each pushed line carries `TAX` or `NON` based on our taxability rules (section 5 item 1 of
   [[V1 Alignment]], still unanswered).
2. The invoice names the mapped tax rate or code and sends `TotalTax` equal to what we charged.
3. After create, read back the invoice. If QBO's total doesn't match ours, flag it for review
   instead of leaving a silent mismatch.

The roll-up adds a wrinkle: one collapsed line carries one tax treatment. If design is non-taxable
and materials are taxable, they can't share a line. That was already noted for G7 and applies here
too.

### Deposits

V1 records deposits taken elsewhere and applies them to the final invoice. QBO has no clean
"deposit on a future invoice" in the API. Accepted practices are an **unapplied payment** later
linked to the invoice, or a **customer deposits liability** account cleared by a credit memo. The
first is simpler and is what the API supports directly. Bookkeeper picks. Accrual-basis books
generally want the liability.

### Edits after sync

FullBay's model, and the simplest: **a finalized invoice is locked.** Changes are a void and
reissue, or a credit memo. Updating a synced invoice in QBO is possible (`SyncToken` concurrency)
but drags in all the edit cases two-way sync was going to have. Lock instead. It's also better
accounting.

### Reliability

The architecture already has an outbox and a job runner. The QBO push is one more consumer:

- Each finalize writes an outbox row. A worker pushes it, retries with backoff, and stores the QBO ID.
- Every create sends Intuit's `requestid`, so a retry after a timeout can't create a duplicate.
- Rate limits (about 10 concurrent requests per company) are irrelevant at graphics volume.
- **When QBO is down, nothing in the shop stops.** Rows wait and catch up automatically. This is
  the specific pain from postal, solved: no hand-keying the backlog.
- Failures that need a person (unmapped item, customer not linked, tax mismatch, disconnected)
  stop that one record and show up on the sync screen.
- A nightly check compares what we think we pushed against QBO and flags gaps.

### What we deliberately do not do

- Read changes back from QBO (no webhooks, no change data capture, no conflict rules).
- Edit or delete anything we did not create.
- Sync inventory.
- Push estimates or POs as QBO documents. Estimates stay in the app; received POs only if the
  bookkeeper asks for bills.

## 5. What this adds to V1

### New screens

| # | Screen | What it does | Size |
|---|---|---|---|
| 1 | **Settings › QuickBooks connection** | Connect / reconnect / disconnect. Company name, connection status, last successful push. Shows the company's class-tracking, custom-numbering and AST settings read on connect | S |
| 2 | **Settings › Accounting mapping** | Class (Graphics) · QBO item per line category · tax handling · deposit account for card payments and for other methods · card-fee expense account · surcharge handling · deposit handling · invoice prefix and starting number | M |
| 3 | **Customer linking** | Lists our customers with their QBO link status. Suggests matches from QBO by name and email. Link, or create in QBO. Bulk pass for go-live, then per customer as new ones appear | M |
| 4 | **Sync activity** | Every pushed record with status: pending, synced, needs attention. The error in plain English, a fix link (map this item, link this customer), retry. Filter by type and date | M |
| 5 | **Sync status on records** | Small badge plus "Open in QuickBooks" on invoice, payment and customer screens. Blocks finalizing an invoice whose customer isn't linked | S |
| 6 | **Attention banner** | In-app banner for the Owner when the connection drops or anything needs attention. In-app only, since V1 sends no email | S |
| 7 | **Accounting reconciliation report** | Invoices, payments, credits and Stripe payouts for a period, with QBO sync state, totals that should match QBO's Graphics class, and a CSV. Joins the other V1 reports | M |

### Changes to features already in V1

- **Invoices lock on finalize.** Corrections become void and reissue, or a credit memo. V1 needs a
  credit memo action it didn't have.
- **Line categories.** Every line, catalog item and roll-up package needs an accounting category
  (if the bookkeeper wants revenue split by type).
- **Customers** gain a QBO link, and the first invoice for a new customer prompts the link.
- **Payments** carry a method and a deposit account. Stripe webhooks feed the sync as well as the
  invoice balance.
- **Invoice numbering** reads the prefix and start from settings rather than a hard-coded value.
- **Deposits** follow whichever QBO treatment the bookkeeper picks.

### Behind the screens

- Intuit developer app, production keys, OAuth flow, encrypted token storage with rotation.
- QBO client: create calls with `requestid`, read-back verification, error classification.
- Mapping tables, sync state on customers, invoices, payments and credit memos.
- Outbox consumer with retries and a nightly comparison job.
- Stripe payout webhook, if the app posts payouts.
- Tests against a QBO sandbox, plus one supervised live test for tax.

### Rough size

Effort guesses at this stage are just that. Relative to the rest of V1:

- **FullBay-equivalent push (this document):** roughly **two to four weeks** for one developer.
  Around a third of that is tax, deposits and payouts against the real company, not code.
- **Export file for the bookkeeper (earlier proposal):** a few days. One screen, one CSV format.
- **Two-way sync as the punch list described it:** the push above **plus** reading QBO changes,
  conflict rules, and the open-invoice migration problem. Roughly double, and the most fragile piece
  of V1.

Most of the push's cost is in screens 2, 3 and 4 and in tax. Screens 1, 5 and 6 are small.

## 6. Options side by side

| | Export file | Summary journal | **FullBay-equivalent push** | Two-way sync |
|---|---|---|---|---|
| Bookkeeper effort | Import weekly, enter payments by hand | Post one entry a month | **None. Same as today** | None |
| Per-invoice detail in QBO | Yes | No | **Yes** | Yes |
| Customer balances in QBO | Yes, once payments are entered | No | **Yes** | Yes |
| Build effort | Days | Days | **2–4 weeks** | 4–8+ weeks |
| Failure modes | Missed or doubled imports | Low | **Unlinked customers, tax mismatch, disconnects (all visible)** | All of those plus edit conflicts |
| Matches what OTC has today | No | No | **Yes** | More than today |

## 7. Recommendation

**If parity with FullBay matters to the bookkeeper, build the push, and build it one-way.** It is
what OTC already runs, so nobody learns a new process, and it is half the cost of the two-way sync
Cameron withdrew. It also fixes a real complaint: when QuickBooks is down, the backlog catches up by
itself.

**If Cameron's "keep V1 small" wins,** launch on the export file but build the parts the push needs
anyway, so the upgrade is a feature rather than a migration:

- prefixed invoice numbering from day one
- QBO customer IDs stored on customers
- accounting category on lines and catalog items
- invoices locked on finalize, credit memos for changes
- payments with method and deposit account

Then the push is screens 1, 3 and 4 plus the worker, added after launch.

Either way, **the bookkeeper session comes first.** The questions in section 9 decide half the
mapping screen.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Duplicate customers between FullBay and our app | Link before first sync, store QBO ID, no auto-create |
| AST recalculates tax differently from what the customer was charged | Send `TotalTax`, read back, flag mismatches. Supervised live test. Get taxability from accounting first |
| Stripe payments double-counted by a second connector | One writer per Stripe account. Check what's connected to QBO today |
| Invoice number clash | Prefix + start number agreed before invoice one |
| Connection silently dropped | Banner, sync screen, nightly check. Nothing in the shop blocks on QBO |
| Graphics jobs still being created in FullBay after cutover | Cutover date. Graphics class report in QBO shows anything FullBay still sends |
| Intuit pricing or token rules change | Writes are free. Reads are tiny. Watch the release notes |

## 9. To confirm before building

**Ten minutes in QuickBooks (Cameron or the bookkeeper, screenshots are enough):**

1. One recent **FullBay graphics invoice** opened in QBO: items used, class (header or lines), tax
   line, invoice number format.
2. The **payment** applied to it: which account it was deposited to, and how the bank deposit looks.
3. **Settings › Account and settings › Advanced:** class tracking (per transaction or per row),
   location tracking, custom transaction numbers.
4. **Settings › Sales tax:** AST on or off, agencies, and the rates FullBay's tax locations map to.
5. **Apps › My apps:** everything connected to the company. Is there a Stripe connector already?
6. FullBay's **QuickBooks integration settings** screen (the gear icon on the integration card): item and account mapping, class hierarchy, tax locations.

**Questions for the bookkeeper:**

1. Revenue split by type for graphics, or one item?
2. Where should card payments land: Undeposited Funds or a Stripe clearing account? Who posts
   processing fees today, and how?
3. How is the 3% card surcharge recorded?
4. Deposits: unapplied payment, or a customer deposits liability account?
5. Bills from received POs: from the shop system, or entered from the vendor's invoice?
6. Cash or accrual basis?
7. Sales tax rates and taxability (still blocking go-live regardless).

## Related

- [[2026-10-30 Cameron Reply to V1 Alignment]] — two-way withdrawn, "simplest practical handoff"
- [[V1 Vision and Gaps]] — G7 roll-up and tax, G14 numbering and migration
- [[V1 Scope from Punch List]] — 7.17, 7.18, 7.24, 11.2, 11.3
- [[Architecture Decisions]] — outbox and job runner the push builds on
- [[Data Export Feasibility]] — earlier claim that FullBay's QBO sync is two-way; see section 2 here

## Sources

FullBay's two explainer PDFs and its QuickBooks page were read in full. The Intuit pages could not
be rendered from this session (their content loads from `intuitcdn.net`, which is not allowed), so
those points come from search summaries.

- FullBay — [QuickBooks integration](https://www.fullbay.com/products/integrations/quickbooks/),
  [integration explainer PDF](https://www2.fullbay.com/rs/823-QJJ-687/images/Fullbay_Quickbooks_Integration_Explainer.pdf),
  [Payments](https://www.fullbay.com/products/connect/payments/),
  [Integrated accounting](https://www.fullbay.com/products/integrated-accounting/)
- Intuit — [Automated sales tax (US)](https://developer.intuit.com/app/developer/qbo/docs/workflows/calculate-sales-tax/automated-sales-tax-for-us-locales),
  [Manage sales tax (US)](https://developer.intuit.com/app/developer/qbo/docs/workflows/manage-sales-tax-for-us-locales),
  [AST override blog](https://blogs.intuit.com/2017/12/11/using-quickbooks-online-api-automated-sales-tax/),
  [Categorize income and expenses (classes)](https://developer.intuit.com/app/developer/qbo/docs/workflows/categorize-income-and-expenses),
  [Manage linked transactions](https://developer.intuit.com/app/developer/qbo/docs/workflows/manage-linked-transactions),
  [Top API errors (DocNumber)](https://blogs.intuit.com/2017/06/08/top-quickbooks-online-api-errors-and-how-to-handle-them/),
  [Webhooks best practices](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks/best-practices),
  [Release notes (refresh tokens)](https://developer.intuit.com/app/developer/qbo/docs/release-notes/general-release-notes),
  [Partner program benefits](https://developer.intuit.com/partners/benefits),
  [Platform service fees](https://help.developer.intuit.com/s/article/platform-service-fees),
  [Stripe Connector by QuickBooks](https://quickbooks.intuit.com/learn-support/en-us/help-article/manage-integrations/connect-manage-stripe-transactions-quickbooks/L10TzOVcN_US_en_US)
- Vendor help on multi-app duplicates and mapping — [Readybuild](https://readybuild-docs.pages.dev/admin/integrations/quickbooks-online/troubleshooting),
  [Maxio](https://docs.maxio.com/accounting/general-ledger-integrations/quickbooks/troubleshooting/quickbooks-online/quickbooks-online-sync-issue-duplicate-name-exists),
  [Bill.com classes on AR invoices](https://support.wf.bill.com/hc/en-us/articles/360043146312-QuickBooks-Online-sync-Classes-on-AR-Invoices),
  [Jobber one-way paid status](https://help.getjobber.com/hc/en-us/articles/115009786748-How-Items-Sync-Between-Jobber-and-QuickBooks-Online),
  [Codat app assessment questionnaire](https://docs.codat.io/integrations/accounting/quickbooksonline/qbo-app-assessment-questionnaire)
- Stripe reconciliation — [CommerceSync on Stripe deposits](https://support.commercesync.com/hc/en-us/articles/207604363-How-Stripe-Deposits-Work-with-QuickBooks-Online),
  [Stripe accounting integrations](https://edge-docs.stripe.com/stripe-apps/embedded-apps/accounting-integrations)
- Deposits — [Intuit community: customer deposits](https://quickbooks.intuit.com/learn-support/en-us/payments/use-sales-receipt-for-customer-deposits/00/230722)
