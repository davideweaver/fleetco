---
status: reference
summary: Can we get OTC's data out of FullBay? Partly, painfully
created: 2026-10-30
updated: 2026-10-30
---

# FullBay Data Export Feasibility

**Date:** 2026-10-09 · **Updated:** 2026-10-28 with observations from inside the live account
**Context:** Fleetco is migrating off FullBay ($5,000/mo) and must bring customer, vehicle/unit, service order, parts, and invoice history with them. This note assesses whether that data can be extracted programmatically or whether the migration requires manual/screen-scraping effort — based entirely on public sources (FullBay's site, help center, partner integration docs, review sites, and one leaked API reference on GitHub). **No one has logged into the client's actual FullBay account yet; everything below is inference from the outside.**

## 0. Confirmed From Inside the Account (2026-10-23)

Cameron walked Dave through FullBay's reporting live. See
[[2026-10-23 Cameron Walkthrough Debrief]] §6.

- **There is no master export.** *"They don't have one master download to download all of your data
  or anything."* Section 2's suspicion was correct.
- **Exports run one area and one shop at a time** — and OTC has four shops in FullBay (Lancaster,
  mobile, postal, graphics; Berks retired but still present). A full extract is a matrix of
  report × shop, run by hand.
- **The reports do return real lists**, not just summaries — all customers, all customer vehicles,
  and contacts were visible. That is better than the worst case in the verdict below.
- **Large reports are emailed**, not downloaded in-browser.
- **Report access is role-gated.** Cameron wasn't sure he could reach some of them; Taylor can.
  Whoever runs the extract needs the right role.
- **The API question is closed: invoices only.** Confirmed independently from Cameron's side —
  he derives customer, unit, and parts data by parsing invoice detail. No background sync; his
  portal reads the API live, and the mapping is demonstrably imperfect (19 open invoices reported
  vs. 15 visible in FullBay).
- **Scale:** ten years of data, ~3,200 lifetime shop customers, a few hundred graphics customers.
- **Cameron's expectation of a dump request:** *"They're usually pretty reluctant on things like
  that."* He has a friendlier internal contact and will use him.

**Agreed framing for the ask — do not signal a migration.** A routine backup/audit request: the
company is growing, is going through audits, and not holding its own data is a liability; we want a
dump every 6–12 months.

**And the risk dropped.** Under the graphics-first V1, the pilot department is in its *first year*
of business and almost certainly starts fresh. **The export now gates the shop cutover, not V1.**

## 1. Public/partner API — exists, but narrow

FullBay has a long-standing "open API" (confirmed in its own FAQ and in a "Fullbay Connect" blog post: *"Our open API key allows you to build the integrations you want with the software you already use"*). A leaked reference (GitHub gist, [EpikaNick/fullbay-api](https://gist.github.com/EpikaNick/38f2ac3ee83bd7f84f5f991ffb43e5a1)) documents the actual mechanics:

- **Base URL:** `https://app.fullbay.com/services/`
- **Auth:** API key + SHA1(key + today's date + requester's public IP) token — no OAuth, no modern key rotation.
- **Endpoints found:** `getAdjustments`, `getCounterSales`, `getCustomerCredits`, `getCustomerUnit`, `getInvoices`, `getCustomerPayments`, `getVendorBills`, `getVendorCredits`.
- **Hard limitation:** every list endpoint caps the query window at **7 days** ("end date cannot be more than 7 days after the start date"). Pulling years of invoice history means hundreds of paginated, chunked calls, not a bulk export.
- **Notably absent:** no endpoint to list *all* customers, *all* units/vehicles, or *all* service orders. `getCustomerUnit` returns a single unit matching criteria you already have to supply — there's no "give me every vehicle on this account" call. Parts/inventory has no listed endpoint at all.

This API reads like it was built for **accounting-system sync** (QuickBooks-style transaction feeds), not full historical migration. It can plausibly get you invoices, payments, credits, and vendor bills — slowly — but not a clean customer/unit/service-order/parts dump.

**Access is gated**, not fully public: it sits behind "Fullbay Connect," a subscription add-on with four tiers (one free). Whether Fleetco's actual account tier includes API access is unknown from outside.

### Fullbay Next — a real upgrade, not yet available
FullBay announced "Fullbay Next" (Aug 2026, [PR Newswire](https://www.prnewswire.com/news-releases/fullbay-reimagines-the-repair-shop-with-fullbay-next-its-all-new-mobile-first-ai-native-platform-that-connects-fleets-cuts-busywork-and-boosts-technician-productivity-302854176.html)) including a "modern Developer portal and API" with self-service docs, formal versioning, and — critically — **"expanded data exposed as native API resources."** This is the first public signal that FullBay knows its current API doesn't cover enough entities. But **early access is only "opening in the coming months"** from an August 2026 announcement, with no GA date given. This may or may not land before Fleetco's migration needs it, and may initially be partner-only.

## 2. In-product export features

FullBay's own FAQ states shops "can export their reports and data from the software" and separately "use an API to export data into another compatible software solution." No public page documents what a raw CSV export actually contains — whether it's normalized tables (customers, units, service orders, line items, parts) or just summarized reports (the more common pattern for SaaS "export" buttons). This is a meaningful unknown: "export your data" in marketing copy very often means "export a formatted report," not "dump your database."

FullBay also advertises an **"integration data team"** that will assist with large transfers — but every public mention of this team is framed as *importing into* FullBay from a prior system, not exporting out. One Capterra review (2020) describes a prospective customer being quoted a steep price to move data **into** FullBay from their old system; FullBay's own response confirmed transfer costs exist but said they "work with shops" on pricing. There's no public evidence either way on what this team charges — or whether it even operates — for outbound migrations.

## 3. Terms of service / data ownership clause

**Not found.** Public search surfaces blog posts, pricing pages, and a FAQ, but not the actual Terms of Service, Master Subscription Agreement, or Data Processing Agreement text. These documents are standard for a B2B SaaS of this size but are evidently not indexed/public — they're almost certainly gated behind a customer login or only provided at contract signing. This means **the one place a documented, binding data-export/data-ownership right would most likely exist is exactly the place public research can't reach.**

## 4. Integration surfaces as alternate extraction paths

| Partner | Direction | Useful as extraction path? |
|---|---|---|
| **QuickBooks (Online & Desktop)** | Two-way; FullBay pushes invoices, payments, credits, vendor bills, customer/vendor records automatically | **Potentially the best path.** If Fleetco has had this synced since go-live, QuickBooks may already hold a parallel, exportable copy of most *financial* history (invoices, payments, customers as "customers," vendors). QuickBooks has mature, well-documented export/reporting tools. This would **not** cover service order detail (labor lines, technician notes, parts used, unit/vehicle records) — only what QuickBooks' accounting model captures. |
| **Geotab / Samsara (telematics)** | Two-way for vehicle diagnostics, location, fault codes, mileage | Useful for *current* vehicle/unit identity data (VINs, unit numbers) if Fleetco already has a telematics account, but not for service order or parts history — FullBay is the source of truth there, not a pass-through. |
| **Whip Around (DVIR/inspections)** | One-way (Whip Around → FullBay for defects; FullBay → Whip Around for status) | No bulk read-back path; proprietary connection, not a general API. |
| **MOTOR / Mitchell 1 (parts & labor guides)** | Read-only reference data embedded in FullBay | These are FullBay *importing* third-party catalog data for technician reference — not a source of Fleetco's own historical parts-usage data. |

The QuickBooks sync is the one integration surface genuinely worth checking first, since it's bidirectional, well-documented on FullBay's own site, and standard accounting software has far better export tooling than FullBay itself appears to.

## 5. Public accounts of migrating off FullBay

Thin. One competitor (ShopView) markets "Free Data Migration – We handle the entire transfer, hassle-free" as a switching incentive, but gives zero technical detail on *how* — no mention of API use, export format, or manual re-entry. No Reddit threads, forum posts, or case studies describing the actual mechanics of extracting data out of FullBay were found. The absence itself is a mild signal: shops switching away from FullBay don't appear to be publicly documenting the process, which is consistent with either (a) it being handled quietly by vendor migration teams, or (b) it being painful enough that nobody wants to write about it, or simply (c) low switching volume. No way to distinguish these from outside.

## Verdict

**Best case:** The 7-day-windowed accounting API (invoices, payments, credits, vendor bills) plus a QuickBooks sync that's been running since Fleetco's FullBay go-live together cover the full financial history losslessly and programmatically. In-product CSV export turns out to include real normalized service-order and parts-usage data, not just summary reports. Fullbay Next's broader API reaches early access in time and Fleetco qualifies. Total effort: scripted, chunked API pulls + CSV exports + QuickBooks exports — weeks, not months, of engineering.

**Worst case:** The documented API is all there is (no customer list, no unit list, no service-order list, no parts list, 7-day windows forcing hundreds of calls just for invoices), the in-product "export" is summary reports only, QuickBooks sync was never turned on or only captures invoice totals, and the actual signed contract is silent or restrictive on data export rights. Fullbay Next API isn't available before the deadline. Fleetco ends up needing FullBay's paid migration-assistance team (cost and turnaround unknown, and every public signal about that team is about data coming *into* FullBay, not out) or building a screen-scraper against the logged-in UI — which is the scenario that changes the timeline by months, exactly as flagged.

**Questions only the client (not public sources) can answer:**

1. What does the actual signed FullBay contract/MSA say about data export and data retrieval rights on termination? (This document isn't public — someone needs to pull it from Fleetco's files or request it from FullBay.)
2. Does Fleetco's FullBay account include "Fullbay Connect" API access, and at which tier — and does that tier's API, once logged into, expose more than the gist's eight endpoints?
3. Has Fleetco had FullBay↔QuickBooks sync running since the start of their FullBay history, or only recently — and does it capture service-order-level detail or just invoice/payment totals?
4. When logged into the live account, does the "Reports" export feature produce normalized raw data (tables matching FullBay's internal schema) or only formatted/summarized reports?
5. Will FullBay's support/integration-data team quote a price and timeline for a full outbound data export, and in what format?
6. Is Fleetco eligible for Fullbay Next's developer-portal early access now, and does FullBay have a firmer GA date than "coming months" (as of the August 2026 announcement)?
7. Does the current legacy API enforce request-rate limits that would make pulling multi-year history via 7-day windows impractical within the migration timeline, and would FullBay waive them for a one-time export?

None of these can be resolved by more web research — they require either reading Fleetco's actual contract or someone logging into the live FullBay account and support channel.
