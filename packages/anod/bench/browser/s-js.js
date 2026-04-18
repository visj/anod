//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esmMin = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toCommonJS = (mod) => __hasOwnProp.call(mod, "module.exports") ? mod["module.exports"] : __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, { get: (a, b) => (typeof require !== "undefined" ? require : a)[b] }) : x)(function(x) {
	if (typeof require !== "undefined") return require.apply(this, arguments);
	throw Error("Calling `require` for \"" + x + "\" in an environment that doesn't expose the `require` function. See https://rolldown.rs/in-depth/bundling-cjs#require-external-modules for more details.");
});
//#endregion
//#region node_modules/mitata/src/lib.mjs
const AsyncFunction = (async () => {}).constructor;
const GeneratorFunction = (function* () {}).constructor;
const AsyncGeneratorFunction = (async function* () {}).constructor;
const $$1 = {
	_: null,
	__() {
		return print($$1._);
	}
};
async function measure(f, ...args) {
	return await {
		fn,
		iter,
		yield: generator,
		[void 0]() {
			throw new TypeError("expected iterator, generator or one-shot function");
		}
	}[kind(f)](f, ...args);
}
async function generator(gen, opts = {}) {
	const g = gen({ get(name) {
		return opts.args?.[name];
	} });
	const n = await g.next();
	let $fn = n.value;
	if (!n.value?.heap && null != n.value?.heap) opts.heap = false;
	opts.concurrency ??= n.value?.concurrency ?? opts.args?.concurrency;
	if (!n.value?.counters && null != n.value?.counters) opts.$counters = false;
	if (n.done || "fn" !== kind($fn)) {
		$fn = n.value?.bench || n.value?.manual;
		if ("fn" !== kind($fn, true)) throw new TypeError("expected benchmarkable yield from generator");
		opts.params ??= {};
		const params = $fn.length;
		opts.manual = !n.value.manual ? false : "manual" !== n.value.budget ? "real" : "manual";
		for (let o = 0; o < params; o++) {
			opts.params[o] = n.value[o];
			if ("fn" !== kind(n.value[o])) throw new TypeError("expected function for benchmark parameter");
		}
	}
	const stats = await fn($fn, opts);
	if (!(await g.next()).done) throw new TypeError("expected generator to yield once");
	return {
		...stats,
		kind: "yield"
	};
}
const print = (() => {
	if (globalThis.console?.log) return globalThis.console.log;
	if (globalThis.print && !globalThis.document) return globalThis.print;
	return () => {
		throw new Error("no print function available");
	};
})();
const gc = (() => {
	try {
		return Bun.gc(true), () => Bun.gc(true);
	} catch {}
	try {
		return globalThis.gc(), () => globalThis.gc();
	} catch {}
	try {
		return globalThis.__gc(), () => globalThis.__gc();
	} catch {}
	try {
		return globalThis.std.gc(), () => globalThis.std.gc();
	} catch {}
	try {
		return globalThis.$262.gc(), () => globalThis.$262.gc();
	} catch {}
	try {
		return globalThis.tjs.engine.gc.run(), () => globalThis.tjs.engine.gc.run();
	} catch {}
	return Object.assign(globalThis.Graal ? () => new Uint8Array(2 ** 29) : () => new Uint8Array(2 ** 30), { fallback: true });
})();
const now = (() => {
	try {
		Bun.nanoseconds();
		return Bun.nanoseconds;
	} catch {}
	try {
		$$1.agent.monotonicNow();
		return () => 1e6 * $$1.agent.monotonicNow();
	} catch {}
	try {
		$262.agent.monotonicNow();
		return () => 1e6 * $262.agent.monotonicNow();
	} catch {}
	try {
		const now = performance.now.bind(performance);
		now();
		return () => 1e6 * now();
	} catch {
		return () => 1e6 * Date.now();
	}
})();
function kind(fn, _ = false) {
	if (!(fn instanceof Function || fn instanceof AsyncFunction || fn instanceof GeneratorFunction || fn instanceof AsyncGeneratorFunction)) return;
	if (fn instanceof GeneratorFunction || fn instanceof AsyncGeneratorFunction) return "yield";
	if ((_ ? true : 0 === fn.length) && (fn instanceof Function || fn instanceof AsyncFunction)) return "fn";
	if (0 !== fn.length && (fn instanceof Function || fn instanceof AsyncFunction)) return "iter";
}
const k_cpu_time_rescale_heap = 1.1;
const k_cpu_time_rescale_inner_gc = 2;
const k_max_samples = 1e9;
const k_batch_samples = 4096;
const k_batch_threshold = 65536;
const k_min_cpu_time = 642 * 1e6;
const k_warmup_threshold = 5e5;
function defaults$1(opts) {
	opts.gc ??= gc;
	opts.now ??= now;
	opts.heap ??= null;
	opts.params ??= {};
	opts.manual ??= false;
	opts.inner_gc ??= false;
	opts.$counters ??= false;
	opts.concurrency ??= 1;
	opts.min_samples ??= 12;
	opts.max_samples ??= k_max_samples;
	opts.min_cpu_time ??= k_min_cpu_time;
	opts.batch_unroll ??= 4;
	opts.batch_samples ??= k_batch_samples;
	opts.warmup_samples ??= 2;
	opts.batch_threshold ??= k_batch_threshold;
	opts.warmup_threshold ??= k_warmup_threshold;
	opts.samples_threshold ??= 12;
	if (opts.heap) opts.min_cpu_time *= k_cpu_time_rescale_heap;
	if (opts.gc && opts.inner_gc) opts.min_cpu_time *= k_cpu_time_rescale_inner_gc;
}
async function fn(fn, opts = {}) {
	defaults$1(opts);
	let async = false;
	let batch = false;
	const params = Object.keys(opts.params);
	warmup: {
		const $p = new Array(params.length);
		for (let o = 0; o < params.length; o++) $p[o] = await opts.params[o]();
		const t0 = now();
		const r = fn(...$p);
		let t1 = now();
		if (async = r instanceof Promise) await r, t1 = now();
		if (t1 - t0 <= opts.warmup_threshold) for (let o = 0; o < opts.warmup_samples; o++) {
			for (let oo = 0; oo < params.length; oo++) $p[oo] = await opts.params[oo]();
			const t0 = now();
			await fn(...$p);
			if (batch = now() - t0 <= opts.batch_threshold) break;
		}
	}
	if (opts.manual) {
		batch = false;
		opts.concurrency = 1;
	}
	const loop = new AsyncFunction("$fn", "$gc", "$now", "$heap", "$params", "$counters", `
    ${!opts.$counters ? "" : "let _hc = false;"}
    ${!opts.$counters ? "" : "try { $counters.init(); _hc = true; } catch {}"}

    let _ = 0; let t = 0;
    let samples = new Array(2 ** 20);
    ${!opts.heap ? "" : "const heap = { _: 0, total: 0, min: Infinity, max: -Infinity };"}
    ${!(opts.gc && opts.inner_gc && !opts.gc.fallback) ? "" : "const gc = { total: 0, min: Infinity, max: -Infinity };"}

    ${!params.length ? "" : Array.from({ length: params.length }, (_, o) => `
      ${Array.from({ length: opts.concurrency }, (_, c) => `
        let param_${o}_${c} = ${!batch ? "null" : `new Array(${opts.batch_samples})`};
      `.trim()).join(" ")}
    `.trim()).join("\n")}

    ${!opts.gc ? "" : `$gc();`}

    for (; _ < ${opts.max_samples}; _++) {
      if (_ >= ${opts.min_samples} && t >= ${opts.min_cpu_time}) break;

      ${!params.length ? "" : `
        ${!batch ? `
          ${Array.from({ length: params.length }, (_, o) => `
            ${Array.from({ length: opts.concurrency }, (_, c) => `
              if ((param_${o}_${c} = $params[${o}]()) instanceof Promise) param_${o}_${c} = await param_${o}_${c};
            `.trim()).join(" ")}
          `.trim()).join("\n")}
        ` : `
          for (let o = 0; o < ${opts.batch_samples}; o++) {
            ${Array.from({ length: params.length }, (_, o) => `
              ${Array.from({ length: opts.concurrency }, (_, c) => `
                if ((param_${o}_${c}[o] = $params[${o}]()) instanceof Promise) param_${o}_${c}[o] = await param_${o}_${c}[o];
              `.trim()).join(" ")}
            `.trim()).join("\n")}
          }
        `}
      `}

      ${!(opts.gc && opts.inner_gc) ? "" : `
        igc: {
          const t0 = $now();
          $gc(); t += $now() - t0;
        }
      `}

      ${!opts.manual ? "" : "let t2 = 0;"}
      ${!opts.heap ? "" : "const h0 = $heap();"}
      ${!opts.$counters ? "" : "if (_hc) try { $counters.before(); } catch {};"} const t0 = $now();

      ${!batch ? `
        ${!async ? "" : 1 >= opts.concurrency ? "" : "await Promise.all(["}
          ${Array.from({ length: opts.concurrency }, (_, c) => `
            ${!opts.manual ? "" : "t2 +="} ${!async ? "" : 1 < opts.concurrency ? "" : "await"} ${(!params.length ? `
              $fn()
            ` : `
              $fn(${Array.from({ length: params.length }, (_, o) => `param_${o}_${c}`).join(", ")})
            `).trim()}${!async ? ";" : 1 < opts.concurrency ? "," : ";"}
          `.trim()).join("\n")}
        ${!async ? "" : 1 >= opts.concurrency ? "" : `]);`}
      ` : `
        for (let o = 0; o < ${opts.batch_samples / opts.batch_unroll | 0}; o++) {
          ${!params.length ? "" : `const param_offset = o * ${opts.batch_unroll};`}

          ${Array.from({ length: opts.batch_unroll }, (_, u) => `
            ${!async ? "" : 1 >= opts.concurrency ? "" : "await Promise.all(["}
              ${Array.from({ length: opts.concurrency }, (_, c) => `
                ${!async ? "" : 1 < opts.concurrency ? "" : "await"} ${(!params.length ? `
                  $fn()
                ` : `
                  $fn(${Array.from({ length: params.length }, (_, o) => `param_${o}_${c}[${u === 0 ? "" : `${u} + `}param_offset]`).join(", ")})
                `).trim()}${!async ? ";" : 1 < opts.concurrency ? "," : ";"}
              `.trim()).join(" ")}
            ${!async ? "" : 1 >= opts.concurrency ? "" : "]);"}
          `.trim()).join("\n")}
        }
      `}

      const t1 = $now();
      ${!opts.$counters ? "" : "if (_hc) try { $counters.after(); } catch {};"}

      ${!opts.heap ? "" : `
        heap: {
          const t0 = $now();
          const h1 = ($heap() - h0) ${!batch ? "" : `/ ${opts.batch_samples}`}; t += $now() - t0;

          if (0 <= h1) {
            heap._++;
            heap.total += h1;
            heap.min = Math.min(h1, heap.min);
            heap.max = Math.max(h1, heap.max);
          }
        }
      `}

      ${!(opts.gc && opts.inner_gc && !opts.gc.fallback) ? "" : `
        igc: {
          const t0 = $now();
          $gc(); const t1 = $now() - t0;

          t += t1;
          gc.total += t1;
          gc.min = Math.min(t1, gc.min);
          gc.max = Math.max(t1, gc.max);
        }
      `};

      const diff = ${opts.manual ? "t2" : "t1 - t0"};
      t += ${"manual" === opts.manual ? "t2" : "t1 - t0"};
      samples[_] = diff ${!batch ? "" : `/ ${opts.batch_samples}`};
    }

    samples.length = _;
    samples.sort((a, b) => a - b);
    if (samples.length > ${opts.samples_threshold}) samples = samples.slice(2, -2);

    return {
      samples,
      min: samples[0],
      max: samples[samples.length - 1],
      p25: samples[(.25 * (samples.length - 1)) | 0],
      p50: samples[(.50 * (samples.length - 1)) | 0],
      p75: samples[(.75 * (samples.length - 1)) | 0],
      p99: samples[(.99 * (samples.length - 1)) | 0],
      p999: samples[(.999 * (samples.length - 1)) | 0],
      avg: samples.reduce((a, v) => a + v, 0) / samples.length,
      ticks: samples.length ${!batch ? "" : `* ${opts.batch_samples}`},
      ${!opts.heap ? "" : "heap: { ...heap, avg: heap.total / heap._ },"}
      ${!(opts.gc && opts.inner_gc && !opts.gc.fallback) ? "" : "gc: { ...gc, avg: gc.total / _ },"}
      ${!opts.$counters ? "" : `...(!_hc ? {} : { counters: $counters.translate(${!batch ? 1 : opts.batch_samples}, _) }),`}
    };

    ${!opts.$counters ? "" : "if (_hc) try { $counters.deinit(); } catch {};"}
  `);
	return {
		kind: "fn",
		debug: loop.toString(),
		...await loop(fn, opts.gc, opts.now, opts.heap, opts.params, opts.$counters)
	};
}
async function iter(iter, opts = {}) {
	const _ = {};
	defaults$1(opts);
	let samples = new Array(2 ** 20);
	const _i = { next() {
		return _.next();
	} };
	const ctx = {
		[Symbol.iterator]() {
			return _i;
		},
		[Symbol.asyncIterator]() {
			return _i;
		},
		get(name) {
			return opts.args?.[name];
		}
	};
	const gen = (function* () {
		let batch = false;
		warmup: {
			const t0 = now();
			yield void 0;
			if (now() - t0 <= opts.warmup_threshold) for (let o = 0; o < opts.warmup_samples; o++) {
				const t0 = now();
				yield void 0;
				if (batch = now() - t0 <= opts.batch_threshold) break;
			}
		}
		const loop = new GeneratorFunction("$gc", "$now", "$samples", _.debug = `
      let _ = 0; let t = 0;

      ${!opts.gc ? "" : `$gc();`}

      for (; _ < ${opts.max_samples}; _++) {
        if (_ >= ${opts.min_samples} && t >= ${opts.min_cpu_time}) break;

        ${!(opts.gc && opts.inner_gc) ? "" : `
          let inner_gc_cost = 0;

          igc: {
            const t0 = $now(); $gc();
            inner_gc_cost = $now() - t0;
          }
        `}

        const t0 = $now();
        
        ${!batch ? "yield void 0;" : `
          for (let o = 0; o < ${opts.batch_samples / opts.batch_unroll | 0}; o++) {
            ${new Array(opts.batch_unroll).fill("yield void 0;").join(" ")}
          }
        `}

        const t1 = $now();
        const diff = t1 - t0;

        $samples[_] = diff ${!batch ? "" : `/ ${opts.batch_samples}`};
        t += diff ${!(opts.gc && opts.inner_gc) ? "" : "+ inner_gc_cost"};
      }

      $samples.length = _;
    `)(opts.gc, opts.now, samples);
		_.batch = batch;
		_.next = loop.next.bind(loop);
		yield void 0;
	})();
	await iter((_.next = gen.next.bind(gen), ctx));
	if (samples.length < opts.min_samples) throw new TypeError(`expected at least ${opts.min_samples} samples from iterator`);
	samples.sort((a, b) => a - b);
	if (samples.length > opts.samples_threshold) samples = samples.slice(2, -2);
	return {
		samples,
		kind: "iter",
		debug: _.debug,
		min: samples[0],
		max: samples[samples.length - 1],
		p25: samples[.25 * (samples.length - 1) | 0],
		p50: samples[.5 * (samples.length - 1) | 0],
		p75: samples[.75 * (samples.length - 1) | 0],
		p99: samples[.99 * (samples.length - 1) | 0],
		p999: samples[.999 * (samples.length - 1) | 0],
		avg: samples.reduce((a, v) => a + v, 0) / samples.length,
		ticks: samples.length * (!_.batch ? 1 : opts.batch_samples)
	};
}
//#endregion
//#region \0runtime-stub:bun:jsc
var _runtime_stub_bun_jsc_exports = /* @__PURE__ */ __exportAll({
	cpus: () => cpus$2,
	createRequire: () => createRequire$3,
	default: () => _runtime_stub_bun_jsc_default,
	getHeapStatistics: () => getHeapStatistics$2,
	spawnSync: () => spawnSync$3
});
var _runtime_stub_bun_jsc_default, cpus$2, createRequire$3, spawnSync$3, getHeapStatistics$2;
var init__runtime_stub_bun_jsc = __esmMin((() => {
	_runtime_stub_bun_jsc_default = {};
	cpus$2 = () => [];
	createRequire$3 = () => () => null;
	spawnSync$3 = () => ({ stdout: "" });
	getHeapStatistics$2 = () => ({});
}));
//#endregion
//#region \0runtime-stub:node:v8
var _runtime_stub_node_v8_exports = /* @__PURE__ */ __exportAll({
	cpus: () => cpus$1,
	createRequire: () => createRequire$2,
	default: () => _runtime_stub_node_v8_default,
	getHeapStatistics: () => getHeapStatistics$1,
	spawnSync: () => spawnSync$2
});
var _runtime_stub_node_v8_default, cpus$1, createRequire$2, spawnSync$2, getHeapStatistics$1;
var init__runtime_stub_node_v8 = __esmMin((() => {
	_runtime_stub_node_v8_default = {};
	cpus$1 = () => [];
	createRequire$2 = () => () => null;
	spawnSync$2 = () => ({ stdout: "" });
	getHeapStatistics$1 = () => ({});
}));
//#endregion
//#region \0runtime-stub:node:os
var _runtime_stub_node_os_exports = /* @__PURE__ */ __exportAll({
	cpus: () => cpus,
	createRequire: () => createRequire$1,
	default: () => _runtime_stub_node_os_default,
	getHeapStatistics: () => getHeapStatistics,
	spawnSync: () => spawnSync$1
});
var _runtime_stub_node_os_default, cpus, createRequire$1, spawnSync$1, getHeapStatistics;
var init__runtime_stub_node_os = __esmMin((() => {
	_runtime_stub_node_os_default = {};
	cpus = () => [];
	createRequire$1 = () => () => null;
	spawnSync$1 = () => ({ stdout: "" });
	getHeapStatistics = () => ({});
}));
//#endregion
//#region \0runtime-stub:node:module
var createRequire;
var init__runtime_stub_node_module = __esmMin((() => {
	createRequire = () => () => null;
}));
//#endregion
//#region \0runtime-stub:node:child_process
var spawnSync;
var init__runtime_stub_node_child_process = __esmMin((() => {
	spawnSync = () => ({ stdout: "" });
}));
//#endregion
//#region node_modules/@mitata/counters/src/lib.mjs
var lib_exports = /* @__PURE__ */ __exportAll({
	after: () => after,
	before: () => before,
	deinit: () => deinit,
	init: () => init,
	translate: () => translate
});
function init() {
	lib.init();
}
function deinit() {
	lib.deinit();
}
function after() {
	lib.after();
}
function before() {
	lib.before();
}
function translate(batch = 1, samples = 1) {
	if ("darwin" === _runtime_stub_node_os_default.platform()) {
		const events = lib.translate();
		const cycles = {
			min: events.FIXED_CYCLES.min / batch,
			max: events.FIXED_CYCLES.max / batch,
			avg: events.FIXED_CYCLES.total / batch / samples,
			stalls: {
				min: events.MAP_STALL.min / batch,
				max: events.MAP_STALL.max / batch,
				avg: events.MAP_STALL.total / batch / samples
			}
		};
		const branches = !events.INST_BRANCH ? null : {
			min: events.INST_BRANCH.min / batch,
			max: events.INST_BRANCH.max / batch,
			avg: events.INST_BRANCH.total / batch / samples,
			mispredicted: {
				min: events.BRANCH_MISPRED_NONSPEC.min / batch,
				max: events.BRANCH_MISPRED_NONSPEC.max / batch,
				avg: events.BRANCH_MISPRED_NONSPEC.total / batch / samples
			}
		};
		const instructions = {
			min: events.FIXED_INSTRUCTIONS.min / batch,
			max: events.FIXED_INSTRUCTIONS.max / batch,
			avg: events.FIXED_INSTRUCTIONS.total / batch / samples,
			loads_and_stores: !events.INST_LDST ? null : {
				min: events.INST_LDST.min / batch,
				max: events.INST_LDST.max / batch,
				avg: events.INST_LDST.total / batch / samples
			}
		};
		return {
			l1: {
				miss_loads: !events.L1D_CACHE_MISS_LD_NONSPEC ? null : {
					min: events.L1D_CACHE_MISS_LD_NONSPEC.min / batch,
					max: events.L1D_CACHE_MISS_LD_NONSPEC.max / batch,
					avg: events.L1D_CACHE_MISS_LD_NONSPEC.total / batch / samples
				},
				miss_stores: !events.L1D_CACHE_MISS_ST_NONSPEC ? null : {
					min: events.L1D_CACHE_MISS_ST_NONSPEC.min / batch,
					max: events.L1D_CACHE_MISS_ST_NONSPEC.max / batch,
					avg: events.L1D_CACHE_MISS_ST_NONSPEC.total / batch / samples
				}
			},
			cycles,
			branches,
			instructions
		};
	}
	if ("linux" === _runtime_stub_node_os_default.platform()) {
		const events = lib.translate();
		const cycles = {
			min: events.CPU_CYCLES.min / batch,
			max: events.CPU_CYCLES.max / batch,
			avg: events.CPU_CYCLES.total / batch / samples
		};
		const instructions = {
			min: events.INSTRUCTIONS.min / batch,
			max: events.INSTRUCTIONS.max / batch,
			avg: events.INSTRUCTIONS.total / batch / samples
		};
		const _bmispred = !events.BRANCH_MISSES ? null : {
			min: events.BRANCH_MISSES.min / batch,
			max: events.BRANCH_MISSES.max / batch,
			avg: events.BRANCH_MISSES.total / batch / samples
		};
		const branches = !events.BRANCH_INSTRUCTIONS ? null : {
			mispredicted: _bmispred,
			min: events.BRANCH_INSTRUCTIONS.min / batch,
			max: events.BRANCH_INSTRUCTIONS.max / batch,
			avg: events.BRANCH_INSTRUCTIONS.total / batch / samples
		};
		return {
			cache: !events.CACHE_REFERENCES ? null : {
				min: events.CACHE_REFERENCES.min / batch,
				max: events.CACHE_REFERENCES.max / batch,
				avg: events.CACHE_REFERENCES.total / batch / samples,
				misses: !events.CACHE_MISSES ? null : {
					min: events.CACHE_MISSES.min / batch,
					max: events.CACHE_MISSES.max / batch,
					avg: events.CACHE_MISSES.total / batch / samples
				}
			},
			cycles,
			branches,
			_bmispred,
			instructions
		};
	}
}
var lib;
var init_lib = __esmMin((() => {
	init__runtime_stub_node_os();
	init__runtime_stub_node_module();
	init__runtime_stub_node_child_process();
	lib = null;
	if (!globalThis.Bun) lib = createRequire(import.meta.url)(`../dist/${_runtime_stub_node_os_default.arch()}-${_runtime_stub_node_os_default.platform()}.node`);
	else {
		const { dlopen, CString } = globalThis.Bun.FFI;
		const _lib = dlopen(new URL(`../dist/${_runtime_stub_node_os_default.arch()}-${_runtime_stub_node_os_default.platform()}.node`, import.meta.url).pathname, {
			libcounters_load: {
				args: [],
				returns: "i32"
			},
			libcounters_init: {
				args: [],
				returns: "i32"
			},
			libcounters_after: {
				args: [],
				returns: "i32"
			},
			libcounters_deinit: {
				args: [],
				returns: "i32"
			},
			libcounters_before: {
				args: [],
				returns: "i32"
			},
			libcounters_translate: {
				args: [],
				returns: "i32"
			},
			libcounters_translate_len: {
				args: [],
				returns: "u32"
			},
			libcounters_translate_ptr: {
				args: [],
				returns: "ptr"
			},
			libcounters_translate_free: {
				args: [],
				returns: "void"
			}
		});
		lib = {
			load() {
				if (_lib.symbols.libcounters_load()) throw new Error("failed to load libcounters");
			},
			init() {
				if (_lib.symbols.libcounters_init()) throw new Error("failed to init libcounters");
			},
			after() {
				if (_lib.symbols.libcounters_after()) throw new Error("failed to after libcounters");
			},
			deinit() {
				if (_lib.symbols.libcounters_deinit()) throw new Error("failed to deinit libcounters");
			},
			before() {
				if (_lib.symbols.libcounters_before()) throw new Error("failed to before libcounters");
			},
			translate() {
				if (_lib.symbols.libcounters_translate()) throw new Error("failed to translate libcounters");
				const len = _lib.symbols.libcounters_translate_len();
				const ptr = _lib.symbols.libcounters_translate_ptr();
				const json = JSON.parse(new CString(ptr, 0, len));
				return _lib.symbols.libcounters_translate_free(), json;
			}
		};
	}
	lib.load();
	if ("darwin" === _runtime_stub_node_os_default.platform()) {
		const cwd = import.meta.url.replace("file://", "").replace("/lib.mjs", "");
		const paths = [
			"xctrace",
			"/Applications/Xcode.app/Contents/Developer/usr/bin/xctrace",
			"/Applications/Xcode-beta.app/Contents/Developer/usr/bin/xctrace"
		];
		const args = [
			"record",
			"--output",
			"/tmp",
			"--template",
			"../dist/l1cache.template",
			"--launch",
			"--",
			"/bin/echo",
			"cpu counters"
		];
		for (const path of paths) try {
			if (globalThis.Bun) {
				if (Bun.spawnSync([path, ...args], {
					cwd,
					stdin: null,
					stdout: null,
					stderr: null
				}).success) break;
			} else if (0 === spawnSync(path, args, {
				cwd,
				stdio: "ignore"
			}).status) break;
		} catch {}
	}
}));
//#endregion
//#region node_modules/mitata/src/main.mjs
let FLAGS = 0;
let $counters = null;
let COLLECTIONS = [{
	id: 0,
	name: null,
	types: [],
	trials: []
}];
const flags = {
	compact: 1,
	baseline: 2
};
var B = class {
	f = null;
	_args = {};
	_name = "";
	_group = 0;
	_gc = "once";
	flags = FLAGS;
	_highlight = false;
	constructor(name, f) {
		this.f = f;
		this.name(name);
		if (!kind(f)) throw new TypeError("expected iterator, generator or one-shot function");
	}
	name(name, color = false) {
		return this._name = name, this.highlight(color), this;
	}
	gc(gc = "once") {
		if (![
			true,
			false,
			"once",
			"inner"
		].includes(gc)) throw new TypeError("invalid gc type");
		return this._gc = gc, this;
	}
	highlight(color = false) {
		if (!color) return this._highlight = false, this;
		if (!$.colors.includes(color)) throw new TypeError("invalid highlight color");
		return this._highlight = color, this;
	}
	compact(bool = true) {
		if (bool) return this.flags |= flags.compact, this;
		if (!bool) return this.flags &= ~flags.compact, this;
	}
	baseline(bool = true) {
		if (bool) return this.flags |= flags.baseline, this;
		if (!bool) return this.flags &= ~flags.baseline, this;
	}
	range(name, s, e, m = 8) {
		const arr = [];
		for (let o = s; o <= e; o *= m) arr.push(Math.min(o, e));
		if (!arr.includes(e)) arr.push(e);
		return this.args(name, arr);
	}
	dense_range(name, s, e, a = 1) {
		const arr = [];
		for (let o = s; o <= e; o += a) arr.push(o);
		if (!arr.includes(e)) arr.push(e);
		return this.args(name, arr);
	}
	args(name, args) {
		if (name === null) return delete this._args.x, this;
		if (Array.isArray(name)) return this._args.x = name, this;
		if (null === args && "string" === typeof name) return delete this._args[name], this;
		if (Array.isArray(args) && "string" === typeof name) return this._args[name] = args, this;
		if (null !== name && "object" === typeof name) {
			for (const key in name) {
				const v = name[key];
				if (v == null) delete this._args[key];
				else if (Array.isArray(v)) this._args[key] = v;
				else throw new TypeError("invalid arguments map value");
			}
			return this;
		}
		throw new TypeError("invalid arguments");
	}
	*_names() {
		const args = Object.keys(this._args);
		if ((0 === args.length ? "static" : 1 === args.length ? "args" : "multi-args") === "static") yield this._name;
		else {
			const offsets = new Array(args.length).fill(0);
			const runs = args.reduce((len, name) => len * this._args[name].length, 1);
			for (let o = 0; o < runs; o++) {
				{
					const _args = {};
					let _name = this._name;
					for (let oo = 0; oo < args.length; oo++) _args[args[oo]] = this._args[args[oo]][offsets[oo]];
					for (let oo = 0; oo < args.length; oo++) _name = _name.replaceAll(`\$${args[oo]}`, _args[args[oo]]);
					yield _name;
				}
				let offset = 0;
				do
					offsets[offset] = (1 + offsets[offset]) % this._args[args[offset]].length;
				while (0 === offsets[offset++] && offset < args.length);
			}
		}
	}
	async run(thrw = false) {
		const args = Object.keys(this._args);
		const kind = 0 === args.length ? "static" : 1 === args.length ? "args" : "multi-args";
		const tune = {
			$counters,
			inner_gc: "inner" === this._gc,
			gc: !this._gc ? false : void 0,
			heap: await (async () => {
				if (globalThis.Bun) {
					const { memoryUsage } = await Promise.resolve().then(() => (init__runtime_stub_bun_jsc(), _runtime_stub_bun_jsc_exports));
					return () => {
						return memoryUsage().current;
					};
				}
				try {
					const { getHeapStatistics } = await Promise.resolve().then(() => (init__runtime_stub_node_v8(), _runtime_stub_node_v8_exports));
					getHeapStatistics();
					return () => {
						const m = getHeapStatistics();
						return m.used_heap_size + m.malloced_memory;
					};
				} catch {}
			})()
		};
		if (kind === "static") {
			let stats, error;
			try {
				stats = await measure(this.f, tune);
			} catch (err) {
				error = err;
				if (thrw) throw err;
			}
			return {
				kind,
				args: this._args,
				alias: this._name,
				group: this._group,
				baseline: !!(this.flags & flags.baseline),
				runs: [{
					stats,
					error,
					args: {},
					name: this._name
				}],
				style: {
					highlight: this._highlight,
					compact: !!(this.flags & flags.compact)
				}
			};
		} else {
			const offsets = new Array(args.length).fill(0);
			const runs = new Array(args.reduce((len, name) => len * this._args[name].length, 1));
			for (let o = 0; o < runs.length; o++) {
				{
					let stats, error;
					const _args = {};
					let _name = this._name;
					for (let oo = 0; oo < args.length; oo++) _args[args[oo]] = this._args[args[oo]][offsets[oo]];
					for (let oo = 0; oo < args.length; oo++) _name = _name.replaceAll(`\$${args[oo]}`, _args[args[oo]]);
					try {
						stats = await measure(this.f, {
							...tune,
							args: _args
						});
					} catch (err) {
						error = err;
						if (thrw) throw err;
					}
					runs[o] = {
						stats,
						error,
						args: _args,
						name: _name
					};
				}
				let offset = 0;
				do
					offsets[offset] = (1 + offsets[offset]) % this._args[args[offset]].length;
				while (0 === offsets[offset++] && offset < args.length);
			}
			return {
				runs,
				kind,
				args: this._args,
				alias: this._name,
				group: this._group,
				baseline: !!(this.flags & flags.baseline),
				style: {
					highlight: this._highlight,
					compact: !!(this.flags & flags.compact)
				}
			};
		}
	}
};
function bench(n, fn) {
	if (typeof n === "function") fn = n, n = fn.name || "anonymous";
	const collection = COLLECTIONS[COLLECTIONS.length - 1];
	const b = new B(n, fn);
	b._group = collection.id;
	return collection.trials.push(b), b;
}
function colors() {
	return globalThis.tjs?.env?.FORCE_COLOR || globalThis.process?.env?.FORCE_COLOR || !globalThis.Deno?.noColor && !globalThis.tjs?.env?.NO_COLOR && !globalThis.process?.env?.NO_COLOR && !globalThis.process?.env?.NODE_DISABLE_COLORS;
}
async function cpu() {
	if (globalThis.process?.versions?.webcontainer) return null;
	try {
		let n;
		if (n = __require("os")?.cpus?.()?.[0]?.model) return n;
	} catch {}
	try {
		let n;
		if (n = (init__runtime_stub_node_os(), __toCommonJS(_runtime_stub_node_os_exports))?.cpus?.()?.[0]?.model) return n;
	} catch {}
	try {
		let n;
		if (n = globalThis.tjs?.system?.cpus?.[0]?.model) return n;
	} catch {}
	try {
		let n;
		if (n = (await Promise.resolve().then(() => (init__runtime_stub_node_os(), _runtime_stub_node_os_exports)))?.cpus?.()?.[0]?.model) return n;
	} catch {}
	return null;
}
function version() {
	return {
		v8: () => globalThis.version?.(),
		bun: () => globalThis.Bun?.version,
		"txiki.js": () => globalThis.tjs?.version,
		deno: () => globalThis.Deno?.version?.deno,
		llrt: () => globalThis.process?.versions?.llrt,
		node: () => globalThis.process?.versions?.node,
		graaljs: () => globalThis.Graal?.versionGraalVM,
		webcontainer: () => globalThis.process?.versions?.webcontainer,
		"quickjs-ng": () => globalThis.navigator?.userAgent?.split?.("/")[1],
		hermes: () => globalThis.HermesInternal?.getRuntimeProperties?.()?.["OSS Release Version"]
	}[runtime()]?.() || null;
}
function runtime() {
	if (globalThis.d8) return "v8";
	if (globalThis.tjs) return "txiki.js";
	if (globalThis.Graal) return "graaljs";
	if (globalThis.process?.versions?.llrt) return "llrt";
	if (globalThis.process?.versions?.webcontainer) return "webcontainer";
	if (globalThis.inIon && globalThis.performance?.mozMemory) return "spidermonkey";
	if (globalThis.window && globalThis.netscape && globalThis.InternalError) return "firefox";
	if (globalThis.window && globalThis.navigator && Error.prepareStackTrace) return "chromium";
	if (globalThis.navigator?.userAgent?.toLowerCase?.()?.includes?.("quickjs-ng")) return "quickjs-ng";
	if (globalThis.$262 && globalThis.lockdown && globalThis.AsyncDisposableStack) return "XS Moddable";
	if (globalThis.$ && "IsHTMLDDA" in globalThis.$ && (/* @__PURE__ */ new Error()).stack.includes("runtime@")) return "jsc";
	if (globalThis.window && globalThis.navigator && (/* @__PURE__ */ new Error()).stack.includes("runtime@")) return "webkit";
	if (globalThis.os && globalThis.std) return "quickjs";
	if (globalThis.Bun) return "bun";
	if (globalThis.Deno) return "deno";
	if (globalThis.HermesInternal) return "hermes";
	if (globalThis.window && globalThis.navigator) return "browser";
	if (globalThis.process) return "node";
	else return null;
}
async function arch() {
	if (runtime() === "webcontainer") return "js + wasm";
	try {
		let n;
		if (n = Deno?.build?.target) return n;
	} catch {}
	try {
		const os = await Promise.resolve().then(() => (init__runtime_stub_node_os(), _runtime_stub_node_os_exports));
		return `${os.arch()}-${os.platform()}`;
	} catch {}
	if (globalThis.process?.arch && globalThis.process?.platform) return `${globalThis.process.arch}-${globalThis.process.platform}`;
	if (runtime() === "txiki.js") return `${globalThis.tjs.system?.arch}-${globalThis.tjs.system?.platform}`;
	if (runtime() === "spidermonkey") {
		try {
			const build = globalThis.getBuildConfiguration();
			const platforms = [
				"osx",
				"linux",
				"android",
				"windows"
			];
			const arch = [
				"arm",
				"x64",
				"x86",
				"wasi",
				"arm64",
				"mips32",
				"mips64",
				"loong64",
				"riscv64"
			].find((k) => build[k]);
			const platform = platforms.find((k) => build[k]);
			if (arch) return !platform ? arch : `${arch}-${platform}`;
		} catch {}
		try {
			if (globalThis.isAvxPresent()) return "x86_64";
		} catch {}
	}
	return null;
}
function defaults(opts) {
	opts.print ??= print;
	opts.throw ??= false;
	opts.filter ??= /.*/;
	opts.format ??= "mitata";
	opts.colors ??= colors();
	opts.observe ??= (trial) => trial;
}
async function run$1(opts = {}) {
	defaults(opts);
	const t = Date.now();
	const benchmarks = [];
	const noop = await measure(() => {});
	const _cpu = await measure(() => {}, { batch_unroll: 1 });
	const noop_inner_gc = await measure(() => {}, { inner_gc: true });
	const noop_iter = await measure((state) => {
		for (const _ of state);
	});
	const context = {
		now: t,
		arch: await arch(),
		version: version(),
		runtime: runtime(),
		cpu: {
			name: await cpu(),
			freq: 1 / _cpu.avg
		},
		noop: {
			fn: noop,
			iter: noop_iter,
			fn_gc: noop_inner_gc
		}
	};
	if (!$counters && context.arch?.includes?.("darwin") && [
		"bun",
		"node",
		"deno"
	].includes(context.runtime)) try {
		$counters = await Promise.resolve().then(() => (init_lib(), lib_exports));
		if (0 !== process.getuid()) throw $counters = false, 1;
	} catch {}
	if (!$counters && context.arch?.includes?.("linux") && [
		"bun",
		"node",
		"deno"
	].includes(context.runtime)) try {
		$counters = await Promise.resolve().then(() => (init_lib(), lib_exports));
	} catch (err) {
		if (err?.message?.includes?.("PermissionDenied")) $counters = false;
	}
	const layout = COLLECTIONS.map((c) => ({
		name: c.name,
		types: c.types
	}));
	const format = "string" === typeof opts.format ? opts.format : Object.keys(opts.format)[0];
	await formats[format](context, {
		...opts,
		format: opts.format[format]
	}, benchmarks, layout);
	return COLLECTIONS = [{
		name: 0,
		types: [],
		trials: []
	}], {
		layout,
		context,
		benchmarks
	};
}
const formats = {
	async quiet(_, opts, benchmarks) {
		for (const collection of COLLECTIONS) for (const trial of collection.trials) if (opts.filter.test(trial._name)) benchmarks.push(opts.observe(await trial.run(opts.throw)));
	},
	async json(ctx, opts, benchmarks, layout) {
		const print = opts.print;
		const debug = opts.format?.debug ?? true;
		const samples = opts.format?.samples ?? true;
		for (const collection of COLLECTIONS) for (const trial of collection.trials) if (opts.filter.test(trial._name)) benchmarks.push(opts.observe(await trial.run(opts.throw)));
		print(JSON.stringify({
			layout,
			benchmarks,
			context: ctx
		}, (k, v) => {
			if (!debug && k === "debug") return "";
			if (!samples && k === "samples") return null;
			if (!(v instanceof Error)) return v;
			return {
				message: String(v.message),
				stack: v.stack
			};
		}, 0));
	},
	async markdown(ctx, opts, benchmarks) {
		let first = true;
		const print = opts.print;
		print(`clk: ~${ctx.cpu.freq.toFixed(2)} GHz`);
		print(`cpu: ${ctx.cpu.name}`);
		print(`runtime: ${ctx.runtime}${!ctx.version ? "" : ` ${ctx.version}`} (${ctx.arch})`);
		print("");
		for (const collection of COLLECTIONS) {
			const trials = [];
			if (!collection.trials.length) continue;
			for (const trial of collection.trials) if (opts.filter.test(trial._name)) {
				let bench = await trial.run(opts.throw);
				bench = opts.observe(bench);
				trials.push(bench);
				benchmarks.push(bench);
			}
			if (!trials.length) continue;
			if (!first) print("");
			const name_len = trials.reduce((a, b) => Math.max(a, b.runs.reduce((a, b) => Math.max(a, b.name.length), 0)), 0);
			print(`| ${(collection.name ? `• ${collection.name}` : !first ? "" : "benchmark").padEnd(name_len)} | ${"avg".padStart(16)} | ${"min".padStart(11)} | ${"p75".padStart(11)} | ${"p99".padStart(11)} | ${"max".padStart(11)} |`);
			print(`| ${"-".repeat(name_len)} | ${"-".repeat(16)} | ${"-".repeat(11)} | ${"-".repeat(11)} | ${"-".repeat(11)} | ${"-".repeat(11)} |`);
			first = false;
			for (const trial of trials) for (const run of trial.runs) if (run.error) print(`| ${run.name.padEnd(name_len)} | error: ${run.error.message ?? run.error} |`);
			else print(`| ${run.name.padEnd(name_len)} | \`${`${$.time(run.stats.avg)}/iter`.padStart(14)}\` | \`${$.time(run.stats.min).padStart(9)}\` | \`${$.time(run.stats.p75).padStart(9)}\` | \`${$.time(run.stats.p99).padStart(9)}\` | \`${$.time(run.stats.max).padStart(9)}\` |`);
		}
	},
	async mitata(ctx, opts, benchmarks) {
		const print = opts.print;
		let k_legend = opts.format?.name ?? "longest";
		if ("fixed" === k_legend) k_legend = 28;
		else if (k_legend === "longest") {
			k_legend = 28;
			for (const collection of COLLECTIONS) for (const trial of collection.trials) if (opts.filter.test(trial._name)) for (const name of trial._names()) k_legend = Math.max(k_legend, name.length);
		}
		k_legend = Math.max(20, k_legend);
		if (!opts.colors) print(`clk: ~${ctx.cpu.freq.toFixed(2)} GHz`);
		else print($.gray + `clk: ~${ctx.cpu.freq.toFixed(2)} GHz` + $.reset);
		if (!opts.colors) print(`cpu: ${ctx.cpu.name}`);
		else print($.gray + `cpu: ${ctx.cpu.name}` + $.reset);
		if (!opts.colors) print(`runtime: ${ctx.runtime}${!ctx.version ? "" : ` ${ctx.version}`} (${ctx.arch})`);
		else print($.gray + `runtime: ${ctx.runtime}${!ctx.version ? "" : ` ${ctx.version}`} (${ctx.arch})` + $.reset);
		print("");
		print(`${"benchmark".padEnd(k_legend - 1)} avg (min … max) p75 / p99    (min … top 1%)`);
		print("-".repeat(15 + k_legend) + " " + "-".repeat(31));
		let first = true;
		let optimized_out_warning = false;
		for (const collection of COLLECTIONS) {
			const trials = [];
			let prev_run_gap = false;
			if (!collection.trials.length) continue;
			if (!collection.trials.some((trial) => opts.filter.test(trial._name))) continue;
			else if (first) {
				first = false;
				if (collection.name) {
					print(`• ${collection.name}`);
					if (!opts.colors) print("-".repeat(15 + k_legend) + " " + "-".repeat(31));
					else print($.gray + "-".repeat(15 + k_legend) + " " + "-".repeat(31) + $.reset);
				}
			} else {
				print("");
				if (collection.name) print(`• ${collection.name}`);
				if (!opts.colors) print("-".repeat(15 + k_legend) + " " + "-".repeat(31));
				else print($.gray + "-".repeat(15 + k_legend) + " " + "-".repeat(31) + $.reset);
			}
			for (const trial of collection.trials) if (opts.filter.test(trial._name)) {
				let bench = await trial.run(opts.throw);
				bench = opts.observe(bench);
				trials.push([trial, bench]);
				benchmarks.push(bench);
				if (-1 === $.colors.indexOf(trial._highlight)) trial._highlight = null;
				const _h = !opts.colors || !trial._highlight ? (x) => x : (x) => $[trial._highlight] + x + $.reset;
				for (const r of bench.runs) {
					if (prev_run_gap) print("");
					if (r.error) if (!opts.colors) print(`${_h($.str(r.name, k_legend).padEnd(k_legend))} error: ${r.error.message ?? r.error}`);
					else print(`${_h($.str(r.name, k_legend).padEnd(k_legend))} ${$.red + "error:" + $.reset} ${r.error.message ?? r.error}`);
					else {
						const compact = trial.flags & flags.compact;
						const noop = "iter" === r.stats.kind ? ctx.noop.iter : trial._gc !== "inner" ? ctx.noop.fn : ctx.noop.fn_gc;
						const optimized_out = r.stats.avg < 1.42 * noop.avg;
						optimized_out_warning = optimized_out_warning || optimized_out;
						if (compact) {
							let l = "";
							prev_run_gap = false;
							const avg = $.time(r.stats.avg).padStart(9);
							const name = $.str(r.name, k_legend).padEnd(k_legend);
							l += _h(name) + " ";
							if (!opts.colors) l += avg + "/iter";
							else l += $.bold + $.yellow + avg + $.reset + $.bold + "/iter" + $.reset;
							const p75 = $.time(r.stats.p75).padStart(9);
							const p99 = $.time(r.stats.p99).padStart(9);
							const bins = $.histogram.bins(r.stats, 11, .99);
							const histogram = $.histogram.ascii(bins, 1, { colors: opts.colors });
							l += " ";
							if (!opts.colors) l += p75 + " " + p99 + " " + histogram[0];
							else l += $.gray + p75 + " " + p99 + $.reset + " " + histogram[0];
							if (optimized_out) if (!opts.colors) l += " !";
							else l += $.red + " !" + $.reset;
							print(l);
						} else {
							let l = "";
							const avg = $.time(r.stats.avg).padStart(9);
							const name = $.str(r.name, k_legend).padEnd(k_legend);
							l += _h(name) + " ";
							const p75 = $.time(r.stats.p75).padStart(9);
							const bins = $.histogram.bins(r.stats, 21, .99);
							const histogram = $.histogram.ascii(bins, r.stats.gc && r.stats.heap ? 2 : !(r.stats.gc || r.stats.heap) ? 2 : 3, { colors: opts.colors });
							if (!opts.colors) l += avg + "/iter " + p75 + " " + histogram[0];
							else l += $.bold + $.yellow + avg + $.reset + $.bold + "/iter" + $.reset + " " + $.gray + p75 + $.reset + " " + histogram[0];
							if (optimized_out) if (!opts.colors) l += " !";
							else l += $.red + " !" + $.reset;
							print(l);
							l = "";
							const min = $.time(r.stats.min);
							const max = $.time(r.stats.max);
							const p99 = $.time(r.stats.p99).padStart(9);
							const diff = 18 - (min.length + max.length);
							l += " ".repeat(diff + k_legend - 8);
							if (!opts.colors) l += "(" + min + " … " + max + ")";
							else l += $.gray + "(" + $.reset + $.cyan + min + $.reset + $.gray + " … " + $.reset + $.magenta + max + $.reset + $.gray + ")" + $.reset;
							l += " ";
							if (!opts.colors) l += p99 + " " + histogram[1];
							else l += $.gray + p99 + $.reset + " " + histogram[1];
							print(l);
							if (r.stats.gc) {
								l = "";
								prev_run_gap = true;
								l += " ".repeat(k_legend - 10);
								const gcm = $.time(r.stats.gc.min).padStart(9);
								const gcx = $.time(r.stats.gc.max).padStart(9);
								if (!opts.colors) l += "gc(" + gcm + " … " + gcx + ")";
								else l += $.gray + "gc(" + $.reset + $.blue + gcm + $.reset + $.gray + " … " + $.reset + $.blue + gcx + $.reset + $.gray + ")" + $.reset;
								if (r.stats.heap) {
									l += " ";
									const ha = $.bytes(r.stats.heap.avg).padStart(9);
									const hm = $.bytes(r.stats.heap.min).padStart(9);
									const hx = $.bytes(r.stats.heap.max).padStart(9);
									if (!opts.colors) l += ha + " (" + hm + "…" + hx + ")";
									else l += $.yellow + ha + $.reset + $.gray + " (" + $.reset + $.yellow + hm + $.reset + $.gray + "…" + $.reset + $.yellow + hx + $.reset + $.gray + ")" + $.reset;
								} else {
									l += " ";
									const gca = $.time(r.stats.gc.avg).padStart(9);
									if (!opts.colors) l += gca + " " + histogram[2];
									else l += $.blue + gca + $.reset + " " + histogram[2];
								}
								print(l);
							} else if (r.stats.heap) {
								prev_run_gap = true;
								l = " ".repeat(k_legend - 8);
								const ha = $.bytes(r.stats.heap.avg).padStart(9);
								const hm = $.bytes(r.stats.heap.min).padStart(9);
								const hx = $.bytes(r.stats.heap.max).padStart(9);
								if (!opts.colors) l += "(" + hm + " … " + hx + ") " + ha + " " + histogram[2];
								else l += $.gray + "(" + $.reset + $.yellow + hm + $.reset + $.gray + " … " + $.reset + $.yellow + hx + $.reset + $.gray + ") " + $.reset + $.yellow + ha + $.reset + " " + histogram[2];
								print(l);
							}
							if (r.stats.counters) {
								l = "";
								prev_run_gap = true;
								if (ctx.arch.includes("linux")) {
									const _bmispred = r.stats.counters._bmispred.avg;
									const ipc = r.stats.counters.instructions.avg / r.stats.counters.cycles.avg;
									const cache = 100 - Math.min(100, 100 * r.stats.counters.cache.misses.avg / r.stats.counters.cache.avg);
									l += " ".repeat(k_legend - 12);
									if (!opts.colors) l += $.amount(ipc).padStart(7) + " ipc";
									else l += $.bold + $.green + $.amount(ipc).padStart(7) + $.reset + $.bold + " ipc" + $.reset;
									if (!opts.colors) l += " (" + cache.toFixed(2).padStart(6) + "% cache)";
									else l += $.gray + " (" + $.reset + (50 > cache ? $.red : 84 < cache ? $.green : $.yellow) + cache.toFixed(2).padStart(6) + "%" + $.reset + " cache" + $.gray + ")" + $.reset;
									if (!opts.colors) l += " " + $.amount(_bmispred).padStart(7) + " branch misses";
									else l += " " + $.green + $.amount(_bmispred).padStart(7) + $.reset + " branch misses";
									print(l);
									l = "";
									l += " ".repeat(k_legend - 20);
									if (opts.colors) l += $.gray;
									l += $.amount(r.stats.counters.cycles.avg).padStart(7) + " cycles";
									l += " " + $.amount(r.stats.counters.instructions.avg).padStart(7) + " instructions";
									l += " " + $.amount(r.stats.counters.cache.avg).padStart(7) + " c-refs";
									l += " " + $.amount(r.stats.counters.cache.misses.avg).padStart(7) + " c-misses";
									if (opts.colors) l += $.reset;
									print(l);
								}
								if (ctx.arch.includes("darwin")) {
									const ipc = r.stats.counters.instructions.avg / r.stats.counters.cycles.avg;
									const stalls = 100 * r.stats.counters.cycles.stalls.avg / r.stats.counters.cycles.avg;
									const ldst = 100 * r.stats.counters.instructions.loads_and_stores.avg / r.stats.counters.instructions.avg;
									const cache = 100 - Math.min(100, 100 * (r.stats.counters.l1.miss_loads.avg + r.stats.counters.l1.miss_stores.avg) / r.stats.counters.instructions.loads_and_stores.avg);
									l += " ".repeat(k_legend - 13);
									if (!opts.colors) l += $.amount(ipc).padStart(7) + " ipc";
									else l += $.bold + $.green + $.amount(ipc).padStart(7) + $.reset + $.bold + " ipc" + $.reset;
									if (!opts.colors) l += " (" + stalls.toFixed(2).padStart(6) + "% stalls)";
									else l += $.gray + " (" + $.reset + (12 > stalls ? $.green : 50 < stalls ? $.red : $.yellow) + stalls.toFixed(2).padStart(6) + "%" + $.reset + " stalls" + $.gray + ")" + $.reset;
									if (!opts.colors) l += " " + cache.toFixed(2).padStart(6) + "% L1 data cache";
									else l += " " + (50 > cache ? $.red : 84 < cache ? $.green : $.yellow) + cache.toFixed(2).padStart(6) + "%" + $.reset + " L1 data cache";
									print(l);
									l = "";
									l += " ".repeat(k_legend - 20);
									if (opts.colors) l += $.gray;
									l += $.amount(r.stats.counters.cycles.avg).padStart(7) + " cycles";
									l += " " + $.amount(r.stats.counters.instructions.avg).padStart(7) + " instructions";
									l += " " + ldst.toFixed(2).padStart(6) + "% retired LD/ST (" + $.amount(r.stats.counters.instructions.loads_and_stores.avg).padStart(7) + ")";
									if (opts.colors) l += $.reset;
									print(l);
								}
							}
						}
					}
				}
			}
			if (collection.types.includes("b")) {
				const map = {};
				const colors = {};
				for (const [trial, bench] of trials) for (const r of bench.runs) {
					if (r.error) continue;
					map[r.name] = r.stats.avg;
					colors[r.name] = $[trial._highlight];
				}
				if (Object.keys(map).length) {
					print("");
					$.barplot.ascii(map, k_legend, 44, {
						steps: -10,
						colors: !opts.colors ? null : colors
					}).forEach((l) => print(l));
				}
			}
			if (collection.types.includes("x")) {
				const map = {};
				const colors = {};
				if (1 === trials.length) for (const [trial, bench] of trials) for (const r of bench.runs) {
					map[r.name] = r.stats;
					colors[r.name] = $[trial._highlight];
				}
				else for (const [trial, bench] of trials) {
					const runs = bench.runs.filter((r) => r.stats);
					if (!runs.length) continue;
					if (1 === runs.length) {
						map[runs[0].name] = runs[0].stats;
						colors[runs[0].name] = $[trial._highlight];
					} else {
						const stats = {
							avg: 0,
							min: Infinity,
							p25: Infinity,
							p75: -Infinity,
							p99: -Infinity
						};
						for (const r of runs) {
							stats.avg += r.stats.avg;
							stats.min = Math.min(stats.min, r.stats.min);
							stats.p25 = Math.min(stats.p25, r.stats.p25);
							stats.p75 = Math.max(stats.p75, r.stats.p75);
							stats.p99 = Math.max(stats.p99, r.stats.p99);
						}
						map[bench.alias] = stats;
						stats.avg /= runs.length;
						colors[bench.alias] = $[trial._highlight];
					}
				}
				if (Object.keys(map).length) {
					print("");
					$.boxplot.ascii(map, k_legend, 44, { colors: !opts.colors ? null : colors }).forEach((l) => print(l));
				}
			}
			if (collection.types.includes("l")) {
				const map = {};
				const extra = {};
				const colors = {};
				const labels = {};
				if (1 === trials.length) for (const [trial, bench] of trials) {
					const runs = bench.runs.filter((r) => r.stats);
					if (!runs.length) continue;
					if (1 === runs.length) {
						const { min, max, avg, peak, bins } = $.histogram.bins(runs[0].stats, 44, .99);
						extra.ymax = peak;
						colors.xmin = $.cyan;
						colors.xmax = $.magenta;
						extra.ymin = $.min(bins);
						labels.xmin = $.time(min);
						labels.xmax = $.time(max);
						extra.xmax = bins.length - 1;
						colors[runs[0].name] = $[trial._highlight] || $.bold;
						map[runs[0].name] = {
							y: bins,
							x: bins.map((_, o) => o),
							format(x, y, s) {
								x = Math.round(x * 44);
								if (!opts.colors) return s;
								if (x === avg) return $.yellow + s + $.reset;
								return (x < avg ? $.cyan : $.magenta) + s + $.reset;
							}
						};
					} else {
						const avgs = runs.map((r) => r.stats.avg);
						colors.ymin = $.cyan;
						colors.ymax = $.magenta;
						extra.ymin = $.min(avgs);
						extra.ymax = $.max(avgs);
						extra.xmax = runs.length - 1;
						labels.ymin = $.time(extra.ymin);
						labels.ymax = $.time(extra.ymax);
						colors[bench.alias] = $[trial._highlight];
						map[bench.alias] = {
							y: avgs,
							x: avgs.map((_, o) => o)
						};
					}
				}
				else if (trials.every(([_, bench]) => "static" === bench.kind)) {
					colors.xmin = $.cyan;
					colors.xmax = $.magenta;
					for (const [trial, bench] of trials) for (const r of bench.runs) {
						if (r.error) continue;
						const { bins, peak, steps } = $.histogram.bins(r.stats, 44, .99);
						const y = bins.map((b) => b / peak);
						map[r.name] = {
							y,
							x: steps
						};
						colors[r.name] = $[trial._highlight];
						extra.ymin = Math.min($.min(y), extra.ymin ?? Infinity);
						extra.ymax = Math.max($.max(y), extra.ymax ?? -Infinity);
						extra.xmin = Math.min($.min(steps), extra.xmin ?? Infinity);
						extra.xmax = Math.max($.max(steps), extra.xmax ?? -Infinity);
						labels.xmin = $.time(extra.xmin);
						labels.xmax = $.time(extra.xmax);
					}
				} else {
					let min = Infinity;
					let max = -Infinity;
					for (const [trial, bench] of trials) for (const r of bench.runs) {
						if (r.error) continue;
						min = Math.min(min, r.stats.avg);
						max = Math.max(max, r.stats.avg);
					}
					colors.ymin = $.cyan;
					colors.ymax = $.magenta;
					labels.ymin = $.time(min);
					labels.ymax = $.time(max);
					for (const [trial, bench] of trials) {
						const runs = bench.runs.filter((r) => r.stats);
						if (!runs.length) continue;
						if (1 === runs.length) {
							const y = runs[0].stats.avg / max;
							colors[runs[0].name] = $[trial._highlight];
							map[runs[0].name] = {
								x: [0, 1],
								y: [y, y]
							};
							extra.ymin = Math.min(y, extra.ymin ?? Infinity);
							extra.ymax = Math.max(y, extra.ymax ?? -Infinity);
						} else {
							colors[bench.alias] = $[trial._highlight];
							const y = runs.map((r) => r.stats.avg / max);
							extra.ymin = Math.min($.min(y), extra.ymin ?? Infinity);
							extra.ymax = Math.max($.max(y), extra.ymax ?? -Infinity);
							map[bench.alias] = {
								y,
								x: runs.map((_, o) => o / (runs.length - 1))
							};
						}
					}
				}
				if (Object.keys(map).length) {
					print("");
					$.lineplot.ascii(map, {
						labels,
						...extra,
						width: 44,
						height: 16,
						key: k_legend,
						colors: !opts.colors ? null : colors
					}).forEach((l) => print(l));
				}
			}
			if (collection.types.includes("s")) {
				trials.sort((a, b) => {
					const aa = a[1].runs.filter((r) => r.stats);
					const bb = b[1].runs.filter((r) => r.stats);
					if (0 === aa.length) return 1;
					if (0 === bb.length) return -1;
					return aa.reduce((a, r) => a + r.stats.avg, 0) / aa.length - bb.reduce((a, r) => a + r.stats.avg, 0) / bb.length;
				});
				if (1 === trials.length) {
					const runs = trials[0][1].runs.filter((r) => r.stats).sort((a, b) => a.stats.avg - b.stats.avg);
					if (1 < runs.length) {
						print("");
						if (!opts.colors) print("summary");
						else print($.bold + "summary" + $.reset);
						if (!opts.colors) print("  " + runs[0].name);
						else print(" ".repeat(2) + $.bold + $.cyan + runs[0].name + $.reset);
						for (let o = 1; o < runs.length; o++) {
							const r = runs[o];
							const baseline = runs[0];
							const faster = r.stats.avg >= baseline.stats.avg;
							const diff = !faster ? Number((1 / r.stats.avg * baseline.stats.avg).toFixed(2)) : Number((1 / baseline.stats.avg * r.stats.avg).toFixed(2));
							if (!opts.colors) print(" ".repeat(3) + diff + `x ${faster ? "faster" : "slower"} than ${r.name}`);
							else print(" ".repeat(3) + (!faster ? $.red : $.green) + diff + $.reset + `x ${faster ? "faster" : "slower"} than ${$.bold + $.cyan + r.name + $.reset}`);
						}
					}
				} else {
					let header = false;
					const baseline = trials.find(([trial, bench]) => bench.baseline && bench.runs.some((r) => r.stats))?.[1] || trials[0][1];
					if (baseline) {
						const bruns = baseline.runs.filter((r) => !r.error).sort((a, b) => a.stats.avg - b.stats.avg);
						for (const [trial, bench] of trials) {
							if (bench === baseline) continue;
							const runs = bench.runs.filter((r) => !r.error).sort((a, b) => a.stats.avg - b.stats.avg);
							if (!runs.length) continue;
							if (!header) {
								print("");
								header = true;
								if (!opts.colors) print("summary");
								else print($.bold + "summary" + $.reset);
								if (1 !== bruns.length) if (!opts.colors) print("  " + baseline.alias);
								else print(" ".repeat(2) + $.bold + $.cyan + baseline.alias + $.reset);
								else if (!opts.colors) print("  " + bruns[0].name);
								else print(" ".repeat(2) + $.bold + $.cyan + bruns[0].name + $.reset);
							}
							if (1 === runs.length && 1 === bruns.length) {
								const r = runs[0];
								const br = bruns[0];
								const faster = r.stats.avg >= br.stats.avg;
								const diff = !faster ? Number((1 / r.stats.avg * br.stats.avg).toFixed(2)) : Number((1 / br.stats.avg * r.stats.avg).toFixed(2));
								if (!opts.colors) print(" ".repeat(3) + diff + `x ${faster ? "faster" : "slower"} than ${r.name}`);
								else print(" ".repeat(3) + (!faster ? $.red : $.green) + diff + $.reset + `x ${faster ? "faster" : "slower"} than ${$.bold + $.cyan + r.name + $.reset}`);
							} else {
								const rf = runs[0];
								const bf = bruns[0];
								const rs = runs[runs.length - 1];
								const bs = bruns[bruns.length - 1];
								const faster = runs.reduce((a, r) => a + r.stats.avg, 0) / runs.length >= bruns.reduce((a, r) => a + r.stats.avg, 0) / bruns.length;
								const sfaster = rs.stats.avg >= bs.stats.avg;
								const ffaster = rf.stats.avg >= bf.stats.avg;
								const sdiff = !sfaster ? Number((1 / rs.stats.avg * bs.stats.avg).toFixed(2)) : Number((1 / bs.stats.avg * rs.stats.avg).toFixed(2));
								const fdiff = !ffaster ? Number((1 / rf.stats.avg * bf.stats.avg).toFixed(2)) : Number((1 / bf.stats.avg * rf.stats.avg).toFixed(2));
								if (!opts.colors) print(" ".repeat(3) + (1 === sdiff ? sdiff : (sfaster ? "+" : "-") + sdiff) + "…" + (1 === fdiff ? fdiff : (ffaster ? "+" : "-") + fdiff) + `x ${faster ? "faster" : "slower"} than ${1 === runs.length ? rf.name : bench.alias}`);
								else print(" ".repeat(3) + (1 === sdiff ? $.gray + sdiff + $.reset : !sfaster ? $.red + "-" + sdiff + $.reset : $.green + "+" + sdiff + $.reset) + "…" + (1 === fdiff ? $.gray + fdiff + $.reset : !ffaster ? $.red + "-" + fdiff + $.reset : $.green + "+" + fdiff + $.reset) + `x ${faster ? "faster" : "slower"} than ${$.bold + $.cyan + (1 === runs.length ? rf.name : bench.alias) + $.reset}`);
							}
						}
					}
				}
			}
		}
		let nl = false;
		if (false === $counters) if (!opts.colors) print(""), nl = true, print("! = run with sudo to enable hardware counters");
		else print(""), nl = true, print($.yellow + "!" + $.reset + $.gray + " = " + $.reset + "run with sudo to enable hardware counters");
		if (optimized_out_warning) if (!opts.colors) nl || print(""), print(" ".repeat(k_legend - 13) + "benchmark was likely optimized out (dead code elimination) = !"), print(" ".repeat(k_legend - 13) + "https://github.com/evanwashere/mitata#writing-good-benchmarks");
		else nl || print(""), print(" ".repeat(k_legend - 13) + "benchmark was likely optimized out " + $.gray + "(dead code elimination)" + $.reset + $.gray + " = " + $.reset + $.red + "!" + $.reset), print(" ".repeat(k_legend - 13) + $.gray + "https://github.com/evanwashere/mitata#writing-good-benchmarks" + $.reset);
	}
};
const $ = {
	bold: "\x1B[1m",
	reset: "\x1B[0m",
	red: "\x1B[31m",
	cyan: "\x1B[36m",
	blue: "\x1B[34m",
	gray: "\x1B[90m",
	white: "\x1B[37m",
	black: "\x1B[30m",
	green: "\x1B[32m",
	yellow: "\x1B[33m",
	magenta: "\x1B[35m",
	colors: [
		"red",
		"cyan",
		"blue",
		"green",
		"yellow",
		"magenta",
		"gray",
		"white",
		"black"
	],
	clamp(m, v, x) {
		return v < m ? m : v > x ? x : v;
	},
	min(arr, s = Infinity) {
		return arr.reduce((x, v) => Math.min(x, v), s);
	},
	max(arr, s = -Infinity) {
		return arr.reduce((x, v) => Math.max(x, v), s);
	},
	str(s, len = 3) {
		if (len >= s.length) return s;
		return `${s.slice(0, len - 2)}..`;
	},
	amount(n) {
		if (Number.isNaN(n)) return "NaN";
		if (n < 1e3) return n.toFixed(2);
		n /= 1e3;
		if (n < 1e3) return `${n.toFixed(2)}k`;
		n /= 1e3;
		if (n < 1e3) return `${n.toFixed(2)}M`;
		n /= 1e3;
		if (n < 1e3) return `${n.toFixed(2)}G`;
		n /= 1e3;
		if (n < 1e3) return `${n.toFixed(2)}T`;
		n /= 1e3;
		return `${n.toFixed(2)}P`;
	},
	bytes(b, pad = true) {
		if (Number.isNaN(b)) return "NaN";
		if (b < 1e3) return `${b.toFixed(2)} ${!pad ? "" : " "}b`;
		b /= 1024;
		if (b < 1e3) return `${b.toFixed(2)} kb`;
		b /= 1024;
		if (b < 1e3) return `${b.toFixed(2)} mb`;
		b /= 1024;
		if (b < 1e3) return `${b.toFixed(2)} gb`;
		b /= 1024;
		if (b < 1e3) return `${b.toFixed(2)} tb`;
		b /= 1024;
		return `${b.toFixed(2)} pb`;
	},
	time(ns) {
		if (ns < 1) return `${(ns * 1e3).toFixed(2)} ps`;
		if (ns < 1e3) return `${ns.toFixed(2)} ns`;
		ns /= 1e3;
		if (ns < 1e3) return `${ns.toFixed(2)} µs`;
		ns /= 1e3;
		if (ns < 1e3) return `${ns.toFixed(2)} ms`;
		ns /= 1e3;
		if (ns < 1e3) return `${ns.toFixed(2)} s`;
		ns /= 60;
		if (ns < 1e3) return `${ns.toFixed(2)} m`;
		ns /= 60;
		return `${ns.toFixed(2)} h`;
	},
	barplot: {
		symbols: {
			bar: "■",
			legend: "┤",
			tl: "┌",
			tr: "┐",
			bl: "└",
			br: "┘"
		},
		ascii(map, key = 8, size = 14, { steps = 0, fmt = $.time, colors = true, symbols = $.barplot.symbols } = {}) {
			const values = Object.values(map);
			const canvas = new Array(2 + values.length).fill("");
			steps += size;
			const min = $.min(values);
			const step = ($.max(values) - min) / steps;
			canvas[0] += " ".repeat(1 + key);
			canvas[0] += symbols.tl + " ".repeat(size) + symbols.tr;
			Object.keys(map).forEach((name, o) => {
				const value = map[name];
				const bars = Math.round((value - min) / step);
				if (colors?.[name]) canvas[o + 1] += colors[name];
				canvas[o + 1] += $.str(name, key).padStart(key);
				if (colors?.[name]) canvas[o + 1] += $.reset;
				canvas[o + 1] += " " + symbols.legend;
				if (colors) canvas[o + 1] += $.gray;
				canvas[o + 1] += symbols.bar.repeat(bars);
				if (colors) canvas[o + 1] += $.reset;
				canvas[o + 1] += " ";
				if (colors) canvas[o + 1] += $.yellow;
				canvas[o + 1] += fmt(value);
				if (colors) canvas[o + 1] += $.reset;
			});
			canvas[canvas.length - 1] += " ".repeat(1 + key);
			canvas[canvas.length - 1] += symbols.bl + " ".repeat(size) + symbols.br;
			return canvas;
		}
	},
	canvas: { braille(width, height) {
		const vwidth = 2 * width;
		const vheight = 4 * height;
		const buffer = new Uint8Array(vwidth * vheight);
		const symbols = [
			10241,
			10242,
			10244,
			10304,
			10248,
			10256,
			10272,
			10368
		];
		return {
			buffer,
			width,
			height,
			vwidth,
			vheight,
			set(x, y, tag = 1) {
				buffer[x + y * vwidth] = tag;
			},
			line(s, e, tag = 1) {
				s.x = Math.round(s.x);
				s.y = Math.round(s.y);
				e.x = Math.round(e.x);
				e.y = Math.round(e.y);
				const dx = Math.abs(e.x - s.x);
				const dy = Math.abs(e.y - s.y);
				let err = dx - dy;
				let x = s.x;
				let y = s.y;
				const sx = s.x < e.x ? 1 : -1;
				const sy = s.y < e.y ? 1 : -1;
				while (true) {
					buffer[x + y * vwidth] = tag;
					if (x === e.x && y === e.y) break;
					const e2 = 2 * err;
					if (e2 < dx) y += sy, err += dx;
					if (e2 > -dy) x += sx, err -= dy;
				}
			},
			toString({ background = false, format = (x, y, s, tag, backgorund) => s } = {}) {
				const canvas = new Array(height).fill("");
				for (let y = 0; y < vheight; y += 4) {
					const y0 = y * vwidth;
					const y1 = y0 + vwidth;
					const y2 = y1 + vwidth;
					const y3 = y2 + vwidth;
					for (let x = 0; x < vwidth; x += 2) {
						let c = 10240;
						if (buffer[x + y0]) c |= symbols[0];
						if (buffer[1 + x + y0]) c |= symbols[4];
						if (buffer[x + y1]) c |= symbols[1];
						if (buffer[1 + x + y1]) c |= symbols[5];
						if (buffer[x + y2]) c |= symbols[2];
						if (buffer[1 + x + y2]) c |= symbols[6];
						if (buffer[x + y3]) c |= symbols[3];
						if (buffer[1 + x + y3]) c |= symbols[7];
						if (c === 10240 && !background) canvas[y / 4] += " ";
						else canvas[y / 4] += format(x / (vwidth - 1), y / (vheight - 1), String.fromCharCode(c), buffer[x + y0] || buffer[1 + x + y0] || buffer[x + y1] || buffer[1 + x + y1] || buffer[x + y2] || buffer[1 + x + y2] || buffer[x + y3] || buffer[1 + x + y3], c === 10240);
					}
				}
				return canvas;
			}
		};
	} },
	lineplot: {
		symbols: {
			tl: "┌",
			tr: "┐",
			bl: "└",
			br: "┘"
		},
		ascii(map, { colors = true, xmin = 0, xmax = 1, ymin = 0, ymax = 1, symbols = $.lineplot.symbols, key = 8, width = 12, height = 12, labels = {
			xmin: null,
			xmax: null,
			ymin: null,
			ymax: null
		} } = {}) {
			const keys = Object.keys(map);
			const _canvas = $.canvas.braille(width, height);
			const xs = (_canvas.vwidth - 1) / (xmax - xmin);
			const ys = (_canvas.vheight - 1) / (ymax - ymin);
			const colorsv = Object.entries(colors).filter(([n]) => !Object.keys(labels).includes(n)).map(([_, v]) => v);
			const acolors = $.colors.filter((n) => !colorsv.includes($[n]));
			keys.forEach((name, k) => {
				const { x: xp, y: yp } = map[name];
				for (let o = 0; o < xp.length - 1; o++) {
					if (null == xp[o] || null == xp[o + 1]) continue;
					if (null == yp[o] || null == yp[o + 1]) continue;
					const s = {
						x: Math.round(xs * (xp[o] - xmin)),
						y: _canvas.vheight - 1 - Math.round(ys * (yp[o] - ymin))
					};
					const e = {
						x: Math.round(xs * (xp[o + 1] - xmin)),
						y: _canvas.vheight - 1 - Math.round(ys * (yp[o + 1] - ymin))
					};
					_canvas.line(s, e, 1 + k);
				}
			});
			const canvas = new Array(2 + _canvas.height).fill("");
			canvas[0] += " ".repeat(1 + key);
			canvas[0] += symbols.tl + " ".repeat(width) + symbols.tr;
			const lines = _canvas.toString({ format(x, y, s, tag) {
				const name = keys[tag - 1];
				if (map[name].format) return map[name].format(x, y, s);
				else if (colors?.[name]) return colors[name] + s + $.reset;
				else return $[acolors[(tag - 1) % acolors.length]] + s + $.reset;
			} });
			const plabels = {
				0: !colors?.ymax ? labels.ymax || "" : colors.ymax + (labels.ymax || "") + $.reset,
				[lines.length - 1]: !colors?.ymin ? labels.ymin || "" : colors.ymin + (labels.ymin || "") + $.reset
			};
			const legends = keys.map((name, k) => {
				if (colors?.[name]) return colors[name] + $.str(name, key).padStart(key) + $.reset;
				else return $[acolors[k % acolors.length]] + $.str(name, key).padStart(key) + $.reset;
			});
			lines.forEach((l, o) => {
				canvas[o + 1] += legends[o] ?? " ".repeat(key);
				canvas[o + 1] += " ".repeat(2) + l + (!plabels[o] ? "" : " " + plabels[o]);
			});
			canvas[canvas.length - 1] += " ".repeat(1 + key);
			canvas[canvas.length - 1] += symbols.bl + " ".repeat(width) + symbols.br;
			if (labels.xmin || labels.xmax) {
				const xmin = labels.xmin || "";
				const xmax = labels.xmax || "";
				const gap = 2 + width - xmin.length;
				canvas.push(" ".repeat(key) + " " + (!colors?.xmin ? xmin : colors.xmin + xmin + $.reset) + (!colors?.xmax ? xmax.padStart(gap) : colors.xmax + xmax.padStart(gap) + $.reset));
			}
			return canvas;
		}
	},
	histogram: {
		symbols: [
			"▁",
			"▂",
			"▃",
			"▄",
			"▅",
			"▆",
			"▇",
			"█"
		],
		bins(stats, size = 6, percentile = 1) {
			const offset = percentile * (stats.samples.length - 1) | 0;
			let min = stats.min;
			const max = stats.samples[offset] || stats.max || 1;
			const steps = new Array(size);
			const bins = new Array(size).fill(0);
			const step = (max - min) / (size - 1);
			if (0 === step) {
				min = 0;
				for (let o = 0; o < size; o++) steps[o] = o * step;
				bins[$.clamp(0, Math.round((stats.avg - min) / step), size - 1)] = 1;
			} else {
				for (let o = 0; o < size; o++) steps[o] = min + o * step;
				for (let o = 0; o <= offset; o++) bins[Math.round((stats.samples[o] - min) / step)]++;
			}
			return {
				min,
				max,
				step,
				bins,
				steps,
				peak: $.max(bins),
				outliers: stats.samples.length - 1 - offset,
				avg: $.clamp(0, Math.round((stats.avg - min) / step), size - 1)
			};
		},
		ascii(_bins, height = 1, { colors = true, symbols = $.histogram.symbols } = {}) {
			const canvas = new Array(height);
			const { avg, peak, bins } = _bins;
			const scale = (height * symbols.length - 1) / peak;
			for (let y = 0; y < height; y++) {
				let l = "";
				if (0 !== avg) {
					if (colors) l += $.cyan;
					for (let o = 0; o < avg; o++) {
						const b = bins[o];
						if (y === 0) l += symbols[$.clamp(0, Math.round(b * scale), symbols.length - 1)];
						else {
							const min = y * symbols.length;
							const max = (y + 1) * symbols.length;
							const offset = Math.round(b * scale) | 0;
							if (min >= offset) l += " ";
							else if (max <= offset) l += symbols[symbols.length - 1];
							else l += symbols[$.clamp(min, offset, max) % symbols.length];
						}
					}
					if (colors) l += $.reset;
				}
				{
					if (colors) l += $.yellow;
					const b = bins[avg];
					if (y === 0) l += symbols[$.clamp(0, Math.round(b * scale), symbols.length - 1)];
					else {
						const min = y * symbols.length;
						const max = (y + 1) * symbols.length;
						const offset = Math.round(b * scale) | 0;
						if (min >= offset) l += " ";
						else if (max <= offset) l += symbols[symbols.length - 1];
						else l += symbols[$.clamp(min, offset, max) % symbols.length];
					}
					if (colors) l += $.reset;
				}
				if (avg != bins.length - 1) {
					if (colors) l += $.magenta;
					for (let o = 1 + avg; o < bins.length; o++) {
						const b = bins[o];
						if (y === 0) l += symbols[$.clamp(0, Math.round(b * scale), symbols.length - 1)];
						else {
							const min = y * symbols.length;
							const max = (y + 1) * symbols.length;
							const offset = Math.round(b * scale) | 0;
							if (min >= offset) l += " ";
							else if (max <= offset) l += symbols[symbols.length - 1];
							else l += symbols[$.clamp(min, offset, max) % symbols.length];
						}
					}
					if (colors) l += $.reset;
				}
				canvas[y] = l;
			}
			return canvas.reverse();
		}
	},
	boxplot: {
		symbols: {
			v: "│",
			h: "─",
			tl: "┌",
			tr: "┐",
			bl: "└",
			br: "┘",
			avg: {
				top: "┬",
				middle: "│",
				bottom: "┴"
			},
			tail: {
				top: "╷",
				bottom: "╵",
				middle: ["├", "┤"]
			}
		},
		ascii(map, key = 8, size = 14, { fmt = $.time, colors = true, symbols = $.boxplot.symbols } = {}) {
			let tmin = Infinity;
			let tmax = -Infinity;
			const keys = Object.keys(map);
			const canvas = new Array(3 + 3 * keys.length).fill("");
			for (const name of keys) {
				const stats = map[name];
				if (tmin > stats.min) tmin = stats.min;
				const max = stats.p99 || stats.max || 1;
				if (max > tmax) tmax = max;
			}
			const steps = 2 + size;
			const step = (tmax - tmin) / (steps - 1);
			canvas[0] += " ".repeat(1 + key);
			canvas[0] += symbols.tl + " ".repeat(size) + symbols.tr;
			keys.forEach((name, o) => {
				o *= 3;
				const stats = map[name];
				const min = stats.min;
				const avg = stats.avg;
				const p25 = stats.p25;
				const p75 = stats.p75;
				const max = stats.p99 || stats.max || 1;
				const min_offset = 1 + Math.min(steps - 1, Math.round((min - tmin) / step));
				const max_offset = 1 + Math.min(steps - 1, Math.round((max - tmin) / step));
				const avg_offset = 1 + Math.min(steps - 1, Math.round((avg - tmin) / step));
				const p25_offset = 1 + Math.min(steps - 1, Math.round((p25 - tmin) / step));
				const p75_offset = 1 + Math.min(steps - 1, Math.round((p75 - tmin) / step));
				const u = new Array(2 + steps).fill(" ");
				const m = new Array(2 + steps).fill(" ");
				const l = new Array(2 + steps).fill(" ");
				u[0] = !colors ? "" : $.cyan;
				m[0] = !colors ? "" : $.cyan;
				l[0] = !colors ? "" : $.cyan;
				if (min_offset < p25_offset) {
					u[min_offset] = symbols.tail.top;
					l[min_offset] = symbols.tail.bottom;
					m[min_offset] = symbols.tail.middle[0];
					for (let o = 1 + min_offset; o < p25_offset; o++) m[o] = symbols.h;
				}
				if (avg_offset > p25_offset) {
					u[p25_offset] = symbols.tl;
					l[p25_offset] = symbols.bl;
					m[p25_offset] = min_offset === p25_offset ? symbols.v : symbols.tail.middle[1];
					for (let o = 1 + p25_offset; o < avg_offset; o++) u[o] = l[o] = symbols.h;
				}
				u[avg_offset] = !colors ? symbols.avg.top : $.reset + $.yellow + symbols.avg.top + $.reset + $.magenta;
				l[avg_offset] = !colors ? symbols.avg.bottom : $.reset + $.yellow + symbols.avg.bottom + $.reset + $.magenta;
				m[avg_offset] = !colors ? symbols.avg.middle : $.reset + $.yellow + symbols.avg.middle + $.reset + $.magenta;
				if (avg_offset < p75_offset) {
					u[p75_offset] = symbols.tr;
					l[p75_offset] = symbols.br;
					m[p75_offset] = max_offset === p75_offset ? symbols.v : symbols.tail.middle[0];
					for (let o = 1 + avg_offset; o < p75_offset; o++) u[o] = l[o] = symbols.h;
				}
				if (max_offset > p75_offset) {
					u[max_offset] = symbols.tail.top;
					l[max_offset] = symbols.tail.bottom;
					m[max_offset] = symbols.tail.middle[1];
					for (let o = 1 + Math.max(avg_offset, p75_offset); o < max_offset; o++) m[o] = symbols.h;
				}
				canvas[o + 1] = " ".repeat(1 + key) + u.join("").trimEnd() + (!colors ? "" : $.reset);
				if (colors?.[name]) canvas[o + 2] += colors[name];
				canvas[o + 2] += $.str(name, key).padStart(key);
				if (colors?.[name]) canvas[o + 2] += $.reset;
				canvas[o + 2] += " " + m.join("").trimEnd() + (!colors ? "" : $.reset);
				canvas[o + 3] = " ".repeat(1 + key) + l.join("").trimEnd() + (!colors ? "" : $.reset);
			});
			canvas[canvas.length - 2] += " ".repeat(1 + key);
			canvas[canvas.length - 2] += symbols.bl + " ".repeat(size) + symbols.br;
			const rmin = fmt(tmin);
			const rmax = fmt(tmax);
			const rmid = fmt((tmin + tmax) / 2);
			const gap = (size - rmin.length - rmid.length - rmax.length) / 2;
			canvas[canvas.length - 1] += " ".repeat(1 + key);
			canvas[canvas.length - 1] += !colors ? rmin : $.cyan + rmin + $.reset;
			canvas[canvas.length - 1] += " ".repeat(1 + gap | 0);
			canvas[canvas.length - 1] += !colors ? rmid : $.gray + rmid + $.reset;
			canvas[canvas.length - 1] += " ".repeat(1 + Math.ceil(gap));
			canvas[canvas.length - 1] += !colors ? rmax : $.magenta + rmax + $.reset;
			return canvas;
		}
	}
};
//#endregion
//#region node_modules/s-js/dist/es/S.js
var S = function S(fn, value) {
	var node = new ComputationNode(fn, value);
	return function computation() {
		return node.current();
	};
};
Object.defineProperty(S, "default", { value: S });
S.root = function root(fn) {
	var owner = Owner, root = fn.length === 0 ? UNOWNED : new ComputationNode(null, null), result = void 0, disposer = fn.length === 0 ? null : function _dispose() {
		if (RunningClock !== null) RootClock.disposes.add(root);
		else dispose(root);
	};
	Owner = root;
	if (RunningClock === null) result = topLevelRoot(fn, disposer, owner);
	else {
		result = disposer === null ? fn() : fn(disposer);
		Owner = owner;
	}
	return result;
};
function topLevelRoot(fn, disposer, owner) {
	try {
		return disposer === null ? fn() : fn(disposer);
	} finally {
		Owner = owner;
	}
}
S.on = function on(ev, fn, seed, onchanges) {
	if (Array.isArray(ev)) ev = callAll(ev);
	onchanges = !!onchanges;
	return S(on, seed);
	function on(value) {
		var running = RunningNode;
		ev();
		if (onchanges) onchanges = false;
		else {
			RunningNode = null;
			value = fn(value);
			RunningNode = running;
		}
		return value;
	}
};
function callAll(ss) {
	return function all() {
		for (var i = 0; i < ss.length; i++) ss[i]();
	};
}
S.effect = function effect(fn, value) {
	new ComputationNode(fn, value);
};
S.data = function data(value) {
	var node = new DataNode(value);
	return function data(value) {
		if (arguments.length === 0) return node.current();
		else return node.next(value);
	};
};
S.value = function value(current, eq) {
	var data = S.data(current), age = -1;
	return function value(update) {
		if (arguments.length === 0) return data();
		else {
			if (!(eq ? eq(current, update) : current === update)) {
				var time = RootClock.time;
				if (age === time) throw new Error("conflicting values: " + update + " is not the same as " + current);
				age = time;
				current = update;
				data(update);
			}
			return update;
		}
	};
};
S.freeze = function freeze(fn) {
	var result = void 0;
	if (RunningClock !== null) result = fn();
	else {
		RunningClock = RootClock;
		RunningClock.changes.reset();
		try {
			result = fn();
			event();
		} finally {
			RunningClock = null;
		}
	}
	return result;
};
S.sample = function sample(fn) {
	var result, running = RunningNode;
	if (running !== null) {
		RunningNode = null;
		result = fn();
		RunningNode = running;
	} else result = fn();
	return result;
};
S.cleanup = function cleanup(fn) {
	if (Owner !== null) if (Owner.cleanups === null) Owner.cleanups = [fn];
	else Owner.cleanups.push(fn);
	else console.warn("cleanups created without a root or parent will never be run");
};
S.makeDataNode = function makeDataNode(value) {
	return new DataNode(value);
};
S.makeComputationNode = function makeComputationNode(fn, seed) {
	return new ComputationNode(fn, seed);
};
S.isFrozen = function isFrozen() {
	return RunningClock !== null;
};
S.isListening = function isListening() {
	return RunningNode !== null;
};
var Clock = function() {
	function Clock() {
		this.time = 0;
		this.changes = new Queue();
		this.updates = new Queue();
		this.disposes = new Queue();
	}
	return Clock;
}();
var RootClockProxy = { time: function() {
	return RootClock.time;
} };
var DataNode = function() {
	function DataNode(value) {
		this.value = value;
		this.pending = NOTPENDING;
		this.log = null;
	}
	DataNode.prototype.current = function() {
		if (RunningNode !== null) logDataRead(this, RunningNode);
		return this.value;
	};
	DataNode.prototype.next = function(value) {
		if (RunningClock !== null) if (this.pending !== NOTPENDING) {
			if (value !== this.pending) throw new Error("conflicting changes: " + value + " !== " + this.pending);
		} else {
			this.pending = value;
			RootClock.changes.add(this);
		}
		else if (this.log !== null) {
			this.pending = value;
			RootClock.changes.add(this);
			event();
		} else this.value = value;
		return value;
	};
	DataNode.prototype.clock = function() {
		return RootClockProxy;
	};
	return DataNode;
}();
var ComputationNode = function() {
	function ComputationNode(fn, value) {
		this.state = CURRENT;
		this.source1 = null;
		this.source1slot = 0;
		this.sources = null;
		this.sourceslots = null;
		this.log = null;
		this.owned = null;
		this.cleanups = null;
		this.fn = fn;
		this.value = value;
		this.age = RootClock.time;
		if (fn === null) return;
		var owner = Owner, running = RunningNode;
		if (owner === null) console.warn("computations created without a root or parent will never be disposed");
		Owner = RunningNode = this;
		if (RunningClock === null) toplevelComputation(this);
		else this.value = this.fn(this.value);
		if (owner && owner !== UNOWNED) if (owner.owned === null) owner.owned = [this];
		else owner.owned.push(this);
		Owner = owner;
		RunningNode = running;
	}
	ComputationNode.prototype.current = function() {
		if (RunningNode !== null) {
			if (this.age === RootClock.time) if (this.state === RUNNING) throw new Error("circular dependency");
			else updateNode(this);
			logComputationRead(this, RunningNode);
		}
		return this.value;
	};
	ComputationNode.prototype.clock = function() {
		return RootClockProxy;
	};
	return ComputationNode;
}();
var Log = function() {
	function Log() {
		this.node1 = null;
		this.node1slot = 0;
		this.nodes = null;
		this.nodeslots = null;
	}
	return Log;
}();
var Queue = function() {
	function Queue() {
		this.items = [];
		this.count = 0;
	}
	Queue.prototype.reset = function() {
		this.count = 0;
	};
	Queue.prototype.add = function(item) {
		this.items[this.count++] = item;
	};
	Queue.prototype.run = function(fn) {
		var items = this.items;
		for (var i = 0; i < this.count; i++) {
			fn(items[i]);
			items[i] = null;
		}
		this.count = 0;
	};
	return Queue;
}();
var NOTPENDING = {}, CURRENT = 0, STALE = 1, RUNNING = 2;
var RootClock = new Clock(), RunningClock = null, RunningNode = null, Owner = null, UNOWNED = new ComputationNode(null, null);
function logRead(from, to) {
	var fromslot, toslot = to.source1 === null ? -1 : to.sources === null ? 0 : to.sources.length;
	if (from.node1 === null) {
		from.node1 = to;
		from.node1slot = toslot;
		fromslot = -1;
	} else if (from.nodes === null) {
		from.nodes = [to];
		from.nodeslots = [toslot];
		fromslot = 0;
	} else {
		fromslot = from.nodes.length;
		from.nodes.push(to);
		from.nodeslots.push(toslot);
	}
	if (to.source1 === null) {
		to.source1 = from;
		to.source1slot = fromslot;
	} else if (to.sources === null) {
		to.sources = [from];
		to.sourceslots = [fromslot];
	} else {
		to.sources.push(from);
		to.sourceslots.push(fromslot);
	}
}
function logDataRead(data, to) {
	if (data.log === null) data.log = new Log();
	logRead(data.log, to);
}
function logComputationRead(node, to) {
	if (node.log === null) node.log = new Log();
	logRead(node.log, to);
}
function event() {
	var owner = Owner;
	RootClock.updates.reset();
	RootClock.time++;
	try {
		run(RootClock);
	} finally {
		RunningClock = RunningNode = null;
		Owner = owner;
	}
}
function toplevelComputation(node) {
	RunningClock = RootClock;
	RootClock.changes.reset();
	RootClock.updates.reset();
	try {
		node.value = node.fn(node.value);
		if (RootClock.changes.count > 0 || RootClock.updates.count > 0) {
			RootClock.time++;
			run(RootClock);
		}
	} finally {
		RunningClock = Owner = RunningNode = null;
	}
}
function run(clock) {
	var running = RunningClock, count = 0;
	RunningClock = clock;
	clock.disposes.reset();
	while (clock.changes.count !== 0 || clock.updates.count !== 0 || clock.disposes.count !== 0) {
		if (count > 0) clock.time++;
		clock.changes.run(applyDataChange);
		clock.updates.run(updateNode);
		clock.disposes.run(dispose);
		if (count++ > 1e5) throw new Error("Runaway clock detected");
	}
	RunningClock = running;
}
function applyDataChange(data) {
	data.value = data.pending;
	data.pending = NOTPENDING;
	if (data.log) markComputationsStale(data.log);
}
function markComputationsStale(log) {
	var node1 = log.node1, nodes = log.nodes;
	if (node1 !== null) markNodeStale(node1);
	if (nodes !== null) for (var i = 0, len = nodes.length; i < len; i++) markNodeStale(nodes[i]);
}
function markNodeStale(node) {
	var time = RootClock.time;
	if (node.age < time) {
		node.age = time;
		node.state = STALE;
		RootClock.updates.add(node);
		if (node.owned !== null) markOwnedNodesForDisposal(node.owned);
		if (node.log !== null) markComputationsStale(node.log);
	}
}
function markOwnedNodesForDisposal(owned) {
	for (var i = 0; i < owned.length; i++) {
		var child = owned[i];
		child.age = RootClock.time;
		child.state = CURRENT;
		if (child.owned !== null) markOwnedNodesForDisposal(child.owned);
	}
}
function updateNode(node) {
	if (node.state === STALE) {
		var owner = Owner, running = RunningNode;
		Owner = RunningNode = node;
		node.state = RUNNING;
		cleanup(node, false);
		node.value = node.fn(node.value);
		node.state = CURRENT;
		Owner = owner;
		RunningNode = running;
	}
}
function cleanup(node, final) {
	var source1 = node.source1, sources = node.sources, sourceslots = node.sourceslots, cleanups = node.cleanups, owned = node.owned, i, len;
	if (cleanups !== null) {
		for (i = 0; i < cleanups.length; i++) cleanups[i](final);
		node.cleanups = null;
	}
	if (owned !== null) {
		for (i = 0; i < owned.length; i++) dispose(owned[i]);
		node.owned = null;
	}
	if (source1 !== null) {
		cleanupSource(source1, node.source1slot);
		node.source1 = null;
	}
	if (sources !== null) for (i = 0, len = sources.length; i < len; i++) cleanupSource(sources.pop(), sourceslots.pop());
}
function cleanupSource(source, slot) {
	var nodes = source.nodes, nodeslots = source.nodeslots, last, lastslot;
	if (slot === -1) source.node1 = null;
	else {
		last = nodes.pop();
		lastslot = nodeslots.pop();
		if (slot !== nodes.length) {
			nodes[slot] = last;
			nodeslots[slot] = lastslot;
			if (lastslot === -1) last.source1slot = slot;
			else last.sourceslots[lastslot] = slot;
		}
	}
}
function dispose(node) {
	node.fn = null;
	node.log = null;
	cleanup(node, true);
}
//#endregion
//#region \0save-run-browser
function saveRun(name, raw) {
	const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
	const benchmarks = {};
	for (const b of raw.benchmarks) {
		const stats = b.runs[0].stats;
		const entry = {
			avg: stats.avg,
			min: stats.min,
			max: stats.max,
			p75: stats.p75,
			p99: stats.p99,
			heap: stats.heap ? stats.heap.avg : null
		};
		benchmarks[b.alias] = entry;
	}
	const output = {
		name,
		date,
		cpu: raw.context.cpu.name,
		runtime: raw.context.runtime + " " + raw.context.version + " (" + raw.context.arch + ")",
		benchmarks
	};
	window.__benchResult = output;
	if (typeof window.__onBenchDone === "function") window.__onBenchDone(output);
}
//#endregion
//#region bench/reactivity/s-js.js
let sink = 0;
let counter = 0;
const fib = (n) => {
	if (n < 2) return 1;
	return fib(n - 1) + fib(n - 2);
};
const hard = (n, _log) => n + fib(16);
function setupDeep() {
	return S.root(() => {
		const len = 50;
		const head = S.data(0);
		let current = head;
		for (let i = 0; i < len; i++) {
			const prev = current;
			current = S(() => prev() + 1);
		}
		const tail = current;
		S(() => {
			const v = tail();
			counter += v;
			sink += counter;
		});
		let i = 0;
		return () => {
			head(++i);
		};
	});
}
function setupBroad() {
	return S.root(() => {
		const head = S.data(0);
		for (let i = 0; i < 50; i++) {
			const current = S(() => head() + i);
			const current2 = S(() => current() + 1);
			S(() => {
				const v = current2();
				counter += v;
				sink += counter;
			});
		}
		let i = 0;
		return () => {
			head(++i);
		};
	});
}
function setupDiamond() {
	return S.root(() => {
		const width = 5;
		const head = S.data(0);
		const branches = [];
		for (let i = 0; i < width; i++) branches.push(S(() => head() + 1));
		const sum = S(() => branches.reduce((a, b) => a + b(), 0));
		S(() => {
			const v = sum();
			counter += v;
			sink += counter;
		});
		let i = 0;
		return () => {
			head(++i);
		};
	});
}
function setupTriangle() {
	return S.root(() => {
		const width = 10;
		const head = S.data(0);
		let current = head;
		const list = [];
		for (let i = 0; i < width; i++) {
			const prev = current;
			list.push(current);
			current = S(() => prev() + 1);
		}
		const sum = S(() => list.reduce((a, b) => a + b(), 0));
		S(() => {
			const v = sum();
			counter += v;
			sink += counter;
		});
		let i = 0;
		return () => {
			head(++i);
		};
	});
}
function setupMux() {
	return S.root(() => {
		const heads = new Array(100).fill(null).map(() => S.data(0));
		const mux = S(() => heads.map((h) => h()));
		const split = heads.map((_, index) => S(() => mux()[index])).map((x) => S(() => x() + 1));
		for (const x of split) S(() => {
			const v = x();
			counter += v;
			sink += counter;
		});
		let i = 0;
		return () => {
			heads[i % heads.length](++i);
		};
	});
}
function setupUnstable() {
	return S.root(() => {
		const head = S.data(0);
		const double = S(() => head() * 2);
		const inverse = S(() => -head());
		const current = S(() => {
			let result = 0;
			for (let i = 0; i < 20; i++) result += head() % 2 ? double() : inverse();
			return result;
		});
		S(() => {
			const v = current();
			counter += v;
			sink += counter;
		});
		let i = 0;
		return () => {
			head(++i);
		};
	});
}
function setupAvoidable() {
	return S.root(() => {
		const head = S.data(0);
		const computed1 = S(() => head());
		const computed2 = S(() => {
			computed1();
			return 0;
		});
		const computed3 = S(() => computed2() + 1);
		const computed4 = S(() => computed3() + 2);
		const computed5 = S(() => computed4() + 3);
		S(() => {
			const v = computed5();
			counter += v;
			sink += counter;
		});
		let i = 0;
		return () => {
			head(++i);
		};
	});
}
function setupRepeatedObservers() {
	return S.root(() => {
		const size = 30;
		const head = S.data(0);
		const current = S(() => {
			let result = 0;
			for (let i = 0; i < size; i++) result += head();
			return result;
		});
		S(() => {
			const v = current();
			counter += v;
			sink += counter;
		});
		let i = 0;
		return () => {
			head(++i);
		};
	});
}
function setupCellx(layers) {
	return S.root(() => {
		const start = {
			prop1: S.data(1),
			prop2: S.data(2),
			prop3: S.data(3),
			prop4: S.data(4)
		};
		let layer = start;
		for (let i = layers; i > 0; i--) {
			const m = layer;
			const s = {
				prop1: S(() => m.prop2()),
				prop2: S(() => m.prop1() - m.prop3()),
				prop3: S(() => m.prop2() + m.prop4()),
				prop4: S(() => m.prop3())
			};
			S(() => {
				const v = s.prop1();
				counter += v;
				sink += counter;
			});
			S(() => {
				const v = s.prop2();
				counter += v;
				sink += counter;
			});
			S(() => {
				const v = s.prop3();
				counter += v;
				sink += counter;
			});
			S(() => {
				const v = s.prop4();
				counter += v;
				sink += counter;
			});
			S(() => {
				const v = s.prop1();
				counter += v;
				sink += counter;
			});
			S(() => {
				const v = s.prop2();
				counter += v;
				sink += counter;
			});
			S(() => {
				const v = s.prop3();
				counter += v;
				sink += counter;
			});
			S(() => {
				const v = s.prop4();
				counter += v;
				sink += counter;
			});
			layer = s;
		}
		const end = layer;
		let toggle = false;
		return () => {
			toggle = !toggle;
			S.freeze(() => {
				start.prop1(toggle ? 4 : 1);
				start.prop2(toggle ? 3 : 2);
				start.prop3(toggle ? 2 : 3);
				start.prop4(toggle ? 1 : 4);
			});
			end.prop1();
			end.prop2();
			end.prop3();
			end.prop4();
		};
	});
}
function setupMolWire() {
	return S.root(() => {
		const numbers = Array.from({ length: 5 }, (_, i) => i);
		const A = S.data(0);
		const B = S.data(0);
		const C = S(() => A() % 2 + B() % 2);
		const D = S(() => numbers.map((i) => ({ x: i + A() % 2 - B() % 2 })));
		const E = S(() => hard(C() + A() + D()[0].x, "E"));
		const F = S(() => hard(D()[2].x || B(), "F"));
		const G = S(() => C() + (C() || E() % 2) + D()[4].x + F());
		S(() => {
			const v = hard(G(), "H");
			counter += v;
			sink += counter;
		});
		S(() => {
			const v = G();
			counter += v;
			sink += counter;
		});
		S(() => {
			const v = hard(F(), "J");
			counter += v;
			sink += counter;
		});
		let i = 0;
		return () => {
			i++;
			S.freeze(() => {
				B(1);
				A(1 + i * 2);
			});
			S.freeze(() => {
				A(2 + i * 2);
				B(2);
			});
		};
	});
}
function benchCreateSignals(count) {
	return () => {
		return S.root(() => {
			let signals = [];
			for (let i = 0; i < count; i++) signals[i] = S.data(i);
			return signals;
		});
	};
}
function benchCreateComputations(count) {
	return () => {
		S.root(() => {
			const src = S.data(0);
			for (let i = 0; i < count; i++) {
				const comp = S(() => src());
				S(() => {
					const v = comp();
					counter += v;
					sink += counter;
				});
			}
		});
	};
}
/**
* Seeded PRNG using xmur3a hash + sfc32.
* Adapted from https://github.com/bryc/code/blob/master/jshash/PRNGs.md (Public Domain)
* @param {string} seed
* @returns {() => number} returns values in [0, 1)
*/
function pseudoRandom(seed) {
	let h = 2166136261;
	for (let k, i = 0; i < seed.length; i++) {
		k = Math.imul(seed.charCodeAt(i), 3432918353);
		k = k << 15 | k >>> 17;
		h ^= Math.imul(k, 461845907);
		h = h << 13 | h >>> 19;
		h = Math.imul(h, 5) + 3864292196 | 0;
	}
	h ^= seed.length;
	function nextHash() {
		h ^= h >>> 16;
		h = Math.imul(h, 2246822507);
		h ^= h >>> 13;
		h = Math.imul(h, 3266489909);
		h ^= h >>> 16;
		return h >>> 0;
	}
	let a = nextHash(), b = nextHash(), c = nextHash(), d = nextHash();
	return function() {
		a >>>= 0;
		b >>>= 0;
		c >>>= 0;
		d >>>= 0;
		let t = a + b | 0;
		a = b ^ b >>> 9;
		b = c + (c << 3) | 0;
		c = c << 21 | c >>> 11;
		d = d + 1 | 0;
		t = t + d | 0;
		c = c + t | 0;
		return (t >>> 0) / 4294967296;
	};
}
/** @param {any[]} src @param {number} rmCount @param {() => number} rand */
function removeElems(src, rmCount, rand) {
	const copy = src.slice();
	for (let i = 0; i < rmCount; i++) {
		const rmDex = Math.floor(rand() * copy.length);
		copy.splice(rmDex, 1);
	}
	return copy;
}
/**
* Build a rectangular reactive dependency graph using native S.js API.
* Must be called inside an S.root() context.
* @param {number} width
* @param {number} totalLayers
* @param {number} staticFraction
* @param {number} nSources
*/
function makeDynGraph(width, totalLayers, staticFraction, nSources) {
	const sources = new Array(width);
	for (let i = 0; i < width; i++) sources[i] = S.data(i);
	const random = pseudoRandom("seed");
	let prevRow = sources;
	const layers = [];
	for (let l = 0; l < totalLayers - 1; l++) {
		const row = new Array(width);
		for (let myDex = 0; myDex < width; myDex++) {
			const mySources = new Array(nSources);
			for (let s = 0; s < nSources; s++) mySources[s] = prevRow[(myDex + s) % width];
			if (random() < staticFraction) row[myDex] = S(() => {
				let sum = 0;
				for (let s = 0; s < mySources.length; s++) sum += mySources[s]();
				return sum;
			});
			else {
				const first = mySources[0];
				const tail = mySources.slice(1);
				row[myDex] = S(() => {
					let sum = first();
					const shouldDrop = sum & 1;
					const dropDex = sum % tail.length;
					for (let i = 0; i < tail.length; i++) {
						if (shouldDrop && i === dropDex) continue;
						sum += tail[i]();
					}
					return sum;
				});
			}
		}
		layers.push(row);
		prevRow = row;
	}
	return {
		sources,
		layers
	};
}
/**
* Build a fresh graph inside S.root() and return a function that reads all
* leaves to force materialization. Measures graph construction + initial evaluation cost.
* @param {number} width
* @param {number} totalLayers
* @param {number} staticFraction
* @param {number} nSources
*/
function setupDynBuild(width, totalLayers, staticFraction, nSources) {
	return () => {
		S.root(() => {
			const { layers } = makeDynGraph(width, totalLayers, staticFraction, nSources);
			const leaves = layers[layers.length - 1];
			const len = leaves.length;
			for (let r = 0; r < len; r++) sink += leaves[r]();
		});
	};
}
/**
* Build the graph once inside S.root(), force-read all leaves to materialize,
* then return a function that writes one source and reads selected leaves per call.
* @param {number} width
* @param {number} totalLayers
* @param {number} staticFraction
* @param {number} nSources
* @param {number} readFraction
*/
function setupDynUpdate(width, totalLayers, staticFraction, nSources, readFraction) {
	return S.root(() => {
		const { sources, layers } = makeDynGraph(width, totalLayers, staticFraction, nSources);
		const leaves = layers[layers.length - 1];
		/** Force-read all leaves so lazy frameworks fully materialize the graph. */
		for (let r = 0; r < leaves.length; r++) sink += leaves[r]();
		const rand = pseudoRandom("seed");
		const readLeaves = removeElems(leaves, Math.round(leaves.length * (1 - readFraction)), rand);
		const readLen = readLeaves.length;
		const srcLen = sources.length;
		/** Persistent counter across mitata calls so each write triggers propagation. */
		let iter = 0;
		return () => {
			iter++;
			const sourceDex = iter % srcLen;
			sources[sourceDex](iter + sourceDex);
			for (let r = 0; r < readLen; r++) sink += readLeaves[r]();
		};
	});
}
bench("Kairo: deep propagation", setupDeep());
bench("Kairo: broad propagation", setupBroad());
bench("Kairo: diamond", setupDiamond());
bench("Kairo: triangle", setupTriangle());
bench("Kairo: mux", setupMux());
bench("Kairo: unstable", setupUnstable());
bench("Kairo: avoidable propagation", setupAvoidable());
bench("Kairo: repeated observers", setupRepeatedObservers());
bench("CellX 10 layers", setupCellx(10));
bench("$mol_wire", setupMolWire());
bench("Create 1k signals", benchCreateSignals(1e3));
bench("Create 1k computations", benchCreateComputations(1e3));
bench("Dynamic build: simple component", setupDynBuild(10, 5, 1, 2));
bench("Dynamic build: large web app", setupDynBuild(1e3, 12, .95, 4));
bench("Dynamic build: wide dense", setupDynBuild(1e3, 5, 1, 25));
bench("Dynamic update: simple component", setupDynUpdate(10, 5, 1, 2, .2));
bench("Dynamic update: dynamic component", setupDynUpdate(10, 10, .75, 6, .2));
bench("Dynamic update: large web app", setupDynUpdate(1e3, 12, .95, 4, 1));
bench("Dynamic update: wide dense", setupDynUpdate(1e3, 5, 1, 25, 1));
bench("Dynamic update: deep", setupDynUpdate(5, 500, 1, 3, 1));
bench("Dynamic update: very dynamic", setupDynUpdate(100, 15, .5, 6, 1));
saveRun("s-js", await run$1());
//#endregion
