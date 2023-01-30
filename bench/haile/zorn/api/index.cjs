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

var S = typeof window !== 'undefined' ? Zorn : require('../../../../dist/zorn.cjs');

var now = typeof process === 'undefined' ? browserNow : nodeNow;

var COUNT = 1e6;

var sideEffect = 0;

var lines = [];

function log(msg) {
    lines.push(msg);
}

main();

console.log(lines.join("\n"));

function main() {
    var createTotal = { ms: 0, mem: 0 };
    createTotal = addRes(createTotal, bench(createDataSignals, COUNT, COUNT));
    createTotal = addRes(createTotal, bench(createComputations0to1, COUNT, 0));
    createTotal = addRes(createTotal, bench(createComputations1to1, COUNT, COUNT));
    createTotal = addRes(createTotal, bench(createComputations2to1, COUNT / 2, COUNT));
    createTotal = addRes(createTotal, bench(createComputations4to1, COUNT / 4, COUNT));
    createTotal = addRes(createTotal, bench(createComputations1000to1, COUNT / 1000, COUNT));
    //createTotal = addRes(createTotal, bench1(createComputations8, COUNT, 8 * COUNT));
    createTotal = addRes(createTotal, bench(createComputations1to2, COUNT, COUNT / 2));
    createTotal = addRes(createTotal, bench(createComputations1to4, COUNT, COUNT / 4));
    createTotal = addRes(createTotal, bench(createComputations1to8, COUNT, COUNT / 8));
    createTotal = addRes(createTotal, bench(createComputations1to1000, COUNT, COUNT / 1000));
    log('---');
    bench(readToplevelSignal, COUNT, COUNT);
    bench(readWatchedSignal, COUNT, COUNT);
    bench(sampleNoSignal, COUNT, COUNT);
    bench(sampleToplevelSignal, COUNT, COUNT);
    bench(sampleWatchedSignal, COUNT, COUNT);
    log('---');
    var updateTotal = { ms: 0, mem: 0 };
    updateTotal = addRes(updateTotal, bench(updateComputations1to1, COUNT * 4, 1));
    updateTotal = addRes(updateTotal, bench(updateComputations2to1, COUNT * 2, 2));
    updateTotal = addRes(updateTotal, bench(updateComputations4to1, COUNT, 4));
    updateTotal = addRes(updateTotal, bench(updateComputations1000to1, COUNT / 100, 1000));
    updateTotal = addRes(updateTotal, bench(updateComputations1to2, COUNT * 4, 1));
    updateTotal = addRes(updateTotal, bench(updateComputations1to4, COUNT * 4, 1));
    updateTotal = addRes(updateTotal, bench(updateComputations1to1000, COUNT * 4, 1));
    log('---');
    printRes('create total', createTotal);
    printRes('update total', updateTotal);
    printRes('total', addRes(createTotal, updateTotal));
}

function bench(fn, count, scount) {
    var res = run(fn, count, scount);
    printRes(fn.name, res);
    return res;
}

function printRes(name, res) {
    log(`${name.padEnd(30)} ${res.ms.toFixed(1).padStart(5)} ${(res.mem / 1000).toFixed(0).padStart(10)}`);
}

function addRes(a, b) {
    return { ms: a.ms + b.ms, mem: a.mem + b.mem };
}

function run(fn, n, scount) {
    // prep n * arity sources
    var start,
        end,
        heapBefore,
        heapAfter;

    sideEffect = 0;

    S.root(function () {
        //S.freeze(function () {
        // run 3 times to warm up 
        var sources = createDataSignals(scount, []);
        fn(n / 100, sources);
        sources = createDataSignals(scount, []);
        fn(n / 100, sources);
        sources = createDataSignals(scount, []);
        optimizeFunctionOnNextCall(fn);
        fn(n / 100, sources);
        sources = createDataSignals(scount, []);

        for (var i = 0; i < scount; i++) {
            sources[i].get();
            sources[i].get();
            optimizeFunctionOnNextCall(sources[i].get);
            sources[i].get();
        }

        // start GC clean
        collectGarbage(null);

        start = now();

        heapBefore = getHeapUsage();
        fn(n, sources);
        heapAfter = getHeapUsage();

        // end GC clean
        sources = null;
        collectGarbage(null);

        end = now();

        //});
    });

    return { ms: end - start, mem: heapAfter - heapBefore };
}

