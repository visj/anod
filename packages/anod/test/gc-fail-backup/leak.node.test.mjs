// import { describe, test } from "node:test";
// import assert from "node:assert/strict";
// import { c } from "../dist/index.mjs";

// async function collectAsync() {
//     await new Promise((r) => setTimeout(r, 10));
//     global.gc();
// }

// function capture(fn) {
//     const nodes = fn();
//     const refs = [];
//     for (let i = 0; i < nodes.length; i++) {
//         refs.push(new WeakRef(nodes[i]));
//         nodes[i] = null;
//     }
//     return refs;
// }

// describe("stack retention after disposal", () => {
//     test("DSTACK releases setup-time sender references", async () => {
//         const refs = capture(() => {
//             const s1 = c.signal(1);
//             const s2 = c.signal(2);
//             const s3 = c.signal(3);
//             const s4 = c.signal(4);
//             const s5 = c.signal(5);
//             const cx = c.compute(c => c.val(s1) + c.val(s2) + c.val(s3) + c.val(s4) + c.val(s5));
//             cx.peek();
//             cx.dispose();
//             s1.dispose();
//             s2.dispose();
//             s3.dispose();
//             s4.dispose();
//             s5.dispose();
//             return [s1, s2, s3, s4, s5, cx];
//         });

//         await collectAsync();
//         for (const r of refs) {
//             assert.equal(r.deref(), undefined);
//         }
//     });

//     test("VSTACK releases saved-version sender references", async () => {
//         const refs = capture(() => {
//             const holders = [];
//             c.root(r => {
//                 const s1 = c.signal(1);
//                 const s2 = c.signal(2);
//                 const s3 = c.signal(3);
//                 holders.push(s1, s2, s3);

//                 r.effect(r2 => {
//                     r2.val(s1);
//                     r2.val(s2);
//                     r2.val(s3);
//                     c.compute(c2 => c2.val(s1) + c2.val(s2) + c2.val(s3)).peek();
//                 });

//                 holders.push(r);
//             }).dispose();

//             for (const s of holders) {
//                 if (typeof s.dispose === "function") {
//                     s.dispose();
//                 }
//             }
//             return holders;
//         });

//         await collectAsync();
//         for (const r of refs) {
//             assert.equal(r.deref(), undefined);
//         }
//     });

//     test("CSTACK releases pending-chain compute references", async () => {
//         const holders = capture(() => {
//             let s1, s2, c1, c2, c3, c4;
//             const r = c.root(r => {
//                 s1 = c.signal(1);
//                 s2 = c.signal(10);
//                 c1 = c.compute(c => c.val(s1));
//                 c2 = c.compute(c => c.val(c1));
//                 c3 = c.compute(c => c.val(s2));
//                 c4 = c.compute(c => c.val(c2) + c.val(c3));
//                 r.effect(c => c.val(c4));
//                 s1.set(2);
//             });
//             r.dispose();
//             c1.dispose();
//             c2.dispose();
//             c3.dispose();
//             c4.dispose();
//             s1.dispose();
//             s2.dispose();
//             let ret = [s1, s2, c1, c2, c3, c4, r];
//             s1 = s2 = c1 = c2 = c3 = c4 = null;
//             return ret;
//         });

//         await collectAsync();
//         for (const ref of holders) {
//             assert.equal(ref.deref(), undefined);
//         }
//     });

//     test("dynamic re-run sweepDeps doesn't retain old deps via VSTACK", async () => {
//         const refs = capture(() => {
//             const sGate = c.signal(true);
//             const sShared = c.signal("shared");
//             const sOther = c.signal("other");

//             const outer = c.compute(cx => {
//                 if (cx.val(sGate)) {
//                     cx.val(sShared);
//                 } else {
//                     cx.val(sOther);
//                 }
//                 c.compute(c2 => c2.val(sShared)).peek();
//             });

//             outer.peek();
//             sGate.set(false);
//             outer.peek();

//             outer.dispose();
//             sGate.dispose();
//             sShared.dispose();
//             sOther.dispose();
//             return [outer, sGate, sShared, sOther];
//         });

//         await collectAsync();
//         for (const r of refs) {
//             assert.equal(r.deref(), undefined);
//         }
//     });
// });
