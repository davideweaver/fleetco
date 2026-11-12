# My notes

Predictions go in before I run anything. Wrong predictions stay in.

---

## Visualizer

| Scene | My prediction | Actual | Why I was off |
|---|---|---|---|
| One thing at a time | | | |
| Blocking the loop | | | |
| setTimeout(0), alone | | | |
| Promise vs setTimeout | | | |
| async/await, unmasked | | | |
| Promise.all | | | |
| fetch | | | |

**In my own words, what does `await` actually do to the function it is in?**

*(These scenes are the website's own code, not the warmup files. Part 2 is where you run ours.)*

**What runs immediately when you call an async function, before any waiting?**

---

## What a model is

**Three models from ollama.com/library:**

| Name | Parameters | File size |
|---|---|---|
| | | |
| | | |
| | | |

**My desktop:** RAM ___   graphics card ___   its memory ___

**The model I'm running next session, and why:**

**If the model remembers nothing between requests, who is doing the remembering?**

**An AI model is:**

**A data model is:**

---

## 01 - Waiting versus blocking

**Predicted:** dots during wait #1: ___   dots during wait #2: ___

**Actually:**

**Why:**

---

## 02 - What order does this print in?

**Predicted order:**

**Actual order:**

**Why I was off (if I was):**

**Stretch (5, 6, 7 uncommented) - predicted:**

**Stretch - actual:**

---

## 03 - What an async function returns

**Predicted:** A: ___  B: ___  C: ___  D: ___

**Actually:** A: ___  B: ___  C: ___

**D, uncommented - the error was:**

**What that error is telling me, in my own words:**

---

## 04 - One at a time, three questions

**Predicted total time:**  **Actual:**

---

## 05 - All at once

**Predicted total time:**  **Actual:**

**Where did the `await` go, and what is it waiting for now?**

**If this is faster, why would anyone write 04? (at least two reasons)**

1.
2.

---

## 06 - The forEach trap

**Predicted:**  **Actual:**

**What forEach could not do:**

**My two fixes:** (paste them)

---

## 07 - Errors

| | Predicted: caught? | Actually | Why |
|---|---|---|---|
| a | | | |
| c | | | |
| b | | | |

**In c, did T-114 and T-301 still get fetched? How did I find out?**

**`Promise.allSettled` - when would I want it instead?**

**The missing word in b, and what it cost:**

---

## 08 - A real network

| Run | one at a time | all at once |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |

**Why are these less tidy than the one-second fakes?**

**NOTAVIN - did the request fail, or succeed and tell me something? Which is better, and why?**

**With wi-fi off, my program did:**

**It should have:**

---

## My own quiz app, with the `await` removed

(Open `test-test`, delete the `await` from `const response = await rl.question(...)`,
predict, run it, put it back.)

**Predicted:**

**Actually:**

**What `response` held, and why the comparison behaved that way:**

---

## Why that code needed `await` - the real answer

(Three or four sentences. No AI.)
