// 06 - The trap
//
// This looks like 04. It is written the way most people first write it.
// It is broken, it is silent about being broken, and everyone writes it once.
// You will write it again in the real app, so meet it here first.
//
// PREDICT FIRST, in NOTES.md: what does the last line print, and how long does
// it take?
//
// Run it:  node warmup/06-the-foreach-trap.js
//
// Then fix it two different ways and keep both. One using `for...of`, one using
// Promise.all. Explain in NOTES.md what forEach could not do.

const { startTimer } = require("./lib/sleep");
const { askModel, QUESTIONS } = require("./lib/aiModel");

async function main() {
  const elapsed = startTimer();

  const answers = [];
  QUESTIONS.forEach(async (question) => {
    answers.push(await askModel(question));
  });

  console.log(`\n${answers.length} answers in ${elapsed()}`);
}

main();
