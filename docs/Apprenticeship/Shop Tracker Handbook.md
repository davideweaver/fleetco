---
status: living
summary: Charlie's 12-week developer handbook — building Shop Tracker, a small shop-management app
created: 2026-11-01
updated: 2026-11-10
tags: [fleetco, apprenticeship, charlie, handbook, shop-tracker]
source: Claude Code, from Dave's planning chat of 2026-10-24. Project changed from the Coin Rush game to Shop Tracker on 2026-11-10
---

## Overview

**Software Engineering Apprenticeship: Charlie's 12-Week Developer Handbook**

| | |
|---|---|
| **Project** | Shop Tracker, a small web app for running a heavy-duty repair shop |
| **Duration** | 12 weeks, flexible pace |
| **Time** | About 10 hours a week |
| **Approach** | Learn, build, test, review, repeat |
| **Tools** | Git, GitHub, JavaScript, Node.js, HTML, CSS, PostgreSQL and Codex |

The principles, working relationship, Codex rules and weekly report template live in
[[Apprenticeship Overview]]. What follows week 12 is in [[After the 12 Weeks]].

**Why a shop app and not a game.** The first draft of this handbook built a multiplayer game
(Coin Rush). On 2026-11-10 Dave changed it to something shaped like Fleetco: a website with real
entities, realistic data and real business rules. Every lesson the game was teaching is still
here, mapped onto business software:

| The game taught | Shop Tracker teaches it with |
|---|---|
| The server is the authority on scores | The server calculates order totals and enforces the authorization gate |
| Game rules as state transitions | A service order moving from open to invoiced |
| Rooms, players and scores in a database | Customers, units, service orders and action items, with real relationships |
| Leaderboards | Reports: open work by stage, units out of service, totals by customer |
| Live multiplayer updates | A live shop board two people watch and change at once |
| Players cheating from the browser | Nobody can skip authorization or edit a total from the browser |

## Welcome

The goal of this program is to learn how professional software is built, tested, maintained and
delivered. You already know how to code games. This builds on that and introduces the tools and
practices used to develop real business applications.

You'll learn to:

- Use Git and GitHub to manage changes to a codebase.
- Work with JavaScript, Node.js and eventually TypeScript.
- Understand how browsers, servers and HTTP requests work together.
- Build APIs that accept requests and return data.
- Store and retrieve data in a relational database.
- Write tests that prove your code behaves correctly.
- Use AI coding tools well without blindly trusting their output.
- Collaborate through issues, branches, pull requests and code reviews.
- Deploy a working application other people can use.

You'll apply all of it by building **Shop Tracker**. It's a much smaller cousin of the Fleetco app
Dave is building, so the words, the data and the problems you meet are the ones you'll meet on
Fleetco afterwards.

**How to approach the work.** You are not expected to memorize everything or write every line
yourself. AI coding tools are part of modern development. You are responsible for understanding
the code you submit, verifying that it works and explaining your decisions. Getting stuck is
normal. Repeatedly accepting code you don't understand is not a fix.

## The app: Shop Tracker

A heavy-duty repair shop fixes trucks and trailers for fleet customers. Shop Tracker is the
website the shop runs on:

