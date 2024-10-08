var MESSAGES = [];

var PASS = 0;
var FAIL = 0;

/** @type {import("../../dist/index") & import("../../dist/array")} */
export var Anod;

/**
 *
 * @param {string} msg
 * @param {function(): void} callback
 */
export function test(msg, callback) {
    try {
        MESSAGES.push(msg);
        callback();
    } catch (err) {
        console.error(MESSAGES.join(" -> ") + ": " + err.message);
    } finally {
        MESSAGES.pop();
    }
}

/**
 * @template T
 * @param {T} v1
 * @param {T} v2
 */
export function assert(v1, v2) {
  if (v1 !== v2) {
      FAIL++;
      throw new Error("Expected " + v2 + ", got " + v1);
  }
  PASS++;
}

export function context() {
    var slice = MESSAGES.slice();
    return function(callback) {
        var messages = MESSAGES;
        MESSAGES = slice;
        try {
            callback();
        } finally {
            MESSAGES = messages;
        }
    }
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
    if (FAIL > 0) {
        console.error("\nFail: " + FAIL + "\nPass: " + PASS);
    } else {
        console.log("\nPass: " + PASS);
    }
    console.log("Total: " + (PASS + FAIL));
}
