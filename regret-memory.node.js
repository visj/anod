// regret-memory.node.js
//
// Run with:  node --expose-gc regret-memory.node.js
//
// Validates that abandoning an async continuation through a "REGRET" thenable
// (whose .then drops the resolvers) lets V8 collect the suspended frame.
//
// Two checks:
//   1. Correctness — the code after `await suspend(...)` only runs when we
//      actually pass the promise through.
//   2. Memory    — frames that hit REGRET are reachable only via REGRET's
//      dropped resolvers, so they must be collectible.
//
// Tweak CONFIG below to match your workload shape.

"use strict";

const CONFIG = {
  iterations: 10_000_000,
  triggerAt: 999_999, // which iteration is allowed to resolve
  variant: "chain", // 'direct' or 'chain'
  payloadSize: 200, // array length held per frame (bigger = clearer signal)
  gcSettleMs: 50 // how long to wait between GC passes
};

if (typeof global.gc !== "function") {
  console.error("This test needs --expose-gc. Run:");
  console.error("  node --expose-gc " + require("path").basename(__filename));
  process.exit(1);
}

// The whole trick: an object with a .then that never calls its resolvers.
// Once the await machinery hands its (resolve, reject) pair to this .then
// and the call returns, nothing references those resolvers anymore.
const REGRET = { then: function () {} };

let sideEffect = 0;

// FinalizationRegistry lets us count how many per-iteration tag objects the
// GC actually reclaimed. This is a stronger signal than heap deltas alone.
let finalizedCount = 0;
const registry = new FinalizationRegistry(() => {
  finalizedCount++;
});

function somePromise(tag, payloadSize) {
  return Promise.resolve({ tag, payload: new Array(payloadSize).fill(0) });
}

// Two variants of `suspend`. Both should GC identically; the .then chain just
// allocates an extra promise + closure per call so the peak is larger.
function suspendDirect(promise, allow) {
  return allow ? promise : REGRET;
}

function suspendChain(promise, allow) {
  return promise.then((value) => (allow ? value : REGRET));
}

async function updateFn(i, suspend) {
  // A tag object the frame closes over. If the frame survives, so does this.
  const tag = { i };
  registry.register(tag, i);

  // const val = await suspend(
  //   somePromise(tag, CONFIG.payloadSize),
  //   i === CONFIG.triggerAt
  // );
  const val = await somePromise(tag, CONFIG.payloadSize);
  sideEffect++; // should run exactly once — when i === CONFIG.triggerAt
  return val;
}

// ---------- helpers ----------

const fmtMB = (b) => (b / 1024 / 1024).toFixed(2).padStart(8) + " MB";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function forceGc(rounds = 3) {
  for (let i = 0; i < rounds; i++) {
    global.gc();
    // A short timer lets pending finalizers and weak-callback work run.
    await sleep(CONFIG.gcSettleMs);
  }
}

function rss() {
  return process.memoryUsage().heapUsed;
}

// ---------- runner ----------

async function run() {
  const suspend = CONFIG.variant === "chain" ? suspendChain : suspendDirect;

  console.log("=== REGRET memory test ===");
  console.log("Node:       ", process.version);
  console.log("Iterations: ", CONFIG.iterations.toLocaleString());
  console.log("Trigger at: ", CONFIG.triggerAt);
  console.log(
    "Variant:    ",
    CONFIG.variant,
    "(" +
      (CONFIG.variant === "chain"
        ? "promise.then chain"
        : "direct REGRET return") +
      ")"
  );
  console.log("Payload:    ", CONFIG.payloadSize, "element array per frame");
  console.log();

  await forceGc();
  const baseline = rss();
  console.log("Baseline heap:", fmtMB(baseline));

  const t0 = Date.now();
  for (let i = 0; i < CONFIG.iterations; i++) {
    // Intentionally unawaited — the returned promise is orphaned.
    updateFn(i, suspend);
    if (i % 500_000 === 0) {
      await sleep(10);
    }
  }
  const dispatchMs = Date.now() - t0;

  // Drain microtasks so the chains actually run and hit REGRET.
  await sleep(100);

  const peak = rss();
  console.log(
    "Peak heap:    ",
    fmtMB(peak),
    " (+",
    fmtMB(peak - baseline).trim(),
    ")"
  );

  await forceGc();
  const settled = rss();
  console.log(
    "After GC:     ",
    fmtMB(settled),
    " (+",
    fmtMB(settled - baseline).trim(),
    ")"
  );

  console.log();
  console.log("--- results ---");
  console.log("sideEffect count:", sideEffect, "(expected 1)");
  console.log(
    "Finalized tags:  ",
    finalizedCount.toLocaleString(),
    "of",
    CONFIG.iterations.toLocaleString()
  );
  const retained = CONFIG.iterations - finalizedCount;
  const retainedPct = ((retained / CONFIG.iterations) * 100).toFixed(2);
  console.log(
    "Retained tags:   ",
    retained.toLocaleString(),
    "(" + retainedPct + "%)"
  );
  console.log("Dispatch time:   ", dispatchMs, "ms");

  // pass/fail
  const okCorrectness = sideEffect === 1;
  const okMemory = retained === 0;
  const heapRecoveredPct = (
    (1 - (settled - baseline) / Math.max(peak - baseline, 1)) *
    100
  ).toFixed(2);

  console.log();
  console.log("--- verdict ---");
  console.log("correctness:   ", okCorrectness ? "PASS" : "FAIL");
  console.log(
    "GC reclaimed:  ",
    okMemory ? "PASS" : "FAIL",
    "(" + heapRecoveredPct + "% of peak delta recovered)"
  );

  process.exit(okCorrectness && okMemory ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