function createDataSignals(n, sources) {
    for (var i = 0; i < n; i++) {
        sources[i] = new S.Data(i);
    }
    return sources;
}

function readToplevelSignal(n, sources) {
    for (var i = 0; i < n; i++) {
        sideEffect += sources[i].get()
    }
}

function readWatchedSignal(n, sources) {
    S.effect(function () {
        for (var i = 0; i < n; i++) {
            sideEffect += sources[i].get()
        }
    });
}

function sampleNoSignal(n, sources) {
    S.effect(function () {
        var fn = () => i;
        for (var i = 0; i < n; i++) {
            sideEffect += S.sample(fn);
        }
    });
}

function sampleToplevelSignal(n, sources) {
    var fn = () => sources[i].get();
    for (var i = 0; i < n; i++) {
        sideEffect += S.sample(fn);
    }
}

function sampleWatchedSignal(n, sources) {
    S.effect(function () {
        var fn = () => sources[i].get();
        for (var i = 0; i < n; i++) {
            sideEffect += S.sample(fn);
        }
    });
}

function createComputations0to1(n, sources) {
    for (var i = 0; i < n; i++) {
        createComputation0(i);
    }
}

function createComputations1to1000(n, sources) {
    for (var i = 0; i < n / 1000; i++) {
        for (var j = 0; j < 1000; j++) {
            createComputation1(sources[i]);
        }
        //sources[i] = null;
    }
}

function createComputations1to8(n, sources) {
    for (var i = 0; i < n / 8; i++) {
        createComputation1(sources[i]);
        createComputation1(sources[i]);
        createComputation1(sources[i]);
        createComputation1(sources[i]);
        createComputation1(sources[i]);
        createComputation1(sources[i]);
        createComputation1(sources[i]);
        createComputation1(sources[i]);
        //sources[i] = null;
    }
}

function createComputations1to4(n, sources) {
    for (var i = 0; i < n / 4; i++) {
        createComputation1(sources[i]);
        createComputation1(sources[i]);
        createComputation1(sources[i]);
        createComputation1(sources[i]);
        //sources[i] = null;
    }
}

function createComputations1to2(n, sources) {
    for (var i = 0; i < n / 2; i++) {
        createComputation1(sources[i]);
        createComputation1(sources[i]);
        //sources[i] = null;
    }
}

function createComputations1to1(n, sources) {
    for (var i = 0; i < n; i++) {
        createComputation1(sources[i]);
        //sources[i] = null;
    }
}

function createComputations2to1(n, sources) {
    for (var i = 0; i < n; i++) {
        createComputation2(
            sources[i * 2],
            sources[i * 2 + 1]
        );
        //sources[i * 2] = null;
        //sources[i * 2 + 1] = null;
    }
}

function createComputations4to1(n, sources) {
    for (var i = 0; i < n; i++) {
        createComputation4(
            sources[i * 4],
            sources[i * 4 + 1],
            sources[i * 4 + 2],
            sources[i * 4 + 3]
        );
        //sources[i * 4] = null;
        //sources[i * 4 + 1] = null;
        //sources[i * 4 + 2] = null;
        //sources[i * 4 + 3] = null;
    }
}

