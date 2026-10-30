---
created: 2026-10-09
tags: [fleetco, prompts, sessions, parallel]
source: Claude Code (Xerro)
---

## Overview

Copy-paste prompts for parallel cold sessions. Each is self-contained — a fresh session has none
of this conversation's context.

**Priority order.** Fire tier 1 first.

> Pricing research was removed on 2026-10-09 — the $5,000 figure's composition will surface
> naturally when the plan is presented at M1, so researching it in advance is wasted effort.
> Q18 in [[Open Questions]] still records the gap, because the M1 plan must not lean on an
> unverified denominator.

Knowledgebase root: `/Users/dweaver/.xerro/documents/Projects/Business/Fleetco`

## Tier 1

### 1–4. Framework spike (FOUR separate sessions)

**Run these as four isolated sessions, not one.** Each agent must approach its framework fresh,
with no knowledge of the others' output — otherwise candidate two imitates candidate one and the
comparison is worthless.

Use the prompt below verbatim four times, substituting only the bracketed framework line.

```
Build a reference implementation of one module for a fleet-maintenance SaaS backend.

FRAMEWORK: [NestJS]
  ← substitute per session. The four are:
     1. NestJS
     2. Fastify, with your own layered structure
     3. AdonisJS
     4. A port of the pattern in https://github.com/davideweaver/authors-api —
        specifically its Process and AppModule lifecycle classes — onto Fastify

Read these first, they are the specification:
  /Users/dweaver/.xerro/documents/Projects/Business/Fleetco/Architecture/Code Standards and Guardrails.md
  /Users/dweaver/.xerro/documents/Projects/Business/Fleetco/Architecture/Testing Strategy.md
  /Users/dweaver/.xerro/documents/Projects/Business/Fleetco/Architecture/Tenancy Model.md
  /Users/dweaver/.xerro/documents/Projects/Business/Fleetco/Architecture/Framework Evaluation.md

Write the code to: /Users/dweaver/Projects/ai/xerro-agent/projects/fleetco/spikes/fleetco-framework-[framework]/

BUILD: a `customers` module, complete and canonical.
- Drizzle schema on Postgres. tenant_id on every table. UUIDv7 primary keys.
- Branded types for ids and money (Cents), per the standards doc.
- Repository — the ONLY place queries happen; tenant scope applied unconditionally.
- Service layer holding business logic, unit-testable without a database.
- REST routes: list, get, create, update. Thin — no logic in handlers.
- Zod contracts with types derived from them, and generated OpenAPI.
- One outbox event written in the same transaction as the state change.
- ONE SSE ENDPOINT streaming customer-scoped events. This is the only genuinely
  non-trivial requirement — do not skip it.
- Tests at four layers: pure unit, property-based (fast-check), integration against
  real Postgres (testcontainers or docker), and a cross-tenant leak test.

CONSTRAINTS:
- Follow the standards doc exactly. No abstraction with only one call site.
- No dependencies beyond what the framework and the above require. Boring is a requirement.
- Do not ask me questions. Make reasonable choices and record them in NOTES.md.

When done, write NOTES.md in the repo root covering:
  1. Every decision you made that the documents did not specify
  2. Anywhere the framework fought the documented rules
  3. Concept count — what must someone understand to safely change one endpoint?
  4. Trace one request end to end: how many files, how many hops?
  5. Count of interfaces with exactly one implementation
  6. Lines of application code vs. lines of framework scaffolding
```

### 5. FullBay feature inventory — public-sources draft

**No login required, and worth running before one arrives.** Public sources give the feature
*map* — which modules exist and roughly what each does. That is exactly what Fleetco needs in
order to cross things off. What they cannot give is depth: field-level form detail, which status
transitions are legal, permission granularity, report column definitions, or the customer
portal's real surface.

So this is not a substitute for the read-only login (Q4) — **it is the prep that makes the
shadowing day productive.** Walking in with eighty features to verify beats walking in cold.

