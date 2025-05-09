#!/usr/bin/env node
import { performance } from "perf_hooks";
import { array } from "../../build/index.js";
import { signal, computed } from "@preact/signals-core";
import { createSignal, mapArray } from "solid-js/dist/solid.js";

if (typeof global.gc !== "function") {
  console.warn(
    "⚠️  GC is not exposed. Restart with `node --expose-gc` to allow manual garbage collection."
  );
}

// --- Seeded RNG ---
function mulberry32(seed) {
  return function () {
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
  return function (arr) {
    const len = arr.length;
    if (nextId === 0) nextId = len;
    const reuseCount = Math.floor(len * 0.5);
    const addCount = Math.floor(len * 0.25);
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    const reused = a.slice(0, reuseCount);
    const added = [];
    for (let k = 0; k < addCount; k++) added.push(nextId++);
    return reused.concat(added);
  };
}

// manual garbage collection helper
async function collectGarbage() {
  if (typeof global.gc !== "function") return;
  for (let i = 0; i < 3; i++) {
    global.gc();
    await new Promise(r => setTimeout(r, 100));
  }
}

// format bytes to human-readable
function formatBytes(bytes) {
  const kb = bytes / 1024;
  const mb = kb / 1024;
  return mb >= 1 ? `${mb.toFixed(2)} MB` : `${kb.toFixed(2)} KB`;
}

// generate input data for each id
function generateDataForId(id) {
  const rng = mulberry32(id + 0xABCDEF);
  const specs = [];
  for (let i = 0; i < 5; i++) {
    specs.push(`Spec ${i + 1}: ${rng().toFixed(2)}`);
  }
  return {
    id,
    title: `Product #${id}`,
    imageUrl: `https://picsum.photos/seed/${id}/100/100`,
    description: `Description for product ${id}`,
    specs
  };
}

// simulate DOM/Component creation using provided data
function createComponent(data) {
  const { title, imageUrl, description, specs } = data;
  const DOM_OPS_PER_NODE = 500;
  // simulate cost of creating 30 nodes
  for (let op = 0; op < 30 * DOM_OPS_PER_NODE; op++) Math.sqrt(op);
  // build a nested object tree
  const card = { tag: 'div', props: { className: 'product-card' }, children: [] };
  const header = { tag: 'div', props: { className: 'card-header' }, children: [] };
  const body = { tag: 'div', props: { className: 'card-body' }, children: [] };
  card.children.push(header, body);
  header.children.push(
    { tag: 'h2', props: {}, children: [title] },
    { tag: 'span', props: { className: 'badge' }, children: ['New'] }
  );
  const img = { tag: 'img', props: { src: imageUrl, alt: 'Product image' }, children: [] };
  const desc = { tag: 'p', props: { className: 'description' }, children: [description] };
  const specsList = { tag: 'ul', props: { className: 'specs' }, children: [] };
  for (const s of specs) specsList.children.push({ tag: 'li', props: {}, children: [s] });
  body.children.push(img, desc, specsList);
  return card;
}

// measure only the update (map) part and memory
async function measureTime(label, updateFn, iters) {
  if (typeof global.gc === "function") await collectGarbage();
  const beforeMem = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) updateFn();
  const dt = performance.now() - t0;
  const deltaMem = process.memoryUsage().heapUsed - beforeMem;
  console.log(`${label.padEnd(40)}  ${dt.toFixed(2)}ms  Δheap=${formatBytes(deltaMem)}`);
  return { time: dt, mem: deltaMem };
}

// run benchmarks for a given size
async function runBenchCase(size, iters, repeats) {
  const base = Array.from({ length: size }, (_, i) => i);
  const shuffle = makeShuffle(123456);
  const sequences = Array.from({ length: iters }, () => shuffle(base));

  const frameworks = [
    {
      name: 'Anod',
      makeUpdateFn: () => {
        const s = array(base);
        const c = s.mapRoot(id => {
          return createComponent(generateDataForId(id));
        });
        c.val(); let idx = 0;
        return () => {
          s.set(sequences[idx]);
          c.val(); idx++;
        };
      }
    },
    // {
    //     name: 'Preact',
    //     makeUpdateFn: () => {
    //         const s = signal(base);
    //         const c = computed(() => s.value.map(id => {
    //             return createComponent(generateDataForId(id));
    //         }));
    //         c.value; let idx = 0;
    //         return () => { s.value = sequences[idx]; c.value; idx++; };
    //     }
    // },
    // {
    //     name: 'Solid',
    //     makeUpdateFn: () => {
    //         const [s, setS] = createSignal(base);
    //         const c = mapArray(s, id => {
    //             return createComponent(generateDataForId(id));
    //         });
    //         c(); let idx = 0;
    //         return () => { setS(sequences[idx]); c(); idx++; };
    //     }
    // },
  ];

  for (const fw of frameworks) {
    const results = [];
    for (let r = 0; r < repeats; r++) {
      const updateFn = fw.makeUpdateFn();
      const res = await measureTime(`${fw.name} N=${size}`, updateFn, iters);
      results.push(res);
    }
    const times = results.map(r => r.time);
    const mems = results.map(r => r.mem);
    const meanTime = times.reduce((a, b) => a + b, 0) / times.length;
    const stdTime = Math.sqrt(times.reduce((sum, t) => sum + (t - meanTime) ** 2, 0) / times.length);
    const meanMem = mems.reduce((a, b) => a + b, 0) / mems.length;
    const stdMem = Math.sqrt(mems.reduce((sum, m) => sum + (m - meanMem) ** 2, 0) / mems.length);
    console.log(`${fw.name} N=${size} over ${repeats} runs: time mean=${meanTime.toFixed(2)}ms std=${stdTime.toFixed(2)}ms | mem mean=${formatBytes(meanMem)} std=${formatBytes(stdMem)}\n`);
  }
}

// main
(async function main() {
  const sizes = [10, 30, 100, 300, 500, 1000];
  const iters = 1000;
  const repeats = 5;
  console.log(`Starting heavy benchmarks: sizes=${sizes.join(", ")}, iters=${iters}, repeats=${repeats}\n`);
  for (const size of sizes) {
    console.log(`=== HEAVY BENCHMARK SIZE: N=${size} ===`);
    await runBenchCase(size, iters, repeats);
  }
})();
