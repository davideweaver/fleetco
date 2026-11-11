---
status: living
summary: What happens after the 12-week handbook: service orders, then real Fleetco work
created: 2026-11-01
updated: 2026-11-10
tags: [fleetco, apprenticeship, charlie, frameworks, onboarding]
source: Claude Code, from Dave's planning chat of 2026-10-24
---

## Overview

What follows [[Shop Tracker Handbook]]. By week 12 Charlie has built one part of Shop Tracker
(customers and units) on Fleetco's own stack: TypeScript, NestJS, PostgreSQL with Drizzle, React,
Vitest and GitHub Actions. What's left is depth, the next part of the app, and then a staged path
into real Fleetco work. Principles and guardrails are in [[Apprenticeship Overview]].

The goal was never to finish twelve weeks knowing everything. It's to become someone who can take
a task, investigate it, implement it, test it, explain it and deliver it responsibly.

## The next part of Shop Tracker: service orders

Before touching Fleetco's production code, add the heart of a repair shop to Shop Tracker, on the
same stack. This is the part that was cut from the 12 weeks to reach the real technologies
sooner.

1. When a unit needs work, the shop opens a **service order**.
2. Each problem goes on the order as an **action item**: the *concern*, then the *cause* the
   technician finds, then the *correction*.
3. The shop prices each line (labor hours and parts) and sends the estimate.
4. The customer **authorizes** each line. No work on a line until it's authorized: Fleetco's
   authorization gate.
5. The order is completed and invoiced, and the server works out the total.

Suggested order of work:

- **The stages and rules**, as tested service code first:
  `Open → Diagnosing → Estimate sent → Authorized → In progress → Completed → Invoiced`. A unit
  can't have two open orders; a line needs a cause before it's priced; no work on an unauthorized
  line; every line needs a correction before the order completes; an invoiced order can't change.
- **Money.** Totals in whole cents, calculated from the lines, with a shop supplies fee and tax.
  Never sent by the browser.
- **Tables and endpoints:** `service_orders` and `action_items`, joined to units. Extend the seed
  script with service history.
- **Screens:** an order's detail, a unit's service history, and a list of open orders.
- **A live shop board:** a column per stage, updated in every open browser with Server-Sent
  Events. Two people moving the same order at once: the server refuses the stale change rather
  than silently overwriting it.
- **Reports:** open orders by stage, and total billed per customer.

Start with one vertical slice (open an order, add a line, authorize it, complete it) before the
rest. The domain is Fleetco's, so compare each decision with the [[Domain Model]] and the
[[Rules Catalog]].

## Going deeper

Learned in context, as the work needs it:

- **TypeScript:** generics, utility types, and types shared between the API and React.
- **React:** custom hooks, data-fetching libraries, and larger forms.
- **NestJS:** guards, interceptors, configuration, and generating OpenAPI from Zod schemas.
- **PostgreSQL:** transactions, constraints, indexes, and reading a query plan.
- **Production engineering:** authentication, authorization, monitoring and operational practice.

**Resources** (official and free; no bootcamp needed)

- TypeScript Handbook: https://www.typescriptlang.org/docs/handbook/intro.html
- React Learn: https://react.dev/learn
- NestJS documentation: https://docs.nestjs.com/
- Drizzle: https://orm.drizzle.team/docs/overview
- PostgreSQL documentation: https://www.postgresql.org/docs/current/
- AWS Cloud Essentials: https://aws.amazon.com/training/learn-about/cloud-practitioner/

## First Fleetco work

No whole subsystem at the start. A progression of tasks with rising risk and complexity:

| Stage | Example assignment | What it teaches |
|---|---|---|
| 1 | Improve a form label or empty state | React, components, code review |
| 2 | Add a filter to a list | State, TypeScript, arrays and UI testing |
| 3 | Add an API endpoint for a simple lookup | HTTP, NestJS and DTOs |
| 4 | Add a database query or small schema change | SQL, relationships and migrations |
| 5 | Implement a complete small feature | End-to-end thinking and integration |
| 6 | Diagnose a failed CI build or test | GitHub Actions and debugging |
| 7 | Improve development docs or monitoring | Operational practice |

These are examples, not a commitment to every kind of task. The first tickets depend on what is
already built and stable in the Fleetco codebase.

**What "contributing" looks like, in order**

1. **Real work under review.** Set up and run Fleetco locally, read its architecture and
   conventions ([[Code Standards and Guardrails]], [[Testing Strategy]]), pick up small,
   well-defined tickets and address review feedback. *Proof:* a small, low-risk change shipped
   against an agreed acceptance criterion.
2. **Delivery.** CI pipelines, linting, tests and build failures; environment variables and
   secrets; deployment concepts; logging, debugging and safe migrations. *Proof:* diagnose a
   failed build or test, fix it, and explain how the change reaches the development environment.
3. **Ownership.** Understand a business requirement, propose a design and plan, implement the UI,
   API and data changes, add tests, document the behavior and demo it. *Proof:* a reviewed feature
   delivered with minimal step-by-step guidance, while Dave keeps architectural and production
   oversight.

All Fleetco work follows the guardrails in [[Apprenticeship Overview]]: normal review, no direct
production changes, no unsupervised access to sensitive data, no merging unreviewed
agent-generated code.
