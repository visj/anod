// import { describe, test } from "node:test";
// import assert from "node:assert/strict";
// import { c } from "../dist/index.mjs";

// const tick = () => Promise.resolve();
// const settle = () => tick().then(tick).then(tick);

// describe("async node", () => {
//     test("task settles", async () => {
//         const c1 = c.task((c) => c.suspend(Promise.resolve(42)));
//         await settle();
//         assert.equal(c1.peek(), 42);
//     });

//     test("spawn awaits task", async () => {
//         let resolve;
//         const taskA = c.task((c) => c.suspend(new Promise(r => { resolve = r; })));
//         let obs = null;
//         c.spawn(async (c) => { obs = await c.suspend(taskA); });
//         await settle();
//         resolve(99);
//         await settle();
//         assert.equal(obs, 99);
//     });

//     test("multiple awaiters", async () => {
//         let resolve;
//         const taskA = c.task((c) => c.suspend(new Promise(r => { resolve = r; })));
//         let o1 = null, o2 = null;
//         c.spawn(async (c) => { o1 = await c.suspend(taskA); });
//         c.spawn(async (c) => { o2 = await c.suspend(taskA); });
//         await settle();
//         resolve(77);
//         await settle();
//         assert.equal(o1, 77);
//         assert.equal(o2, 77);
//     });

//     test("task re-runs with pending", async () => {
//         const s1 = c.signal(1);
//         const taskA = c.task((c) => c.suspend(Promise.resolve(c.val(s1) * 10)));
//         await settle();
//         let runs = 0;
//         let observed = null;
//         c.effect((c) => {
//             runs++;
//             if (c.pending(taskA)) return;
//             observed = c.val(taskA);
//         });
//         assert.equal(runs, 1);
//         assert.equal(observed, 10);
//         s1.set(2);
//         await settle();
//         assert.equal(observed, 20);
//     });

//     test("defer works", async () => {
//         const s1 = c.signal(1);
//         const s2 = c.signal(10);
//         let runs = 0;
//         let resolve;
//         const c1 = c.task((c) => {
//             runs++;
//             c.val(s1);
//             c.defer(s2);
//             return c.suspend(new Promise(r => { resolve = r; }));
//         });
//         assert.equal(runs, 1);
//         s2.set(20);
//         await tick();
//         assert.equal(runs, 1);
//         resolve(11);
//         await settle();
//         assert.equal(runs, 2);
//     });

//     // Run many to create GC pressure
//     for (let i = 0; i < 30; i++) {
//         test(`bulk task ${i}`, async () => {
//             const s = c.signal(i);
//             const t = c.task(c => c.suspend(Promise.resolve(c.val(s))));
//             await settle();
//             assert.equal(t.peek(), i);
//             s.set(i + 1);
//             t.peek();
//             await settle();
//             assert.equal(t.peek(), i + 1);
//         });
//     }
// });
