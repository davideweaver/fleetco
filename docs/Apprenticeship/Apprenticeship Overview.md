---
status: living
summary: Charlie's paid apprenticeship — the living plan
created: 2026-11-01
updated: 2026-11-10
tags: [fleetco, apprenticeship, charlie, training, planning]
source: Claude Code, from Dave's planning chat of 2026-10-24
---

## Overview

Charlie will have a paid apprenticeship with Dave while Dave builds Fleetco. This folder is the
living plan for it. Edit it as the apprenticeship runs: it is meant to change.

Charlie already codes (Roblox, Unity) and uses Codex, so this is not a course in programming from
scratch. The goal is to cross the gap between building games and contributing to a real
production business application: understanding an existing codebase, changing it safely, testing
it, using Git properly, working with APIs and databases, and deploying without breaking things.

| Document | What it holds |
|---|---|
| **This document** | Principles, working relationship, Codex rules, weekly report, status and open decisions |
| [[Shop Tracker Handbook]] | The 12-week, week-by-week handbook Charlie works from |
| [[After the 12 Weeks]] | The path into TypeScript, React, NestJS and PostgreSQL, and the first Fleetco tasks |

## Status and open decisions

**Decided 2026-11-10** (Dave talked it through with Charlie):

- **Start date.** The week of 2026-11-09.
- **Pay.** $25 an hour, for training time as well as Fleetco work.
- **Hours.** About 10 a week.
- **Training project.** A small shop-management web app, Shop Tracker, instead of the Coin Rush
  game. It uses real entities (customers, units, service orders, action items) and realistic
  data, and teaches everything the game was meant to. See [[Shop Tracker Handbook]].

**Still undecided:**

- **When Fleetco code work starts.** The handbook is a standalone training project. When Charlie
  first touches the real Fleetco codebase depends on what is built and stable by then.
- **When paid tickets begin.** Training time is paid. When Charlie moves on to paid Fleetco
  delivery tickets is open (within weeks, after a month of foundations, or after two or three
  months).
- **Deployment architecture.** Week 11 deploys Shop Tracker to a development environment. Where and
  how depends on Fleetco's own hosting decisions (see [[Hosting and Deployment]]).
- **Hour tracking and payroll.** How hours are recorded, what counts as assigned work versus
  optional study, and handling payroll and employment correctly for a minor who is still in high
  school. The rate is settled; these aren't, and pay starts this week.
- **TypeScript timing.** The 12-week handbook is plain JavaScript and Node.js. TypeScript only
  arrives after week 12, though Fleetco is written in TypeScript. Revisit if Fleetco work starts
  earlier than planned.

## Principles

1. **Learn just enough, then build something.** No months of courses before touching a real
   project.
2. **Codex is a multiplier, not a substitute for understanding.** Charlie should be able to
   explain the code it generates, spot when it is wrong, and prove changes work.
3. **Progressively more responsibility.** Start with isolated tasks and work toward owning a small
   feature from the React interface through the API and database.
4. **Fundamentals before frameworks.** The first phase is plain HTML, CSS, JavaScript and Node.js.
   React and NestJS come once Charlie understands the problems they solve.
5. **Milestones, not deadlines.** If the fundamentals land in eight weeks, move faster. If HTTP and
   persistence take longer, that's fine: those are exactly the concepts worth getting right.

**Time.** About 10 hours a week around school and sports, on a flexible schedule with concrete
deliverables. The 12-week handbook is about 120 hours; over six months that is about 250 hours of
deliberate practice.

## Target skills

Charlie doesn't need to master everything before contributing. Enough foundation to work safely,
then depth in whatever the next task needs.

**Level 1: Developer fundamentals** (immediate)

- Git, GitHub, branches, commits, pull requests and code reviews
- JavaScript: promises, async/await, modules, error handling
- TypeScript: types, interfaces, unions, generics, compiler errors
- Terminal, VS Code, Node.js, npm and debugging
- Using Codex to understand and change an unfamiliar codebase

**Level 2: Application development** (before the first substantial feature)

- React components, props, state, hooks, forms and routing
- HTTP, REST APIs, JSON, headers and status codes
- NestJS controllers, services, dependency injection and validation
- PostgreSQL, SQL, joins, constraints and migrations
- Unit tests, API tests and basic end-to-end testing

**Level 3: Production engineering** (learned in context, not up front)

- CI/CD, automated checks and deployment pipelines
- AWS fundamentals, IAM, networking, hosting and managed databases
- Environment configuration, secrets and permissions
- Logging, monitoring, troubleshooting and rollback
- Authentication, authorization, data privacy, backups and migrations

**Cross-cutting**

- **Business domain.** How Fleetco runs its operations, what FullBay does and doesn't do, and why
  a workflow matters.
- **Engineering judgment.** Breaking down a requirement, finding the right place to change code,
  assessing risk, testing behavior and explaining trade-offs.

