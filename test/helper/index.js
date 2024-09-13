var MESSAGES = [];

var PASS = 0;
var FAIL = 0;

/** @type {import("../../dist/index") & import("../../dist/array")} */
export var Anod;

/**
 *
 * @param {string} msg
 * @param {function(): Promise} callback
 */
export async function test(msg, callback) {
    try {
        MESSAGES.push(msg);
        await callback();
    } catch (err) {
        console.error(MESSAGES.join(" -> ") + ": " + err.message);
    } finally {
        MESSAGES.pop();
    }
}

/**
 * @template T
 * @param {T} v1
 * @param {T | string} v2
 */
export function assert(v1, v2) {
  if (v1 !== v2) {
      FAIL++;
      throw new Error("Expected " + v2 + ", got " + v1);
  }
  PASS++;
}

/**
 * @param {function(): void} callback
 */
assert.throws = function(callback) {
  var thrown = false;
  try {
      callback();
  } catch (err) {
      thrown = true;
  }
  if (!thrown) {
      FAIL++;
      throw new Error("Expected function to throw");
  }
  PASS++;
}

export function report() {
    console.log("Executed " + (PASS + FAIL) + " asserts.");
    if (FAIL > 0) {
        console.error("\nFail: " + FAIL + "\nPass: " + PASS);
    } else {
        console.log("Pass: " + PASS);
    }
    FAIL = PASS = 0;
}
