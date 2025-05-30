/**
 * @template T
 * @param {IArrayLike<T>} actual 
 * @param {IArrayLike<T>} expected 
 * @returns {boolean}
 */
export function shallowEq(actual, expected) {
    if (actual == null) {
        return expected == actual;
    }
    if (actual.length !== expected.length) {
        return false;
    }
    for (var i = 0; i < actual.length; i++) {
        if (actual[i] instanceof Array && expected[i] instanceof Array) {
            if (!shallowEq(actual[i], expected[i])) {
                return false;
            }
        } else if (actual[i] !== expected[i]) {
            return false;
        }
    }
    return true;
}