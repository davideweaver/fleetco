// 03 - What an async function actually gives you back
//
// getUnitCount() says `return 6`. So four questions:
//
// PREDICT FIRST, in NOTES.md:
//   A - what does line A print?
//   B - what does line B print?
//   C - what does line C print?
//   D - showUnitCount() at the bottom is commented out, and it will not even run.
//       Read it and work out why before you uncomment it.
//
// Run it:  node warmup/03-the-promise.js
// Then uncomment both D lines, run it again, and read the error carefully.
// You have seen that error before. This time you know what it is telling you.

const { sleep } = require("./lib/sleep");

async function getUnitCount() {
  await sleep(300);
  return 6;
}

// A
console.log("A:", getUnitCount());

// B
getUnitCount().then((count) => console.log("B:", count));

// C
async function main() {
  console.log("C:", await getUnitCount());
}
main();

// D
// function showUnitCount() {
//   const count = await getUnitCount();
//   console.log("D:", count);
// }
// showUnitCount();
