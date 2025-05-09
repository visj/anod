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
    try {
        var messages = this.messages.slice();
        messages.push(message);
        callback(new Test(messages));
    } catch (err) {
        FAIL++;
        console.error(this.scope() + ": " + (message || ""));
    }
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
 * 
 * @param {boolean} assert 
 * @param {string=} message 
 */
Test.prototype.assert = function(assert, message) {
    if (assert === true) {
        PASS++;
    } else {
        FAIL++;
        console.error(this.scope() + ": " + (message || ""));
    }
};

/**
 * @template T
 * @param {T} actual 
 * @param {T} expected 
 * @param {string=} message
 */
Test.prototype.equal = function(actual, expected, message) {
    if (actual === expected) {
        PASS++;
    } else {
        FAIL++;
        console.error(this.scope() + ": Expected " + expected + ", got " + actual, message || "");
    }
};

/**
 * 
 * @param {function(...?): ?} callback
 * @returns {void}
 */
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
