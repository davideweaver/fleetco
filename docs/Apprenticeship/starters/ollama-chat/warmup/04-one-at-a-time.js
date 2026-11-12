// 04 - Three questions, one at a time
//
// askModel() takes one second to think. This asks it three questions.
//
// PREDICT FIRST, in NOTES.md: how long does the whole thing take?
//
// Run it:  node warmup/04-one-at-a-time.js

const { startTimer } = require("./lib/sleep");
const { askModel, QUESTIONS } = require("../aiModel");

async function main() {
  const elapsed = startTimer();

  const answers = [];
  for (const question of QUESTIONS) {
    const answer = await askModel(question);
    console.log(`  [${elapsed()}] ${question}`);
    answers.push(answer);
  }

  console.log(`\n${answers.length} answers in ${elapsed()}`);
}

main();
