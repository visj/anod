/**
 * Memory pressure test for anod's sync pending() pattern.
 * Mirrors suspend.js structure for direct comparison.
 *
 * Run with: node --expose-gc memory/pending.js
 *
 * Instead of await c.suspend(task), uses:
 *   if (c.pending(task)) return;
 *   const val = c.val(task);
 *
 * This is the "pull" flow — no promises, no async frames, no WeakRefs.
 * Should be significantly cheaper than the suspend flow.
 */

import { c } from "../src/index.js";
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
  console.error("Run with: node --expose-gc memory/pending.js");
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
  console.log("=== anod pending() memory pressure tests ===");
  console.log(`Node: ${process.version}`);
  console.log(`Iterations: ${ITERATIONS}, Payload: ${PAYLOAD_SIZE} elements`);
  console.log();

  // ── 1. Effect with pending: task re-runs, effect re-runs via pending ─────
  await runTest("effect + pending: task re-runs (signal dep)", async () => {
    const s1 = c.signal(0);
    const taskA = c.task((cx) => {
      cx.val(s1);
      return cx.suspend(neverResolve());
    });
    let effectRuns = 0;
    c.effect((cx) => {
      effectRuns++;
      if (cx.pending(taskA)) {
        return;
      }
      cx.val(taskA);
    });

    for (let i = 1; i <= ITERATIONS; i++) {
      s1.set(i);
      if (i % 1000 === 0) {
        updateLoader(Math.floor((i / ITERATIONS) * 100));
        await nextTick();
      }
    }
    taskA.dispose();
  });

  // ── 2. Create+dispose task with effect subscriber ────────────────────────
  await runTest("create+dispose: task + pending effect", async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const r = c.root((r) => {
        const taskA = r.task((cx) => cx.suspend(neverResolve()));
        r.effect((cx) => {
          if (cx.pending(taskA)) {
            return;
          }
          cx.val(taskA);
        });
      });
      r.dispose();
      if (i % 1000 === 0) {
        updateLoader(Math.floor((i / ITERATIONS) * 100));
        await nextTick();
      }
    }
  });

  // ── 3. Multiple tasks with pending pattern ───────────────────────────────
  await runTest("pending: multiple tasks, one signal", async () => {
    const s1 = c.signal(0);
    const taskA = c.task((cx) => { cx.val(s1); return cx.suspend(neverResolve()); });
    const taskB = c.task((cx) => { cx.val(s1); return cx.suspend(neverResolve()); });
    const taskC = c.task((cx) => { cx.val(s1); return cx.suspend(neverResolve()); });

    let effectRuns = 0;
    c.effect((cx) => {
      effectRuns++;
      if (cx.pending([taskA, taskB, taskC])) {
        return;
      }
      cx.val(taskA);
      cx.val(taskB);
      cx.val(taskC);
    });

    for (let i = 1; i <= ITERATIONS; i++) {
      s1.set(i);
      if (i % 1000 === 0) {
        updateLoader(Math.floor((i / ITERATIONS) * 100));
        await nextTick();
      }
    }
    taskA.dispose();
    taskB.dispose();
    taskC.dispose();
  });

  // ── 4. Task that resolves, triggers effect, then re-runs ─────────────────
  await runTest("pending: task resolves and re-runs in cycle", async () => {
    const s1 = c.signal(0);
    let taskRuns = 0;
    let effectRuns = 0;
    const taskA = c.task((cx) => {
      taskRuns++;
      return cx.suspend(Promise.resolve(cx.val(s1) * 10));
    });

    c.effect((cx) => {
      effectRuns++;
      if (cx.pending(taskA)) {
        return;
      }
      cx.val(taskA);
    });

    await nextTick(); // let first settle
    for (let i = 1; i <= ITERATIONS; i++) {
      s1.set(i);
      if (i % 1000 === 0) {
        updateLoader(Math.floor((i / ITERATIONS) * 100));
        await nextTick();
      }
    }
    await nextTick();
    taskA.dispose();
  });

  // ── 5. Rapid signal updates (no yielding) ────────────────────────────────
  await runTest("rapid updates: pending check per set", async () => {
    const s1 = c.signal(0);
    const taskA = c.task((cx) => {
      cx.val(s1);
      return cx.suspend(neverResolve());
    });
    let effectRuns = 0;
    c.effect((cx) => {
      effectRuns++;
      if (cx.pending(taskA)) {
        return;
      }
      cx.val(taskA);
    });

    for (let i = 1; i <= ITERATIONS; i++) {
      s1.set(i);
      if (i % 1000 === 0) {
        updateLoader(Math.floor((i / ITERATIONS) * 100));
      }
      if (i % 5000 === 0) {
        await nextTick();
      }
    }
    taskA.dispose();
  });

  // ── 6. Compute using pending to derive loading state ─────────────────────
  await runTest("compute + pending: derives loading state", async () => {
    const s1 = c.signal(0);
    const taskA = c.task((cx) => {
      cx.val(s1);
      return cx.suspend(neverResolve());
    });
    const status = c.compute((cx) => {
      if (cx.pending(taskA)) {
        return "loading";
      }
      return "value:" + cx.val(taskA);
    });
    let effectRuns = 0;
    c.effect((cx) => {
      effectRuns++;
      cx.val(status);
    });

    for (let i = 1; i <= ITERATIONS; i++) {
      s1.set(i);
      if (i % 1000 === 0) {
        updateLoader(Math.floor((i / ITERATIONS) * 100));
        await nextTick();
      }
    }
    taskA.dispose();
    status.dispose();
  });

  // ── 7. Full lifecycle: create, wait, resolve, re-run (with payload) ──────
  await runTest("full lifecycle: pending + resolve + payload", async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const r = c.root((r) => {
        const taskA = r.task((cx) => cx.suspend(Promise.resolve(new Array(PAYLOAD_SIZE).fill(i))));
        r.effect((cx) => {
          if (cx.pending(taskA)) {
            return;
          }
          cx.val(taskA);
        });
      });
      r.dispose();
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
