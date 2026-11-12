// 07 - When it goes wrong
//
// askModel() throws if it does not know the question. Your real model will
// throw too, for better reasons: the server is down, the model is not
// installed, the answer came back as something you cannot read.
//
// Three functions try to deal with that. Run them one at a time.
//
// PREDICT FIRST, in NOTES.md, for each of a, c and b:
//   - does the error get caught?
//   - what gets printed?
//
// Run them:  node warmup/07-errors.js a
//            node warmup/07-errors.js c
//            node warmup/07-errors.js b     <-- run this one last, and watch

const { askModel, QUESTIONS } = require("./lib/model");

// a - the ordinary case
async function a() {
  try {
    const answer = await askModel("what is the capital of australia");
    console.log("a: got", answer);
  } catch (error) {
    console.log("a: caught -", error.message);
  }
  console.log("a: still running");
}

// c - three at once, and one of them fails
async function c() {
  try {
    const answers = await Promise.all([
      askModel(QUESTIONS[0]),
      askModel("something it has never heard of"),
      askModel(QUESTIONS[1]),
    ]);
    console.log("c: got", answers.length, "answers");
  } catch (error) {
    console.log("c: caught -", error.message);
  }
  // For NOTES.md: did the other two questions still get asked? How could you
  // find out? Then look up Promise.allSettled and say when you would want it.
}

// b - one word is missing. Find it before you run this.
async function b() {
  try {
    askModel("something it has never heard of");
    console.log("b: no error here");
  } catch (error) {
    console.log("b: caught -", error.message);
  }
  console.log("b: finished");
}

const which = process.argv[2];
const exercises = { a, b, c };
if (!exercises[which]) {
  console.log("Usage: node warmup/07-errors.js a|b|c");
} else {
  exercises[which]();
}
