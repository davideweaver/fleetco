---
status: living
summary: Charlie's 12-week developer handbook — building the units part of a small shop app, on Fleetco's stack from week 6
created: 2026-11-01
updated: 2026-11-10
tags: [fleetco, apprenticeship, charlie, handbook, shop-tracker]
source: Claude Code, from Dave's planning chat of 2026-10-24. Changed on 2026-11-10 from the Coin Rush game to Shop Tracker, scoped to one part of the app, with the switch to Fleetco's stack at week 6
---

## Overview

**Software Engineering Apprenticeship: Charlie's 12-Week Developer Handbook**

| | |
|---|---|
| **Project** | Shop Tracker, a small web app for a heavy-duty repair shop. For 12 weeks, one part of it: customers and their units |
| **Duration** | 12 weeks, flexible pace |
| **Time** | About 10 hours a week |
| **Approach** | Learn, build, test, review, repeat |
| **Weeks 1 to 5** | Plain JavaScript, HTML, CSS and Node.js |
| **Weeks 6 to 12** | Fleetco's stack: TypeScript, NestJS, PostgreSQL, React, Vitest and GitHub Actions |

The principles, working relationship, Codex rules and weekly report template live in
[[Apprenticeship Overview]]. What follows week 12 is in [[After the 12 Weeks]].

**What changed on 2026-11-10.** The first draft built a multiplayer game (Coin Rush) in plain
JavaScript for all twelve weeks, and left the real frameworks until afterwards. Dave changed two
things:

1. **A business app, not a game.** Shop Tracker is shaped like Fleetco: a website with real
   entities, realistic data and real rules.
2. **Real technologies sooner, on a smaller scope.** Five weeks of fundamentals, then the switch
   to Fleetco's stack one piece a week. To make room, the twelve weeks build one part of the app
   (customers, units and their maintenance) well, instead of the whole thing thinly. Service
   orders come next, in [[After the 12 Weeks]].

The lessons the game was teaching are still here:

| The game taught | Shop Tracker teaches it with |
|---|---|
| The server is the authority on scores | The server decides when maintenance is due, and refuses changes the rules don't allow |
| Game rules as state transitions | A unit moving between Active, Out of Service and Sold |
| Rooms, players and scores in a database | Customers, units, odometer readings and maintenance history, with real relationships |
| Leaderboards | Reports: overdue maintenance, units out of service, units per customer |
| Players cheating from the browser | Nobody can roll back an odometer or bring a sold unit back from the browser |

## Welcome

The goal of this program is to learn how professional software is built, tested, maintained and
delivered. You already know how to code games. This builds on that and introduces the tools and
practices used to develop real business applications.

You'll learn to:

- Use Git and GitHub to manage changes to a codebase.
- Work with JavaScript, Node.js and TypeScript.
- Understand how browsers, servers and HTTP requests work together.
- Build APIs with NestJS that accept requests and return data.
- Store and retrieve data in PostgreSQL.
- Build screens with React.
- Write tests that prove your code behaves correctly, and run them automatically.
- Use AI coding tools well without blindly trusting their output.
- Collaborate through issues, branches, pull requests and code reviews.
- Deploy a working application other people can use.

You'll apply all of it by building **Shop Tracker**. It's a much smaller cousin of the Fleetco app
Dave is building, on the same technologies, so the words, the data and the problems you meet are
the ones you'll meet on Fleetco afterwards.

**How to approach the work.** You are not expected to memorize everything or write every line
yourself. AI coding tools are part of modern development. You are responsible for understanding
the code you submit, verifying that it works and explaining your decisions. Getting stuck is
normal. Repeatedly accepting code you don't understand is not a fix.

## The app: Shop Tracker

A heavy-duty repair shop fixes trucks and trailers for fleet customers. The full Shop Tracker
would follow a repair from start to invoice. For these twelve weeks you build the part everything
else rests on: **who the customers are, what units they own, and what shape those units are in.**

