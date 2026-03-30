// bench/bench.ts
import { bench, group, run } from "mitata";
import {
  batch,
  effect,
  compute,
  signal
} from "../src/signal.js";

import S from "s-js";

var framework = {
  name: "s",
  signal: S.value,
  computed: S,
  effect: S,
  withBatch: S.batch,
  withBuild: (fn) => fn()
};
function benchCreateSignals(fw, count) {
  return () => {
    for (let i = 0;i < count; i++) {
      fw.signal(i);
    }
  };
}
function benchCreateComputations(fw, count) {
  const src = fw.signal(0);
  return () => {
    for (let i = 0;i < count; i++) {
      fw.computed(() => src())
    }
  };
}
group("Create 1k signals", () => {
  bench("anod", benchCreateSignals(framework, 1000));
});
group("Create 1k computations", () => {
  bench("anod", benchCreateComputations(framework, 1000));
});
await run();
