// 01 - Waiting versus blocking
//
// A heartbeat prints a dot every 100 milliseconds. Then this program waits one
// second in two different ways.
//
// PREDICT FIRST, in NOTES.md: how many dots appear during each of the two waits?
//
// Run it:  node warmup/01-blocking.js

const { sleep, sleepSync } = require("./lib/sleep");

const heartbeat = setInterval(() => process.stdout.write("."), 100);

async function main() {
  console.log("\nWait #1 - sleepSync(1000):");
  sleepSync(1000);
  console.log("  done");

  console.log("\nWait #2 - await sleep(1000):");
  await sleep(1000);
  console.log("  done");

  clearInterval(heartbeat);
}

main();
