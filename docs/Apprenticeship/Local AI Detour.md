---
status: living
summary: The interlude between Week 2 and Week 3 — a local Ollama chat app, then a quiz the AI grades
created: 2026-11-12
updated: 2026-11-12
tags: [fleetco, apprenticeship, charlie, handbook, ollama, ai]
source: Claude Code, from Dave's session notes of 2026-11-12
---

## Overview

**The code lives in `docs/Apprenticeship/starters/`.** `ollama-chat/` is the source of truth,
`ollama-chat.zip` is what gets sent to Charlie, and `build-zip.sh` rebuilds the zip from the folder
after any change. Edit the folder, run the script, send the zip.

An interlude in [[Shop Tracker Handbook]], taken after Week 2 and before Week 3. Two small
projects, each its own repository, neither one part of Shop Tracker:

1. **`ollama-chat`** — a console chat app that talks to a model running on your own computer.
2. **`quiz-ai`** — your quiz app rebuilt so the AI writes the questions and grades free-text
   answers, instead of you writing four choices and comparing letters.

It exists because of what you already built. In `test-test` you used `async` and `await`, and when
Dave asked why, the honest answer was "the error told me to." That answer is fine once. The way to
stop needing it is to write code where asynchrony is the whole point: a request leaves your
computer, time passes, something comes back, and it might come back broken. Chatting with a model
is the clearest small version of that problem, and it is far more interesting than a toy exercise
about timers.

It also puts the hardest parts of Week 3 to Week 5 in front of you early, on a subject you want to
work on anyway: HTTP by hand, JSON in both directions, streams, timeouts, error handling, and code
that is split into modules so it can be tested.

**Where it sits.** The twelve weeks keep their numbers; this is not Week 3. Expect it to take two
to three weeks of real time. Week 3 then goes faster, because you will already have met most of
its JavaScript.

| Before | This interlude | After |
|---|---|---|
| Week 2: issues, branches, pull requests | `ollama-chat`, then `quiz-ai` | Week 3: JavaScript fundamentals, on shop data |

**Why local, and not an API key.** A model on your own machine costs nothing per request, works
with no internet, and keeps your data on your computer. You can therefore experiment without
anyone watching the bill, and you will learn more, because nothing is hidden behind someone
else's service. Fleetco will run models both ways, and the reasons are the same ones you are about
to feel directly.

## Before Project A: the warmup

Charlie wrote working `await` code in `test-test` and, asked why, said the error told him to.
Project A assumes `async` and `await` are at least familiar, so there is a warmup first. It lives
**inside** `ollama-chat` rather than in a repo of its own, because one repo is one assignment, and
because the warmup's fake model is deliberately the same shape as the one he writes in Phase 1.

**How it gets to him.** Nobody but Charlie can create a repo under his own account, so it goes over
Slack as `starters/ollama-chat.zip` (no `.git` inside) and **he creates the repo himself** and
makes the first commit. That is Week 1 practice for the third time, and it means the history is his
from the start rather than inherited.

**The design.** Nine small programs. Running them is not the work — **writing down what he thinks
will happen first** is the work. The deliverable is `NOTES.md`, full of predictions, including the
wrong ones. That shape was chosen because it is the one exercise Codex cannot do for him: a
prediction he did not make himself is worth nothing, and he will be able to tell. The README gives
him a legitimate use for Codex instead — *after* each exercise, "I predicted X, it printed Y,
explain why I was wrong, write no code."

**The video is somebody else's and better than anything written here.** Philip Roberts, "What the
heck is the event loop anyway?" — 26 minutes, JSConf EU, free, and the best explanation of this
subject that exists: https://www.youtube.com/watch?v=8aGhZQkoFbQ.

