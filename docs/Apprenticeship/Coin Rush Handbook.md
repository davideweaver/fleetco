---
created: 2026-11-01
tags: [fleetco, apprenticeship, charlie, handbook, coin-rush]
source: Claude Code, from Dave's planning chat of 2026-10-24
---

## Overview

**Software Engineering Apprenticeship: Charlie's 12-Week Developer Handbook**

| | |
|---|---|
| **Project** | Coin Rush, a multiplayer browser game |
| **Duration** | 12 weeks, flexible pace |
| **Time** | About 6 to 8 hours a week |
| **Approach** | Learn, build, test, review, repeat |
| **Tools** | Git, GitHub, JavaScript, Node.js, HTML, CSS, PostgreSQL and Codex |

The principles, working relationship, Codex rules and weekly report template live in
[[Apprenticeship Overview]]. What follows week 12 is in [[After the 12 Weeks]].

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

You'll apply all of it by building **Coin Rush**. The game is the learning vehicle. The skills
transfer directly to professional projects.

**How to approach the work.** You are not expected to memorize everything or write every line
yourself. AI coding tools are part of modern development. You are responsible for understanding
the code you submit, verifying that it works and explaining your decisions. Getting stuck is
normal. Repeatedly accepting code you don't understand is not a fix.

## The game: Coin Rush

Friends open a URL, enter a nickname and join a shared game room. They collect coins, compete for
points and see a live leaderboard. The server keeps the authoritative score, so nobody can change
a value in their browser and claim a win. The theme can change to something more fun; the
technical exercises are what matter.

Start round-based, not real-time action. Real-time multiplayer brings synchronization, latency
and cheating problems that distract from the core lessons.

1. Players join a room with a short room code.
2. The server creates a round and assigns collectible targets.
3. Players submit actions to the server.
4. The server validates actions and updates scores.
5. The browser refreshes the displayed state by polling the server.
6. Later, WebSockets deliver live score and game-state updates.

This teaches a principle that matters just as much in business software: **the server is the
authority for shared data.** The browser is a client, not a trusted source of truth.

**Database approach.** Start with in-memory objects, so you see how a request changes server state
and how the client reads it. Then move to PostgreSQL (Fleetco's database), starting with one
`players` table and later `game_rooms`, `game_sessions` and `scores`. Use plain SQL and
parameterized queries through the Node.js `pg` package before any ORM.

## Your weekly routine

Aim for four or five sessions a week, around school and sports. A typical 75 to 90 minute
session:

| Step | Time | What |
|---|---|---|
| **Learn** | 15 min | Read documentation or work through a lesson |
| **Build** | 45 to 60 min | Apply it to your project |
| **Verify** | 10 min | Run the program or tests, investigate problems |
| **Record** | 5 min | Commit your work and note what you learned |

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
  workflow on your own `coin-rush` repo)
- Node.js learning resources: https://nodejs.org/learn
- Git documentation: https://git-scm.com/doc

**Assignments**

1. Install Git, Node.js LTS and your editor.
2. Configure your Git identity.
3. Create a GitHub repository called `coin-rush`.
4. Clone it onto your computer.
5. Write a JavaScript program that prints a welcome message.
6. Change it, commit the change and push to GitHub.
7. Write a README explaining how to run the program.

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

1. Create a GitHub issue describing a small feature.
2. Create a branch for it.
3. Implement it and commit.
4. Open a pull request.
5. Ask your mentor to review it.
6. Address the review comments and merge.
7. Deliberately create a merge conflict in a practice branch and resolve it.

**Acceptance criteria**

- [ ] You can do the issue-to-pull-request workflow on your own.
- [ ] You can explain how to recover from a basic merge conflict.

**Codex prompt**

> Teach me Git branching and pull requests using my coin-rush repository. Give me an exercise
> where I create a branch, make a change, commit it, open a pull request and resolve a merge
> conflict. Explain the commands and let me execute them myself.

---

## Phase 2: Understand JavaScript and the web

### Week 3: JavaScript fundamentals and small programs

**Objective.** Build confidence writing small programs without a framework.

**Learn**

- Variables, functions and objects
- Arrays and array methods
- Modules and imports
- JSON and reading structured data
- Error handling
- Basic automated tests

**Resources**

- MDN JavaScript guide: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide
- Node.js learning resources: https://nodejs.org/learn

**Assignments**

Build three small programs:

1. A player-score calculator.
2. A leaderboard that sorts players by score.
3. A program that reads a JSON file of players and produces a report.

Keep the main logic and the program entry point in separate modules. Write tests for score
calculation and leaderboard sorting.

**Acceptance criteria**

- [ ] Each program runs from the terminal.
- [ ] The code is split into understandable functions.
- [ ] Tests cover normal cases and at least two edge cases.
- [ ] You can explain how data moves through each program.

**Codex prompt**

> Give me a JavaScript exercise that processes game-player records. Start with a small
> specification, not the solution. Let me implement it, then review my code for correctness,
> readability and edge cases. Suggest tests before suggesting improvements.

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

Use MDN selectively, based on what you already know. You don't need every lesson.

**Assignments**

1. Make a simple page with a nickname form.
2. Add a button that sends a request with `fetch()`.
3. Open the browser developer tools and the Network panel.
4. Identify the request URL, method, status code, headers and response body.
5. Show the server response on the page.

You can mock the response for now. Next week connects the page to a real server.

**Acceptance criteria**

- [ ] You can explain the difference between browser-side and server-side code.
- [ ] You can inspect an HTTP request and response without guessing what happened.

**Codex prompt**

