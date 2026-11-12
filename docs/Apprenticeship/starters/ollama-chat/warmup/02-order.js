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
// Optional, and genuinely skippable. Uncomment and predict again if you want.
//
// This is the "which kind of waiting cuts in line" puzzle. People ask it in job
// interviews. It will not come up once while you build the chat app, so do not
// spend your evening on it. The only part that matters is the simple part:
// everything that did not wait ran before everything that did.
// ---------------------------------------------------------------------------

// setTimeout(() => console.log("5"), 0);
// Promise.resolve().then(() => console.log("6"));
// console.log("7");
