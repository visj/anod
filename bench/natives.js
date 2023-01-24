function zero() {
    return 0;
}

/**
 * 
 * @param {string[]} def 
 * @param {function(): any} fallback 
 * @returns {function(): any}
 * @returns 
 */
function tryDefine(def, fallback) {
    try {
        return new Function(...def);
    } catch (_) {
        return fallback;
    }
}

var getHeapUsage = tryDefine(['%CollectHeapUsage()'], zero);
var collectGarbage = tryDefine(['%CollectGarbage(null)'], zero);
var optimizeFunctionOnNextCall = tryDefine(['fn', '%OptimizeFunctionOnNextCall(fn)'], zero);