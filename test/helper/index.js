/** @type {number} */
var PASS = 0;
/** @type {number} */
var FAIL = 0;
/**
 * @const
 * @type {Test}
 */
var ROOT = new Test([]);

/**
 * @constructor
 * @param {Array<string>} messages
 */
function Test(messages) {
    /**
     * @type {Array<string>}
     */
    this.messages = messages;
    /**
     * @type {string | null}
     */
    this._scope = null;
}

/**
 * 
 * @param {string} message 
 * @param {function(Test): void} callback 
 * @returns {void}
 */
Test.prototype.test = function(message, callback) {
    callback(new Test(this.messages.concat(message)));
};

/**
 * @returns {string}
 */
Test.prototype.scope = function() {
    if (this._scope === null) {
        this._scope = this.messages.join(" -> ");
    }
    return this._scope;
};

/**
 * @template T
 * @param {T} expected 
 * @param {T} actual 
 */
Test.prototype.assert = function(expected, actual) {
    if (expected === actual) {
        PASS++;
    } else {
        FAIL++;
        console.error(this.scope() + ": Expected " + expected + ", got " + actual);
    }
};

Test.prototype.throws = function(callback) {
    var thrown = false;
    try {
        callback();
    } catch (_) {
        thrown = true;
    }
    if (thrown) {
        PASS++;
    } else {
        FAIL++;
        console.error(this.scope() + ": Expected function " + callback.name + " to throw");
    }
};

/**
 *
 * @param {string} message
 * @param {function(Test): void} callback
 */
export function test(message, callback) {
    ROOT.test(message, callback);
}

export function report() {
    if (FAIL > 0) {
        console.error("Fail: " + FAIL + "\nPass: " + PASS);
    } else {
        console.log("Pass: " + PASS);
    }
    console.log("Total: " + (PASS + FAIL));
}
