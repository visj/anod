#!/usr/bin/env node
import { performance } from "perf_hooks";
import { array } from "../../dist/array.js";
import { signal, computed } from "@preact/signals-core";
import { createSignal, mapArray } from "solid-js/dist/solid.js";

if (typeof global.gc !== "function") {
    console.warn(
        "⚠️  GC is not exposed. Restart with `node --expose-gc` to allow manual garbage collection."
    );
}

// --- Seeded RNG ---
function mulberry32(seed) {
    return function() {
        var t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// --- Shuffle with reuse and additions, seeded ---
function makeShuffle(seed) {
    const random = mulberry32(seed);
    let nextId = 0;
    return function(arr) {
        const len = arr.length;
        if (nextId === 0) nextId = len;
        const reuseCount = Math.floor(len * 0.5);
        const addCount = Math.floor(len * 0.25);
        // shuffle clone
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        const reused = a.slice(0, reuseCount);
        const added = [];
        for (let k = 0; k < addCount; k++) {
            added.push(nextId++);
        }
        return reused.concat(added);
    };
}

// simulate DOM/Component creation
function createComponent(val) {
    return {
        id: val,
        label: `item-${val}`,
        timestamp: Date.now(),
        metadata: { index: val, parity: val % 2 === 0 }
    };
}

// manual garbage collection helper
async function collectGarbage() {
    if (typeof global.gc !== "function") return;
    for (let i = 0; i < 3; i++) {
        global.gc();
        await new Promise(r => setTimeout(r, 200));
    }
}

// format bytes to human-readable
function formatBytes(bytes) {
    const kb = bytes / 1024;
    const mb = kb / 1024;
    if (mb >= 1) return `${mb.toFixed(2)} MB`;
    return `${kb.toFixed(2)} KB`;
}

// measure only the update (map) part
async function measureTime(label, updateFn, iters) {
    if (typeof global.gc === "function") await collectGarbage();
    const beforeMem = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    for (let i = 0; i < iters; i++) {
        updateFn();
    }
    const dt = performance.now() - t0;
    const afterMem = process.memoryUsage().heapUsed;
    const deltaMem = afterMem - beforeMem;
    console.log(
        `${label.padEnd(40)}  ${dt.toFixed(2)}ms  Δheap=${formatBytes(deltaMem)}`
    );
    return { time: dt, mem: deltaMem };
}

// run benchmarks for a given size
async function runBenchCase(size, iters, repeats) {
    const base = Array.from({ length: size }, (_, i) => i);
    const shuffle = makeShuffle(123456);
    // precompute input sequences
    const sequences = Array.from({ length: iters }, () => shuffle(base));

    const frameworks = [
        {
            name: "Anod",
            makeUpdateFn: () => {
                const s = array(base);
                const c = s.map(x => createComponent(x));
                c.val();
                let idx = 0;
                return () => {
                    s.set(sequences[idx]);
                    c.val();
                    idx++;
                };
            }
        },
        {
            name: "Preact",
            makeUpdateFn: () => {
                const s = signal(base);
                const c = computed(() => s.value.map(x => createComponent(x)));
                c.value;
                let idx = 0;
                return () => {
                    s.value = sequences[idx];
                    c.value;
                    idx++;
                };
            }
        },
        {
            name: "Solid",
            makeUpdateFn: () => {
                const [s, setS] = createSignal(base);
                const c = mapArray(s, x => createComponent(x));
                c();
                let idx = 0;
                return () => {
                    setS(sequences[idx]);
                    c();
                    idx++;
                };
            }
        }
    ];



    for (const fw of frameworks.filter(f => f.name === "Preact")) {
        const results = [];
        for (let r = 0; r < repeats; r++) {
            let updateFn = fw.makeUpdateFn();

            // Warm-up phase: Run 10% of iters (minimum 100, maximum 1000) to stabilize JIT and allocations
            const warmUpIters = Math.min(Math.max(Math.floor(iters * 0.1), 100), 1000);
            for (let i = 0; i < warmUpIters; i++) {
                updateFn();
            }
            // Reset idx to 0 after warm-up to ensure consistent sequence usage
            updateFn = fw.makeUpdateFn(); // Assumes updateFn closure allows idx reset; see note below
            // Force GC after warm-up to clean up any temporary allocations
            if (typeof global.gc === "function") await collectGarbage();

            const { time, mem } = await measureTime(`${fw.name} N=${size}`, updateFn, iters);
            results.push({ time, mem });
        }
        // compute statistics
        const times = results.map(r => r.time);
        const mems = results.map(r => r.mem);
        const meanTime = times.reduce((a, b) => a + b, 0) / times.length;
        const stdTime = Math.sqrt(
            times.reduce((sum, t) => sum + Math.pow(t - meanTime, 2), 0) / times.length
        );
        const meanMem = mems.reduce((a, b) => a + b, 0) / mems.length;
        const stdMem = Math.sqrt(
            mems.reduce((sum, m) => sum + Math.pow(m - meanMem, 2), 0) / mems.length
        );
        console.log(
            `${fw.name} N=${size} over ${repeats} runs: time mean=${meanTime.toFixed(2)}ms std=${stdTime.toFixed(2)}ms | mem mean=${formatBytes(meanMem)} std=${formatBytes(stdMem)}\n`
        );
    }
}

// main
(async function main() {
    const sizes = [10, 30, 100, 300, 500, 1000];
    const iters = 100000;
    const repeats = 5;

    console.log(`Starting benchmarks: sizes=${sizes.join(", ")}, iters=${iters}, repeats=${repeats}\n`);
    for (const size of sizes) {
        console.log(`=== BENCHMARK SIZE: N=${size} ===`);
        await runBenchCase(size, iters, repeats);
    }
})();