```
Build a draft feature inventory of FullBay, a SaaS platform for heavy-duty vehicle repair
and fleet maintenance shops (https://www.fullbay.com/).

PURPOSE: a client is replacing FullBay. They will mark this list up — crossing off what
they do not use and adding what they need. A thorough draft turns a hard request ("tell
me everything you need") into an easy one ("correct this list"). That is the entire goal.

You do NOT have a login. Work from public sources only:
- FullBay's help centre and knowledge base (richest source — real screens and workflows)
- YouTube demos, walkthroughs, and webinars, including third-party reviews
- Release notes or changelog if public
- G2 and Capterra feature listings
- Comparison articles against Shop-Ware, Mitchell 1, Tekmetric, AutoLeap

VOCABULARY RULE — this matters more than coverage:
Prefer the words used in help articles and demo videos over marketing-page language. A
help article says "repair order"; the marketing page says "Powerful Work Order
Management." This document feeds a ubiquitous-language glossary, so capture the terms a
service advisor would actually say. Where marketing and product language differ, record
the product term and note the marketing one in parentheses.

Produce a hierarchical inventory grouped by functional area — expect roughly: service
orders / repair orders, estimates and authorization, parts and inventory, labor and
technician time tracking, PM scheduling, inspections and DVIR, invoicing and payments,
the customer portal, reporting, mobile apps, integrations.

For each feature record: what it does, which role uses it (service advisor, technician,
manager, customer), and your confidence — confirmed in docs / seen in a demo / inferred.

TWO THINGS TO REPORT EXPLICITLY AT THE END:
1. Everything you could NOT determine from public sources. These become the checklist for
   the day someone shadows a service advisor with a real login.
2. Whether FullBay's help centre is publicly readable or gated behind a login. If it is
   gated, say so plainly — it materially changes how much of this is possible.

Write to:
/Users/dweaver/.xerro/documents/Projects/Business/Fleetco/Product/Feature Inventory Draft.md
Do not overwrite the existing Feature Inventory.md.

Do not guess at features to pad the list. An honest gap is more useful than a plausible
invention, because this will be shown to a client who knows the real product and any
invention costs credibility.
```

## Tier 2

### 6. Heavy-duty repair domain research

```
Research the domain of heavy-duty vehicle repair and fleet maintenance shop operations,
to sharpen a domain model for software replacing FullBay.

Read first (do not duplicate what it already has):
/Users/dweaver/.xerro/documents/Projects/Business/Fleetco/Product/Domain Model.md

Research and explain, in the industry's own vocabulary:
- VMRS coding (Vehicle Maintenance Reporting Standards) — structure, and whether shop
  software is expected to support it
- DVIR (Driver Vehicle Inspection Reports) — what they contain, DOT retention requirements
- DOT annual inspection requirements and record-keeping
- Preventive maintenance scheduling: how intervals are defined (mileage, hours, time,
  fuel) and how shops track them
- The customer authorization workflow — how a shop gets approval to proceed, approval
  thresholds, what gets recorded
- Warranty: OEM claims, parts warranty, comebacks, and how shops recover that money
- Labor rate structures: flat-rate vs actual, SRT (standard repair times), fleet rates
- Parts markup conventions, cores, and core returns
- How shops bill fleets: per-unit, per-repair, monthly statements, fuel surcharges

Write to:
/Users/dweaver/.xerro/documents/Projects/Business/Fleetco/Product/Domain Research.md

Cite sources. Flag where practice varies by shop rather than presenting one convention as
universal. The output feeds a ubiquitous-language glossary, so the industry's exact terms
matter more than clear explanations in your own words.
```

### 7. FullBay data export and API feasibility — Q1

```
Determine whether data can be extracted from FullBay, a SaaS platform for heavy-duty
repair shops (https://www.fullbay.com/).

CONTEXT: a client is migrating off FullBay and must bring history with them — customers,
vehicles/units, service orders, parts, invoices. This is the highest-risk unknown in the
project. If extraction means screen-scraping, the timeline changes by months.

Investigate:
- Does FullBay have a public or partner API? Developer docs, API reference, auth model?
- What export features exist in the product? CSV, reports, scheduled exports, full dumps?
- Is there a documented data-ownership or export clause in their terms of service?
- Any public accounts of customers migrating off FullBay and how they got data out?
- Do they integrate with QuickBooks, parts catalogs, or telematics — and would any of
  those integration surfaces be usable as an extraction path?

Sources: FullBay docs and help centre, developer portal if one exists, terms of service,
integration partner listings, forums, Reddit.

Write to:
/Users/dweaver/.xerro/documents/Projects/Business/Fleetco/FullBay/Data Export Feasibility.md

End with a plain verdict: best case, worst case, and the specific questions the client
must answer that public sources cannot.
```