## Working relationship

Dave is both project lead and Charlie's father, so learning time and delivery work are kept
separate.

- **Self-directed learning.** Charlie follows the handbook and builds Shop Tracker.
- **Paid project work.** Defined Fleetco tasks, with tests, reviews and documentation of what was
  delivered.
- **Weekly review.** 30 minutes on what Charlie learned, where Charlie got stuck, and what's next.
  Charlie brings the weekly report (below).
- **Progression.** Task complexity grows with demonstrated competence, not weeks elapsed.

**Guardrails**

- Training happens in a separate repository (Charlie's own `shop-tracker`), with no Fleetco
  credentials, customer data or production access. Shop Tracker's data is invented, never copied
  from Fleetco or OTC.
- Fleetco work goes through the normal review process. No direct production changes, no
  unsupervised access to sensitive data, and no merging unreviewed agent-generated code.
- Basic security and data-handling rules apply from day one. Production security architecture
  stays with Dave.

**Day one.** Dave and Charlie spend the first paid session together: set up the machine and
repository, walk through week 1, and agree the weekly review and paid training schedule. Then
Charlie owns the work.

The first milestone isn't that everything is installed. It's that Charlie can clone a
repository, install dependencies, run a program, debug an error, commit a change and push it to
GitHub without being walked through each step.

**Workstation**

- VS Code (editor and debugger)
- Git, including the command line
- Node.js LTS and npm
- A GitHub account
- Codex, used with the repository
- Browser developer tools (requests, responses, console errors)
- `curl`, to test the server without the browser

## Codex operating rules

Codex is a development partner, not an unquestioned source of truth.

**The one rule:** you don't have to type every line, but you do have to understand every
meaningful change you submit.

**The task loop**

1. **Investigate before coding.** Ask Codex to locate the relevant code, trace current behavior
   and explain the design. Check that explanation against the actual code.
2. **Write a short plan.** Expected behavior, files likely to change, edge cases and tests. For
   anything beyond a trivial fix, agree the approach before implementing.
3. **Implement with Codex.** Let it write code, then inspect the diff, question assumptions and
   check it matches the plan.
4. **Verify.** Run the tests and the application, exercise the changed behavior, inspect failures.
   A passing build alone is not proof the feature works.
5. **Explain and submit.** What changed, why it works, what could go wrong and how it was tested.
   Then open a pull request for review.

**Habits from day one**

- Ask it to explain concepts and propose exercises before asking it to implement everything.
- Make it explain unfamiliar APIs and dependencies.
- Review the generated diff rather than accepting it blindly.
- Run tests and verify behavior yourself.
- Write a short note of what you learned at the end of each session.
- If Codex generates 200 lines you can't explain, reduce the scope.

**Exercises that show real understanding**

- Explain a TypeScript (or JavaScript) error before asking Codex to fix it.
- Deliberately break a test and diagnose why it fails.
- Trace a button click through an HTTP request, a controller, a service and a database query.
- Review a pull request that contains a planted bug.
- Occasionally make a tiny change with no AI assistance, to know which concepts are really yours.

That last one isn't about rejecting AI. It's about being able to supervise it.

**Useful prompts**

- *Learning:* "Teach me this concept through a small example. Ask me questions and give me
  exercises. Don't jump straight to the complete solution."
- *Code review:* "Review my changes for correctness, edge cases, security and maintainability.
  Explain each finding and distinguish confirmed bugs from suggestions."
- *Debugging:* "Help me diagnose this failure. Start by explaining what evidence we need and how to
  collect it. Don't assume the first plausible explanation is correct."
- *Unfamiliar code:* "Trace this behavior through the codebase. Identify the entry point, the
  important functions, the data flow and the error paths. Reference the actual files and code."
- *Testing:* "Identify the important success cases, failure cases and edge cases for this feature.
  Suggest tests and explain what each test proves."

## Weekly progress report

At the end of each week, Charlie writes a short report and brings it to the weekly review:

1. What did I build?
2. What new concepts did I learn?
3. What was the hardest problem I hit?
4. How did I diagnose and solve it?
5. What did Codex help with, and what did I have to verify myself?
6. What can I now explain or do independently?
7. What do I want to learn next?

The point isn't to prove every task was easy. It's to show understanding and independence
growing.

## Deliberately postponed

- Advanced AWS networking and infrastructure-as-code
- Kubernetes and container orchestration, unless Fleetco's deployment needs it
- Complex React state management libraries
- Advanced PostgreSQL query optimization
- Distributed systems, queues and event-driven architecture
- Advanced authentication and security implementation
- Deep framework internals
- An AWS certification. Safely deploying, debugging and explaining a small application is worth
  more here.

No paid bootcamp or certification for now. Free official resources cover the first several
months, and the project supplies the practical experience.
