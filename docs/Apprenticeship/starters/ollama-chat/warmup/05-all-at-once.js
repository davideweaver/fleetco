// 05 - Three questions, all at once
//
// Same three questions, same one-second askModel(), different shape.
//
// PREDICT FIRST, in NOTES.md:
//   - How long does this take, compared with 04?
//   - Where did the `await` go, and what is it waiting for now?
//
// Run it:  node warmup/05-all-at-once.js
//
// Then answer this in NOTES.md, which is the real question:
// if this is three times faster, why would anyone ever write 04?
// Come up with at least two reasons. There are more than two.
//
// Hint for one of them: in a chat app, could you ask the next question before
// you have the answer to the last one?

const { startTimer } = require("./lib/sleep");
const { askModel, QUESTIONS } = require("../aiModel");

async function main() {
  const elapsed = startTimer();

  const answers = await Promise.all(QUESTIONS.map((q) => askModel(q)));

  console.log(`\n${answers.length} answers in ${elapsed()}`);
}

main();