1. A **customer** (a trucking company) owns **units** (tractors, trailers, reefers).
2. When a unit needs work, the shop opens a **service order**.
3. Each problem goes on the order as an **action item**: the *concern* (what's wrong), then the
   *cause* the technician finds, then the *correction* (what was done).
4. The shop prices each action item (labor hours and parts) and sends the estimate.
5. The customer **authorizes** each line. No work happens on a line until it's authorized.
6. Technicians do the work and record the correction.
7. The order is completed and invoiced. The server works out the total.

The vocabulary is the industry's own and the same as Fleetco's (see [[Domain Model]]). Shops say
*unit*, never *vehicle*. Use these words in your table names, API paths and screens.

**The server is the authority for shared data.** The browser is a client, not a trusted source of
truth. The browser never sends a total, never decides a line is authorized, and never moves an
order past a stage it hasn't earned. The server checks all of that. That's the same lesson as not
trusting a player's score, and it's the most important one in business software.

**Real data, safely.** The data should feel real: dozens of customers, a few hundred units with
real makes and models (Freightliner, Peterbilt, Kenworth, Great Dane, Utility), real-looking unit
numbers, and a year or two of service history. You'll write a **seed script** that generates it
(week 6). Big enough that lists need searching and reports have something to say. It is invented
data. No Fleetco or OTC customer data goes into Shop Tracker, ever.

For a real outside data source, the U.S. government's free vPIC service decodes a VIN into year,
make and model: https://vpic.nhtsa.dot.gov/api/. You'll call it in week 4.

**Database approach.** Start with in-memory objects, so you see how a request changes server state
and how the client reads it. Then move to PostgreSQL (Fleetco's database): `customers` and `units`
first, then `service_orders` and `action_items`. Use plain SQL and parameterized queries through
the Node.js `pg` package before any ORM.

**Keep it small.** Shop Tracker isn't Fleetco. No logins, no parts inventory, no QuickBooks, no
customer portal. If you want to add one of those, finish the twelve weeks first.

## Your weekly routine

About 10 hours a week, around school and sports: five or six sessions. A typical 90 to 120
minute session:

| Step | Time | What |
|---|---|---|
| **Learn** | 15 to 20 min | Read documentation or work through a lesson |
| **Build** | 60 to 80 min | Apply it to your project |
| **Verify** | 10 to 15 min | Run the program or tests, investigate problems |
| **Record** | 5 min | Commit your work, note what you learned, log your hours |

At the end of each week, prepare a short demo and the weekly report for your mentor. The schedule
is flexible: understanding matters more than finishing a lesson on a particular day.

---

## Phase 1: Learn the tools

### Week 1: Set up your development environment

**Objective.** Understand your tools and run a program from your own computer.

**Learn**

- What a terminal is and how to navigate directories
- What Git does and why version control matters
- The difference between Git and GitHub
- What Node.js and npm do
- How to run a JavaScript program

**Resources**

- GitHub Skills, Introduction to GitHub: https://github.com/skills/introduction-to-github
- GitHub Skills, Introduction to Git: https://github.com/skills (do both, then repeat the
  workflow on your own `shop-tracker` repo)
- Node.js learning resources: https://nodejs.org/learn
- Git documentation: https://git-scm.com/doc

**Assignments**

1. Install Git, Node.js LTS and your editor.
2. Configure your Git identity.
3. Create a GitHub repository called `shop-tracker`.
4. Clone it onto your computer.
5. Write a JavaScript program that prints a short summary of one unit (unit number, year, make,
   model, customer).
6. Change it, commit the change and push to GitHub.
7. Write a README explaining what Shop Tracker will be and how to run the program.

**Acceptance criteria**

- [ ] You can explain the purpose of Git, GitHub, Node.js and npm.
- [ ] You can clone, edit, commit and push a repository.
- [ ] Someone else can follow your README and run your program.

**Codex prompt**

> Act as my software engineering mentor. I'm learning professional development workflows. Help me
> verify my Git and Node.js setup, one step at a time. Explain what each command does. Don't run
> commands or make changes on my behalf unless I ask. Give me small exercises to verify my
> understanding.

### Week 2: Git branches, pull requests and code review

**Objective.** Learn how developers make changes safely without editing `main` directly.

**Learn**

- Repositories, commits, branches and remotes
- `main` versus a feature branch
- Pull requests and code reviews
- Merge conflicts and how to resolve them
- Issues and task descriptions

**Resources**

- GitHub Skills: https://github.com/skills
- Pro Git book: https://git-scm.com/book/en/v2

**Assignments**

1. Write GitHub issues for the first few things Shop Tracker needs (for example "list units",
   "add a unit", "open a service order"). Each issue says what done looks like.
2. Pick one small issue and create a branch for it.
3. Implement it and commit.
4. Open a pull request that links the issue.
5. Ask your mentor to review it.
6. Address the review comments and merge.
7. Deliberately create a merge conflict in a practice branch and resolve it.

**Acceptance criteria**

- [ ] You can do the issue-to-pull-request workflow on your own.
- [ ] You can explain how to recover from a basic merge conflict.

**Codex prompt**

> Teach me Git branching and pull requests using my shop-tracker repository. Give me an exercise
> where I create a branch, make a change, commit it, open a pull request and resolve a merge
> conflict. Explain the commands and let me execute them myself.

---

## Phase 2: Understand JavaScript and the web

### Week 3: JavaScript fundamentals and small programs

**Objective.** Build confidence writing small programs without a framework, on shop data.

**Learn**

- Variables, functions and objects
- Arrays and array methods (`filter`, `map`, `sort`, `reduce`)
- Modules and imports
- JSON and reading structured data
- Error handling
- Basic automated tests
- Why money is stored in cents, not as decimals

**Resources**

- MDN JavaScript guide: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide
- Node.js learning resources: https://nodejs.org/learn

**Assignments**

Build three small programs:

1. **An action item price calculator.** Labor hours times a labor rate, plus parts, plus a shop
   supplies fee and sales tax. Store money in whole cents and round once, at the end.
2. **A unit list tool.** Given a list of units, filter by customer or status (for example *Out of
   Service*) and sort by unit number or year.
3. **A report.** Read a JSON file of customers, units and service orders, and print open orders
   per customer and the total billed per customer.

Keep the main logic and the program entry point in separate modules. Write tests for the price
calculation and the filtering and sorting.

*Stretch:* a VIN has a check digit (the 9th character) calculated from the other 16. Write a
function that says whether a VIN is valid, and test it against a few real ones.

**Acceptance criteria**

- [ ] Each program runs from the terminal.
- [ ] The code is split into understandable functions.
- [ ] Tests cover normal cases and at least two edge cases (an order with no parts, a rounding
      case, an empty list).
- [ ] You can explain how data moves through each program.

**Codex prompt**

> Give me a JavaScript exercise that processes repair shop records: customers, units and service
> orders. Start with a small specification, not the solution. Let me implement it, then review my
> code for correctness, readability and edge cases. Suggest tests before suggesting improvements.

### Week 4: HTML, browser JavaScript and HTTP

**Objective.** Understand how a browser talks to a server.

**Learn**

- HTML elements and forms
- Basic CSS and DOM manipulation
- Browser events
- `fetch()` and asynchronous JavaScript
- HTTP methods, URLs, headers and status codes
- JSON request and response bodies

**Resources**

- MDN Learn Web Development: https://developer.mozilla.org/en-US/docs/Learn_web_development
- MDN, How the web works:
  https://developer.mozilla.org/en-US/docs/Learn_web_development/Getting_started/Web_standards/How_the_web_works
- MDN, HTTP overview: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview
- NHTSA vPIC API: https://vpic.nhtsa.dot.gov/api/

Use MDN selectively, based on what you already know. You don't need every lesson.

**Assignments**

1. Make an **Add Unit** page: unit number, VIN, year, make, model and customer.
2. Add a **Decode VIN** button that calls the vPIC API with `fetch()` and fills in year, make and
   model. This is real data from someone else's server.
3. Open the browser developer tools and the Network panel.
4. Identify the request URL, method, status code, headers and response body.
5. Handle the failures: a bad VIN, a VIN vPIC doesn't recognize, and no network.
6. Show the unit you entered on the page.

Saving the unit can be mocked for now. Next week connects the page to your own server.

**Acceptance criteria**

- [ ] You can explain the difference between browser-side and server-side code.
- [ ] You can inspect an HTTP request and response without guessing what happened.
- [ ] The page tells the user something useful when the VIN lookup fails.

**Codex prompt**

> Help me build a plain HTML, CSS and JavaScript form that adds a truck unit and decodes its VIN
> with the NHTSA vPIC API. Don't use React or another framework. Explain DOM events, fetch,
> promises and HTTP status codes as we go.

---

## Phase 3: Build a real server

### Week 5: Node.js and your first HTTP server

**Objective.** Receive real requests, run server-side code and return responses.

**Learn**

- What a server process is
- Ports, URLs and HTTP request handling
- Node.js modules
- The built-in `node:http` module
- Request methods and paths
- Parsing JSON and returning status codes
- Basic input validation and error handling

**Resources**

- Node.js learning resources: https://nodejs.org/learn
- Node.js HTTP documentation: https://nodejs.org/api/http.html
- MDN client-server overview:
  https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Server-side/First_steps/Client-Server_overview

**Assignments**

Build a small server with no Express or NestJS. Implement:

- `GET /health`: return a status response
- `GET /customers` and `POST /customers`
- `GET /units`: list units, with an optional `?customer=` filter
- `GET /units/:id`: one unit, or a 404
- `POST /units`: create a unit

Store everything in in-memory JavaScript objects for now. Validate input: a unit needs a unit
number and a customer that exists, and two units of the same customer can't share a unit number.
Connect the week 4 page to this server, and add a page that lists units.

**Acceptance criteria**

- [ ] The server accepts real HTTP requests.
- [ ] The browser can create and list units.
- [ ] Invalid input returns a 400 with a message that says what's wrong. A missing unit returns a
      404.
- [ ] You can explain how a request reaches the right handler and how the response goes back.

**Codex prompt**

> Help me implement a small HTTP server using only Node.js built-in modules. I want to understand
> request routing, JSON parsing, response status codes and error handling. Ask me to predict the
> behavior of each endpoint before we test it.

### Week 6: Persistence, real data, tests and debugging

**Objective.** Understand the difference between temporary application state and persistent
storage, and fill the app with data that feels real.

**Learn**

- Why in-memory data disappears when a process restarts
- What a database is for
- Relational tables, rows, primary keys and foreign keys
- SQL basics: `SELECT`, `INSERT`, `UPDATE`, `WHERE`, `JOIN`, `ORDER BY`
- Parameterized queries
- Automated tests and debugging

**Resources**

- PostgreSQL tutorial: https://www.postgresql.org/docs/current/tutorial.html
- Node.js test runner: https://nodejs.org/api/test.html
- Node.js PostgreSQL client (`pg`): https://node-postgres.com/

**Assignments**

1. Create `customers` and `units` tables. A unit belongs to a customer (a foreign key). Add a
   `status` column for units (for example *Active*, *Out of Service*, *Sold*).
2. Move the week 5 endpoints onto PostgreSQL.
3. Write a **seed script** that fills the database with realistic data: about 25 fleet
   customers and 300 units with real makes, models and years.
4. Add search and paging to `GET /units`, because 300 rows is too many for one page.
5. Handle a unit that doesn't exist, and a customer that can't be deleted because it still has
   units.

Write automated tests for the important behavior, using a separate test database or isolated
test data.

**Acceptance criteria**

- [ ] Records survive a server restart.
- [ ] The seed script can rebuild the database from scratch with one command.
- [ ] SQL queries use parameters, never string-concatenated untrusted input.
- [ ] Tests cover successful requests and failure cases.
- [ ] You can explain how the HTTP server, application code and database relate.

---

## Phase 4: Build Shop Tracker

### Week 7: Service orders and the rules of the shop

**Objective.** Separate business rules from HTTP handling and browser presentation.

**Learn**

- Splitting modules by responsibility
- State and state transitions
- Server-side validation
- Basic application design
- Unit testing business rules

**Assignments**

Write the service order rules as plain JavaScript functions, with no HTTP and no database. A
service order moves through stages:

`Open → Diagnosing → Estimate sent → Authorized → In progress → Completed → Invoiced`

Rules to enforce:

- An order belongs to one unit. A unit can't have two open orders at once.
- An action item has a concern. It needs a cause before it can be priced.
- **No work on a line the customer hasn't authorized.** This is the most important rule in the
  whole app. Fleetco calls it the authorization gate.
- Each line needs a correction before the order can be completed.
- The total is calculated from the lines (your week 3 calculator), never typed in.
- An invoiced order can't be changed.

Write tests for every allowed move and for the moves that must be refused.

**Acceptance criteria**

- [ ] The rules work independently of the browser and the HTTP layer.
- [ ] Tests show an order can't skip authorization and an invoiced order can't be edited.
- [ ] You can draw the stages on paper and explain which move each rule blocks.

### Week 8: Orders in the database, and reports

**Objective.** Build the core data model and the screens a service writer would use.

**Assignments**

1. Add `service_orders` and `action_items` tables. Extend the seed script with a year or two of
   service history.
2. Implement endpoints to:
   - Open a service order for a unit
   - Add an action item (concern)
   - Record cause, labor hours and parts on a line
   - Authorize lines (one at a time, or all at once)
   - Move an order to its next stage
   - Get one order with its lines and its server-calculated total
3. Build the pages: a unit's history, an order's detail, and a list of open orders.
4. Build three reports with SQL `JOIN`s and `GROUP BY`:
   - Open orders by stage
   - Units out of service and how long they've been out
   - Total billed per customer this month
5. Check that the server ignores any total or authorization a browser tries to send.

**Acceptance criteria**

- [ ] You can open an order, price it, authorize it, complete it and invoice it from the browser.
- [ ] Every stage rule from week 7 is enforced by the server, not just hidden in the page.
- [ ] Data that should persist is stored in the database.

### Week 9: A live shop board

**Objective.** Understand polling versus real-time communication, and what happens when two people
change the same thing.

**Learn**

- Polling and its trade-offs
- Server-Sent Events (one-way, server to browser; what Fleetco uses) and WebSockets
- Connection lifecycle and disconnects
- Two people editing the same record at once
- Basic rate limiting and abuse prevention

**Resources**

- MDN Server-Sent Events: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
- MDN WebSockets API: https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API

**Assignments**

1. Build a **shop board**: a page with a column per stage, showing each open order as a card.
2. First make it update by polling: the browser asks for the board every few seconds.
3. If the fundamentals are solid, push updates with Server-Sent Events instead.
4. Open two browser windows, one as the service writer and one as a technician. A change in one
   shows up in the other.
5. Make both windows move the same order at the same moment. Decide what should happen, and make
   the server refuse the stale change rather than silently overwrite it.

**Acceptance criteria**

- [ ] Two people see the same board and each other's changes.
- [ ] The server stays authoritative.
- [ ] Refreshing or disconnecting a browser doesn't leave an order in a state the rules don't
      allow.

Don't rush into Server-Sent Events to hit the schedule. If HTTP or persistence isn't solid yet,
stay there.

---

## Phase 5: Deliver software professionally

### Week 10: Automated testing and CI

**Objective.** Make sure changes are checked automatically before they're merged.

**Learn**

- Unit tests versus integration tests
- Linting and formatting
- Continuous integration
- GitHub Actions
- Reproducing and diagnosing failed builds

**Resources**

- GitHub Actions documentation: https://docs.github.com/en/actions
- Node.js test runner: https://nodejs.org/api/test.html

**Assignments**

1. Add tests for the important behavior: the stage rules, the totals and the reports.
2. Create a GitHub Actions workflow.
3. Run tests automatically when a pull request is opened or updated.
4. Deliberately introduce a failing test and diagnose it.
5. Document how to run the tests locally.

**Acceptance criteria**

- [ ] A pull request isn't ready until the automated checks pass.
- [ ] You can explain what the pipeline runs and how to investigate a failure.

### Week 11: Deployment and cloud fundamentals

**Objective.** Understand how an application runs outside your own computer.

**Learn**

- Development versus production environments
- Environment variables and secrets
- Hosting a server process
- Database connectivity and network access
- Logs and basic monitoring
- Deployment and rollback

**Resources**

- AWS Cloud Essentials: https://aws.amazon.com/training/learn-about/cloud-practitioner/
- AWS Well-Architected Framework:
  https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html

**Assignments**

1. With your mentor, deploy a development version of Shop Tracker, loaded with seed data.
2. Use a separate development database and appropriate access controls.
3. Never commit credentials or secrets to GitHub.
4. Document how to deploy, read the logs and recover from a failed deployment.

**Acceptance criteria**

- [ ] Someone else can open the deployed app, open a service order and take it through to
      invoiced.
- [ ] You can find the server logs and explain the main components involved in serving a request.

*Open: the hosting target for this week isn't decided yet. See [[Apprenticeship Overview]].*

### Week 12: Ship, demonstrate and review

**Objective.** Complete a small delivery cycle on your own.

**Assignments**

1. Fix remaining bugs.
2. Review and improve the README.
3. Document the database model (a diagram of the tables) and the API endpoints.
4. Review open issues and known limitations.
5. Demo the app to your mentor: take a unit from a new concern through to an invoice, and show the
   shop board updating live.
6. Present one bug you hit, how you diagnosed it and how you fixed it.
7. Compare Shop Tracker with Fleetco's [[Domain Model]]: what Fleetco has that yours doesn't, and
   what you'd add in a second version.

**Acceptance criteria**

- [ ] You can demo the app, explain its architecture, show the tests and describe how a change
      travels from your local branch to the deployed app.
- [ ] You can point to parts of the code you don't fully understand and explain how you'd
      investigate them.

**Final milestone.** Someone else plays service writer on the deployed app, reports a bug, and you
reproduce, diagnose and fix it through a reviewed pull request.

---

## Checkpoint after the foundation phase

Treat the first stretch (workstation and Git, small JavaScript programs and async code, a plain
HTML and JavaScript client talking to a basic Node HTTP server, then tests, persistence and seed
data) as a foundation phase, and reassess before building out service orders. If you can
independently explain and extend that application, you're ready for the shop rules and the live
board. If not, spend more time there. That's the foundation everything else stands on.