1. A **customer** is a trucking company. It owns **units**: tractors, trailers, reefers.
2. Each unit has a unit number (the customer's own name for it, like `T-114`), a VIN, a year,
   make and model, and a **status**: *Active*, *Out of Service* or *Sold*.
3. The shop records **odometer readings** when a unit comes in.
4. Each unit has a **preventive maintenance (PM) schedule**, such as every 25,000 miles or every
   90 days, whichever comes first. The shop records when a PM was done.
5. The app shows which units are **due or overdue** for maintenance, and which are out of service
   and for how long.

The vocabulary is the industry's own and the same as Fleetco's (see [[Domain Model]]). Shops say
*unit*, never *vehicle*. Use these words in your table names, API paths and screens.

**The server is the authority for shared data.** The browser is a client, not a trusted source of
truth. The browser never decides that maintenance isn't due, never sends an odometer reading lower
than the last one and gets away with it, and never brings a sold unit back. The server checks all
of that. That's the same lesson as not trusting a player's score, and it's the most important one
in business software.

**Real data, safely.** The data should feel real: dozens of customers, a few hundred units with
real makes and models (Freightliner, Peterbilt, Kenworth, Great Dane, Utility), real-looking unit
numbers, and a year or two of odometer readings and maintenance history. You'll write a **seed
script** that generates it (week 8). Big enough that lists need searching and reports have
something to say. It is invented data. No Fleetco or OTC customer data goes into Shop Tracker,
ever.

For a real outside data source, the U.S. government's free vPIC service decodes a VIN into year,
make and model: https://vpic.nhtsa.dot.gov/api/. You'll call it in week 4.

**Why five weeks of plain JavaScript first.** NestJS and React save you from doing things by hand.
You only understand what they save you from if you've done it by hand once. Weeks 1 to 5 build
the same units feature without frameworks; weeks 6 to 9 swap each piece for the real tool, one a
week, so you can see what each one does.

**Keep it small.** No logins, no service orders, no parts, no invoices. If you finish early, go
deeper on what's here (tests, edge cases, the reports) before adding anything.

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
   model, customer, status).
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
   "add a unit", "show units due for maintenance"). Each issue says what done looks like.
2. Pick one small issue and create a branch for it.
3. Implement it and commit.
4. Open a pull request that links the issue.
5. Ask your mentor to review it.
6. Address the review comments and merge.
7. Deliberately create a merge conflict in a practice branch and resolve it.

From here on, every change goes through an issue, a branch and a reviewed pull request.

**Acceptance criteria**

- [ ] You can do the issue-to-pull-request workflow on your own.
- [ ] You can explain how to recover from a basic merge conflict.

**Codex prompt**

> Teach me Git branching and pull requests using my shop-tracker repository. Give me an exercise
> where I create a branch, make a change, commit it, open a pull request and resolve a merge
> conflict. Explain the commands and let me execute them myself.

---

## Phase 2: Fundamentals, by hand

### Week 3: JavaScript fundamentals and small programs

**Objective.** Build confidence writing small programs without a framework, on shop data.

**Learn**

- Variables, functions and objects
- Arrays and array methods (`filter`, `map`, `sort`, `reduce`)
- Modules and imports
- JSON and reading structured data
- Dates, and why they're harder than they look
- Error handling
- Basic automated tests (the built-in `node:test` runner for now)

**Resources**

- MDN JavaScript guide: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide
- Node.js learning resources: https://nodejs.org/learn
- Node.js test runner: https://nodejs.org/api/test.html

**Assignments**

Build three small programs:

1. **A unit list tool.** Given a list of units, filter by customer or status and sort by unit
   number or year.
2. **A maintenance-due calculator.** Given a unit's PM schedule (every N miles or N days), its
   last PM and its latest odometer reading, say whether it's *OK*, *Due soon* or *Overdue*.
3. **A report.** Read a JSON file of customers and units, and print units per customer and every
   unit that's overdue.

Keep the main logic and the program entry point in separate modules. Write tests for the
calculator and the filtering and sorting.

*Stretch:* a VIN has a check digit (the 9th character) calculated from the other 16. Write a
function that says whether a VIN is valid, and test it against a few real ones. You'll use it
again in week 10.

**Acceptance criteria**

- [ ] Each program runs from the terminal.
- [ ] The code is split into understandable functions.
- [ ] Tests cover normal cases and at least two edge cases (a unit with no PM yet, a reading
      exactly on the limit, an empty list).
- [ ] You can explain how data moves through each program.

**Codex prompt**

> Give me a JavaScript exercise that processes repair shop records: customers, truck units and
> maintenance schedules. Start with a small specification, not the solution. Let me implement it,
> then review my code for correctness, readability and edge cases. Suggest tests before suggesting
> improvements.

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

### Week 5: A server by hand

**Objective.** Receive real requests, run server-side code and return responses, with nothing but
Node.js. You'll replace this with NestJS in week 7, so pay attention to what's tedious.

