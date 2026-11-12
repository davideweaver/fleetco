// Three small helpers the exercises use. Read them now; they are the whole toolkit.

// Wait for ms milliseconds and let the rest of the program carry on meanwhile.
// This is the only honest way to wait in JavaScript.
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wait for ms milliseconds by refusing to do anything else at all.
// Never write this in real code. Exercise 01 is here to show you why.
function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Spinning on purpose.
  }
}

// Call startTimer(), do some work, then call what it gave you to get "1.23s".
function startTimer() {
  const start = Date.now();
  return () => `${((Date.now() - start) / 1000).toFixed(2)}s`;
}

module.exports = { sleep, sleepSync, startTimer };
