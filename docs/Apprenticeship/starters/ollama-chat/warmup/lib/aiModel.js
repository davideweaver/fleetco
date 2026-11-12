// A pretend AI model. askModel() takes one second to "think", the way a real
// one would. It is fake, but your code cannot tell, and that is the point.
//
// "AI model" here means the thing that answers questions, like llama3.2. Not to
// be confused with the other kind of model you will meet in a few weeks, which
// is the shape of a record in a database. See the README.
//
// In Part 3 you write a bigger version of this file yourself.
const { sleep } = require("./sleep");

const ANSWERS = {
  "what is a promise":
    "An object that stands for a value you do not have yet.",
  "why do i need await":
    "Because without it you get the promise instead of the value.",
  "what is the event loop":
    "The thing that takes finished work off the queue and puts it back on the stack.",
};

async function askModel(question) {
  await sleep(1000);
  const answer = ANSWERS[question.toLowerCase().trim()];
  if (!answer) throw new Error(`I have no answer for "${question}"`);
  return answer;
}

const QUESTIONS = Object.keys(ANSWERS);

module.exports = { askModel, QUESTIONS };
