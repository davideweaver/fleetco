# ollama-chat

A console chat app that talks to an AI model running on your own computer.

## First, make this yours

These files are not a repo yet. Make one:

1. Create a new repository on GitHub called `ollama-chat`.
2. Clone it to your desktop.
3. Copy everything from the zip into it.
4. Commit and push.

Everything after that is your own history on top of a starting point.

You are building it in two sessions. **This session you build everything except the
AI.** Next session you install Ollama and plug in the real model, and if you do this
session right, almost nothing else has to change.

Three parts, in order:

1. **The visualizer** - 15 minutes, watch how JavaScript handles waiting.
2. **`warmup/`** - eight small programs. Predict the output, then run it.
3. **The app** - the chat loop, built against a fake model you write yourself.

---

## Part 1: watch how JavaScript waits (15 minutes)

Watch the video first if you haven't: https://www.youtube.com/watch?v=8aGhZQkoFbQ

Then work through these at **The Event Loop, Visualized**: https://jseventloop.tech/

It shows your code running across five boxes: the **call stack**, **Web APIs**, the
**microtask queue**, the **callback queue**, and a **console** where your output appears.
You step through one tick at a time with the arrow keys, forwards or backwards, as slow as
you like.

Two things to set up before you start:

- **Pick "Explain simply"** at the top left. There are three voices for the same animation:
  simple, Developer, and Under the hood. Start simple. Switch to Developer on the second
  pass and see how much of it you now follow.
- **Each one opens with a prediction question.** Answer it before you watch. There is a
  "skip the prediction" link. Don't use it. Getting it wrong and finding out why is the
  entire value of the exercise.

### The five scenes, in order

