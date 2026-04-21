/**
 * Memory pressure test for anod's async primitives.
 *
 * Run with: node --expose-gc memory/test.js
 *
 * Tests that the REGRET thenable mechanism correctly allows GC to collect
 * abandoned async continuations. Exercises every variation where a suspended
 * promise may be silently discarded:
 *
 * 1. spawn re-runs while awaiting a native promise (stale activation)
 * 2. spawn is disposed while awaiting
 * 3. task re-runs while awaiting (stale activation)
 * 4. task is disposed while awaiting
 * 5. spawn awaiting a task that re-runs (task invalidation)
 * 6. spawn awaiting a task that disposes (panic path)
 * 7. rapid signal updates causing many abandoned continuations
 * 8. chained suspends — multiple awaits in a single async function
 */

import { c } from "../src/index.js";

import { cursorTo, clearLine } from 'node:readline';

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
  console.error("Run with: node --expose-gc memory/test.js");
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
	console.log(`Running test ${name}`);
	const now = performance.now();
  const before = process.memoryUsage().heapUsed;
  try {
    await fn();
    await forceGC();
    const after = process.memoryUsage().heapUsed;
		const delta = after - before;
		clearLoader();
		const duration = performance.now() - now;
    /** Allow 2MB of noise */
    if (delta > 2 * 1024 * 1024) {
      console.log(`  FAIL ${name}: leaked ${fmtMB(delta)}, duration: ${duration}`);
      testsFailed++;
    } else {
      console.log(`  PASS ${name} (delta: ${fmtMB(delta)}), duration: ${duration}`);
      testsPassed++;
    }
  } catch (err) {
    console.log(`  FAIL ${name}: threw ${err.message}, duration: ${performance.now() - now}`);
    testsFailed++;
	}
}

// ─── Test helpers ────────────────────────────────────────────────────────────

/** Creates a promise that never resolves (simulates a long network request). */
function neverResolve() {
  return new Promise(() => {});
}

/** Creates a promise that resolves after a microtask. */
function nextTick() {
  return Promise.resolve();
}

const ITERATIONS = 1_000_000;
const PAYLOAD_SIZE = 1000;

