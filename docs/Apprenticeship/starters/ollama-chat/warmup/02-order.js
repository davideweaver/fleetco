// 02 - What order does this print in?
//
// PREDICT FIRST, in NOTES.md: write down the order of the numbers before you run it.
// Getting it wrong is the point. Write down what you expected anyway.
//
// Run it:  node warmup/02-order.js

const { sleep } = require("./lib/sleep");

console.log("1");

async function middle() {
  console.log("2");
  await sleep(100);
  console.log("3");
}

middle();

console.log("4");

// ---------------------------------------------------------------------------
// Stretch, once you have the four above figured out. Uncomment and predict again.
// This one is genuinely tricky and nobody needs it memorized. The question worth
// answering is the simple one: which of these ran before anything waited?
// ---------------------------------------------------------------------------

// setTimeout(() => console.log("5"), 0);
// Promise.resolve().then(() => console.log("6"));
// console.log("7");
