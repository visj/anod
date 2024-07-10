/**
 * Extracted from: https://github.com/Riim/cellx#benchmark
 */

import kleur from 'kleur';

import { reactive } from '@reactively/core';
import * as cellx from 'cellx';
import * as Sjs from 's-js';
import * as solid from "solid-js/dist/solid.js";
import * as preact from '@preact/signals-core';
import * as maverick from '@maverick-js/signals';
import * as usignal from "usignal";
import Table from 'cli-table';
import * as anod from "../../dist/anod.mjs";

const BATCHED = false;
const RUNS_PER_TIER = 500;
const LAYER_TIERS = [1, 2, 3, 4, 5, 10, 15, 20, 25, 50, 100, 500, 1000, 2000, 2500];

async function collectGarbage() {
  return new Promise(resolve => {
    setTimeout(() => {
      if (global.gc) {
        global.gc();
      }
      resolve();
    });
  })
}

const med = (array) => {
  return array.reduce((a, b) => a + b, 0) / array.length;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

const SOLUTIONS = [
  [3, 2, 4, 2],
  [4, -2, 4, 4],
  [-1, -2, 3, 4],
  [2, 2, 4, 2],
  [-4, -4, -1, 2],
  [2, 2, 4, 2],
  [-1, -2, 3, 4],
  [4, -2, 4, 4],
  [3, 2, 4, 2],
  [4, -2, 4, 4],
  [-2, -4, 2, 3],
  [4, -2, 4, 4],
  [-2, -4, 2, 3],
  [4, -2, 4, 4],
  [-2, -4, 2, 3]
];

/**
 * @param {number} layers
 * @param {number[]} answer
 */
const isSolution = (layers, answer) => {
  return answer.every((_, i) => (
    SOLUTIONS[LAYER_TIERS.indexOf(layers)][i] === _)
  );
};

var rand = 0;

async function main() {
  const report = {};

  report.solid = { fn: runSolid, runs: [] };
  report.S = { fn: runS, runs: [] };
  report.maverick = { fn: runMaverick, runs: [], avg: [] };
  report['preact/signals'] = { fn: runPreact, runs: [] };
  report.usignal = { fn: runUsignal, runs: [] };
  report.anod = { fn: runAnod, runs: [] };
  // Has no way to dispose so can't consider it feature comparable.
  report.reactively = { fn: runReactively, runs: [], avg: [] };
  // These libraries are not comparable in terms of features.
  // report.cellx = { fn: runCellx, runs: [] };

  // warm up first
  for (const lib of Object.keys(report)) {
    const current = report[lib];

    for (let i = 0; i < LAYER_TIERS.length; i += 1) {
      let layers = LAYER_TIERS[i];
      const runs = [];
      for (let j = 0; j < RUNS_PER_TIER; j += 1) {
        runs.push(await start(current.fn, layers));
      }
      // Give cellx time to release its global pendingCells array
      await new Promise((resolve) => setTimeout(resolve, 0));
      await collectGarbage();
    }
  }

  for (const lib of shuffleArray(Object.keys(report))) {
    rand = 0;
    const current = report[lib];
    for (let i = 0; i < LAYER_TIERS.length; i += 1) {
      let layers = LAYER_TIERS[i];
      const runs = [];
      rand++;
      for (let j = 0; j < RUNS_PER_TIER; j += 1) {
        runs.push(await start(current.fn, layers));
      }
      // Give cellx time to release its global pendingCells array
      await new Promise((resolve) => setTimeout(resolve, 0));

      current.runs[i] = med(runs) * 1000;
      await collectGarbage();
    }
  }

  const table = new Table({
    head: ['', ...LAYER_TIERS.map((n) => kleur.bold(kleur.cyan(n)))],
  });

  for (let i = 0; i < LAYER_TIERS.length; i += 1) {
    let min = Infinity,
      max = -1,
      fastestLib,
      slowestLib;

    for (const lib of Object.keys(report)) {
      const time = report[lib].runs[i];

      if (time < min) {
        min = time;
        fastestLib = lib;
      }

      if (time > max) {
        max = time;
        slowestLib = lib;
      }
    }
    if (Object.keys(report).length > 1) {
      report[fastestLib].runs[i] = kleur.green(report[fastestLib].runs[i].toFixed(2));
      report[slowestLib].runs[i] = kleur.red(report[slowestLib].runs[i].toFixed(2));
    }
  }

  for (const lib of Object.keys(report)) {
    table.push([
      kleur.magenta(lib),
      ...report[lib].runs.map((n) => (typeof n === 'number' ? n.toFixed(2) : n)),
    ]);
  }

  console.log(table.toString());
}

async function start(runner, layers) {
  return new Promise((done) => {
    runner(layers, done);
  }).catch((err) => {
    console.error(err);
    return -1;
  });
}

/**
 * @see {@link https://github.com/modderme123/reactively}
 */
function runReactively(layers, done) {
  const start = {
    a: reactive(1),
    b: reactive(2),
    c: reactive(3),
    d: reactive(4),
  };

  let layer = start;

  for (let i = layers; i--;) {
    layer = ((m) => {
      return {
        a: reactive(() => rand % 2 ? m.b.value : m.c.value),
        b: reactive(() => m.a.value - m.c.value),
        c: reactive(() => m.b.value + m.d.value),
        d: reactive(() => m.c.value),
      };
    })(layer);
  }
  const startTime = performance.now();

  const end = layer;
  if (BATCHED) {
    start.a.set(4);
    start.b.set(3);
    start.c.set(2);
    start.d.set(1);
  } else {
    start.a.set(4);
    end.a.get(), end.b.get(), end.c.get(), end.d.get();
    start.b.set(3);
    end.a.get(), end.b.get(), end.c.get(), end.d.get();
    start.c.set(2);
    end.a.get(), end.b.get(), end.c.get(), end.d.get();
    start.d.set(1);
  }

  const solution = [end.a.get(), end.b.get(), end.c.get(), end.d.get()];
  const endTime = performance.now() - startTime;

  done(isSolution(layers, solution) ? endTime : -1);
}

/**
 * @see {@link https://github.com/maverick-js/signals}
 */
function runMaverick(layers, done) {
  maverick.root((dispose) => {
    const start = {
      a: maverick.signal(1),
      b: maverick.signal(2),
      c: maverick.signal(3),
      d: maverick.signal(4),
    };

    let layer = start;

    for (let i = layers; i--;) {
      layer = ((m) => {
        return {
          a: maverick.computed(() => rand % 2 ? m.b() : m.c()),
          b: maverick.computed(() => m.a() - m.c()),
          c: maverick.computed(() => m.b() + m.d()),
          d: maverick.computed(() => m.c()),
        };
      })(layer);
    }
    const startTime = performance.now();

    const end = layer;
    if (BATCHED) {
      start.a.set(4);
      start.b.set(3);
      start.c.set(2);
      start.d.set(1);
      maverick.tick();
    } else {
      start.a.set(4);
      maverick.tick();
      end.a(), end.b(), end.c(), end.d();
      start.b.set(3);
      maverick.tick();
      end.a(), end.b(), end.c(), end.d();
      start.c.set(2);
      maverick.tick();
      end.a(), end.b(), end.c(), end.d();
      start.d.set(1);
      maverick.tick();
    }

    const solution = [end.a(), end.b(), end.c(), end.d()];
    const endTime = performance.now() - startTime;
    dispose();
    done(isSolution(layers, solution) ? endTime : -1);
  });
}

/**
 * @see {@link https://github.com/adamhaile/S}
 */
function runS(layers, done) {
  const S = Sjs.default;

  S.root((dispose) => {
    const start = {
      a: S.data(1),
      b: S.data(2),
      c: S.data(3),
      d: S.data(4),
    };

    let layer = start;

    for (let i = layers; i--;) {
      layer = ((m) => {
        return {
          a: S(() => rand % 2 ? m.b() : m.c()),
          b: S(() => m.a() - m.c()),
          c: S(() => m.b() + m.d()),
          d: S(() => m.c()),
        };
      })(layer);
    }
    const startTime = performance.now();

    const end = layer;
    if (BATCHED) {
      S.freeze(() => {
        start.a(4);
        start.b(3);
        start.c(2);
        start.d(1);
      });
    } else {
      start.a(4);
      end.a(), end.b(), end.c(), end.d();
      start.b(3);
      end.a(), end.b(), end.c(), end.d();
      start.c(2);
      end.a(), end.b(), end.c(), end.d();
      start.d(1);
    }
    const solution = [end.a(), end.b(), end.c(), end.d()];
    const endTime = performance.now() - startTime;
    dispose();
    done(isSolution(layers, solution) ? endTime : -1);
  });
}

function runAnod(layers, done) {
  anod.root((dispose) => {
    const start = {
      a: anod.data(1),
      b: anod.data(2),
      c: anod.data(3),
      d: anod.data(4),
    };

    let layer = start;

    for (let i = layers; i--;) {
      layer = ((m) => {
        return {
          a: anod.compute(() => rand % 2 ? m.b.val() : m.c.val(), 0),
          b: anod.compute(() => m.a.val() - m.c.val(), 0),
          c: anod.compute(() => m.b.val() + m.d.val(), 0),
          d: anod.compute(() => m.c.val(), 0),
        };
      })(layer);
    }
    const startTime = performance.now();

    const end = layer;
    if (BATCHED) {
      anod.batch(() => {
        start.a.update(4);
        start.b.update(3);
        start.c.update(2);
        start.d.update(1);
      });
    } else {
      start.a.update(4);
      end.a.val(), end.b.val(), end.c.val(), end.d.val();
      start.b.update(3);
      end.a.val(), end.b.val(), end.c.val(), end.d.val();
      start.c.update(2);
      end.a.val(), end.b.val(), end.c.val(), end.d.val();
      start.d.update(1);
    }

    const solution = [end.a.val(), end.b.val(), end.c.val(), end.d.val()];
    const endTime = performance.now() - startTime;
    dispose();
    done(isSolution(layers, solution) ? endTime : -1);
  });
}

/**
 * @see {@link https://github.com/solidjs/solid}
 */
function runSolid(layers, done) {
  solid.createRoot((dispose) => {
    const [a, setA] = solid.createSignal(1),
      [b, setB] = solid.createSignal(2),
      [c, setC] = solid.createSignal(3),
      [d, setD] = solid.createSignal(4);

    const start = { a, b, c, d };

    let layer = start;

    for (let i = layers; i--;) {
      layer = ((m) => {
        const props = {
          a: solid.createMemo(() => rand % 2 ? m.b() : m.c()),
          b: solid.createMemo(() => m.a() - m.c()),
          c: solid.createMemo(() => m.b() + m.d()),
          d: solid.createMemo(() => m.c()),
        };

        return props;
      })(layer);
    }
    const startTime = performance.now();

    const end = layer;

    if (BATCHED) {
      solid.batch(() => {
        setA(4), setB(3), setC(2), setD(1);
      });
    } else {
      setA(4), end.a(), end.b(), end.c(), end.d();
      setB(3), end.a(), end.b(), end.c(), end.d();
      setC(2), end.a(), end.b(), end.c(), end.d();
      setD(1);
    }

    const solution = [end.a(), end.b(), end.c(), end.d()];
    const endTime = performance.now() - startTime;
    dispose();
    done(isSolution(layers, solution) ? endTime : -1);
  });
}

/**
 * @see {@link https://github.com/preactjs/signals}
 */
function runPreact(layers, done) {
  const a = preact.signal(1),
    b = preact.signal(2),
    c = preact.signal(3),
    d = preact.signal(4);

  const start = { a, b, c, d };

  let layer = start;

  for (let i = layers; i--;) {
    layer = ((m) => {
      const props = {
        a: preact.computed(() => rand % 2 ? m.b.value : m.c.value),
        b: preact.computed(() => m.a.value - m.c.value),
        c: preact.computed(() => m.b.value + m.d.value),
        d: preact.computed(() => m.c.value),
      };
      return props;
    })(layer);
  }
  const startTime = performance.now();

  const end = layer;
  if (BATCHED) {
    preact.batch(() => {
      a.value = 4;
      b.value = 3;
      c.value = 2;
      d.value = 1;
    });
  } else {
    a.value = 4;
    end.a.value, end.b.value, end.c.value, end.d.value;
    b.value = 3;
    end.a.value, end.b.value, end.c.value, end.d.value;
    c.value = 2;
    end.a.value, end.b.value, end.c.value, end.d.value;
    d.value = 1;
  }
  const solution = [end.a.value, end.b.value, end.c.value, end.d.value];
  const endTime = performance.now() - startTime;
  done(isSolution(layers, solution) ? endTime : -1);
}

/**
 * @see {@link https://github.com/Riim/cellx}
 */
function runCellx(layers, done) {
  const start = {
    a: new cellx.Cell(1),
    b: new cellx.Cell(2),
    c: new cellx.Cell(3),
    d: new cellx.Cell(4),
  };

  let layer = start;

  for (let i = layers; i--;) {
    layer = ((m) => {
      const props = {
        a: new cellx.Cell(() => rand % 2 ? m.b.get() : m.c.get()),
        b: new cellx.Cell(() => m.a.get() - m.c.get()),
        c: new cellx.Cell(() => m.b.get() + m.d.get()),
        d: new cellx.Cell(() => m.c.get()),
      };

      props.a.on('change', function () { });
      props.b.on('change', function () { });
      props.c.on('change', function () { });
      props.d.on('change', function () { });

      return props;
    })(layer);
  }
  const startTime = performance.now();

  const end = layer;
  if (BATCHED) {
    start.a.set(4);
    start.b.set(3);
    start.c.set(2);
    start.d.set(1);
  } else {
    start.a.set(4), end.a.get(), end.b.get(), end.c.get(), end.d.get();
    start.b.set(3), end.a.get(), end.b.get(), end.c.get(), end.d.get();
    start.c.set(2), end.a.get(), end.b.get(), end.c.get(), end.d.get();
    start.d.set(1);
  }

  const solution = [end.a.get(), end.b.get(), end.c.get(), end.d.get()];
  const endTime = performance.now() - startTime;

  start.a.dispose();
  start.b.dispose();
  start.c.dispose();
  start.d.dispose();

  done(isSolution(layers, solution) ? endTime : -1);
}

function runUsignal(layers, done) {
  const a = usignal.signal(1),
    b = usignal.signal(2),
    c = usignal.signal(3),
    d = usignal.signal(4);

  const start = { a, b, c, d };

  let layer = start;

  for (let i = layers; i--;) {
    layer = ((m) => {
      const props = {
        a: usignal.computed(() => rand % 2 ? m.b.value : m.c.value),
        b: usignal.computed(() => m.a.value - m.c.value),
        c: usignal.computed(() => m.b.value + m.d.value),
        d: usignal.computed(() => m.c.value),
      };

      return props;
    })(layer);
  }
  const startTime = performance.now();

  const end = layer;
  if (BATCHED) {
    usignal.batch(() => {
      a.value = 4, b.value = 3, c.value = 2, d.value = 1;
      const solution = [end.a.value, end.b.value, end.c.value, end.d.value];
      const endTime = performance.now() - startTime;
      done(isSolution(layers, solution) ? endTime : -1);
    });
  } else {
    a.value = 4, end.a.value, end.b.value, end.c.value, end.d.value;
    b.value = 3, end.a.value, end.b.value, end.c.value, end.d.value;
    c.value = 2, end.a.value, end.b.value, end.c.value, end.d.value;
    d.value = 1;
    const solution = [end.a.value, end.b.value, end.c.value, end.d.value];
    const endTime = performance.now() - startTime;
    done(isSolution(layers, solution) ? endTime : -1);
  }
}

main();