function createComputations8(n, sources) {
    for (var i = 0; i < n; i++) {
        createComputation8(
            sources[i * 8],
            sources[i * 8 + 1],
            sources[i * 8 + 2],
            sources[i * 8 + 3],
            sources[i * 8 + 4],
            sources[i * 8 + 5],
            sources[i * 8 + 6],
            sources[i * 8 + 7]
        );
        sources[i * 8] = null;
        sources[i * 8 + 1] = null;
        sources[i * 8 + 2] = null;
        sources[i * 8 + 3] = null;
        sources[i * 8 + 4] = null;
        sources[i * 8 + 5] = null;
        sources[i * 8 + 6] = null;
        sources[i * 8 + 7] = null;
    }
}

// only create n / 100 computations, as otherwise takes too long
function createComputations1000to1(n, sources) {
    for (var i = 0; i < n; i++) {
        createComputation1000(sources, i * 1000);
    }
}

function createComputation0(i) {
    S.effect(() => sideEffect += i);
}

function createComputation1(s1) {
    S.effect(() => sideEffect += s1.get());
}

function createComputation2(s1, s2) {
    S.effect(() => sideEffect += s1.get() + s2.get());
}

function createComputation4(s1, s2, s3, s4) {
    S.effect(() => sideEffect += s1.get() + s2.get() + s3.get() + s4.get());
}

function createComputation8(s1, s2, s3, s4, s5, s6, s7, s8) {
    S.effect(() => sideEffect += s1.get() + s2.get() + s3.get() + s4.get() + s5.get() + s6.get() + s7.get() + s8.get());
}

function createComputation1000(ss, offset) {
    S.effect(() => {
        var sum = 0;
        for (var i = 0; i < 1000; i++) {
            sum += ss[offset + i].get();
        }
        sideEffect += sum;
    }, undefined);
}

function updateComputations1to1(n, sources) {
    var s1 = sources[0],
        c = S.effect(() => s1.get());
    for (var i = 0; i < n; i++) {
        s1.set(i);
    }
}

function updateComputations2to1(n, sources) {
    var s1 = sources[0],
        s2 = sources[1],
        c = S.effect(() => s1.get() + s2.get());
    for (var i = 0; i < n; i++) {
        s1.set(i);
    }
}

function updateComputations4to1(n, sources) {
    var s1 = sources[0],
        s2 = sources[1],
        s3 = sources[2],
        s4 = sources[3],
        c = S.effect(() => s1.get() + s2.get() + s3.get() + s4.get());
    for (var i = 0; i < n; i++) {
        s1.set(i);
    }
}

function updateComputations1000to1(n, sources) {
    var s1 = sources[0],
        c = S.effect(() => {
            var sum = 0;
            for (var i = 0; i < 1000; i++) {
                sum += sources[i].get();
            }
            return sum;
        }, undefined);
    for (var i = 0; i < n; i++) {
        s1.set(i);
    }
}

function updateComputations1to2(n, sources) {
    var s1 = sources[0],
        c1 = S.effect(() => s1.get()),
        c2 = S.effect(() => s1.get());
    for (var i = 0; i < n / 2; i++) {
        s1.set(i);
    }
}

function updateComputations1to4(n, sources) {
    var s1 = sources[0],
        c1 = S.effect(() => s1.get()),
        c2 = S.effect(() => s1.get()),
        c3 = S.effect(() => s1.get()),
        c4 = S.effect(() => s1.get());
    for (var i = 0; i < n / 4; i++) {
        s1.set(i);
    }
}

function updateComputations1to1000(n, sources) {
    var s1 = sources[0];
    for (var i = 0; i < 1000; i++) {
        S.effect(() => s1.get());
    }
    for (var i = 0; i < n / 1000; i++) {
        s1.set(i);
    }
}

function browserNow() {
    return performance.now();
}

function nodeNow() {
    var hrt = process.hrtime();
    return hrt[0] * 1000 + hrt[1] / 1e6;
}

function repeat(n, val) {
    var arr = [];
    for (var i = 0; i < n; i++) {
        arr[i] = val;
    }
    return arr;
}