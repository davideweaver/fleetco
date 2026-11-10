---
status: living
summary: What happens when the apprenticeship ends
created: 2026-11-01
updated: 2026-11-10
tags: [fleetco, apprenticeship, charlie, frameworks, onboarding]
source: Claude Code, from Dave's planning chat of 2026-10-24
---

## Overview

What follows [[Shop Tracker Handbook]]: learning the frameworks Fleetco actually uses, then a
staged path into real Fleetco work. Principles and guardrails are in [[Apprenticeship Overview]].

By this point Charlie works with abstractions Charlie understands, rather than memorizing
framework conventions without knowing what they do.

The goal was never to finish twelve weeks knowing everything. It's to become someone who can take
a task, investigate it, implement it, test it, explain it and deliver it responsibly.

## The framework sequence

1. **TypeScript.** Add static typing to what you know of JavaScript: everyday types, functions,
   object types, narrowing, classes and modules. You've now felt the problems types solve.
2. **React.** Components, props, state, forms and hooks. Thinking in React matters most: breaking
   a business interface into components and reasoning about data flowing through them.
3. **NestJS.** Controllers, services, dependency injection, DTOs, validation, status codes, error
   handling and application structure. Learn why frameworks like Express and NestJS exist, and
   what they do that `node:http` made you do by hand.
4. **PostgreSQL in depth.** Relationships, constraints, transactions and migrations. Understand
   the SQL the application generates rather than treating the ORM as magic.
5. **Production engineering.** Authentication, authorization, deployment, monitoring and
   operational practice, learned in context.

Don't learn React and NestJS as two unrelated frameworks. Once TypeScript and HTTP are solid,
build a small feature that connects the two. That's where the architecture clicks.

**Resources** (official and free; no bootcamp needed)

- TypeScript Handbook: https://www.typescriptlang.org/docs/handbook/intro.html
- React Learn: https://react.dev/learn
- Thinking in React: https://react.dev/learn/thinking-in-react
- NestJS First Steps: https://docs.nestjs.com/first-steps
- MDN HTTP overview: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview
- PostgreSQL tutorial: https://www.postgresql.org/docs/current/tutorial.html
- AWS Cloud Essentials: https://aws.amazon.com/training/learn-about/cloud-practitioner/

**Practice deliverables**

- A small TypeScript command-line app that reads a JSON file, validates it, transforms it and
  writes a report, with automated tests.
- A responsive unit list with search, filters, an edit form and validation. Mock data first,
  then a real API.
- A typed REST API for units with create, read, update and delete, tested independently of the
  UI.
- A relational model of units and service orders, with queries for overdue
  maintenance, joins across related records and basic integrity constraints.
- An explanation of how a React app, an API, a database, the network and access permissions fit
  together. Later, a deploy of a small app to a controlled development environment.

## A bridge project: Shop Tracker on Fleetco's stack

Before touching Fleetco's production code, rebuild Shop Tracker (from [[Shop Tracker Handbook]])
on the stack Fleetco uses:

- **TypeScript** throughout
- **React:** the unit list, order detail and shop board
- **NestJS:** the REST API, replacing the hand-written `node:http` server
- **PostgreSQL:** the same tables and seed data, now with migrations
- **GitHub:** issues, branches, pull requests and code review
- **Tests and the CI pipeline**, carried over
- **Deployment** once the local version works

Rebuilding an app Charlie already understands is the point. The domain and the rules are known,
so every difference is the framework, and it's obvious what React and NestJS do that the plain
version made him do by hand. It's still a safe place to make mistakes away from Fleetco's data.
Start with one vertical slice (list units, open an order, authorize a line, complete it) before
porting the rest.

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
