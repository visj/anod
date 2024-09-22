import { root, effect, value } from "anod";

function now() {
  return performance.now();
}

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
  createTotal += bench(createComputations1to2, COUNT, COUNT / 2);
  createTotal += bench(createComputations1to4, COUNT, COUNT / 4);
  createTotal += bench(createComputations1to8, COUNT, COUNT / 8);
  createTotal += bench(createComputations1to1000, COUNT, COUNT / 1000);
  log("---");
  var updateTotal = 0;
  updateTotal += bench(updateComputations1to1, COUNT * 4, 1);
  updateTotal += bench(updateComputations2to1, COUNT * 2, 2);
  updateTotal += bench(updateComputations4to1, COUNT, 4);
  updateTotal += bench(updateComputations1000to1, COUNT / 100, 1000);
  updateTotal += bench(updateComputations1to2, COUNT * 4, 1);
  updateTotal += bench(updateComputations1to4, COUNT * 4, 1);
  updateTotal += bench(updateComputations1to1000, COUNT * 4, 1);
  log("---");
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
  log(
    `${name.padEnd(30)} ${res.ms.toFixed(1).padStart(5)} ${(res.mem / 1000).toFixed(0).padStart(10)}`,
  );
}

function run(fn, n, scount) {
  // prep n * arity sources
  var start, end;
  var r1 = root(function () {
    // run 3 times to warm up
    var sources = createDataSignals(scount, []);
    fn(n / 100, sources);
    sources = createDataSignals(scount, []);
    fn(n / 100, sources);
    sources = createDataSignals(scount, []);
    fn(n / 100, sources);
    sources = createDataSignals(scount, []);
    for (var i = 0; i < scount; i++) {
      sources[i].val();
      sources[i].val();
      sources[i].val();
    }
  });
  r1.dispose();
  var sources = createDataSignals(scount, []);
  start = now();
  fn(n, sources);
  end = now();
  return end - start;
}

function createDataSignals(n, sources) {
  for (var i = 0; i < n; i++) {
    sources[i] = value(i);
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
  }
}

function createComputations1to4(n, sources) {
  for (var i = 0; i < n / 4; i++) {
    createComputation1(sources[i]);
    createComputation1(sources[i]);
    createComputation1(sources[i]);
    createComputation1(sources[i]);
  }
}

function createComputations1to2(n, sources) {
  for (var i = 0; i < n / 2; i++) {
    createComputation1(sources[i]);
    createComputation1(sources[i]);
  }
}

function createComputations1to1(n, sources) {
  for (var i = 0; i < n; i++) {
    createComputation1(sources[i]);
  }
}

function createComputations2to1(n, sources) {
  for (var i = 0; i < n; i++) {
    createComputation2(sources[i * 2], sources[i * 2 + 1]);
  }
}

function createComputations4to1(n, sources) {
  for (var i = 0; i < n; i++) {
    createComputation4(
      sources[i * 4],
      sources[i * 4 + 1],
      sources[i * 4 + 2],
      sources[i * 4 + 3],
    );
  }
}

// only create n / 100 computations, as otherwise takes too long
function createComputations1000to1(n, sources) {
  for (var i = 0; i < n; i++) {
    createComputation1000(sources, i * 1000);
  }
}

function createComputation0(i) {
  effect(function () {
    return i;
  });
}

function createComputation1(s1) {
  effect(function () {
    return s1.val();
  });
}

function createComputation2(s1, s2) {
  effect(function () {
    return s1.val() + s2.val();
  });
}

function createComputation4(s1, s2, s3, s4) {
  effect(function () {
    return s1.val() + s2.val() + s3.val() + s4.val();
  });
}

function createComputation1000(ss, offset) {
  effect(function () {
    var sum = 0;
    for (var i = 0; i < 1000; i++) {
      sum += ss[offset + i].val();
    }
    return sum;
  });
}

function updateComputations1to1(n, sources) {
  var s1 = sources[0];
  effect(function () {
    return s1.val();
  });
  for (var i = 0; i < n; i++) {
    s1.set(i);
  }
}

function updateComputations2to1(n, sources) {
  var s1 = sources[0],
    s2 = sources[1];
  effect(function () {
    return s1.val() + s2.val();
  });
  for (var i = 0; i < n; i++) {
    s1.set(i);
  }
}

function updateComputations4to1(n, sources) {
  var s1 = sources[0],
    s2 = sources[1],
    s3 = sources[2],
    s4 = sources[3];
  effect(function () {
    return s1.val() + s2.val() + s3.val() + s4.val();
  });
  for (var i = 0; i < n; i++) {
    s1.set(i);
  }
}

function updateComputations1000to1(n, sources) {
  var s1 = sources[0];
  effect(function () {
    var sum = 0;
    for (var i = 0; i < 1000; i++) {
      sum += sources[i].val();
    }
    return sum;
  });
  for (var i = 0; i < n; i++) {
    s1.set(i);
  }
}

function updateComputations1to2(n, sources) {
  var s1 = sources[0];
  effect(function () {
    return s1.val();
  });
  effect(function () {
    return s1.val();
  });
  for (var i = 0; i < n / 2; i++) {
    s1.set(i);
  }
}

function updateComputations1to4(n, sources) {
  var s1 = sources[0];
  effect(function () {
    return s1.val();
  });
  effect(function () {
    return s1.val();
  });
  effect(function () {
    return s1.val();
  });
  effect(function () {
    return s1.val();
  });
  for (var i = 0; i < n / 4; i++) {
    s1.set(i);
  }
}

function updateComputations1to1000(n, sources) {
  var s1 = sources[0];
  for (var i = 0; i < 1000; i++) {
    effect(function () {
      return s1.val();
    });
  }
  for (var i = 0; i < n / 1000; i++) {
    s1.set(i);
  }
}
