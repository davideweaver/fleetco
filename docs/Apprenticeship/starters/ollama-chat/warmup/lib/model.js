// A pretend AI model. askModel() takes one second to "think", the way a real
// one would. It is fake, but your code cannot tell, and that is the point.
//
// Next session you write the real one. If you build the rest of the app right,
// nothing except this file has to change.
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