| | Scene | Shows |
|---|---|---|
| 1 | [One thing at a time](https://jseventloop.tech/play/sync-basics) | Logging running in sequence, with nothing async involved |
| 2 | [Blocking the loop](https://jseventloop.tech/play/blocking-loop) | A loop blocking everything, so a waiting timer never runs |
| 3 | [async/await, unmasked](https://jseventloop.tech/play/async-await) | `await` stepping a function aside part-way, and the rest of the code carrying on |
| 4 | [fetch, a real network wait](https://jseventloop.tech/play/fetch-then) | `fetch` making a network request, and not blocking while it waits |
| 5 | [Promise.all, waiting in parallel](https://jseventloop.tech/play/promise-all) | Two waits running at the same time instead of one after the other |

Write your prediction and the real answer for each one in `warmup/NOTES.md`.

Scene 5 is worth a second look. The two waits start when you **call** the function, not when you
`await` it. `await` does not start the work. That is the real difference between `warmup/04` and
`warmup/05`.

### What is `fetch`?

`fetch` is how JavaScript asks another computer for something over the internet. You give it a web
address, it sends the request, and the answer comes back some time later.

That "some time later" is the reason async exists: a round trip can take 20 milliseconds or 5
seconds and you cannot know which in advance. `warmup/08` uses `fetch` to ask the government's VIN
service about three trucks, and it is how you will talk to Ollama next session.

Scene 4 writes it with `.then()` rather than `await`. Same machinery, older spelling, and you will
see both in real code.

### Don't try to run the warmup files on that site

The site has a "Playground" where you can type your own code. Skip it. If you paste a warmup
file in, it refuses in red and you will think you broke something.

It accepts only a tiny slice of JavaScript: `console.log`, `setTimeout`, `.then()` chains, and a
couple of `await` shapes. No `const`, no loops, no arrays, no `require`. The warmup files are
nowhere near that.

**Why so limited?** Because it is not running your code. It is a **simulator**: it reads the code,
works out what the event loop would do, and animates that. A real JavaScript engine runs your code
properly but can show you nothing, because the stack and the queues are invisible from the inside.

| | Shows you the machinery | Runs real code |
|---|---|---|
| The website | yes | no |
| Node, in `warmup/` | no | yes |

So Part 1 is seven scenes **the site wrote**, and Part 2 is eight programs **you run in Node**.
Same ideas, different code, no crossover. Don't go looking for your files on the website.

That is a genuinely useful thing to know about tools in general: a thing that models your system
is never the same as your system.

### Scene 3 is the one to slow down on

It answers the question you couldn't answer about your quiz app. The site puts it better
than I can, so here it is, and it is worth reading twice:

> What await really does is split the function in two. Everything before it runs
> synchronously, right up to the await expression itself. The remainder is packaged as a
> continuation and queued as a microtask when the awaited value settles. The function frame
> is suspended, not blocked: the stack unwinds completely and the thread is free.

In plainer words: **`await` does not stop your program. It steps the function out of the
way, lets everything else carry on, and comes back to it when the answer shows up.**

Two things follow from that, and both will bite you in Part 3 if you forget them:

- The code before the first `await` runs **immediately** when you call the function.
- Every `await` costs you a trip through the queue, even when the answer is already there.

---

## Part 2: warmup (about an hour)

Eight programs in `warmup/`. Every one starts with `PREDICT FIRST`.

```
node warmup/01-blocking.js
node warmup/02-order.js
node warmup/03-the-promise.js
node warmup/04-one-at-a-time.js
node warmup/05-all-at-once.js
node warmup/06-the-foreach-trap.js
node warmup/07-errors.js a      (then c, then b)
node warmup/08-real-network.js
```

Go in order. Write your prediction in `warmup/NOTES.md` **before** you run each
one, then write what actually happened. Being wrong is the point. Leave the wrong
predictions in.

`warmup/lib/model.js` is a fake AI model that takes a second to think. Look at it
now. You are about to write a bigger version of it.

**Don't ask Codex for the answers.** The predictions are the only thing this part
produces, so asking for them means you did an hour of work for nothing. Use it
after each one instead:

> I predicted X. It printed Y. Explain why I was wrong. Don't write code and don't
> give me the next exercise.

---

## What a model actually is

You are about to write a file called `fakeModel.js`, so you should know what the real
thing is. This takes ten minutes and it is not optional.

### First, a warning about the word

"Model" means two completely different things in programming, and you are going to meet both
within a few weeks. They have nothing to do with each other.

| | What it means | Example |
|---|---|---|
| **AI model** | A file that answers questions. **This is what this project means.** | `llama3.2`, the thing Ollama runs |
| **Data model** | The shape of a thing in your code and your database | A `Unit`, with a unit number, year, make and status |

You already built a data model without knowing the word for it: the objects in your `units.json`
are exactly that. In Shop Tracker you will build them properly, in a database.

How to tell which one someone means: a **data model is a shape** that describes information. An
**AI model is a thing that runs** and gives you answers. "Add a field to the model" is a data
model. "Which model are you running" is an AI one.

Nobody is going to fix this. The word is just overloaded and you have to read the room. For the
rest of this README, "model" always means the AI kind.

### So: what is an AI model

**A model is a file.** That is the whole headline. It is a very large file full of
numbers, and that is all it is. It is not a program, not a database, not a search engine
and not a lookup table of answers.

Those numbers came out of **training**: a computer read an enormous amount of text and
slowly adjusted billions of numbers until it got good at one single task. Nobody wrote
rules. Nobody typed in the answers.

**The one task is: given the text so far, guess what comes next.** Then it adds that
guess to the text and does it again. And again. That is how you get a paragraph out of
it. When you chat with an AI, that is what is happening, over and over, very fast.

**"3B" means three billion numbers.** That is the parameter count, and it is the number
in the model's name. More numbers generally means better answers, more memory needed, and
slower replies. You are always trading those against each other.

**The size of the file is roughly what it needs to run**, because the whole thing has to
be loaded into memory. Real sizes, from ollama.com/library:

| Model | Parameters | File |
|---|---|---|
| `llama3.2:1b` | 1 billion | 1.3 GB |
| `llama3.2:3b` | 3 billion | 2.0 GB |
| `llama3.1:8b` | 8 billion | 4.9 GB |
| `llama3.1:70b` | 70 billion | 43 GB |
| `llama3.1:405b` | 405 billion | 243 GB |

Look at that list and you can already work out what your desktop can and cannot do.

**Ollama is not the model.** Ollama is the program that downloads a model file, loads it
into memory and runs it. Same as VLC is not the movie. Next session you install Ollama,
then separately pull a model, and the two steps being separate will make sense.

**The model remembers nothing.** Every single request starts from zero. It has no idea
you talked to it ten seconds ago. This matters enormously for the app you are about to
write, and there is a question about it below.

And one more: **Codex is a model too.** Same idea, just much bigger, running on somebody
else's computer instead of yours. You have been using one for weeks.

### Your homework before next session

Write the answers in `warmup/NOTES.md`.

1. Go to https://ollama.com/library. Pick three models that look interesting. Write down
   their names, their parameter counts and their file sizes.
2. Find out what your desktop actually has. Open Task Manager, go to the Performance tab.
   Write down how much RAM you have, and whether you have a graphics card with its own
   memory, and how much.
3. **Decide which model you are going to run next session, and write down why.** It has to
   fit, and you have to be willing to wait for it. This is your call, not mine, and next
   session you pull the one you picked.
4. If the model remembers nothing between requests, then when you have a back and forth
   conversation with an AI, who is doing the remembering?
5. In one sentence each, what is an AI model and what is a data model?

That last question is the one that matters. You will answer it properly in Part 3.

---

## Part 3: the app

Now build the chat app. No network, no install, nothing to download.

**1. `fakeModel.js`** - a bigger version of `warmup/lib/model.js`. It is a stand-in for a
real model: same job, same shape, none of the billions of numbers. One function:

```js
async function respond(messages) { ... }
```

It takes **the whole conversation so far** and returns a reply. That is not an accident,
and it is the answer to question 4 above: the model has no memory, so your program has to
hand it the entire conversation every single time. Your app is doing the remembering.

It should:

- think for a random half second to a second and a half, so the wait is real. A real model
  is slow because it is doing billions of multiplications per word, and your code has to
  cope with that either way
- **tell you what it can see**, like `"I can see 5 messages. Your last one was 9 words."`
  That is how you will know whether your history is working, because otherwise it is
  invisible
- throw an error if the last message contains the word `break`, so you have
  something to catch

**2. `chat.js`** - the loop. Read a line, send the conversation to the model, print
the reply, repeat. Commands: `/exit`, `/clear`, `/history`.

Keep the conversation as an array of `{ role, content }` objects, where role is
`"user"` or `"assistant"`. That is the shape the real Ollama API wants, so you may
as well use it now.

**3. Handle the error.** Type something with `break` in it. The app should say what
went wrong and keep going. It should not crash, and it should not quietly do nothing.

### The rule that matters

**`chat.js` must not know the model is fake.** If the word "fake" appears anywhere
outside `fakeModel.js`, you did it wrong.

Next session you write `ollamaModel.js` with the same `respond(messages)` function,
change one import line, and the app talks to a real AI. That is the whole reason for
building it this way, and it is how real software gets tested.

### Stretch, if you get there

- **Stream it.** Instead of returning the whole reply, have the fake give back one
  word every 60 milliseconds and print them as they arrive. Look up async generators
  and `for await (const chunk of stream)`. This is the hard one, and it's exactly what
  the real Ollama API will need.
- **A spinner.** Show a little spinner while the model is thinking, and clear it when
  the answer arrives. `setInterval` and `clearInterval`. It only works if you got the
  async part right, which is the point. Go back and look at `warmup/01-blocking.js`.

### Done when

- [ ] You can have a real back and forth with it.
- [ ] It remembers what you said, and the model tells you how many messages it sees.
- [ ] `/clear` wipes the history, and you can prove it did.
- [ ] Typing something with `break` in it doesn't take the program down.
- [ ] The word "fake" appears in exactly one file.
- [ ] `warmup/NOTES.md` is filled in, wrong predictions and all.
- [ ] You picked the model you want to run next session, and can say why it and not a
      bigger one.
- [ ] You can explain, without looking it up, what an AI model is and what it does.
- [ ] You can say what the other kind of model is, and not mix the two up.

## Setup

Node 18 or newer. No dependencies, on purpose.
