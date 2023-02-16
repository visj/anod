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
  
  var now = typeof process === 'undefined' ? browserNow : nodeNow;
  
  var COUNT = 1e6;
  
  var lines = [];
  
  function log(msg) {
    lines.push(msg);
  }
  
  main();
  
  console.log(lines.join("\n"));
  
  function main() {
    var createTotal = 0;
    createTotal += bench(createDataSignals, COUNT, COUNT);
    createTotal += bench(createComputations0to1, COUNT, 0);
    createTotal += bench(createComputations1to1, COUNT, COUNT);
    createTotal += bench(createComputations2to1, COUNT / 2, COUNT);
    createTotal += bench(createComputations4to1, COUNT / 4, COUNT);
    createTotal += bench(createComputations1000to1, COUNT / 1000, COUNT);
    //total += bench1(createComputations8, COUNT, 8 * COUNT);
    createTotal += bench(createComputations1to2, COUNT, COUNT / 2);
    createTotal += bench(createComputations1to4, COUNT, COUNT / 4);
    createTotal += bench(createComputations1to8, COUNT, COUNT / 8);
    createTotal += bench(createComputations1to1000, COUNT, COUNT / 1000);
    log('---');
    var updateTotal = 0;
    updateTotal += bench(updateComputations1to1, COUNT * 4, 1);
    updateTotal += bench(updateComputations2to1, COUNT * 2, 2);
    updateTotal += bench(updateComputations4to1, COUNT, 4);
    updateTotal += bench(updateComputations1000to1, COUNT / 100, 1000);
    updateTotal += bench(updateComputations1to2, COUNT * 4, 1);
    updateTotal += bench(updateComputations1to4, COUNT * 4, 1);
    updateTotal += bench(updateComputations1to1000, COUNT * 4, 1);
    log('---');
    log(`create total: ${createTotal.toFixed(0)}`);
    log(`update total: ${updateTotal.toFixed(0)}`);
    log(`total: ${(createTotal + updateTotal).toFixed(0)}`);
  }
  
  function bench(fn, count, scount) {
    var time = run(fn, count, scount);
    printRes(fn.name, { ms: time, mem: 0 });
    return time;
  }
  
  function printRes(name, res) {
    log(`${name.padEnd(30)} ${res.ms.toFixed(1).padStart(5)} ${(res.mem / 1000).toFixed(0).padStart(10)}`);
  }
  
  function run(fn, n, scount) {
    // prep n * arity sources
    var start,
        end;
  
    maverick.root(function () {
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
            sources[i]();
            sources[i]();
            optimizeFunctionOnNextCall(sources[i]);
            sources[i]();
        }
  
        // start GC clean
        collectGarbage(null);
  
        start = now();
  
        fn(n, sources);

        maverick.tick();
  
        // end GC clean
        sources = null;
        collectGarbage(null);
  
        end = now();
    });
  
    return end - start;
  }
  
  function createDataSignals(n, sources) {
    for (var i = 0; i < n; i++) {
        sources[i] = maverick.signal(i);
    }
    return sources;
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
    maverick.effect(function () { return i; });
  }
  
  function createComputation1(s1) {
    maverick.effect(function () { return s1(); });
  }
  
  function createComputation2(s1, s2) {
    maverick.effect(function () { return s1() + s2(); });
  }
  
  function createComputation4(s1, s2, s3, s4) {
    maverick.effect(function () { return s1() + s2() + s3() + s4(); });
  }
  
  function createComputation8(s1, s2, s3, s4, s5, s6, s7, s8) {
    maverick.effect(function () { return s1() + s2() + s3() + s4() + s5() + s6() + s7() + s8(); });
  }
  
  function createComputation1000(ss, offset) {
    maverick.effect(function () {
        var sum = 0;
        for (var i = 0; i < 1000; i++) {
            sum += ss[offset + i]();
        }
        return sum;
    });
  }
  
  function updateComputations1to1(n, sources) {
    var s1 = sources[0],
        c = maverick.effect(function () { return s1(); });
    for (var i = 0; i < n; i++) {
        s1.set(s1() + 1);
        
    }
  }
  
  function updateComputations2to1(n, sources) {
    var s1 = sources[0],
        s2 = sources[1],
        c = maverick.effect(function () { return s1() + s2(); });
    for (var i = 0; i < n; i++) {
        s1.set(s1() + 1);
        
    }
  }
  
  function updateComputations4to1(n, sources) {
    var s1 = sources[0],
        s2 = sources[1],
        s3 = sources[2],
        s4 = sources[3],
        c = maverick.effect(function () { return s1() + s2() + s3() + s4(); });
    for (var i = 0; i < n; i++) {
        s1.set(s1() + 1);
        
    }
  }
  
  function updateComputations1000to1(n, sources) {
    var s1 = sources[0],
        c = maverick.effect(function () {
            var sum = 0;
            for (var i = 0; i < 1000; i++) {
                sum += sources[i]();
            }
            return sum;
        });
    for (var i = 0; i < n; i++) {
        s1.set(s1() + 1);
        
    }
  }
  
  function updateComputations1to2(n, sources) {
    var s1 = sources[0],
        c1 = maverick.effect(function () { return s1(); }),
        c2 = maverick.effect(function () { return s1(); });
    for (var i = 0; i < n / 2; i++) {
        s1.set(s1() + 1);
        
    }
  }
  
  function updateComputations1to4(n, sources) {
    var s1 = sources[0],
        c1 = maverick.effect(function () { return s1(); }),
        c2 = maverick.effect(function () { return s1(); }),
        c3 = maverick.effect(function () { return s1(); }),
        c4 = maverick.effect(function () { return s1(); });
    for (var i = 0; i < n / 4; i++) {
        s1.set(s1() + 1);
        
    }
  }
  
  function updateComputations1to1000(n, sources) {
    var s1 = sources[0];
    var calls = 0;
    for (var i = 0; i < 1000; i++) {
        maverick.effect(function () { 
            calls++;
            return s1(); 
        });
    }
    calls = 0;
    var ln = n / 1000;
    for (var i = 0; i < ln; i++) {
        s1.set(s1() + 1);
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