var MESSAGES = [];

var PASS = 0;
var FAIL = 0;

/**
 * 
 * @param {string} msg 
 * @param {function(): void} callback 
 */
export function test(msg, callback) {
    try {
        MESSAGES.push(msg);
        callback();
    } catch(err) {
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

export function throws(fn) {
    var thrown = false;
    try {
        fn();
    } catch(err) {
        thrown = true;
    }
    if (!thrown) {
        throw new Error("Expected function to throw");
    }
}

export function report() {
    if (FAIL > 0) {
        console.error("\nFail: " + FAIL + "\nPass: " + PASS);
    } else {
        console.log("Pass: " + PASS);
    }
    FAIL = PASS = 0;
}

// export var test = {
//     /**
//      *
//      * @param {*} ok
//      * @param {string=} msg
//      */
//     ok: function (ok, msg) {
//         if (!ok) {
//             throw new Error(msg);
//         }
//     },
//     /**
//      * @template T
//      * @param {T} actual
//      * @param {T} expected
//      * @param {string=} msg
//      */
//     equals: function (actual, expected, msg) {
//         if (msg == null) {
//             msg = '';
//         } else {
//             msg = ' ' + msg;
//         }
//         if (Array.isArray(actual) && Array.isArray(expected)) {
//             if (actual.length !== expected.length) {
//                 throw new Error('Array#length error. Expected ' + expected.length + ', got ' + actual.length + '.' + msg);
//             }
//             for (var i = 0; i < actual.length; i++) {
//                 if (actual[i] !== expected[i]) {
//                     throw new Error('Array[' + i + '] error. Expected ' + expected[i] + ', got ' + actual[i] + '.' + msg);
//                 }
//             }
//         } else if (typeof actual === 'object' && typeof expected === 'object') {
//             if (actual === null && expected === null) {
//                 return;
//             }
//             if (expected === null && actual !== null) {
//                 throw new Error('Expected null, got ' + actual + '. ' + msg);
//             } else if (expected !== null && actual === null) {
//                 throw new Error('Expected ' + expected + ', got null. ' + msg);
//             }
//             var actualKeys = Object.keys(actual);
//             var expectedKeys = Object.keys(expected);
//             if (actualKeys.length !== expectedKeys.length) {
//                 throw new Error('Object#length error. Expected ' + expectedKeys.length + ', got ' + actualKeys.length + '.' + msg);
//             }
//             for (var i = 0; i < actualKeys.length; i++) {
//                 if (actual[actualKeys[i]] !== expected[actualKeys[i]]) {
//                     throw new Error('Object[' + actualKeys[i] + '] error. Expected ' + expected[actualKeys[i]] + ', got ' + actual[actualKeys[i]] + '.' + msg);
//                 }
//             }
//         } else if (actual !== expected) {
//             throw new Error('Expected ' + expected + ', got ' + actual + '.' + msg);
//         }
//     },
//     /**
//      *
//      * @param {Function} fn
//      * @param {string=} msg
//      */
//     throws: function (fn, msg) {
//         var thrown = false;
//         try {
//             fn();
//         } catch (e) {
//             thrown = true;
//         }
//         if (!thrown) {
//             throw new Error(msg);
//         }
//     }
// }