### 8. The two remaining architecture coverage gaps

```
Write two missing architecture documents for a fleet-maintenance SaaS.

Read these first for stack, conventions, and house style — match their tone, structure,
and frontmatter exactly:
/Users/dweaver/.xerro/documents/Projects/Business/Fleetco/Architecture/Stack Evaluation.md
/Users/dweaver/.xerro/documents/Projects/Business/Fleetco/Architecture/Tenancy Model.md
/Users/dweaver/.xerro/documents/Projects/Business/Fleetco/Architecture/Realtime and Events.md

Stack: Node/TypeScript, Aurora Serverless v2 Postgres, Drizzle, ECS Fargate, S3,
modular monolith, pooled multi-tenancy with tenant_id on every table.

WRITE 1 — Architecture/Reporting and Analytics.md
Shops need technician efficiency, revenue by customer, work-in-progress, parts usage,
PM compliance. Cover: querying the OLTP database directly vs an Aurora read replica vs a
separate reporting layer; when each becomes necessary; how tenant scoping applies to
reports; scheduled vs on-demand report generation; export formats; and the customer
portal's reporting needs, which differ from the shop's. Give a phase-one recommendation
that is as boring as possible.

WRITE 2 — Architecture/Search.md
Users search service orders, customers, vehicles, VIN, and parts. Cover: Postgres
full-text search vs trigram vs a dedicated engine; what each costs; indexing strategy
with tenant_id; typo tolerance; VIN and plate lookup, which are exact-match not
fuzzy; and when a dedicated search engine would ever be justified. Recommend the
simplest thing that works, and name the trigger that would change it.

Both docs: open with an Overview and a bolded one-line recommendation, use tables where
they carry real structure, end with a Related section using [[wikilinks]] to the files
listed above. Record open questions honestly rather than inventing answers.
```

## Tier 3

### 9. Draft the M1 client-facing plan

```
Draft a high-level plan document to present to a client. They run a fleet-maintenance
company, currently use FullBay, and are considering a custom replacement.

Read the whole knowledgebase first:
/Users/dweaver/.xerro/documents/Projects/Business/Fleetco/
Start with Roadmap.md, Project Brief.md, and Stack Evaluation.md.

AUDIENCE: a business owner, not an engineer. No file paths, no symbol names, no
architecture jargon. Lead with the outcome.

COVER: the approach in plain language; what gets built first and in what order; rough
running cost; rough timeline shape (no dates — the client has set no deadline); what is
needed FROM them; and the honest risks.

CRITICAL CONSTRAINTS:
- The $5,000/month FullBay figure is UNVERIFIED. Its composition is an open question
  (Q18 in Open Questions.md). Do not build the ROI argument on it. Where a cost
  comparison is needed, state the assumption explicitly and visibly.
- Do not invent timelines, dates, or feature commitments.
- Mark every assumption as an assumption so it can be corrected rather than inherited.

Write to:
/Users/dweaver/.xerro/documents/Projects/Business/Fleetco/Presentations/Plan Draft.md
```

## Related

- [[Roadmap]] — which milestone each of these feeds
- [[Open Questions]] — Q1 is directly targeted above; Q4 is what prompt 5 prepares for
- [[Framework Evaluation]] — criteria for judging the four spikes

## 10. HAR capture — FullBay schema extraction

**Two pieces. You run the capture; an agent parses it.** The capture needs your logged-in browser,
so it cannot be delegated. The parse is a scripting job.

### 10a. Capture checklist — you, ~2 hours, read-only

**Setup**
1. Chrome → DevTools → **Network** tab
2. Filter to **Fetch/XHR**
3. Tick **Preserve log** and **Disable cache**
4. Browse the list below. **Open things; submit nothing.**
5. When finished: right-click in the Network pane → **Save all as HAR with content**
6. Save to a personal (not work) machine