> Help me build a plain HTML, CSS and JavaScript page that submits a nickname and displays a JSON
> response. Don't use React or another framework. Explain DOM events, fetch, promises and HTTP
> status codes as we go.

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
- `POST /players`: accept a nickname and create a player
- `GET /players`: return the current players

Store players in in-memory JavaScript objects for now. Connect the week 4 page to this server.

**Acceptance criteria**

- [ ] The server accepts real HTTP requests.
- [ ] The browser can create and retrieve players.
- [ ] Invalid input returns an appropriate error response.
- [ ] You can explain how a request reaches the right handler and how the response goes back.

**Codex prompt**

> Help me implement a small HTTP server using only Node.js built-in modules. I want to understand
> request routing, JSON parsing, response status codes and error handling. Ask me to predict the
> behavior of each endpoint before we test it.

### Week 6: Persistence, tests and debugging

**Objective.** Understand the difference between temporary application state and persistent
storage.

**Learn**

- Why in-memory data disappears when a process restarts
- What a database is for
- Relational tables, rows and primary keys
- SQL basics
- Parameterized queries
- Automated tests and debugging

**Resources**

- PostgreSQL tutorial: https://www.postgresql.org/docs/current/tutorial.html
- Node.js test runner: https://nodejs.org/api/test.html
- Node.js PostgreSQL client (`pg`): https://node-postgres.com/

**Assignments**

Start with a small persistence example, then move player records into PostgreSQL. Create a
`players` table with an ID, nickname and creation timestamp. Implement:

- Create a player
- Get a player by ID
- List players
- Reject invalid input
- Handle a player that doesn't exist

Write automated tests for the important behavior, using a separate test database or isolated
test data.

**Acceptance criteria**

- [ ] Player records survive a server restart.
- [ ] SQL queries use parameters, never string-concatenated untrusted input.
- [ ] Tests cover successful requests and failure cases.
- [ ] You can explain how the HTTP server, application code and database relate.

---

## Phase 4: Build Coin Rush

### Week 7: Implement game rules

**Objective.** Separate game logic from HTTP handling and browser presentation.

**Learn**

- Splitting modules by responsibility
- Game state and state transitions
- Server-side validation
- Basic application design
- Unit testing business rules

**Assignments**

Implement a simple round-based game: players join a room, receive a game state and submit an
action to earn points. Define rules such as:

- A round has a start and end time.
- Only players in the room can take part.
- Each valid action can earn points.
- The server calculates scores.
- A round can't be scored after it ends.

Write tests for valid actions, invalid actions and actions submitted after the round ends.

**Acceptance criteria**

- [ ] The game rules work independently of the browser and the HTTP layer.
- [ ] Tests show that invalid actions can't award points.

### Week 8: Rooms, records and leaderboards

**Objective.** Build the core multiplayer data model.

**Assignments**

Add database records for game rooms, sessions and scores. Implement endpoints to:

- Create a room
- Join a room
- Get the current game state
- Submit a game action
- Get the leaderboard

Add a simple room-code system, and make sure a player's submitted score is never trusted.

**Acceptance criteria**

- [ ] Two browser sessions can join the same room and see consistent server-managed scores.
- [ ] Data that should persist is stored in the database.

### Week 9: Make it multiplayer in real time

**Objective.** Understand polling versus real-time communication.

**Learn**

- Polling and its trade-offs
- WebSockets
- Connection lifecycle and disconnects
- Shared state and concurrent actions
- Basic rate limiting and abuse prevention

**Resources**

- MDN WebSockets API: https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API

**Assignments**

1. First implement simple polling: the browser periodically asks for the latest game state.
2. If the fundamentals are solid, move live score updates to WebSockets.
3. Test with several browser windows and simulate disconnects.

**Acceptance criteria**

- [ ] Players see updates from the same game session.
- [ ] The server stays authoritative.
- [ ] Disconnecting or refreshing a browser doesn't silently create invalid scores.

Don't rush into WebSockets to hit the schedule. If HTTP or persistence isn't solid yet, stay
there.

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

1. Add tests for important game behavior.
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

1. With your mentor, deploy a development version of Coin Rush.
2. Use a separate development database and appropriate access controls.
3. Never commit credentials or secrets to GitHub.
4. Document how to deploy, read the logs and recover from a failed deployment.

**Acceptance criteria**

- [ ] A friend can open the deployed app and play a basic round.
- [ ] You can find the server logs and explain the main components involved in serving a request.

*Open: the hosting target for this week isn't decided yet. See [[Apprenticeship Overview]].*

### Week 12: Ship, demonstrate and review

**Objective.** Complete a small delivery cycle on your own.

**Assignments**

1. Fix remaining bugs.
2. Review and improve the README.
3. Document the database model and API endpoints.
4. Review open issues and known limitations.
5. Demo the game to your mentor and a few friends.
6. Present one bug you hit, how you diagnosed it and how you fixed it.
7. Say what you'd improve in a second version.

**Acceptance criteria**

- [ ] You can demo the app, explain its architecture, show the tests and describe how a change
      travels from your local branch to the deployed app.
- [ ] You can point to parts of the code you don't fully understand and explain how you'd
      investigate them.

**Final milestone.** A friend opens the deployed URL, plays, and reports a bug that you reproduce,
diagnose and fix through a reviewed pull request.

---

## Checkpoint after the foundation phase

Treat the first stretch (workstation and Git, small JavaScript programs and async code, a plain
HTML and JavaScript client talking to a basic Node HTTP server, then tests, persistence and a
little server-side game logic) as a foundation phase, and reassess before building the game out.
If you can independently explain and extend that application, you're ready for database-backed
features and the full game. If not, spend more time there. That's the foundation everything else
stands on.