**Learn**

- What a server process is
- Ports, URLs and HTTP request handling
- The built-in `node:http` module
- Request methods and paths
- Parsing JSON and returning status codes
- Basic input validation and error handling

**Resources**

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

Store everything in in-memory JavaScript objects. Validate input: a unit needs a unit number and a
customer that exists, and two units of the same customer can't share a unit number. Connect the
week 4 page to this server, and add a page that lists units.

Keep a list in your notes of everything you had to do by hand: routing, parsing, validation,
error responses. You'll tick it off in week 7.

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

---

## Phase 3: Switch to Fleetco's stack

One piece a week. Each week replaces something you built by hand with the tool Fleetco uses. The
app should keep working at the end of every week.

### Week 6: TypeScript, Vitest and CI

**Objective.** Add types to the code you already understand, and have GitHub check every change.

**Learn**

- Why types: the bugs from weeks 3 to 5 that TypeScript would have caught
- Everyday types, object types, unions and narrowing
- `tsconfig.json` and the compiler
- Reading compiler errors before asking Codex to fix them
- Vitest, the test runner Fleetco uses
- GitHub Actions and continuous integration

**Resources**

- TypeScript Handbook: https://www.typescriptlang.org/docs/handbook/intro.html
- Vitest: https://vitest.dev/guide/
- GitHub Actions documentation: https://docs.github.com/en/actions

**Assignments**

1. Convert the week 3 programs to TypeScript. Define `Customer`, `Unit`, `UnitStatus` and
   `PmSchedule` types.
2. Move the tests to Vitest.
3. Add a GitHub Actions workflow that runs the type check and the tests on every pull request.
4. Deliberately break a type and a test, push, and read the failures in GitHub.

**Acceptance criteria**

- [ ] The compiler passes with `strict` on.
- [ ] A pull request isn't ready until the checks pass.
- [ ] You can explain a TypeScript error in your own words before fixing it.

**Codex prompt**

> I'm converting a small JavaScript project to TypeScript. Teach me as we go: before you change a
> file, tell me what types you'd add and why, and ask me to predict what errors the compiler will
> raise.

### Week 7: NestJS

**Objective.** Rebuild the week 5 server in NestJS, and see what a framework does for you.

**Learn**

- Modules, controllers and services
- Dependency injection
- Validating request bodies with Zod (as Fleetco does)
- Exceptions and status codes
- Testing a service and testing an endpoint

**Resources**

- NestJS First Steps: https://docs.nestjs.com/first-steps
- Zod: https://zod.dev/

**Assignments**

1. Create a NestJS app in the repo, with a `customers` module and a `units` module.
2. Rebuild every week 5 endpoint. Keep the data in memory for one more week.
3. Validate input with Zod schemas.
4. Point the week 5 browser pages at the new server.
5. Go back to your week 5 list and tick off what NestJS now does for you. Write down anything it
   doesn't.

**Acceptance criteria**

- [ ] Every week 5 endpoint behaves the same, including the errors.
- [ ] Tests cover the units service and at least two endpoints.
- [ ] You can trace a request from the controller through the service and back.

### Week 8: PostgreSQL and real data

**Objective.** Make the data permanent, and fill the app with data that feels real.

**Learn**

- Why in-memory data disappears when a process restarts
- Tables, rows, primary keys and foreign keys
- SQL: `SELECT`, `INSERT`, `UPDATE`, `WHERE`, `JOIN`, `ORDER BY`, `GROUP BY`
- Parameterized queries
- Migrations: changing the database with code
- Drizzle, the query library Fleetco uses

**Resources**

- PostgreSQL tutorial: https://www.postgresql.org/docs/current/tutorial.html
- Drizzle: https://orm.drizzle.team/docs/overview

**Assignments**

1. Create `customers`, `units`, `odometer_readings` and `pm_records` tables with migrations. A
   unit belongs to a customer (a foreign key).
2. Write a few queries in plain SQL first, in `psql`, until you can read them easily.
3. Move the NestJS services onto PostgreSQL with Drizzle. For each query, look at the SQL it
   generates.
4. Write a **seed script** that fills the database with realistic data: about 25 fleet
   customers, 300 units with real makes, models and years, and a year or two of odometer readings
   and PM history.
5. Add search and paging to `GET /units`, because 300 rows is too many for one page.

Run the integration tests against a separate test database.

**Acceptance criteria**

