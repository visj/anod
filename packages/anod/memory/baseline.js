/**
 * Baseline: raw async function overhead without any reactive system.
 * Mirrors suspend.js test structure exactly for fair comparison.
 *
 * Run with: node --expose-gc memory/baseline.js
 *
 * Uses a minimal "Watcher" object that stores the fn as a property
 * and calls it via a prototype .update() method with try/catch/finally
 * to prevent V8 from inlining/dead-code-eliminating the async work.
 */

import { cursorTo, clearLine } from "node:readline";

const NO_PROGRESS = process.argv.includes("--no-progress");

function updateLoader(percent, width = 20) {
  if (NO_PROGRESS) return;
  const dots = Math.floor((percent / 100) * width);
  const arrow = "-".repeat(Math.max(0, dots - 1)) + ">";
  const padding = " ".repeat(width - dots);
  cursorTo(process.stdout, 0);
  clearLine(process.stdout, 0);
  process.stdout.write(`Progress: [${arrow}${padding}] ${percent}%`);
}

function clearLoader() {
  if (NO_PROGRESS) return;
  cursorTo(process.stdout, 0);
  clearLine(process.stdout, 0);
}

if (typeof global.gc !== "function") {
  console.error("Run with: node --expose-gc memory/baseline.js");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function forceGC(rounds = 3) {
  for (let i = 0; i < rounds; i++) {
    global.gc();
    await sleep(20);
  }
}

const fmtMB = (b) => (b / 1024 / 1024).toFixed(2) + " MB";

let testsPassed = 0;
let testsFailed = 0;

async function runTest(name, fn) {
  await forceGC();
  console.log(`Running test: ${name}`);
  const now = performance.now();
  const before = process.memoryUsage().heapUsed;
  try {
    await fn();
    await forceGC();
    const after = process.memoryUsage().heapUsed;
    const delta = after - before;
    const duration = performance.now() - now;
    clearLoader();
    if (delta > 2 * 1024 * 1024) {
      console.log(`  FAIL ${name}: leaked ${fmtMB(delta)}, duration: ${duration.toFixed(0)}ms`);
      testsFailed++;
    } else {
      console.log(`  PASS ${name} (delta: ${fmtMB(delta)}), duration: ${duration.toFixed(0)}ms`);
      testsPassed++;
    }
  } catch (err) {
    console.log(`  FAIL ${name}: threw ${err.message}`);
    testsFailed++;
  }
}

// ─── Minimal "Watcher" to prevent V8 optimization tricks ─────────────────────

/**
 * Simulates a reactive effect: stores a callback, calls it via prototype
 * method with try/catch/finally, tracks a "value" and an AbortController.
 * This ensures V8 cannot inline or dead-code-eliminate the async work.
 */
function Watcher(fn) {
  this._fn = fn;
  this._value = 0;
  this._disposed = false;
}

Watcher.prototype.update = function (value) {
  this._value = value;
  try {
    this._fn(value);
  } catch (e) {
    // swallow
  } finally {
    if (this._disposed) {
      this._value = null;
    }
  }
};

Watcher.prototype.dispose = function () {
  this._disposed = true;
  this._fn = null;
};

// ─── Test helpers ────────────────────────────────────────────────────────────

function neverResolve() {
  return new Promise(() => {});
}

function nextTick() {
  return Promise.resolve();
}

const ITERATIONS = 1_000_000;
const PAYLOAD_SIZE = 1000;

// ─── Tests ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Baseline: raw async overhead (no reactive system) ===");
  console.log(`Node: ${process.version}`);
  console.log(`Iterations: ${ITERATIONS}, Payload: ${PAYLOAD_SIZE} elements`);
  console.log();

  // ── 1. Re-run watcher with payload + await neverResolve ──────────────────
  await runTest("watcher re-run: payload + await never", async () => {
    const w = new Watcher(async (value) => {
      const payload = new Array(PAYLOAD_SIZE).fill(value);
      await neverResolve();
      return payload;
    });

    for (let i = 1; i <= ITERATIONS; i++) {
      w.update(i);
      if (i % 1000 === 0) {
        updateLoader(Math.floor((i / ITERATIONS) * 100));
        await nextTick();
      }
    }
    w.dispose();
  });

  // ── 2. Create + dispose watcher each iteration ───────────────────────────
  await runTest("create+dispose: payload + await never", async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const w = new Watcher(async (value) => {
        const payload = new Array(PAYLOAD_SIZE).fill(value);
        await neverResolve();
        return payload;
      });
      w.update(i);
      w.dispose();
      if (i % 1000 === 0) {
        updateLoader(Math.floor((i / ITERATIONS) * 100));
        await nextTick();
      }
    }
  });

  // ── 3. Re-run watcher with no payload + await neverResolve ───────────────
  await runTest("watcher re-run: no payload + await never", async () => {
    const w = new Watcher(async (value) => {
      await neverResolve();
      return value;
    });

    for (let i = 1; i <= ITERATIONS; i++) {
      w.update(i);
      if (i % 1000 === 0) {
        updateLoader(Math.floor((i / ITERATIONS) * 100));
        await nextTick();
      }
    }
    w.dispose();
  });

  // ── 4. Create + dispose watcher, no payload ──────────────────────────────
  await runTest("create+dispose: no payload + await never", async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const w = new Watcher(async (value) => {
        await neverResolve();
        return value;
      });
      w.update(i);
      w.dispose();
      if (i % 1000 === 0) {
        updateLoader(Math.floor((i / ITERATIONS) * 100));
        await nextTick();
      }
    }
  });

  // ── 5. Rapid re-run (no yielding between each) ──────────────────────────
  await runTest("rapid re-run: payload + await tick", async () => {
    const w = new Watcher(async (value) => {
      const data = new Array(PAYLOAD_SIZE).fill(value);
      await nextTick();
      await neverResolve();
      return data;
    });

    for (let i = 1; i <= ITERATIONS; i++) {
      w.update(i);
      if (i % 1000 === 0) {
        updateLoader(Math.floor((i / ITERATIONS) * 100));
      }
      if (i % 5000 === 0) {
        await nextTick();
      }
    }
    w.dispose();
  });

  // ── 6. Chained awaits then dispose ──────────────────────────────────────
  await runTest("create+dispose: chained awaits", async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const w = new Watcher(async (value) => {
        await Promise.resolve(1);
        await Promise.resolve(2);
        await Promise.resolve(3);
        const payload = new Array(PAYLOAD_SIZE).fill(value);
        await neverResolve();
        return payload;
      });
      w.update(i);
      w.dispose();
      if (i % 1000 === 0) {
        updateLoader(Math.floor((i / ITERATIONS) * 100));
        await nextTick();
      }
    }
  });


  // ── Summary ──────────────────────────────────────────────────────────────
  console.log();
  console.log("─── Summary ───");
  console.log(`  ${testsPassed} passed, ${testsFailed} failed`);
  process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
