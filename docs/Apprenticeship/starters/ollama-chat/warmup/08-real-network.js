// 08 - A real server, a real wait
//
// Everything so far faked the waiting with setTimeout. This one actually leaves
// your computer. It asks the U.S. government's free vPIC service to decode three
// truck VINs, which is the same API you will use in Week 6 of the handbook.
//
// PREDICT FIRST, in NOTES.md:
//   - which way will be faster, and roughly by how much?
//   - will the timings be as tidy as the one-second fakes were? why not?
//
// Run it:  node warmup/08-real-network.js
//
// Then, in NOTES.md:
//   - Run it three times. Write down the three sets of numbers.
//   - NOTAVIN is not a VIN. What does vPIC do about that - does the request fail,
//     or does it succeed and tell you something? Which would you rather it did?
//   - Turn off your wi-fi and run it again. What does your program do? What
//     should it do?

const { startTimer } = require("./lib/sleep");

const VINS = [
  "1FUJGBDV8CLBP8834",
  "1XKWDB0X57J211825",
  "1M1AK07Y8HM040163",
  "NOTAVIN",
];

async function decodeVin(vin) {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${vin}?format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`vPIC returned ${response.status} for ${vin}`);
  const body = await response.json();
  const result = body.Results[0];
  return {
    vin,
    year: result.ModelYear || "?",
    make: result.Make || "?",
    model: result.Model || "?",
    error: result.ErrorCode,
  };
}

async function oneAtATime() {
  const elapsed = startTimer();
  const decoded = [];
  for (const vin of VINS) {
    decoded.push(await decodeVin(vin));
  }
  console.log(`one at a time: ${elapsed()}`);
  return decoded;
}

async function allAtOnce() {
  const elapsed = startTimer();
  const decoded = await Promise.all(VINS.map((vin) => decodeVin(vin)));
  console.log(`all at once:   ${elapsed()}`);
  return decoded;
}

async function main() {
  const decoded = await oneAtATime();
  await allAtOnce();

  console.log();
  for (const unit of decoded) {
    console.log(`  ${unit.vin}  ${unit.year} ${unit.make} ${unit.model}`);
  }
}

main().catch((error) => {
  console.error(`\nFailed: ${error.message}`);
  process.exitCode = 1;
});