- [ ] Records survive a server restart.
- [ ] The seed script can rebuild the database from scratch with one command.
- [ ] No query is built by gluing untrusted input into a string.
- [ ] You can explain how the API, the service code and the database relate.

### Week 9: React

**Objective.** Rebuild the screens in React, the way Fleetco's are built.

**Learn**

- Components, props and state
- Thinking in React: breaking a screen into components
- Forms and validation
- Loading data from an API, and loading and error states
- Routing between pages
- Vite, Fleetco's build tool

**Resources**

- React Learn: https://react.dev/learn
- Thinking in React: https://react.dev/learn/thinking-in-react
- Vite: https://vite.dev/guide/

**Assignments**

1. Create a React app with Vite in the repo.
2. Build the **unit list**: search, filter by customer and status, and paging from your API.
3. Build the **unit detail** page: the unit, its odometer readings and its PM history.
4. Rebuild the **Add Unit** form, including Decode VIN, with the errors shown next to the right
   fields.
5. Retire the plain HTML pages.

**Acceptance criteria**

- [ ] The React app does everything the plain pages did.
- [ ] Every screen handles loading, empty and error states.
- [ ] You can trace a button click through the component, the HTTP request, the controller, the
      service and the database query.

---

## Phase 4: Make it a real product

### Week 10: The rules of the shop

**Objective.** Put the business rules on the server, test them, and build the reports.

**Learn**

- Business rules versus validation
- State and state transitions
- Unit testing business rules
- SQL for reports

**Assignments**

Write these rules in the units service, not in the browser, and test every one:

- A unit's status moves between *Active* and *Out of Service*. Going out of service needs a
  reason. *Sold* is final: a sold unit can't be edited or brought back.
- Keep a history of status changes, so the app can say how long a unit has been out of service.
- An odometer reading can't be lower than the unit's last one.
- A VIN must be valid (your week 3 check digit) and can't belong to two units.
- Whether PM is due is calculated by the server from the schedule, the last PM and the latest
  reading. The browser never sends it.

Then build three reports, as API endpoints and React pages:

- Overdue and due-soon maintenance
- Units out of service, and for how long
- Units per customer, by status

Finally, check that the server refuses each forbidden change even when the request comes from
`curl` instead of your React app.

*Stretch:* a live **yard board** of out-of-service units that updates in every open browser
without a refresh, first by polling, then with Server-Sent Events (what Fleetco uses).

**Acceptance criteria**

- [ ] The rules work independently of the browser and the HTTP layer.
- [ ] Tests show a sold unit can't change and an odometer can't go backwards.
- [ ] You can explain which layer each rule lives in, and why it's there.

### Week 11: Deployment and cloud fundamentals

**Objective.** Understand how an application runs outside your own computer.

**Learn**

- Development versus production environments
- Environment variables and secrets
- Hosting a server process and a React app
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

- [ ] Someone else can open the deployed app, add a unit, take it out of service and see it on
      the reports.
- [ ] You can find the server logs and explain the main components involved in serving a request.

*Open: the hosting target for this week isn't decided yet. See [[Apprenticeship Overview]].*

### Week 12: Ship, demonstrate and review

**Objective.** Complete a small delivery cycle on your own.

**Assignments**

1. Fix remaining bugs.
2. Review and improve the README.
3. Document the database model (a diagram of the tables) and the API endpoints.
4. Review open issues and known limitations.
5. Demo the app to your mentor: add a unit with a decoded VIN, record readings, show it going
   overdue, and take it out of service.
6. Present one bug you hit, how you diagnosed it and how you fixed it.
7. Compare Shop Tracker with Fleetco's [[Domain Model]]: what Fleetco has around units that yours
   doesn't, and what service orders would need from your tables.

**Acceptance criteria**

- [ ] You can demo the app, explain its architecture, show the tests and describe how a change
      travels from your local branch to the deployed app.
- [ ] You can point to parts of the code you don't fully understand and explain how you'd
      investigate them.

**Final milestone.** Someone else uses the deployed app, reports a bug, and you reproduce,
diagnose and fix it through a reviewed pull request.

---

## Checkpoint at week 5

Before switching to TypeScript and the frameworks, reassess. Can you explain and extend the
plain version on your own: the JavaScript programs, the page talking to your server, and the
server's routing and validation? If so, start week 6. If not, spend another week there. The
frameworks are much easier to learn when you know what they're doing for you, and much harder
when you don't.