**Three rules**
- **Never submit a form.** Opening "New Service Order" is read-only and gives you the field names,
  required markers, and full dropdown contents. Submitting is what creates records.
- **Never touch anything financial.** The QuickBooks sync is live — an invoice, payment, counter
  sale, or PO can propagate into Fleetco's real books.
- Open *one* record of each type, not many. Variety of entity beats volume of rows.

**Walk this order** (mirrors `fullbay-surface-map.html`)

| Area | Visit |
|---|---|
| Service | Service board · SO list (switch 4–5 of the 13 tabs) · open one SO · open an Action Item · its Parts tab · its Labor tab · Service Requests |
| Schedule | Schedule page · open one calendar event |
| Customers | Customer list · one customer · every tab on it · click **Portal** (opens their portal) |
| Units | Unit list · one unit · PM history · meter readings |
| Parts | Parts list · one part · a part with cores · Needs Ordered list |
| Purchasing | PO list · one PO · open (don't submit) Receive · Vendor list · one vendor |
| Counter sale | **Open the form only** |
| Time | Tech Home · Timesheet list · one timesheet |
| Billing | Invoice list · one invoice · Statements · open (don't submit) a payment screen |
| Reports | Run one report from each of the 5 categories |
| Settings | Roles · one role · Labor rates · Pricing matrices · Cost floor · Unit types · PM templates · Tax · Chart of accounts |
| Empty forms | Open "New" for: SO, customer, unit, part, PO, vendor. **Close each without saving.** |
| Portal | All 7 sections · one estimate authorize view |

### 10b. Parse prompt — Sonnet 5

```
Extract a data model from a HAR file captured while browsing FullBay, a
heavy-duty repair shop SaaS.

HAR file: [PATH]
Write output to: /Users/dweaver/.xerro/documents/Projects/Business/Fleetco/Product/FullBay Observed Schema.md

CRITICAL — DO NOT READ THE HAR INTO CONTEXT. It may be 50–200MB. Write a Node
or Python script to process it and work from the script's summarized output.
Reading it directly will fail and waste the session.

SECURITY — handle before anything else:
- The HAR contains auth tokens, cookies, session ids, and real customer PII
  (names, addresses, phone numbers, payment details).
- Your script must strip all Authorization/Cookie/Set-Cookie headers and must
  never write a real field VALUE to the output document.
- Record field NAMES, TYPES, and NULLABILITY only. Where you need an example,
  write a redacted shape (e.g. "string, uuid-like", "string, 2-letter state
  code"), never the actual data.
- If you find anything that looks like a card number, bank account, or SSN, do
  not record it at all — just note the field name exists.

WHAT TO EXTRACT
1. Every distinct API endpoint: method, path pattern (collapse ids to :id),
   how many times it was called.
2. For each endpoint's JSON response, infer a schema: field names, inferred
   types, nullability (seen null in some responses?), nested objects, arrays.
3. Merge schemas across calls to the same endpoint — later responses often
   reveal fields absent from the first.
4. Identify ENTITIES: group endpoints and response shapes into named business
   entities. Use FullBay's own vocabulary (Service Order, Action Item / SOAI,
   Unit, not "vehicle").
5. Identify RELATIONSHIPS: foreign-key-shaped fields (customerId, unitId,
   serviceOrderId), embedded child objects, and arrays of children. State the
   cardinality you observed and whether you observed it or inferred it.
6. Identify ENUMERATIONS: any field whose observed values come from a small
   fixed set, plus any lookup/options endpoint the app called to populate a
   dropdown. These are high value — list every value seen.

THEN RECONCILE against the existing model:
  /Users/dweaver/.xerro/documents/Projects/Business/Fleetco/Product/Domain Model.md
Report three lists explicitly:
  - CONFIRMED — entities/fields the model already predicted
  - NEW — found in the HAR, absent from the model
  - CONTRADICTED — the model says one thing, the wire says another

OUTPUT FORMAT
Markdown, with frontmatter matching the other files in that folder. One section
per entity: field table (name / type / nullable / notes), then relationships,
then enumerations. Mark every entity with how many endpoints evidenced it.

BE HONEST ABOUT COVERAGE. End with: which entities from Domain Model.md you saw
NO evidence for, and which endpoints you could not confidently assign to an
entity. A short accurate map beats a long speculative one — do not invent
fields to fill gaps.
```

**Model: Sonnet 5.** This is a scripting-plus-extraction job and the volume is in the script, not
the reasoning. If the reconciliation section comes back shallow, re-run just that step on Opus,
feeding it the generated schema document rather than the HAR — by then it is small.

**On letting an agent drive the browser instead:** possible via the Chrome extension, and not
recommended here. The navigation is the easy part, and an agent clicking freely in a live
production system with an active QuickBooks sync is a real hazard. You know the app; drive it
yourself.

### 10c. Agent-driven capture — the automated alternative

**Correction to 10a: the capture does not have to be manual.** The Playwright MCP exposes
`browser_network_requests` (saves to file, filterable by URL regexp) and `browser_evaluate`, so an
agent can navigate and capture. **Only the login is manual — about 30 seconds.**

| Approach | Your time | Risk |
|---|---|---|
| Manual (10a) | ~2 hrs | None |
| Agent-driven, production | ~5 min | **Agent clicks Save on a live system with active QuickBooks sync** |
| Agent-driven, **sandbox** | ~5 min | None — and POST payloads become capturable |

**Ask FullBay for a demo/sandbox account.** It removes the only real objection to automating this,
and it comes up naturally in the same support conversation as export rights and API tier.

```
Capture FullBay's API traffic by driving a browser, then extract a data model.
FullBay is a heavy-duty repair shop SaaS at https://app.fullbay.com/

⚠️ READ THIS FIRST — THIS MAY BE A LIVE PRODUCTION SYSTEM
Fleetco runs their real business on this account and the QuickBooks sync is
ACTIVE. A created invoice or payment can propagate into their real accounting.

ABSOLUTE RULES — violating any of these is a serious incident, not a bug:
- NEVER click Save, Submit, Create, Delete, Post, Send, Pay, Receive, Approve,
  Authorize, or Void.
- NEVER type into a form field.
- NEVER confirm a dialog. If a confirmation dialog appears, DISMISS it.
- Opening a "New X" form is allowed and useful. Closing it without saving is
  required.
- If you are ever unsure whether a control mutates data, DO NOT CLICK IT. Note
  it and move on.
- If you believe you have changed anything, STOP IMMEDIATELY and report it.

STEP 1 — HAND OFF FOR LOGIN
Open https://app.fullbay.com/ and then STOP. Tell me to log in manually. Do not
attempt to authenticate, and do not ask me for credentials. Wait for me to
confirm before continuing.

STEP 2 — INSTALL A RESPONSE RECORDER
Before navigating, use browser_evaluate to patch window.fetch and
XMLHttpRequest so every JSON response is pushed to a global array with its URL,
method, and status. Cap it at ~2000 entries. Re-install it after any full page
reload.

STEP 3 — WALK THE APP, READ-ONLY
Follow the checklist in section 10a of this document — Service, Schedule,
Customers, Units, Parts, Purchasing, Time, Billing, Reports, Settings, the
empty "New" forms, and the customer portal. One record of each type; variety of
entity beats volume of rows. Take a snapshot before each click so you know what
you are clicking.

STEP 4 — HARVEST
Read the recorder array out via browser_evaluate in chunks, and also call
browser_network_requests with a filename to save the request list. Write raw
captures to a scratch directory, NOT into the Fleetco knowledgebase.

STEP 5 — EXTRACT
Process the captures with a SCRIPT, not by reading them into context — they
will be large. Then follow section 10b's extraction, security, and
reconciliation instructions exactly: field names/types/nullability only, never
real values, strip auth headers, reconcile against Domain Model.md, and report
CONFIRMED / NEW / CONTRADICTED.

Output: /Users/dweaver/.xerro/documents/Projects/Business/Fleetco/Product/FullBay Observed Schema.md

Report at the end: every page you visited, every page you could not reach, and
an explicit confirmation that you created, edited, or deleted nothing.
```

**Model: Sonnet 5.** Browser driving plus scripted extraction. If you run this against
production rather than a sandbox, watch the first few minutes of navigation before leaving it
alone.