// ─── Tests ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== anod async memory pressure tests ===");
  console.log(`Node: ${process.version}`);
  console.log(`Iterations: ${ITERATIONS}, Payload: ${PAYLOAD_SIZE} elements`);
  console.log();

  // ── 1. Spawn re-runs while awaiting native promise ───────────────────────
  await runTest("spawn re-run: stale promises collected", async () => {
    const s1 = c.signal(0);
    const r = c.root((r) => {
      r.spawn(async (cx) => {
        cx.val(s1);
        /** Each activation allocates a large payload. On re-run, the
         *  old continuation hits REGRET and should be GC'd. */
        const payload = new Array(PAYLOAD_SIZE).fill(cx.val(s1));
        await cx.suspend(neverResolve());
        // This line should never execute for stale activations
        return payload;
      });
    });

    for (let i = 1; i <= ITERATIONS; i++) {
      s1.set(i);
			if (i % 1000 === 0) {
				updateLoader(Math.floor((i / ITERATIONS) * 100));
				await nextTick();
      }
		}
    r.dispose();
  });

  // ── 2. Spawn disposed while awaiting ─────────────────────────────────────
  await runTest("spawn dispose: pending promises collected", async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const r = c.root((r) => {
        r.spawn(async (cx) => {
          const payload = new Array(PAYLOAD_SIZE).fill(i);
          await cx.suspend(neverResolve());
          return payload;
        });
      });
      r.dispose();
			if (i % 1000 === 0) {
				updateLoader(Math.floor((i / ITERATIONS) * 100));
        await nextTick();
      }
		}
  });

  // ── 3. Task re-runs while awaiting (stale activation) ────────────────────
  await runTest("task re-run: stale activations collected", async () => {
    const s1 = c.signal(0);
    /** Make the task eager by subscribing a spawn to it. */
    const taskA = c.task((cx) => {
      cx.val(s1);
      return cx.suspend(neverResolve());
    });
    const r = c.root((r) => {
      r.spawn(async (cx) => {
        await cx.suspend(taskA);
      });
    });

    for (let i = 1; i <= ITERATIONS; i++) {
      s1.set(i);
			if (i % 1000 === 0) {
				updateLoader(Math.floor((i / ITERATIONS) * 100));
        await nextTick();
      }
    }
    r.dispose();
		taskA.dispose();
  });

  // ── 4. Task disposed while awaiting ──────────────────────────────────────
  await runTest("task dispose: pending task promises collected", async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const taskA = c.task((cx) => {
        return cx.suspend(new Promise(() => {
          // never resolves, holds payload
          new Array(PAYLOAD_SIZE).fill(i);
        }));
      });
      taskA.dispose();
			if (i % 1000 === 0) {
				updateLoader(Math.floor((i / ITERATIONS) * 100));
        await nextTick();
      }
		}
  });

  // ── 5. Spawn awaiting task that re-runs ──────────────────────────────────
  await runTest("spawn awaits task that re-runs: channel cleaned", async () => {
    const s1 = c.signal(0);
    const taskA = c.task((cx) => {
      cx.val(s1);
      return cx.suspend(neverResolve());
    });

    const r = c.root((r) => {
      r.spawn(async (cx) => {
        /** Each time the task re-runs, the awaiter's promise is stale
         *  and must be collected. */
        const val = await cx.suspend(taskA);
        return val;
      });
    });

    for (let i = 1; i <= ITERATIONS; i++) {
      s1.set(i);
			if (i % 1000 === 0) {
				updateLoader(Math.floor((i / ITERATIONS) * 100));
        await nextTick();
      }
    }
    r.dispose();
		taskA.dispose();
  });

  // ── 6. Spawn awaiting task that disposes (panic) ─────────────────────────
  await runTest("spawn awaits task that disposes: panic path collected", async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const taskA = c.task((cx) => cx.suspend(neverResolve()));
      const r = c.root((r) => {
        r.spawn(async (cx) => {
          cx.recover(() => true);
          const payload = new Array(PAYLOAD_SIZE).fill(i);
          await cx.suspend(taskA);
          return payload;
        });
      });
      taskA.dispose(); // panics the spawn
      r.dispose();
			if (i % 1000 === 0) {
				updateLoader(Math.floor((i / ITERATIONS) * 100));
        await nextTick();
      }
		}
  });

  // ── 7. Rapid signal updates: many abandoned continuations ────────────────
  await runTest("rapid updates: all abandoned continuations collected", async () => {
    const s1 = c.signal(0);
    let totalAllocated = 0;

    const r = c.root((r) => {
      r.spawn(async (cx) => {
        cx.val(s1);
        totalAllocated++;
        /** Simulate holding resources between awaits */
        const data = new Array(PAYLOAD_SIZE).fill(cx.val(s1));
        await cx.suspend(nextTick());
        /** Second await — only reached if not stale */
        await cx.suspend(new Promise((resolve) => setTimeout(resolve, 50_000)));
        return data;
      });
    });

    /** Flood with updates — each one creates a new activation
     *  that immediately stales the previous one. */
    for (let i = 1; i <= ITERATIONS; i++) {
			s1.set(i);
			if (i % 1000 === 0) {
				updateLoader(Math.floor((i / ITERATIONS) * 100));
			}
			if (i % 5000 === 0) {
        await nextTick();
      }
    }
		r.dispose();
  });

  // ── 8. Chained suspends — multiple awaits per function ───────────────────
  await runTest("chained suspends: intermediate promises collected", async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const r = c.root((r) => {
        r.spawn(async (cx) => {
          await cx.suspend(Promise.resolve(1));
          await cx.suspend(Promise.resolve(2));
          await cx.suspend(Promise.resolve(3));
          const payload = new Array(PAYLOAD_SIZE).fill(i);
          await cx.suspend(neverResolve());
          return payload;
        });
      });
      r.dispose();
			if (i % 1000 === 0) {
				updateLoader(Math.floor((i / ITERATIONS) * 100));
        await nextTick();
      }
    }
  });

  // ── 9. WeakRef in suspend: node collected even with pending promise ──────
  await runTest("WeakRef: disposed node collected despite pending promise", async () => {
    let collected = 0;
    const registry = new FinalizationRegistry(() => { collected++; });

    for (let i = 0; i < 1000; i++) {
      const r = c.root((r) => {
        const spawn = r.spawn(async (cx) => {
          await cx.suspend(neverResolve());
        });
        registry.register(spawn, i);
      });
      r.dispose();
    }

    await forceGC(5);
    /** At least 90% should be collected. */
    if (collected < 900) {
      throw new Error(`Only ${collected}/1000 finalized`);
    }
  });

  // ── 10. Task with controller + spawn awaiter: full lifecycle ──────────────
  await runTest("full lifecycle: task+controller+spawn all collected", async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const s1 = c.signal(i);
      const r = c.root((r) => {
        const taskA = r.task(async (cx) => {
          cx.controller();
          return cx.suspend(neverResolve());
        });
        r.spawn(async (cx) => {
          await cx.suspend(taskA);
        });
      });
      r.dispose();
			if (i % 1000 === 0) {
				updateLoader(Math.floor((i / ITERATIONS) * 100));
        await nextTick();
      }
    }
  });

  // ── 11. Promise.all inside suspend: does it leak? ─────────────────────────
  await runTest("Promise.all inside suspend: retains promises (LEAK expected)", async () => {
    const s1 = c.signal(0);
    const r = c.root((r) => {
      r.spawn(async (cx) => {
        cx.val(s1);
        await cx.suspend(Promise.all([
          neverResolve(),
          neverResolve(),
          neverResolve(),
        ]));
      });
    });

    for (let i = 1; i <= ITERATIONS; i++) {
      s1.set(i);
      if (i % 1000 === 0) {
        updateLoader(Math.floor((i / ITERATIONS) * 100));
        await nextTick();
      }
    }
    r.dispose();
  });

  // ── 12. Promise.race inside suspend: same leak pattern ───────────────────
  await runTest("Promise.race inside suspend: retains promises (LEAK expected)", async () => {
    const s1 = c.signal(0);
    const r = c.root((r) => {
      r.spawn(async (cx) => {
        cx.val(s1);
        await cx.suspend(Promise.race([
          neverResolve(),
          neverResolve(),
          neverResolve(),
        ]));
      });
    });

    for (let i = 1; i <= ITERATIONS; i++) {
      s1.set(i);
      if (i % 1000 === 0) {
        updateLoader(Math.floor((i / ITERATIONS) * 100));
        await nextTick();
      }
    }
    r.dispose();
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