**The visualizer is The Event Loop, Visualized** (https://jseventloop.tech/). Two others were tried
and rejected first, both driven in a browser on 2026-11-12:

| Tool | Why not |
|---|---|
| **loupe** (the one in the talk) | No output panel at all: `console.log` goes to devtools, nothing on the page, so it looks broken. Parses with 2014 esprima, so `async`, `await`, `const` and arrows are silently discarded. Fixed 750ms steps |
| **JS Visualizer 9000** | Better: on-page output, a Step button, a microtask queue. But **still a syntax error on `async`/`await`** |

The third one handles `async`/`await` properly, which was Dave's requirement. It also has what
neither of the others had:

- **A built-in console pane**, so output is on the page.
- **Step forwards and backwards**, at any speed, with the step number in the URL.
- **Three explanation levels** for the same animation: "Explain simply", "Developer", "Under the
  hood". Charlie starts simple and re-walks it as a developer.
- **A prediction question before every scene**, multiple choice, with a "skip" link he is told not
  to use. The tool does the predict-then-check that the warmup was hand-rolling.
- **Fifteen curated scenes**, linked in a chain, each with a written explanation underneath.

**Its Playground will not run the warmup files.** Checked on 2026-11-12 by pasting warmup code in:
it takes a deliberately tiny grammar -- `console.log`, `setTimeout(fn, ms)`, `.then` chains,
`queueMicrotask`, `await Promise.resolve()`, `await new Promise(r => setTimeout(r, ms))`, and calls
to declared functions. No `const`, no loops, no arrays, no `require`, and you cannot `await` your
own async function. Anything else gets a red "Can't visualize this yet". It simulates the event
loop rather than executing code, which is how it can show the queues at all.

That mattered while an earlier draft claimed a scene **was** `warmup/01-blocking.js` and offered a
paste-in snippet. Both are gone, along with the section warning about the Playground: with nothing
pointing Charlie at it, he has no reason to go there. Part 1 is five links he clicks, Part 2 is
eight files he runs with `node`. If a future edit reintroduces "try your own code here", the
warning has to come back with it.

Five scenes are picked, ordered so each maps to something Charlie will actually do: `sync-basics`, `blocking-loop` (same idea as `01`),
**`async-await`**, `fetch-then` (the real shape, and what the chat app does), and `promise-all`
(the `04` versus `05` choice, three seconds versus one). All return 200, checked.

The README quotes the site's own description of `await` splitting a function in two and leaving the
frame suspended rather than blocked, then restates it plainly: **`await` does not stop your program,
it steps the function out of the way and comes back when the answer shows up.** Followed by the two
consequences that bite in Phase 1: code before the first `await` runs immediately, and every
`await` costs a trip through the queue even when the value is already there.

Everything about `async`/`await` itself moves to `warmup/`. Nothing online does the
predict-and-check part, which is why it is hand-built. The closest things, if Charlie wants more
reading: javascript.info's promises chapter (https://javascript.info/async, good, with exercises)
and MDN's asynchronous JavaScript module. Both explain well; neither makes him commit to an answer
before he finds out.

**The capstone is in his own repo, and it is the whole point.** He opens his own `test-test`, deletes
the word `await` from `const response = await rl.question(...)`, predicts, and runs it. All five
questions flash past and he scores zero, because `response` holds a pending promise and a promise
is never equal to `"A"`. His own code, his own bug, an absurd result. Then he writes three or four
sentences on why that code needed `await`, with no AI. That paragraph is how Dave knows the lab
worked.

### Answer key — Dave's copy

Charlie works from the repo's README and should not see this. Every output below was run and
confirmed on Node 24.

| | Answer | What it is for |
|---|---|---|
| **01** | Roughly **0 dots** during `sleepSync(1000)`, **10 dots** during `await sleep(1000)` | The difference between waiting and being stuck, visible on screen. The whole lab in one run |
| **02** | `1, 2, 4, 3` | `2` before `4` is the surprise: an `async` function body runs synchronously until it hits the first `await`. `3` last |
| **02 stretch** | `1, 2, 4, 7, 6, 5, 3` | Advanced and not the point. The point is that every synchronous line ran before anything that waited. Do not let him think he has to memorize microtask ordering |
| **03 A** | `A: Promise { <pending> }` | The moment. `return 6` gives back a promise, always. He has certainly seen this and worked around it without knowing why |
| **03 B / C** | `B: 6` and `C: 6` | Two ways to open the envelope: `.then()` and `await` |
| **03 D** | `SyntaxError: await is only valid in async functions and the top level bodies of modules` | Deliberately the exact error he hit in `test-test`. Now it is an answer rather than an instruction |
| **04** | `3.00s`, each unit arriving a second apart | A loop with `await` is sequential |
| **05** | `1.00s` | `Promise.all` starts all three, then waits for the slowest |
| **05 discussion** | Each call depends on the previous result; you would flood the server; order of writes matters; you want to stop at the first failure; rate limits | The real question. "Always use `Promise.all`" is the wrong lesson and this is where it gets headed off |
| **06** | `0 units in 0.00s` | Silently, instantly wrong. `forEach` does not wait for an `async` callback, and nothing warns you. Fixes: `for...of`, or `Promise.all(map(...))` |
| **07 a** | Caught, then "still running" | The ordinary case |
| **07 c** | Caught the first rejection; the other two still ran and their results are thrown away | Leads to `Promise.allSettled` |
| **07 b** | Prints "no error here" and "finished", **then the process dies with an unhandled rejection and exit code 1** | The scariest one. A missing `await` means `try`/`catch` cannot see the error — the block exits before the rejection arrives. Run it last |
| **08** | About `0.9s` sequential versus `0.3s` parallel, varying run to run. The three VINs decode to a 2012 Freightliner Cascadia, a 2007 Kenworth W9 and a 2017 Mack | Real waiting, real variance |
| **08 `NOTAVIN`** | **HTTP 200 with an error code in the body.** The request succeeded; the answer is a failure | The best question in the lab. "Did it work?" has two different answers and his code has to check both |
| **capstone** | Five questions flash past, score 0 out of 5. `response` is a pending promise, which never equals `"A"` | His code, his bug |
| **L1 to L5** | Stack empties before the queue runs; timers fire in time order, not code order; clicks pile up in the queue | Loupe. Why waiting needs somewhere to wait |

**Where the time goes.** Video 26 minutes, loupe 15, the warmup about an hour, the capstone 15.
That is one session, with Phase 1 below as the next one. If 06 and 07b do not land, those two are
worth a session on their own: a silently empty array and a process that dies after printing
"finished" are the two failures he will actually meet in Phase 1.

## Project A: `ollama-chat`

Split into two sessions, and the split is the lesson. **Phase 1 builds the entire app against a
fake model**, so nothing is installed and nothing is on the network. **Phase 2 writes the real
model behind the same function** and changes one import.

### What a model is, taught before he writes a fake one

Charlie has used Codex for weeks and nobody has told him what is behind it. He is about to write
`fakeAiModel.js`, which makes this the moment. Ten minutes in the repo README, pitched at someone who
has never heard the word.

**It opens by separating the two meanings of "model", because they collide here.** Dave read
`fakeAiModel.js` as a database record on first encounter, which is the *other* standard meaning and
the one Shop Tracker uses from Week 6 onward (see [[Domain Model]]). If it caught Dave it will
catch Charlie, and he meets both senses within a few weeks of each other. The README gives him the
test: a **data model is a shape** that describes information, an **AI model is a thing that runs**
and answers. "Add a field to the model" versus "which model are you running". It also points out
that his `units.json` objects were already a data model, so he has met one without the word.

The files Charlie writes are **`fakeAiModel.js`** and, next session, **`ollamaAiModel.js`**. Dave
asked for the `Ai` after going looking for `fakeModel.js` in the zip: the word "model" alone reads
as a database record to anyone with a server background, and both senses are about to be in play.
"Model" still appears on its own everywhere else, because that is what the Ollama world calls it
and the API field is literally `model` -- renaming the concept would teach him a word nobody uses.
Spelling it out in the filenames is the cheap half of the fix. The warmup's fake is
`warmup/lib/aiModel.js` for the same reason.

**Neither file is in the zip.** Charlie writes both, and the README now says so in bold at the top
of Part 3, because Dave went looking for `fakeAiModel.js` and could not find it. The only code
handed over is `warmup/`.

Then the AI meaning:

- A model is **a file**, full of numbers. Not a program, not a database, not a lookup table.
- The numbers came from training. Nobody wrote rules.
- It does **one** thing: given the text so far, guess what comes next, then do it again.
- "3B" is the parameter count, and the file size is roughly what it needs in memory. Real figures,
  checked against ollama.com/library on 2026-11-12: `llama3.2:1b` 1.3 GB, `llama3.2:3b` 2.0 GB,
  `llama3.1:8b` 4.9 GB, `llama3.1:70b` 43 GB, `llama3.1:405b` 243 GB.
- **Ollama is not the model.** It is the program that loads one and runs it.
- **The model remembers nothing.** Every request starts from zero.
- **Codex is a model too**, just bigger and on someone else's computer.

**The homework is a decision, not a reading.** He looks up three models, opens Task Manager to find
his own RAM and graphics memory, and **picks the model he will pull next session, with a reason**.
Next session he pulls the one he chose. That turns `ollama pull` from a command he copies into a
call he made and has to defend.

The fourth question — *if the model remembers nothing, who is doing the remembering?* — is left
open at the end of the section and answered by Phase 1, where `respond(messages)` takes the whole
conversation every time. The lesson lands because he met the question before he met the code.

### Phase 1 — the app, with a fake model

`fakeAiModel.js` exposes one function, `async respond(messages)`, and `chat.js` is built against it:
the readline loop, the conversation array of `{ role, content }` objects, `/exit`, `/clear`,
`/history`, and error handling. Three things make the fake earn its place:

1. **It thinks for half a second to a second and a half**, randomly, so the waiting is real and
   variable rather than instant.
2. **It reports what it can see** — "I can see 5 messages, your last one was 9 words." Conversation
   history is the one genuinely invisible thing in a chat app, and this makes it visible. It is
   also how `/clear` becomes provable instead of assumed, and it is the payoff for the question
   left open above.
3. **It throws if the last message contains "break"**, so there is an error worth catching.

The checkable rule: **`chat.js` must not know the model is fake.** If the word "fake" appears
anywhere outside `fakeAiModel.js`, the seam is not done. That is the same seam as the grader in
Project B, arriving two weeks early, discovered by needing it rather than by being told.

Stretch, both of which only work if the async is right: stream the reply one word at a time with
an async generator and `for await`, which is the exact shape the real NDJSON reader needs; and a
spinner while the model thinks, which is `warmup/01-blocking.js` turned into something useful.

### Phase 2 — the real model

Everything below, starting with installing Ollama. By the end of Phase 1 most of steps 4, 5, 7 and
9 are already done, so this session is mostly step 1, step 2 and the streaming reader.

**Objective.** Type a question in a terminal, get an answer back from a model running on your own
computer, and keep the conversation going.

### Learn

- What a model is, what a parameter count means, and what quantization trades away
- What it means for software to run as a **server** on your own machine, on a port
- HTTP from the client side: method, URL, headers, request body, status code, response body
- JSON as the thing on the wire, and objects as the thing in your program — and that they are
  not the same thing
- Promises, `async`/`await`, and what `await` actually waits for — groundwork done in the async
  lab above
- Streaming responses, and why a stream is not just a slower string
- Errors you cannot prevent: the server is not running, the model is not installed, the network
  hangs, the response is not what you expected

### Resources

- Ollama download: https://ollama.com/download
- Ollama model library: https://ollama.com/library
- Ollama API reference: https://github.com/ollama/ollama/blob/main/docs/api.md
- MDN, using `fetch`: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
- MDN, asynchronous JavaScript: https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Async_JS
- Node.js `readline/promises`: https://nodejs.org/api/readline.html

Node 18 and later have `fetch` built in. This project needs no npm packages at all. Resist
installing an Ollama client library: the point is to see the requests.

### Assignments

**1. Install Ollama and get a model.**

Install it for Windows, then from a terminal:

```
ollama pull llama3.2:3b
ollama run llama3.2:3b
```

Talk to it for a few minutes, then `/bye`. Start at 3B parameters: it runs on a CPU and answers
quickly. If your desktop has a graphics card with 8 GB of memory or more, also pull something
bigger (`qwen2.5:7b` or `llama3.1:8b`) and notice the difference in both speed and answer quality.

Then run `ollama list` and `ollama ps`. `ps` tells you which model is loaded and whether it is
running on your GPU or your CPU. Write down, in your notes, what that difference costs you in
seconds.

**2. Find the server.** Ollama is not just a command. It runs a server, on
`http://localhost:11434`, and `ollama run` is one client of it. Prove that to yourself before
writing any code:

```
curl http://localhost:11434/api/tags
```

Then ask it something with `curl`, and read what comes back:

```
curl http://localhost:11434/api/generate -d "{\"model\":\"llama3.2:3b\",\"prompt\":\"Say hello in five words\",\"stream\":false}"
```

Do this step with `curl` before you write JavaScript. When your program misbehaves later, `curl`
is how you find out whether the problem is your code or the server.

**3. One question, one answer.** Write `ask.js`: it takes a question as a command-line argument,
sends one `POST` to `/api/generate`, and prints the answer.

Predict, before you run it, what `await` is waiting for in each place you wrote it. Then check
whether you were right.

**4. Keep asking.** Add a loop with `readline/promises`, so you can ask question after question
until you type `/exit`. You have done this once already in `test.js`, so it should feel familiar —
which is the point.

**5. Give it a memory.** Your loop from step 4 has no memory: ask "who was the first president?"
then "when was he born?" and watch it fail. Switch from `/api/generate` to `/api/chat`, which
takes an **array of messages** with a `role` of `system`, `user` or `assistant`, and send the
whole conversation each time. Add a `/clear` command that empties the history, and a `/history`
command that prints it.

Then answer this in your notes: *the model remembers nothing between requests, so who is actually
remembering the conversation?* Everything you will later learn about conversational AI follows
from the answer.

**6. Make it stream.** Right now you are sending `"stream": false` and waiting, sometimes for a
long time, in silence. Remove it — streaming is Ollama's default — and watch `await response.json()`
break. It breaks because the body is no longer one JSON document; it is a sequence of JSON
documents, one per line, arriving over time.

Read the body as it arrives and print each piece of text as it comes, so words appear the way they
do in `ollama run`. Keep the final message in your history.

This is the hardest part of the project and the one most worth your time. Do not let Codex hand
you a finished reader. Ask it to explain what `response.body` is, what a chunk is, and why a chunk
can end in the middle of a line — then write the loop yourself and let it review your code.

**7. Handle what goes wrong.** Each of these is a different failure and deserves a different
message to the user. Cause each one on purpose and see what your program currently does:

| What you do | What should happen |
|---|---|
| Stop Ollama, then ask a question | "Ollama is not running. Start it and try again," not a stack trace |
| Ask for a model you have not pulled | Report the model name and how to pull it |
| Ask something enormous, then press Ctrl+C | Stop cleanly, no half-written history |
| Set a 2-second timeout with `AbortController` | A clear "timed out" message, and the program keeps running |

**8. Add some controls.** Accept `--model` and `--temperature` as command-line options, with
sensible defaults. Try the same question at temperature 0 and at 1.5, several times each, and
write down what you see. Then set `"options": { "seed": 42, "temperature": 0 }` and ask the same
question twice. Explain the result.

**9. Split it up.** If Phase 1 was done properly this is already true, so use this step to check
it rather than to do it. `chat.js` should be separated into at least:

- a module that knows how to talk to Ollama, and nothing about terminals
- a module that knows about the terminal, and nothing about HTTP
- a thin entry point that wires them together

Then write your first real tests with the built-in runner (`node:test`): test the piece that parses
a stream chunk into text, and the piece that builds the message array, without a model running at
all. If you cannot test those without Ollama, the split is not finished.

### Acceptance criteria

- [ ] You can hold a multi-turn conversation, with history, and clear it.
- [ ] Answers stream in rather than appearing all at once.
- [ ] You can explain the difference between `/api/generate` and `/api/chat`, and why the second
      one needs you to send the whole conversation every time.
- [ ] You can explain, without looking it up, what each `await` in your code is waiting for.
- [ ] Every failure in the table above produces a sentence a person could act on.
- [ ] The tests run and pass with Ollama shut down.
- [ ] Your README lets someone else install Ollama, pull a model and run your app.

### Codex prompt

> Act as my mentor, not my autocomplete. I am writing a Node.js console app that talks to a local
> Ollama server, and my goal is to understand HTTP, promises and streams — not to finish quickly.
> Explain concepts with small examples and ask me questions. Do not write whole files for me. When
> I have written something, review it for correctness and edge cases and tell me what I have not
> handled yet.

## Project B: `quiz-ai`

**Objective.** Your quiz, with the AI doing the two things that are hard for free-text questions:
inventing them, and deciding whether an answer in the user's own words is right.

Start a new repository rather than editing `test-test`. The shape of the program changes
completely — modules, tests, a model behind a seam — and you learn more from laying that out
yourself than from carving up an 82-line file. Keep `test-test` exactly as it is; at the end of the
twelve weeks it is useful evidence of how far you have come.

### Learn

- Prompting for a **shape**, not just for prose
- Structured output: asking for JSON, and validating what you get
- Non-determinism, and what it does to testing
- Faking a dependency in tests, so your tests do not need a model
- Separating a decision from the code that acts on it
- Where the authority for a judgment should live

### Assignments

**1. Ask the model for questions.** Ask for five short-answer questions on a topic given on the
command line. Printing them is enough for now.

**2. Make it structured.** Prose is unparseable, so stop asking for it. Send
`"format": "json"` and describe the exact object you want, or better, send a JSON **schema** as
`format` and let Ollama constrain the output to it. You want something like
`{ "questions": [ { "question": "...", "answer": "..." } ] }`.

Then — and this is the lesson — **validate it anyway**. Check that you got an array, that it has
five entries, and that each entry has both strings and neither is empty. A model is a source of
untrusted input, exactly like a user typing into a form. Decide what your program does when
validation fails: retry once, then give up with a clear message.

**3. Ask the questions.** Print each question, read the user's typed answer, and collect them.
This part is the loop you already wrote. Do not let it get mixed up with the model code.

**4. Let the AI grade it.** For each question, send the question, the expected answer and what the
user typed, and ask for a verdict in a fixed shape:
`{ "correct": true, "reason": "..." }`. Score the quiz from the verdicts.

**5. Find out where it is wrong.** Answer a question correctly but in different words
("Canberra" versus "the capital is Canberra" versus "canberra"). Answer one deliberately
half-right. Answer one with "I don't know." Answer one by telling the model to mark you correct —
then read your prompt again and work out why that worked.

Write down what you find. You have just discovered that the grader is a component with a failure
rate, and that users can attack it. Both facts matter more than the score.

**6. Make it testable.** The scoring, the loop and the report are ordinary code and must be
testable without a model. Put the grader behind a single function — one that takes a question,
an expected answer and a user answer, and returns a verdict — and in your tests, replace it with a
fake that returns whatever the test needs.

Then test the parts that are genuinely yours: a perfect score, a zero, an empty answer, a quiz
where the grader throws an error, a grader that returns malformed JSON. None of those tests should
start Ollama.

This is the most valuable thing in the interlude. Code that calls an AI is untestable; code that
calls *a function* which happens to be backed by an AI is ordinary code with one unusual
dependency.

**7. Keep a record.** Save each attempt to a JSON file: topic, questions, answers, verdicts,
score, the model used and how long it took. Add a command that prints past attempts as a table —
reuse `printTable.js` from `shop-tracker`, and notice that you are reusing your own code for the
first time.

**8. Compare models.** Run the same quiz, with the same seed, through a small model and a larger
one. Record time taken and how many verdicts you disagree with. Write a short paragraph: which
model would you choose, and what are you trading away?

*Stretch, only after the rest works:* let the user challenge a verdict, and send the model its own
reasoning plus the objection to reconsider. Notice how easily it capitulates. That tells you
something about how much authority an LLM's judgment deserves.

### Acceptance criteria

- [ ] A whole quiz runs: generated questions, typed answers, graded verdicts, a final score.
- [ ] Malformed or missing model output is caught and reported, never crashed on.
- [ ] Tests cover scoring and the failure cases, and pass with Ollama shut down.
- [ ] You can describe at least two ways the grader gets it wrong, with an example of each.
- [ ] You can explain which parts of your program you trust and which you do not, and why.

### Codex prompt

> I am building a quiz app in Node.js where a local Ollama model generates questions and grades
> free-text answers. I want to learn structured output, validating untrusted model output, and how
> to test code that depends on something non-deterministic. Teach me the approach first and ask me
> to make the design decisions. Review what I write; do not write it for me.

## The parts worth slowing down for

If the interlude takes three weeks instead of two, spend the extra time here.

1. **Streaming.** Why a chunk is not a line, and why a line is not always a whole JSON document.
2. **Error taxonomy.** "It failed" is not a diagnosis. Server down, model missing, request
   malformed, response malformed, timed out, and cancelled by the user are six different things
   with six different messages.
3. **Non-determinism.** The same input can give a different answer. Everything you know about
   testing assumes otherwise, so you have to put the non-deterministic thing behind a seam.
4. **Untrusted output.** A model's reply is input to your program. Validate it like a form.
5. **Where authority lives.** You decided to let the model score the quiz. That was a design
   choice, and you found out it can be talked out of its verdict. Shop Tracker is the same question
   in a different suit: the browser must not decide whether maintenance is due, and a model must
   not be the last word on something that matters. See [[Shop Tracker Handbook]].

## What this is worth to Fleetco

Not a detour from the real work, as it turns out. Fleetco's own plans run agents against its data
and its API, and every problem in this interlude shows up there: structured output, validating what
a model returns, putting a model behind a testable seam, and keeping a model out of the position of
final authority. See [[AI Readiness]] and [[Agent Playbooks]]. You will meet this code again.

## Folding back in

When the interlude is done, go to Week 3 of [[Shop Tracker Handbook]] and expect it to be quick:
you will have met modules, array methods, JSON, error handling and `node:test` already. Spend the
time you save on the maintenance-due calculator and its edge cases, which is the part of Week 3
with real thinking in it.

Two things to carry forward:

- Week 5 builds an HTTP **server** by hand. You will have spent three weeks as a client, which is
  the best possible preparation: you already know what a client needs, because you were annoyed by
  servers that did not provide it.
- A fair stretch goal for Week 5 or later: add an endpoint to your own server that answers a
  question about the units by passing it to Ollama. That is the first time your two worlds meet.
