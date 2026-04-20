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
const $$2 = {
	_: null,
	__() {
		return print($$2._);
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
		$$2.agent.monotonicNow();
		return () => 1e6 * $$2.agent.monotonicNow();
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
		if (!$$1.colors.includes(color)) throw new TypeError("invalid highlight color");
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
async function run(opts = {}) {
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
			else print(`| ${run.name.padEnd(name_len)} | \`${`${$$1.time(run.stats.avg)}/iter`.padStart(14)}\` | \`${$$1.time(run.stats.min).padStart(9)}\` | \`${$$1.time(run.stats.p75).padStart(9)}\` | \`${$$1.time(run.stats.p99).padStart(9)}\` | \`${$$1.time(run.stats.max).padStart(9)}\` |`);
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
		else print($$1.gray + `clk: ~${ctx.cpu.freq.toFixed(2)} GHz` + $$1.reset);
		if (!opts.colors) print(`cpu: ${ctx.cpu.name}`);
		else print($$1.gray + `cpu: ${ctx.cpu.name}` + $$1.reset);
		if (!opts.colors) print(`runtime: ${ctx.runtime}${!ctx.version ? "" : ` ${ctx.version}`} (${ctx.arch})`);
		else print($$1.gray + `runtime: ${ctx.runtime}${!ctx.version ? "" : ` ${ctx.version}`} (${ctx.arch})` + $$1.reset);
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
					else print($$1.gray + "-".repeat(15 + k_legend) + " " + "-".repeat(31) + $$1.reset);
				}
			} else {
				print("");
				if (collection.name) print(`• ${collection.name}`);
				if (!opts.colors) print("-".repeat(15 + k_legend) + " " + "-".repeat(31));
				else print($$1.gray + "-".repeat(15 + k_legend) + " " + "-".repeat(31) + $$1.reset);
			}
			for (const trial of collection.trials) if (opts.filter.test(trial._name)) {
				let bench = await trial.run(opts.throw);
				bench = opts.observe(bench);
				trials.push([trial, bench]);
				benchmarks.push(bench);
				if (-1 === $$1.colors.indexOf(trial._highlight)) trial._highlight = null;
				const _h = !opts.colors || !trial._highlight ? (x) => x : (x) => $$1[trial._highlight] + x + $$1.reset;
				for (const r of bench.runs) {
					if (prev_run_gap) print("");
					if (r.error) if (!opts.colors) print(`${_h($$1.str(r.name, k_legend).padEnd(k_legend))} error: ${r.error.message ?? r.error}`);
					else print(`${_h($$1.str(r.name, k_legend).padEnd(k_legend))} ${$$1.red + "error:" + $$1.reset} ${r.error.message ?? r.error}`);
					else {
						const compact = trial.flags & flags.compact;
						const noop = "iter" === r.stats.kind ? ctx.noop.iter : trial._gc !== "inner" ? ctx.noop.fn : ctx.noop.fn_gc;
						const optimized_out = r.stats.avg < 1.42 * noop.avg;
						optimized_out_warning = optimized_out_warning || optimized_out;
						if (compact) {
							let l = "";
							prev_run_gap = false;
							const avg = $$1.time(r.stats.avg).padStart(9);
							const name = $$1.str(r.name, k_legend).padEnd(k_legend);
							l += _h(name) + " ";
							if (!opts.colors) l += avg + "/iter";
							else l += $$1.bold + $$1.yellow + avg + $$1.reset + $$1.bold + "/iter" + $$1.reset;
							const p75 = $$1.time(r.stats.p75).padStart(9);
							const p99 = $$1.time(r.stats.p99).padStart(9);
							const bins = $$1.histogram.bins(r.stats, 11, .99);
							const histogram = $$1.histogram.ascii(bins, 1, { colors: opts.colors });
							l += " ";
							if (!opts.colors) l += p75 + " " + p99 + " " + histogram[0];
							else l += $$1.gray + p75 + " " + p99 + $$1.reset + " " + histogram[0];
							if (optimized_out) if (!opts.colors) l += " !";
							else l += $$1.red + " !" + $$1.reset;
							print(l);
						} else {
							let l = "";
							const avg = $$1.time(r.stats.avg).padStart(9);
							const name = $$1.str(r.name, k_legend).padEnd(k_legend);
							l += _h(name) + " ";
							const p75 = $$1.time(r.stats.p75).padStart(9);
							const bins = $$1.histogram.bins(r.stats, 21, .99);
							const histogram = $$1.histogram.ascii(bins, r.stats.gc && r.stats.heap ? 2 : !(r.stats.gc || r.stats.heap) ? 2 : 3, { colors: opts.colors });
							if (!opts.colors) l += avg + "/iter " + p75 + " " + histogram[0];
							else l += $$1.bold + $$1.yellow + avg + $$1.reset + $$1.bold + "/iter" + $$1.reset + " " + $$1.gray + p75 + $$1.reset + " " + histogram[0];
							if (optimized_out) if (!opts.colors) l += " !";
							else l += $$1.red + " !" + $$1.reset;
							print(l);
							l = "";
							const min = $$1.time(r.stats.min);
							const max = $$1.time(r.stats.max);
							const p99 = $$1.time(r.stats.p99).padStart(9);
							const diff = 18 - (min.length + max.length);
							l += " ".repeat(diff + k_legend - 8);
							if (!opts.colors) l += "(" + min + " … " + max + ")";
							else l += $$1.gray + "(" + $$1.reset + $$1.cyan + min + $$1.reset + $$1.gray + " … " + $$1.reset + $$1.magenta + max + $$1.reset + $$1.gray + ")" + $$1.reset;
							l += " ";
							if (!opts.colors) l += p99 + " " + histogram[1];
							else l += $$1.gray + p99 + $$1.reset + " " + histogram[1];
							print(l);
							if (r.stats.gc) {
								l = "";
								prev_run_gap = true;
								l += " ".repeat(k_legend - 10);
								const gcm = $$1.time(r.stats.gc.min).padStart(9);
								const gcx = $$1.time(r.stats.gc.max).padStart(9);
								if (!opts.colors) l += "gc(" + gcm + " … " + gcx + ")";
								else l += $$1.gray + "gc(" + $$1.reset + $$1.blue + gcm + $$1.reset + $$1.gray + " … " + $$1.reset + $$1.blue + gcx + $$1.reset + $$1.gray + ")" + $$1.reset;
								if (r.stats.heap) {
									l += " ";
									const ha = $$1.bytes(r.stats.heap.avg).padStart(9);
									const hm = $$1.bytes(r.stats.heap.min).padStart(9);
									const hx = $$1.bytes(r.stats.heap.max).padStart(9);
									if (!opts.colors) l += ha + " (" + hm + "…" + hx + ")";
									else l += $$1.yellow + ha + $$1.reset + $$1.gray + " (" + $$1.reset + $$1.yellow + hm + $$1.reset + $$1.gray + "…" + $$1.reset + $$1.yellow + hx + $$1.reset + $$1.gray + ")" + $$1.reset;
								} else {
									l += " ";
									const gca = $$1.time(r.stats.gc.avg).padStart(9);
									if (!opts.colors) l += gca + " " + histogram[2];
									else l += $$1.blue + gca + $$1.reset + " " + histogram[2];
								}
								print(l);
							} else if (r.stats.heap) {
								prev_run_gap = true;
								l = " ".repeat(k_legend - 8);
								const ha = $$1.bytes(r.stats.heap.avg).padStart(9);
								const hm = $$1.bytes(r.stats.heap.min).padStart(9);
								const hx = $$1.bytes(r.stats.heap.max).padStart(9);
								if (!opts.colors) l += "(" + hm + " … " + hx + ") " + ha + " " + histogram[2];
								else l += $$1.gray + "(" + $$1.reset + $$1.yellow + hm + $$1.reset + $$1.gray + " … " + $$1.reset + $$1.yellow + hx + $$1.reset + $$1.gray + ") " + $$1.reset + $$1.yellow + ha + $$1.reset + " " + histogram[2];
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
									if (!opts.colors) l += $$1.amount(ipc).padStart(7) + " ipc";
									else l += $$1.bold + $$1.green + $$1.amount(ipc).padStart(7) + $$1.reset + $$1.bold + " ipc" + $$1.reset;
									if (!opts.colors) l += " (" + cache.toFixed(2).padStart(6) + "% cache)";
									else l += $$1.gray + " (" + $$1.reset + (50 > cache ? $$1.red : 84 < cache ? $$1.green : $$1.yellow) + cache.toFixed(2).padStart(6) + "%" + $$1.reset + " cache" + $$1.gray + ")" + $$1.reset;
									if (!opts.colors) l += " " + $$1.amount(_bmispred).padStart(7) + " branch misses";
									else l += " " + $$1.green + $$1.amount(_bmispred).padStart(7) + $$1.reset + " branch misses";
									print(l);
									l = "";
									l += " ".repeat(k_legend - 20);
									if (opts.colors) l += $$1.gray;
									l += $$1.amount(r.stats.counters.cycles.avg).padStart(7) + " cycles";
									l += " " + $$1.amount(r.stats.counters.instructions.avg).padStart(7) + " instructions";
									l += " " + $$1.amount(r.stats.counters.cache.avg).padStart(7) + " c-refs";
									l += " " + $$1.amount(r.stats.counters.cache.misses.avg).padStart(7) + " c-misses";
									if (opts.colors) l += $$1.reset;
									print(l);
								}
								if (ctx.arch.includes("darwin")) {
									const ipc = r.stats.counters.instructions.avg / r.stats.counters.cycles.avg;
									const stalls = 100 * r.stats.counters.cycles.stalls.avg / r.stats.counters.cycles.avg;
									const ldst = 100 * r.stats.counters.instructions.loads_and_stores.avg / r.stats.counters.instructions.avg;
									const cache = 100 - Math.min(100, 100 * (r.stats.counters.l1.miss_loads.avg + r.stats.counters.l1.miss_stores.avg) / r.stats.counters.instructions.loads_and_stores.avg);
									l += " ".repeat(k_legend - 13);
									if (!opts.colors) l += $$1.amount(ipc).padStart(7) + " ipc";
									else l += $$1.bold + $$1.green + $$1.amount(ipc).padStart(7) + $$1.reset + $$1.bold + " ipc" + $$1.reset;
									if (!opts.colors) l += " (" + stalls.toFixed(2).padStart(6) + "% stalls)";
									else l += $$1.gray + " (" + $$1.reset + (12 > stalls ? $$1.green : 50 < stalls ? $$1.red : $$1.yellow) + stalls.toFixed(2).padStart(6) + "%" + $$1.reset + " stalls" + $$1.gray + ")" + $$1.reset;
									if (!opts.colors) l += " " + cache.toFixed(2).padStart(6) + "% L1 data cache";
									else l += " " + (50 > cache ? $$1.red : 84 < cache ? $$1.green : $$1.yellow) + cache.toFixed(2).padStart(6) + "%" + $$1.reset + " L1 data cache";
									print(l);
									l = "";
									l += " ".repeat(k_legend - 20);
									if (opts.colors) l += $$1.gray;
									l += $$1.amount(r.stats.counters.cycles.avg).padStart(7) + " cycles";
									l += " " + $$1.amount(r.stats.counters.instructions.avg).padStart(7) + " instructions";
									l += " " + ldst.toFixed(2).padStart(6) + "% retired LD/ST (" + $$1.amount(r.stats.counters.instructions.loads_and_stores.avg).padStart(7) + ")";
									if (opts.colors) l += $$1.reset;
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
					colors[r.name] = $$1[trial._highlight];
				}
				if (Object.keys(map).length) {
					print("");
					$$1.barplot.ascii(map, k_legend, 44, {
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
					colors[r.name] = $$1[trial._highlight];
				}
				else for (const [trial, bench] of trials) {
					const runs = bench.runs.filter((r) => r.stats);
					if (!runs.length) continue;
					if (1 === runs.length) {
						map[runs[0].name] = runs[0].stats;
						colors[runs[0].name] = $$1[trial._highlight];
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
						colors[bench.alias] = $$1[trial._highlight];
					}
				}
				if (Object.keys(map).length) {
					print("");
					$$1.boxplot.ascii(map, k_legend, 44, { colors: !opts.colors ? null : colors }).forEach((l) => print(l));
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
						const { min, max, avg, peak, bins } = $$1.histogram.bins(runs[0].stats, 44, .99);
						extra.ymax = peak;
						colors.xmin = $$1.cyan;
						colors.xmax = $$1.magenta;
						extra.ymin = $$1.min(bins);
						labels.xmin = $$1.time(min);
						labels.xmax = $$1.time(max);
						extra.xmax = bins.length - 1;
						colors[runs[0].name] = $$1[trial._highlight] || $$1.bold;
						map[runs[0].name] = {
							y: bins,
							x: bins.map((_, o) => o),
							format(x, y, s) {
								x = Math.round(x * 44);
								if (!opts.colors) return s;
								if (x === avg) return $$1.yellow + s + $$1.reset;
								return (x < avg ? $$1.cyan : $$1.magenta) + s + $$1.reset;
							}
						};
					} else {
						const avgs = runs.map((r) => r.stats.avg);
						colors.ymin = $$1.cyan;
						colors.ymax = $$1.magenta;
						extra.ymin = $$1.min(avgs);
						extra.ymax = $$1.max(avgs);
						extra.xmax = runs.length - 1;
						labels.ymin = $$1.time(extra.ymin);
						labels.ymax = $$1.time(extra.ymax);
						colors[bench.alias] = $$1[trial._highlight];
						map[bench.alias] = {
							y: avgs,
							x: avgs.map((_, o) => o)
						};
					}
				}
				else if (trials.every(([_, bench]) => "static" === bench.kind)) {
					colors.xmin = $$1.cyan;
					colors.xmax = $$1.magenta;
					for (const [trial, bench] of trials) for (const r of bench.runs) {
						if (r.error) continue;
						const { bins, peak, steps } = $$1.histogram.bins(r.stats, 44, .99);
						const y = bins.map((b) => b / peak);
						map[r.name] = {
							y,
							x: steps
						};
						colors[r.name] = $$1[trial._highlight];
						extra.ymin = Math.min($$1.min(y), extra.ymin ?? Infinity);
						extra.ymax = Math.max($$1.max(y), extra.ymax ?? -Infinity);
						extra.xmin = Math.min($$1.min(steps), extra.xmin ?? Infinity);
						extra.xmax = Math.max($$1.max(steps), extra.xmax ?? -Infinity);
						labels.xmin = $$1.time(extra.xmin);
						labels.xmax = $$1.time(extra.xmax);
					}
				} else {
					let min = Infinity;
					let max = -Infinity;
					for (const [trial, bench] of trials) for (const r of bench.runs) {
						if (r.error) continue;
						min = Math.min(min, r.stats.avg);
						max = Math.max(max, r.stats.avg);
					}
					colors.ymin = $$1.cyan;
					colors.ymax = $$1.magenta;
					labels.ymin = $$1.time(min);
					labels.ymax = $$1.time(max);
					for (const [trial, bench] of trials) {
						const runs = bench.runs.filter((r) => r.stats);
						if (!runs.length) continue;
						if (1 === runs.length) {
							const y = runs[0].stats.avg / max;
							colors[runs[0].name] = $$1[trial._highlight];
							map[runs[0].name] = {
								x: [0, 1],
								y: [y, y]
							};
							extra.ymin = Math.min(y, extra.ymin ?? Infinity);
							extra.ymax = Math.max(y, extra.ymax ?? -Infinity);
						} else {
							colors[bench.alias] = $$1[trial._highlight];
							const y = runs.map((r) => r.stats.avg / max);
							extra.ymin = Math.min($$1.min(y), extra.ymin ?? Infinity);
							extra.ymax = Math.max($$1.max(y), extra.ymax ?? -Infinity);
							map[bench.alias] = {
								y,
								x: runs.map((_, o) => o / (runs.length - 1))
							};
						}
					}
				}
				if (Object.keys(map).length) {
					print("");
					$$1.lineplot.ascii(map, {
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
						else print($$1.bold + "summary" + $$1.reset);
						if (!opts.colors) print("  " + runs[0].name);
						else print(" ".repeat(2) + $$1.bold + $$1.cyan + runs[0].name + $$1.reset);
						for (let o = 1; o < runs.length; o++) {
							const r = runs[o];
							const baseline = runs[0];
							const faster = r.stats.avg >= baseline.stats.avg;
							const diff = !faster ? Number((1 / r.stats.avg * baseline.stats.avg).toFixed(2)) : Number((1 / baseline.stats.avg * r.stats.avg).toFixed(2));
							if (!opts.colors) print(" ".repeat(3) + diff + `x ${faster ? "faster" : "slower"} than ${r.name}`);
							else print(" ".repeat(3) + (!faster ? $$1.red : $$1.green) + diff + $$1.reset + `x ${faster ? "faster" : "slower"} than ${$$1.bold + $$1.cyan + r.name + $$1.reset}`);
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
								else print($$1.bold + "summary" + $$1.reset);
								if (1 !== bruns.length) if (!opts.colors) print("  " + baseline.alias);
								else print(" ".repeat(2) + $$1.bold + $$1.cyan + baseline.alias + $$1.reset);
								else if (!opts.colors) print("  " + bruns[0].name);
								else print(" ".repeat(2) + $$1.bold + $$1.cyan + bruns[0].name + $$1.reset);
							}
							if (1 === runs.length && 1 === bruns.length) {
								const r = runs[0];
								const br = bruns[0];
								const faster = r.stats.avg >= br.stats.avg;
								const diff = !faster ? Number((1 / r.stats.avg * br.stats.avg).toFixed(2)) : Number((1 / br.stats.avg * r.stats.avg).toFixed(2));
								if (!opts.colors) print(" ".repeat(3) + diff + `x ${faster ? "faster" : "slower"} than ${r.name}`);
								else print(" ".repeat(3) + (!faster ? $$1.red : $$1.green) + diff + $$1.reset + `x ${faster ? "faster" : "slower"} than ${$$1.bold + $$1.cyan + r.name + $$1.reset}`);
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
								else print(" ".repeat(3) + (1 === sdiff ? $$1.gray + sdiff + $$1.reset : !sfaster ? $$1.red + "-" + sdiff + $$1.reset : $$1.green + "+" + sdiff + $$1.reset) + "…" + (1 === fdiff ? $$1.gray + fdiff + $$1.reset : !ffaster ? $$1.red + "-" + fdiff + $$1.reset : $$1.green + "+" + fdiff + $$1.reset) + `x ${faster ? "faster" : "slower"} than ${$$1.bold + $$1.cyan + (1 === runs.length ? rf.name : bench.alias) + $$1.reset}`);
							}
						}
					}
				}
			}
		}
		let nl = false;
		if (false === $counters) if (!opts.colors) print(""), nl = true, print("! = run with sudo to enable hardware counters");
		else print(""), nl = true, print($$1.yellow + "!" + $$1.reset + $$1.gray + " = " + $$1.reset + "run with sudo to enable hardware counters");
		if (optimized_out_warning) if (!opts.colors) nl || print(""), print(" ".repeat(k_legend - 13) + "benchmark was likely optimized out (dead code elimination) = !"), print(" ".repeat(k_legend - 13) + "https://github.com/evanwashere/mitata#writing-good-benchmarks");
		else nl || print(""), print(" ".repeat(k_legend - 13) + "benchmark was likely optimized out " + $$1.gray + "(dead code elimination)" + $$1.reset + $$1.gray + " = " + $$1.reset + $$1.red + "!" + $$1.reset), print(" ".repeat(k_legend - 13) + $$1.gray + "https://github.com/evanwashere/mitata#writing-good-benchmarks" + $$1.reset);
	}
};
const $$1 = {
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
		ascii(map, key = 8, size = 14, { steps = 0, fmt = $$1.time, colors = true, symbols = $$1.barplot.symbols } = {}) {
			const values = Object.values(map);
			const canvas = new Array(2 + values.length).fill("");
			steps += size;
			const min = $$1.min(values);
			const step = ($$1.max(values) - min) / steps;
			canvas[0] += " ".repeat(1 + key);
			canvas[0] += symbols.tl + " ".repeat(size) + symbols.tr;
			Object.keys(map).forEach((name, o) => {
				const value = map[name];
				const bars = Math.round((value - min) / step);
				if (colors?.[name]) canvas[o + 1] += colors[name];
				canvas[o + 1] += $$1.str(name, key).padStart(key);
				if (colors?.[name]) canvas[o + 1] += $$1.reset;
				canvas[o + 1] += " " + symbols.legend;
				if (colors) canvas[o + 1] += $$1.gray;
				canvas[o + 1] += symbols.bar.repeat(bars);
				if (colors) canvas[o + 1] += $$1.reset;
				canvas[o + 1] += " ";
				if (colors) canvas[o + 1] += $$1.yellow;
				canvas[o + 1] += fmt(value);
				if (colors) canvas[o + 1] += $$1.reset;
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
		ascii(map, { colors = true, xmin = 0, xmax = 1, ymin = 0, ymax = 1, symbols = $$1.lineplot.symbols, key = 8, width = 12, height = 12, labels = {
			xmin: null,
			xmax: null,
			ymin: null,
			ymax: null
		} } = {}) {
			const keys = Object.keys(map);
			const _canvas = $$1.canvas.braille(width, height);
			const xs = (_canvas.vwidth - 1) / (xmax - xmin);
			const ys = (_canvas.vheight - 1) / (ymax - ymin);
			const colorsv = Object.entries(colors).filter(([n]) => !Object.keys(labels).includes(n)).map(([_, v]) => v);
			const acolors = $$1.colors.filter((n) => !colorsv.includes($$1[n]));
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
				else if (colors?.[name]) return colors[name] + s + $$1.reset;
				else return $$1[acolors[(tag - 1) % acolors.length]] + s + $$1.reset;
			} });
			const plabels = {
				0: !colors?.ymax ? labels.ymax || "" : colors.ymax + (labels.ymax || "") + $$1.reset,
				[lines.length - 1]: !colors?.ymin ? labels.ymin || "" : colors.ymin + (labels.ymin || "") + $$1.reset
			};
			const legends = keys.map((name, k) => {
				if (colors?.[name]) return colors[name] + $$1.str(name, key).padStart(key) + $$1.reset;
				else return $$1[acolors[k % acolors.length]] + $$1.str(name, key).padStart(key) + $$1.reset;
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
				canvas.push(" ".repeat(key) + " " + (!colors?.xmin ? xmin : colors.xmin + xmin + $$1.reset) + (!colors?.xmax ? xmax.padStart(gap) : colors.xmax + xmax.padStart(gap) + $$1.reset));
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
				bins[$$1.clamp(0, Math.round((stats.avg - min) / step), size - 1)] = 1;
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
				peak: $$1.max(bins),
				outliers: stats.samples.length - 1 - offset,
				avg: $$1.clamp(0, Math.round((stats.avg - min) / step), size - 1)
			};
		},
		ascii(_bins, height = 1, { colors = true, symbols = $$1.histogram.symbols } = {}) {
			const canvas = new Array(height);
			const { avg, peak, bins } = _bins;
			const scale = (height * symbols.length - 1) / peak;
			for (let y = 0; y < height; y++) {
				let l = "";
				if (0 !== avg) {
					if (colors) l += $$1.cyan;
					for (let o = 0; o < avg; o++) {
						const b = bins[o];
						if (y === 0) l += symbols[$$1.clamp(0, Math.round(b * scale), symbols.length - 1)];
						else {
							const min = y * symbols.length;
							const max = (y + 1) * symbols.length;
							const offset = Math.round(b * scale) | 0;
							if (min >= offset) l += " ";
							else if (max <= offset) l += symbols[symbols.length - 1];
							else l += symbols[$$1.clamp(min, offset, max) % symbols.length];
						}
					}
					if (colors) l += $$1.reset;
				}
				{
					if (colors) l += $$1.yellow;
					const b = bins[avg];
					if (y === 0) l += symbols[$$1.clamp(0, Math.round(b * scale), symbols.length - 1)];
					else {
						const min = y * symbols.length;
						const max = (y + 1) * symbols.length;
						const offset = Math.round(b * scale) | 0;
						if (min >= offset) l += " ";
						else if (max <= offset) l += symbols[symbols.length - 1];
						else l += symbols[$$1.clamp(min, offset, max) % symbols.length];
					}
					if (colors) l += $$1.reset;
				}
				if (avg != bins.length - 1) {
					if (colors) l += $$1.magenta;
					for (let o = 1 + avg; o < bins.length; o++) {
						const b = bins[o];
						if (y === 0) l += symbols[$$1.clamp(0, Math.round(b * scale), symbols.length - 1)];
						else {
							const min = y * symbols.length;
							const max = (y + 1) * symbols.length;
							const offset = Math.round(b * scale) | 0;
							if (min >= offset) l += " ";
							else if (max <= offset) l += symbols[symbols.length - 1];
							else l += symbols[$$1.clamp(min, offset, max) % symbols.length];
						}
					}
					if (colors) l += $$1.reset;
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
		ascii(map, key = 8, size = 14, { fmt = $$1.time, colors = true, symbols = $$1.boxplot.symbols } = {}) {
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
				u[0] = !colors ? "" : $$1.cyan;
				m[0] = !colors ? "" : $$1.cyan;
				l[0] = !colors ? "" : $$1.cyan;
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
				u[avg_offset] = !colors ? symbols.avg.top : $$1.reset + $$1.yellow + symbols.avg.top + $$1.reset + $$1.magenta;
				l[avg_offset] = !colors ? symbols.avg.bottom : $$1.reset + $$1.yellow + symbols.avg.bottom + $$1.reset + $$1.magenta;
				m[avg_offset] = !colors ? symbols.avg.middle : $$1.reset + $$1.yellow + symbols.avg.middle + $$1.reset + $$1.magenta;
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
				canvas[o + 1] = " ".repeat(1 + key) + u.join("").trimEnd() + (!colors ? "" : $$1.reset);
				if (colors?.[name]) canvas[o + 2] += colors[name];
				canvas[o + 2] += $$1.str(name, key).padStart(key);
				if (colors?.[name]) canvas[o + 2] += $$1.reset;
				canvas[o + 2] += " " + m.join("").trimEnd() + (!colors ? "" : $$1.reset);
				canvas[o + 3] = " ".repeat(1 + key) + l.join("").trimEnd() + (!colors ? "" : $$1.reset);
			});
			canvas[canvas.length - 2] += " ".repeat(1 + key);
			canvas[canvas.length - 2] += symbols.bl + " ".repeat(size) + symbols.br;
			const rmin = fmt(tmin);
			const rmax = fmt(tmax);
			const rmid = fmt((tmin + tmax) / 2);
			const gap = (size - rmin.length - rmid.length - rmax.length) / 2;
			canvas[canvas.length - 1] += " ".repeat(1 + key);
			canvas[canvas.length - 1] += !colors ? rmin : $$1.cyan + rmin + $$1.reset;
			canvas[canvas.length - 1] += " ".repeat(1 + gap | 0);
			canvas[canvas.length - 1] += !colors ? rmid : $$1.gray + rmid + $$1.reset;
			canvas[canvas.length - 1] += " ".repeat(1 + Math.ceil(gap));
			canvas[canvas.length - 1] += !colors ? rmax : $$1.magenta + rmax + $$1.reset;
			return canvas;
		}
	}
};
//#endregion
//#region bench/reactivity/expected.js
/**
* Expected counter values for each benchmark. The counter tracks the total
* number of reactive node evaluations (computes + effects) per single
* benchmark iteration.
*
* All frameworks except S.js should produce identical counts.
*
* To regenerate: run `bun bench/reactivity/_validate_split.js`
*/
const EXPECTED = {
	deep: 51,
	broad: 150,
	diamond: 7,
	triangle: 11,
	mux: 103,
	unstable: 3,
	avoidable: 2,
	repeatedObservers: 2,
	cellx10: 120,
	molWire: 13,
	createSignals1k: 0,
	createComputations1k: 2e3,
	dynBuildSimple: 40,
	dynBuildLargeWebApp: 11e3,
	dynUpdateSimple: 4,
	dynUpdateDynamic: 77,
	dynUpdateLargeWebApp: 209,
	dynUpdateWideDense: 244,
	dynUpdateDeep: 2493,
	dynUpdateVeryDynamic: 539
}, Yl = 2048, C = 8992;
var li = [], ei = 0, Sl = 0, Ki = [], Li = [], Mi = 0, Ni = [], Pi = 0, Qi = 0, bi = 1, mi = !0, xn = 1, Ai = 0, Oi = 0, pn = [], Rn = 0, Ei = [], vn = [], Sn = 0, ti = [
	0,
	0,
	0,
	0
], ii = [
	[],
	[],
	[],
	[]
], jn = 0, Mn = [], Nn = 0, _n = [], gn = 0;
function s() {
	this.H = null, this.J = null, this.M = null;
}
function p(t) {
	this.j = 0, this.W = t, this.u = 0, this.O = null, this.P = 0, this.T = null;
}
function x(t, i, l, n, e) {
	this.j = 17 | t, this.W = n, this.u = 0, this.O = null, this.P = 0, this.T = null, this.V = i, this.C = l, this.F = 0, this.A = null, this.i = 0, this.it = 0, this.Y = e;
}
function z(t, i, l, n, e) {
	this.j = 16 | t, this.V = i, this.C = l, this.F = 0, this.A = null, this.i = 0, this.H = null, this.J = null, this.$ = 0, this.L = n, this.M = null, this.Y = e;
}
function ba(t) {
	this.tt = t, this.j = t.j, this.u = xn += 2;
}
function In(t) {
	this.j = 0, this.W = t, this.u = 0, this.O = null, this.P = 0, this.T = null, this.Kt = null, this.Ot = null;
}
function Bn(t) {
	let i = Ai;
	if (t.u === i) return t.W;
	if (3 & t.j && t.Tt(), 512 == (544 & this.j)) {
		if (128 & t.j) throw t.W;
		return t.W;
	}
	let l = t.u;
	if (t.u = i, l === i - 1 ? Sl++ : this.Jt(t, l), 128 & t.j) throw t.W;
	return t.W;
}
function Ln(t) {
	if (this.W !== t) if (mi) this.W = t, this.it = bi + 1, this.j &= -20, h(this, 1), Et();
	else {
		this.j |= 4;
		let i = Sn++;
		Ei[i] = this, vn[i] = t;
	}
}
function Kn(t) {
	return t instanceof Error || null != t && "string" == typeof t.message ? t : { message: "Compute threw error: " + t };
}
function a(t) {
	return new p(t);
}
function w(t) {
	let i = new s();
	return Tt(i, t), i;
}
function Jn(t) {
	return new In(t);
}
In.prototype = Object.create(p.prototype);
{
	let t = s.prototype, i = p.prototype, l = x.prototype, n = z.prototype, f = ba.prototype;
	function u(t) {
		let i = this.H;
		null === i ? this.H = t : "function" == typeof i ? this.H = [i, t] : i.push(t);
	}
	function o(t) {
		let i = this.M;
		null === i ? this.M = t : "function" == typeof i ? this.M = [i, t] : i.push(t);
	}
	function c(t) {
		this.j = !1 === t ? -16385 & this.j | 32768 : -32769 & this.j | 16384;
	}
	function y() {
		this.j |= 512;
	}
	t.j = 0, t.L = null, t.$ = -1, i.it = 0, t.dispose = i.dispose = l.dispose = n.dispose = function() {
		8 & this.j || (mi ? this.S() : pn[Rn++] = this);
	}, l.Jt = n.Jt = function(t, i) {
		if (i > Oi && (li[ei++] = t, li[ei++] = i), 32 & this.j) if (null === this.C) {
			let i = M(t, this, -1);
			this.C = t, this.F = i;
		} else {
			let i = M(t, this, Pi - Qi);
			Ni[Pi++] = t, Ni[Pi++] = i;
		}
		else null === this.A ? (this.A = [t, 0], this.j &= -2049) : this.A.push(t, 0);
	}, l.error = n.error = function() {
		return !!(128 & this.j);
	}, l.loading = n.loading = function() {
		return !!(64 & this.j);
	}, t.Mt = n.Mt = u, t.Nt = n.Nt = o, t.cleanup = n.cleanup = u, t.recover = n.recover = o, l.equal = n.equal = f.equal = c, l.stable = n.stable = y, t.S = function() {
		this.j = 8, null !== this.H && Fl(this), null !== this.J && Ct(this), this.J = this.M = null;
	}, i.peek = function() {
		return this.W;
	}, i.set = function(t) {
		if (this.W !== t) if (mi) this.W = t, h(this, 1), Et();
		else {
			this.j |= 4;
			let i = Sn++;
			Ei[i] = this, vn[i] = t;
		}
	}, i.Gt = function(t) {
		this.W = t, 4 & this.j && (this.j &= -5, h(this, 1));
	}, i.S = function() {
		this.j = 8, gt(this), this.W = null;
	}, l.peek = function() {
		let t = this.j;
		if (3 & t) if (mi) {
			mi = !1;
			try {
				(1 & t || Ut(this, bi)) && (Oi = xn, this.ot(bi)), (Sn > 0 || Rn > 0) && Et();
			} finally {
				mi = !0;
			}
		} else this.Tt();
		if (128 & this.j) throw this.W;
		return this.W;
	}, l.val = Bn, l.set = Ln, l.Gt = function(t) {
		this.W = t, 4 & this.j && (this.j &= -21, this.it = bi, h(this, 1));
	}, l.Tt = function() {
		let t = this.j;
		1 & t ? this.ot(bi) : t & Yl ? Zl(this, bi) : qn(this, bi);
	}, l.S = function() {
		let t = this.j;
		this.j = 8, gt(this), Wt(this), 65536 == (196608 & t) && this.Y.ct.S(), this.V = this.W = this.Y = null;
	}, l.ot = function(t) {
		let i, l = this.j;
		if (this.i = t, this.j = -49170 & l, 65536 & l) return this.yt(t);
		if (512 == (544 & l)) {
			let n;
			if (131072 & l) {
				let t = this.C;
				3 & t.j && t.Tt(), n = t.W;
			} else n = this;
			try {
				i = this.V(n, this.W, this.Y);
			} catch (i) {
				this.W = Kn(i), this.j = -20 & this.j | 128, this.it = t;
				return;
			}
		} else {
			let t = Ai, n = xn += 2;
			Ai = n;
			let e, s, h = ei, f = 0, u = 0;
			32 & l ? (e = Qi, Qi = Pi) : (s = Sl, Sl = 0, u = bn(n - 1, this.C, this.A), f = null !== this.A ? this.A.length : 0);
			try {
				i = this.V(this, this.W, this.Y), this.j &= -129;
			} catch (t) {
				i = Kn(t), this.j |= 128;
			}
			if (32 & l) {
				if (Pi > Qi) {
					let t = Ni;
					this.A = t.slice(Qi, Pi);
					for (let i = Qi; i < Pi; i += 2) t[i] = null;
					Pi = Qi;
				} else null !== this.C && (this.j |= Yl);
				Qi = e;
			} else {
				let t = null !== this.A ? this.A.length : 0;
				Sl === u && t === f || Ql(this, n, u, t), Sl = s;
			}
			if (ei > h) {
				let t = ei, i = li;
				for (let l = h; l < t; l += 2) i[l].u = i[l + 1], i[l] = null;
				ei = h;
			}
			Ai = t;
		}
		l = this.j &= -52, 128 & l ? (this.W = i, this.it = t) : i !== this.W ? (this.W = i, 16384 & l || (this.it = t)) : 32768 & l && (this.it = t);
	}, l.yt = function(t) {
		let i, l = this.j;
		if (131072 & l) {
			let l = this.C;
			3 & l.j && l.Tt();
			try {
				i = this.V(l.W, this.W, this.Y), this.j &= -129;
			} catch (i) {
				this.W = Kn(i), this.j = -20 & this.j | 128, this.it = t;
				return;
			}
		} else {
			let n = this.Y, e = n.ct;
			if (544 & l) e.j &= -49153;
			else {
				null !== this.C && (St(this.C, this.F), this.C = null, this.F = 0);
				let t = this.A;
				if (null !== t) {
					let i = t.length >> 1;
					for (; i-- > 0;) {
						let i = t.pop();
						St(t.pop(), i);
					}
				}
				64 & l ? (e.S(), e = n.ct = new ba(this)) : e.Pt();
			}
			try {
				i = this.V(e, this.W, n.Y), this.j = -129 & this.j | 49664 & e.j;
			} catch (i) {
				this.W = Kn(i), this.j = -52 & this.j | 128, this.it = t;
				return;
			}
		}
		this.j &= -52;
		let n = Nl(i);
		3 === n ? (l = this.j &= -65, i !== this.W ? (this.W = i, 16384 & l || (this.it = t)) : 32768 & l && (this.it = t)) : (this.j |= 64, 1 === n ? Xt(new WeakRef(this), i, t) : Yt(new WeakRef(this), i, t));
	}, l.ut = function() {
		64 & this.j ? Mn[Nn++] = this : h(this, 2);
	}, n.val = Bn, n.ot = function(t) {
		let i, l = this.j;
		if (this.i = t, 16 & l || (null !== this.H && Fl(this), null !== this.J && Ct(this), this.M = null), 65536 & l) return this.yt(t);
		if (512 == (544 & l)) {
			let t;
			if (131072 & l) {
				let i = this.C;
				3 & i.j && i.Tt(), t = i.W;
			} else t = this;
			try {
				i = this.V(t, this.Y);
			} finally {
				this.j &= -20;
			}
		} else {
			let t = Ai, n = xn += 2;
			Ai = n;
			let e, s, h = ei, f = 0, u = 0;
			if (32 & l) e = Qi, Qi = Pi;
			else {
				s = Sl, Sl = 0;
				let t = this.A;
				f = bn(n - 1, this.C, t), u = null !== t ? t.length : 0;
			}
			try {
				i = this.V(this, this.Y);
			} finally {
				if (32 & l) {
					if (Pi > Qi) {
						let t = Ni;
						this.A = t.slice(Qi, Pi);
						for (let i = Qi; i < Pi; i += 2) t[i] = null;
						Pi = Qi;
					} else null !== this.C && (this.j |= Yl);
					Qi = e;
				} else {
					let t = null !== this.A ? this.A.length : 0;
					Sl === f && t === u || Ql(this, n, f, t), Sl = s;
				}
				if (ei > h) {
					let t = ei, i = li;
					for (let l = h; l < t; l += 2) i[l].u = i[l + 1], i[l] = null;
					ei = h;
				}
				Ai = t, this.j &= -52;
			}
		}
		"function" == typeof i && this.Mt(i);
	}, n.yt = function(t) {
		let i, l = this.j;
		if (131072 & l) {
			let t = this.C;
			3 & t.j && t.Tt();
			try {
				i = this.V(t.W, this.Y);
			} finally {
				this.j &= -20;
			}
		} else {
			let t, n = this.Y;
			if (!(544 & l)) {
				null !== this.C && (St(this.C, this.F), this.C = null);
				let t = this.A;
				if (null !== t) {
					let i = t.length >> 1;
					for (; i-- > 0;) {
						let i = t.pop();
						St(t.pop(), i);
					}
				}
				64 & l ? (n.ct.S(), n.ct = new ba(this)) : n.ct.Pt();
			}
			t = n.ct;
			try {
				i = this.V(t, n.Y), this.j = this.j | 512 & t.j;
			} finally {
				this.j &= -52;
			}
		}
		let n = Nl(i);
		var e;
		3 === n ? (this.j &= -65, "function" == typeof i && this.Mt(i)) : (this.j |= 64, 1 === n ? (e = new WeakRef(this), i.then((t) => {
			let i = e.deref();
			if (void 0 !== i && !(8 & i.j)) {
				if (i.j &= -65, !(131072 & i.j)) {
					let t = i.Y.ct;
					i.j |= 512 & t.j, t.j &= -33;
				}
				"function" == typeof t && i.Mt(t);
			}
		}, (t) => {
			let i = e.deref();
			void 0 === i || 8 & i.j || (i.j &= -65, qt(i, t) || i.S());
		})) : Zt(new WeakRef(this), i));
	}, n.S = function() {
		let t = this.j;
		this.j = 8, Wt(this), null !== this.H && Fl(this), null !== this.J && Ct(this), 65536 == (196608 & t) && this.Y.ct.S(), this.V = this.Y = this.J = this.L = this.M = null;
	}, n.ut = function() {
		if (null === this.J) _n[gn++] = this;
		else {
			let t = this.$, i = ti[t];
			ii[t][i] = this, ti[t] = i + 1, jn++;
		}
	}, f.val = function(t) {
		let i = this.j;
		if (8 & i) throw Error("Reader disposed");
		let l = t.W;
		if (512 == (544 & i)) return l;
		if (t.u === this.u) return l;
		t.u = this.u;
		let n = this.tt;
		if (null === n.C) n.C = t, n.F = M(t, n, -1);
		else {
			let i = n.A, l = M(t, n, null === i ? 0 : i.length);
			null === i ? n.A = [t, l] : i.push(t, l);
		}
		return l;
	}, f.S = function() {
		this.j = 8, this.tt = null;
	}, f.Pt = function() {
		this.j = 0, this.u = xn += 2;
	}, f.stable = function() {
		this.j = -33 & this.j | 512;
	}, f.cleanup = function(t) {
		if (8 & this.j) throw Error("Reader disposed");
		this.tt.Mt(t);
	}, f.recover = function(t) {
		if (8 & this.j) throw Error("Reader disposed");
		this.tt.Nt(t);
	};
	let d = In.prototype;
	function b(t, i, l, n, e) {
		let s, h;
		return "function" == typeof t ? (s = 32 | (0 | l) & C, h = new x(s, t, null, i, n)) : (s = 133632 | (0 | n) & C, h = new x(s, i, t, l, e), h.F = M(t, h, -1)), jt(this, h), 256 & s || bt(h), h;
	}
	function v(t, i, l, n, e) {
		let s, h;
		return "function" == typeof t ? (s = 65568 | (0 | l) & C, h = new x(s, t, null, i, null), h.Y = {
			ct: new ba(h),
			Y: n
		}) : (s = 199168 | (0 | n) & C, h = new x(s, i, t, l, e), h.F = M(t, h, -1)), jt(this, h), 256 & s || bt(h), h;
	}
	function k(t, i, l, n) {
		let e, s;
		"function" == typeof t ? (e = 32 | (0 | i) & C, s = new z(e, t, null, this, l)) : (e = 133632 | (0 | l) & C, s = new z(e, i, t, this, n), s.F = M(t, s, -1));
		let h = this.$ + 1;
		return this.$ > 2 && h >= ti.length && (ti.push(0), ii.push([])), s.$ = h, jt(this, s), vt(s), s;
	}
	function g(t, i, l, n) {
		let e, s;
		"function" == typeof t ? (e = 65568 | (0 | i) & C, s = new z(e, t, null, this, null), s.Y = {
			ct: new ba(s),
			Y: l
		}) : (e = 199168 | (0 | l) & C, s = new z(e, i, t, this, n), s.F = M(t, s, -1));
		let h = this.$ + 1;
		return this.$ > 2 && h >= ti.length && (ti.push(0), ii.push([])), s.$ = h, jt(this, s), vt(s), s;
	}
	d.set = function(t) {
		let i = this.Ot;
		if (null !== i) if ("function" == typeof i) {
			if (!i(t)) throw Error(i.name);
		} else {
			let l = i.length;
			for (let n = 0; n < l; n++) if (!i[n](t)) throw Error(i[n].name);
		}
		let l = this.Kt;
		t: if (null !== l) {
			let i = this.W;
			if ("function" != typeof l) {
				let n = l.length;
				for (let e = 0; e < n; e++) if (!l[e](t, i)) break t;
				return;
			}
			if (l(t, i)) return;
		}
		Ln.call(this, t);
	}, d.check = function(t) {
		let i = this.Kt;
		return null === i ? this.Kt = t : "function" == typeof i ? this.Kt = [i, t] : i.push(t), this;
	}, d.guard = function(t) {
		let i = this.Ot;
		return null === i ? this.Ot = t : "function" == typeof i ? this.Ot = [i, t] : i.push(t), this;
	}, t.signal = n.signal = a, t.gate = n.gate = Jn, t.compute = n.compute = b, t.task = n.task = v, t.effect = n.effect = k, t.spawn = n.spawn = g, t.root = n.root = w;
}
function M(t, i, l) {
	let n = -1;
	return null === t.O ? (t.O = i, t.P = l) : null === t.T ? (n = 0, t.T = [i, l]) : (n = t.T.length, t.T.push(i, l)), n;
}
function St(t, i) {
	if (-1 === i) t.O = null;
	else {
		let l = t.T, n = l.pop(), e = l.pop();
		i !== l.length && (l[i] = e, l[i + 1] = n, -1 === n ? e.F = i : e.A[n + 1] = i);
	}
	8192 & t.j && null === t.O && (null === t.T || 0 === t.T.length) && (t.j |= 1, t.W = null);
}
function xt(t, i) {
	if (-1 === i) t.C = null;
	else {
		let l = t.A, n = l.pop(), e = l.pop();
		i !== l.length && (l[i] = e, l[i + 1] = n, -1 === n ? e.P = i : e.T[n + 1] = i);
	}
}
function Wt(t) {
	null !== t.C && (St(t.C, t.F), t.C = null);
	let i = t.A;
	if (null !== i) {
		let l = i.length;
		for (let t = 0; t < l; t += 2) St(i[t], i[t + 1]);
		t.A = null;
	}
}
function gt(t) {
	null !== t.O && (xt(t.O, t.P), t.O = null);
	let i = t.T;
	if (null !== i) {
		let l = i.length;
		for (let t = 0; t < l; t += 2) xt(i[t], i[t + 1]);
		t.T = null;
	}
}
function Fl(t) {
	let i = t.H;
	if ("function" == typeof i) i(), t.H = null;
	else {
		let t = i.length;
		for (; t-- > 0;) i.pop()();
	}
}
function jt(t, i) {
	null === t.J ? t.J = [i] : t.J.push(i);
}
function Ct(t) {
	let i = t.J, l = i.length;
	for (; l-- > 0;) i.pop().S();
	t.M = null;
}
function qt(t, i) {
	let l = t.L;
	for (; null !== l;) {
		let t = l.M;
		if (null !== t) if ("function" == typeof t) {
			if (!0 === t(i)) return !0;
		} else {
			let l = t.length;
			for (let n = 0; n < l; n++) if (!0 === t[n](i)) return !0;
		}
		l = l.L;
	}
	return !1;
}
function tn(t) {
	return null === t.C && (null === t.A || 0 === t.A.length);
}
function Ql(t, i, l, n) {
	let e = t.A, s = l > 1 ? 2 * (l - 1) : 0, h = s, f = t.C;
	if (null !== f && f.u !== i) if (St(f, t.F), h < n) {
		let i = e[h];
		t.C = i, t.F = M(i, t, -1), h += 2;
	} else t.C = null, t.F = 0;
	if (null === e) return void (null !== t.C && (t.j |= Yl));
	let u = 0, o = s;
	for (; u < o;) {
		let l = e[u];
		if (l.u !== i) if (St(l, e[u + 1]), h < n) {
			let i = e[h], l = M(i, t, u);
			e[u] = i, e[u + 1] = l, h += 2, u += 2;
		} else {
			let t = 0;
			for (; o > u + 2;) {
				o -= 2;
				let l = e[o];
				if (l.u === i) {
					let i = e[o + 1];
					e[u] = l, e[u + 1] = i, -1 === i ? l.P = u : l.T[i + 1] = u, t = 1;
					break;
				}
				St(l, e[o + 1]);
			}
			t ? u += 2 : o = u;
		}
		else u += 2;
	}
	if (h < n) {
		if (null === t.C) {
			let i = e[h], l = M(i, t, u);
			e[u] = i, e[u + 1] = l, h += 2;
		}
		for (; h < n;) {
			let i = e[h], l = M(i, t, o);
			e[o] = i, e[o + 1] = l, o += 2, h += 2;
		}
	}
	if (null === t.C && o > 0) {
		o -= 2;
		let i = e[o], l = e[o + 1];
		t.C = i, t.F = l, -1 === l ? i.P = -1 : i.T[l + 1] = -1;
	}
	if (0 === o) t.A = null, null !== t.C && (t.j |= Yl);
	else {
		t.j &= -2049;
		let i = e.length - o;
		if (i > 0) if (i < 20) for (; i-- > 0;) e.pop();
		else e.length = o;
	}
}
function bn(t, i, l) {
	let n = 0, e = li, s = ei, h = Oi;
	if (null !== i) {
		let l = i.u;
		l > h && (e[s++] = i, e[s++] = l), i.u = t, n = 1;
	}
	if (null !== l) {
		let i = l.length;
		for (let n = 0; n < i; n += 2) {
			let i = l[n], f = i.u;
			f > h && (e[s++] = i, e[s++] = f), i.u = t;
		}
		n += i >> 1;
	}
	return ei = s, n;
}
function h(t, i) {
	let l = t.O;
	if (null !== l) {
		let t = l.j;
		l.j |= i, 3 & t || l.ut();
	}
	let n = t.T;
	if (null !== n) {
		let t = n.length;
		for (let e = 0; e < t; e += 2) {
			l = n[e];
			let t = l.j;
			l.j |= i, 3 & t || l.ut();
		}
	}
}
function Ut(t, i) {
	let l = t.i, n = t.C;
	if (null !== n) {
		let t = n.j;
		if (1 & t ? (Oi = xn, n.ot(i)) : 2 & t && (Oi = xn, t & Yl ? Zl(n, i) : qn(n, i)), n.it > l) return !0;
	}
	let e = t.A;
	if (null !== e) {
		let t = e.length;
		for (let s = 0; s < t; s += 2) {
			n = e[s];
			let t = n.j;
			if (1 & t ? (Oi = xn, n.ot(i)) : 2 & t && (Oi = xn, t & Yl ? Zl(n, i) : qn(n, i)), n.it > l) return !0;
		}
	}
	return !1;
}
function Zl(t, i) {
	let l = t.C, n = l.j;
	1 & n ? l.ot(i) : 2 & n && (n & Yl ? Zl(l, i) : qn(l, i)), l.it > t.i ? t.ot(i) : (t.i = i, t.j &= -4);
}
function qn(t, i) {
	let l = Mi, n = t.C;
	if (2 == (3 & n.j)) do
		Ki[Mi] = t, Li[Mi] = -1, Mi++, n = (t = n).C;
	while (null !== n && 2 == (3 & n.j));
	let e = -2;
	t: for (;;) {
		let s, h = t.i;
		i: {
			if (-2 === e) {
				if (n = t.C, null !== n) {
					let l = n.j;
					if (1 & l) n.ot(i);
					else if (2 & l) {
						Ki[Mi] = t, Li[Mi] = -1, Mi++, t = n;
						continue t;
					}
					if (n.it > h) {
						t.ot(i);
						break i;
					}
				}
				s = 0;
			} else if (-1 === e) {
				if (t.C.it > h) {
					t.ot(i);
					break i;
				}
				s = 0;
			} else {
				if (t.A[e].it > h) {
					t.ot(i);
					break i;
				}
				s = e + 2;
			}
			let l = t.A;
			if (null !== l) {
				let f = l.length;
				for (; s < f; s += 2) {
					n = l[s];
					let f = n.j;
					if (1 & f) n.ot(i);
					else if (2 & f) {
						Ki[Mi] = t, Li[Mi] = s, Mi++, t = n, e = -2;
						continue t;
					}
					if (n.it > h) {
						t.ot(i);
						break i;
					}
				}
			}
			t.i = i, t.j &= -4;
		}
		for (; Mi > l;) {
			Mi--;
			let l = Ki[Mi];
			if (Ki[Mi] = null, t.it > l.i) {
				l.ot(i), t = l;
				continue;
			}
			let n = Li[Mi];
			if (-1 === n) {
				if (null !== l.A) {
					t = l, e = -1;
					continue t;
				}
			} else if (n + 2 < l.A.length) {
				t = l, e = n;
				continue t;
			}
			l.i = i, l.j &= -4, t = l;
		}
		return;
	}
}
function Nl(t) {
	return null === t || "object" != typeof t ? 3 : "function" == typeof t.then ? 1 : "function" == typeof t[Symbol.asyncIterator] ? 2 : 3;
}
function Xt(t, i, l) {
	i.then((i) => {
		let n = t.deref();
		void 0 === n || 8 & n.j || n.i !== l || (n.j &= -129, dt(n, i));
	}, (i) => {
		let n = t.deref();
		void 0 === n || 8 & n.j || n.i !== l || (n.j |= 128, dt(n, i));
	});
}
function Yt(t, i, l) {
	let n = "function" == typeof i[Symbol.asyncIterator] ? i[Symbol.asyncIterator]() : i, e = (i) => {
		let h = t.deref();
		void 0 === h || 8 & h.j || h.i !== l ? "function" == typeof n.return && n.return() : i.done || (n.next().then(e, s), h.j &= -129, dt(h, i.value));
	}, s = (i) => {
		let n = t.deref();
		void 0 === n || 8 & n.j || n.i !== l || (n.j |= 128, dt(n, i));
	};
	n.next().then(e, s);
}
function dt(t, i) {
	if (t.j &= -65, 65536 & t.j && !(131072 & t.j)) {
		let i = t.Y.ct;
		t.j |= 49664 & i.j, i.j &= -33;
	}
	(i !== t.W || 128 & t.j) && (t.W = i, t.it = bi + 1, 65536 & t.j ? null !== t.A && Hi(t) : tn(t) && (t.V = t.Y = null), h(t, 1), Et());
}
function Hi(t) {
	let i = xn += 2, l = t.C, n = t.A;
	null !== l && (l.u = i);
	let e = n.length - 2;
	for (; e >= 0;) {
		let t = n[e];
		if (t.u === i) {
			St(t, n[e + 1]);
			let i = n.pop(), l = n.pop();
			e !== n.length && (n[e] = l, n[e + 1] = i, -1 === i ? l.P = e : l.T[i + 1] = e);
		} else t.u = i;
		e -= 2;
	}
}
function Zt(t, i) {
	let l = "function" == typeof i[Symbol.asyncIterator] ? i[Symbol.asyncIterator]() : i, n = (i) => {
		let s = t.deref();
		if (void 0 === s || 8 & s.j) "function" == typeof l.return && l.return();
		else if (i.done) {
			if (s.j &= -65, !(131072 & s.j)) {
				let t = s.Y.ct;
				s.j |= 512 & t.j, t.j &= -33;
			}
		} else {
			if (l.next().then(n, e), s.j &= -65, !(131072 & s.j)) {
				let t = s.Y.ct;
				s.j |= 512 & t.j, t.j &= -33;
			}
			"function" == typeof i.value && s.Mt(i.value);
		}
	}, e = (i) => {
		let l = t.deref();
		void 0 === l || 8 & l.j || (l.j &= -65, qt(l, i) || l.S());
	};
	l.next().then(n, e);
}
function Tt(t, i) {
	let l = mi;
	mi = !0;
	try {
		let l = i(t);
		"function" == typeof l && t.Mt(l);
	} finally {
		mi = l;
	}
}
function bt(t) {
	if (mi) {
		mi = !1;
		try {
			Oi = xn, t.ot(bi), (Sn > 0 || Rn > 0) && Et();
		} finally {
			mi = !0;
		}
	} else t.ot(bi);
}
function vt(t) {
	if (mi) {
		mi = !1;
		try {
			Oi = xn, t.ot(bi), (Sn > 0 || Rn > 0) && Et();
		} catch (i) {
			let l = qt(t, i);
			if (t.S(), !l) throw i;
		} finally {
			mi = !0;
		}
	} else try {
		t.ot(bi);
	} catch (i) {
		let l = qt(t, i);
		if (t.S(), !l) throw i;
	}
}
function Et() {
	let t = 0, i = 0, l = null, n = !1;
	mi = !1;
	try {
		do {
			if (t = ++bi, Rn > 0) {
				let t = Rn;
				for (let i = 0; i < t; i++) pn[i].S(), pn[i] = null;
				Rn = 0;
			}
			if (Sn > 0) {
				let t = Sn;
				for (let i = 0; i < t; i++) Ei[i].Gt(vn[i]), Ei[i] = vn[i] = null;
				Sn = 0;
			}
			if (Nn > 0) {
				let i = Nn;
				for (let l = 0; l < i; l++) {
					let i = Mn[l];
					Mn[l] = null, 1 & i.j || 2 & i.j && Ut(i, t) ? i.ot(t) : i.j &= -4;
				}
				Nn = 0;
			}
			if (jn > 0) {
				let i = ti.length;
				for (let e = 0; e < i; e++) {
					let i = ti[e], s = ii[e];
					for (let e = 0; e < i; e++) {
						let i = s[e];
						if (1 & i.j || 2 & i.j && Ut(i, t)) try {
							Oi = xn, i.ot(t);
						} catch (t) {
							n || qt(i, t) || (l = t, n = !0), i.S();
						}
						else i.j &= -4;
						s[e] = null;
					}
					ti[e] = 0;
				}
				jn = 0;
			}
			if (gn > 0) {
				let i = gn;
				for (let e = 0; e < i; e++) {
					let i = _n[e];
					if (_n[e] = null, 1 & i.j || 2 & i.j && Ut(i, t)) {
						Oi = xn;
						try {
							i.ot(t);
						} catch (t) {
							n || qt(i, t) || (l = t, n = !0), i.S();
						}
					} else i.j &= -4;
				}
				gn = 0;
			}
			if (1e5 === i++) {
				l = Error("Runaway cycle"), n = !0;
				break;
			}
		} while (!n && (Sn > 0 || Rn > 0));
	} finally {
		if (mi = !0, Rn = Sn = Nn = jn = gn = 0, n) throw l;
	}
}
const wa = {
	signal: a,
	gate: Jn,
	compute: function(t, i, l, n, e) {
		let s, h;
		return "function" == typeof t ? (s = 32 | (0 | l) & C, h = new x(s, t, null, i, n)) : (s = 133632 | (0 | n) & C, h = new x(s, i, t, l, e), h.F = M(t, h, -1)), 256 & s || bt(h), h;
	},
	task: function(t, i, l, n, e) {
		let s, h;
		return "function" == typeof t ? (s = 65568 | (0 | l) & C, h = new x(s, t, null, i, null), h.Y = {
			ct: new ba(h),
			Y: n
		}) : (s = 199168 | (0 | n) & C, h = new x(s, i, t, l, e), h.F = M(t, h, -1)), 256 & s || bt(h), h;
	},
	effect: function(t, i, l, n) {
		let e, s;
		return "function" == typeof t ? (e = 32 | (0 | i) & C, s = new z(e, t, null, null, l)) : (e = 133632 | (0 | l) & C, s = new z(e, i, t, null, n), s.F = M(t, s, -1)), vt(s), s;
	},
	spawn: function(t, i, l, n) {
		let e, s;
		return "function" == typeof t ? (e = 65568 | (0 | i) & C, s = new z(e, t, null, null, null), s.Y = {
			ct: new ba(s),
			Y: l
		}) : (e = 199168 | (0 | l) & C, s = new z(e, i, t, null, n), s.F = M(t, s, -1)), vt(s), s;
	},
	root: w,
	batch: function(t) {
		if (mi) {
			mi = !1;
			try {
				t(), Et();
			} finally {
				mi = !0;
			}
		} else t();
	}
};
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
//#region bench/reactivity/anod-stable.js
/**
* Benchmark using c.compute()/c.effect() with cx.stable() for multi-dep
* nodes that always read the same set of deps. Single-dep nodes use the
* bound variant: c.compute(dep, fn). Dynamic nodes (conditional reads)
* stay fully dynamic.
*/
let sink = 0;
let counter = 0;
const fib = (n) => {
	if (n < 2) return 1;
	return fib(n - 1) + fib(n - 2);
};
const hard = (n, _log) => n + fib(16);
function setupDeep() {
	const len = 50;
	const head = wa.signal(0);
	let current = head;
	for (let i = 0; i < len; i++) {
		const prev = current;
		current = wa.compute(prev, (val) => {
			counter++;
			return val + 1;
		});
	}
	const tail = current;
	wa.effect(tail, (val) => {
		counter++;
		sink += val;
	});
	let i = 0;
	return () => {
		head.set(++i);
	};
}
function setupBroad() {
	const head = wa.signal(0);
	for (let i = 0; i < 50; i++) {
		const current = wa.compute(head, (val) => {
			counter++;
			return val + i;
		});
		const current2 = wa.compute(current, (val) => {
			counter++;
			return val + 1;
		});
		wa.effect(current2, (val) => {
			counter++;
			sink += val;
		});
	}
	let i = 0;
	return () => {
		head.set(++i);
	};
}
function setupDiamond() {
	const width = 5;
	const head = wa.signal(0);
	const branches = [];
	for (let i = 0; i < width; i++) branches.push(wa.compute(head, (val) => {
		counter++;
		return val + 1;
	}));
	const sum = wa.compute((cx) => {
		cx.stable();
		counter++;
		return branches.reduce((a, b) => a + cx.val(b), 0);
	});
	wa.effect(sum, (val) => {
		counter++;
		sink += val;
	});
	let i = 0;
	return () => {
		head.set(++i);
	};
}
function setupTriangle() {
	const width = 10;
	const head = wa.signal(0);
	let current = head;
	const list = [];
	for (let i = 0; i < width - 1; i++) {
		list.push(current);
		const prev = current;
		current = wa.compute(prev, (val) => {
			counter++;
			return val + 1;
		});
	}
	list.push(current);
	const sum = wa.compute((cx) => {
		cx.stable();
		counter++;
		return list.reduce((a, b) => a + cx.val(b), 0);
	});
	wa.effect(sum, (val) => {
		counter++;
		sink += val;
	});
	let i = 0;
	return () => {
		head.set(++i);
	};
}
function setupMux() {
	const heads = new Array(100).fill(null).map(() => wa.signal(0));
	const mux = wa.compute((cx) => {
		cx.stable();
		counter++;
		return heads.map((h) => cx.val(h));
	});
	const split = heads.map((_, index) => wa.compute(mux, (val) => {
		counter++;
		return val[index];
	})).map((x) => wa.compute(x, (val) => {
		counter++;
		return val + 1;
	}));
	for (const x of split) wa.effect(x, (val) => {
		counter++;
		sink += val;
	});
	let i = 0;
	return () => {
		heads[i % heads.length].set(++i);
	};
}
function setupUnstable() {
	const head = wa.signal(0);
	const double = wa.compute(head, (val) => {
		counter++;
		return val * 2;
	});
	const inverse = wa.compute(head, (val) => {
		counter++;
		return -val;
	});
	const current = wa.compute((cx) => {
		counter++;
		let result = 0;
		for (let i = 0; i < 20; i++) result += cx.val(head) % 2 ? cx.val(double) : cx.val(inverse);
		return result;
	});
	wa.effect(current, (val) => {
		counter++;
		sink += val;
	});
	let i = 0;
	return () => {
		head.set(++i);
	};
}
function setupAvoidable() {
	const head = wa.signal(0);
	const computed1 = wa.compute(head, (val) => {
		counter++;
		return val;
	});
	const computed2 = wa.compute(computed1, (val) => {
		counter++;
		return 0;
	});
	const computed3 = wa.compute(computed2, (val) => {
		counter++;
		return val + 1;
	});
	const computed4 = wa.compute(computed3, (val) => {
		counter++;
		return val + 2;
	});
	const computed5 = wa.compute(computed4, (val) => {
		counter++;
		return val + 3;
	});
	wa.effect(computed5, (val) => {
		counter++;
		sink += val;
	});
	let i = 0;
	return () => {
		head.set(++i);
	};
}
function setupRepeatedObservers() {
	const size = 30;
	const head = wa.signal(0);
	const current = wa.compute(head, (val) => {
		counter++;
		let result = 0;
		for (let i = 0; i < size; i++) result += val;
		return result;
	});
	wa.effect(current, (val) => {
		counter++;
		sink += val;
	});
	let i = 0;
	return () => {
		head.set(++i);
	};
}
function setupCellx(layers) {
	const start = {
		prop1: wa.signal(1),
		prop2: wa.signal(2),
		prop3: wa.signal(3),
		prop4: wa.signal(4)
	};
	let layer = start;
	for (let i = layers; i > 0; i--) {
		const m = layer;
		const s = {
			prop1: wa.compute(m.prop2, (val) => {
				counter++;
				return val;
			}),
			prop2: wa.compute((cx) => {
				cx.stable();
				counter++;
				return cx.val(m.prop1) - cx.val(m.prop3);
			}),
			prop3: wa.compute((cx) => {
				cx.stable();
				counter++;
				return cx.val(m.prop2) + cx.val(m.prop4);
			}),
			prop4: wa.compute(m.prop3, (val) => {
				counter++;
				return val;
			})
		};
		wa.effect(s.prop1, (val) => {
			counter++;
			sink += val;
		});
		wa.effect(s.prop2, (val) => {
			counter++;
			sink += val;
		});
		wa.effect(s.prop3, (val) => {
			counter++;
			sink += val;
		});
		wa.effect(s.prop4, (val) => {
			counter++;
			sink += val;
		});
		wa.effect(s.prop1, (val) => {
			counter++;
			sink += val;
		});
		wa.effect(s.prop2, (val) => {
			counter++;
			sink += val;
		});
		wa.effect(s.prop3, (val) => {
			counter++;
			sink += val;
		});
		wa.effect(s.prop4, (val) => {
			counter++;
			sink += val;
		});
		layer = s;
	}
	const end = layer;
	let toggle = false;
	return () => {
		toggle = !toggle;
		wa.batch(() => {
			start.prop1.set(toggle ? 4 : 1);
			start.prop2.set(toggle ? 3 : 2);
			start.prop3.set(toggle ? 2 : 3);
			start.prop4.set(toggle ? 1 : 4);
		});
		end.prop1.peek();
		end.prop2.peek();
		end.prop3.peek();
		end.prop4.peek();
	};
}
function setupMolWire() {
	const numbers = Array.from({ length: 5 }, (_, i) => i);
	const A = wa.signal(0);
	const B = wa.signal(0);
	const C = wa.compute((cx) => {
		cx.stable();
		counter++;
		return cx.val(A) % 2 + cx.val(B) % 2;
	});
	const D = wa.compute((cx) => {
		cx.stable();
		counter++;
		return numbers.map((i) => ({ x: i + cx.val(A) % 2 - cx.val(B) % 2 }));
	});
	const E = wa.compute((cx) => {
		cx.stable();
		counter++;
		return hard(cx.val(C) + cx.val(A) + cx.val(D)[0].x, "E");
	});
	const F = wa.compute((cx) => {
		counter++;
		return hard(cx.val(D)[2].x || cx.val(B), "F");
	});
	const G = wa.compute((cx) => {
		counter++;
		return cx.val(C) + (cx.val(C) || cx.val(E) % 2) + cx.val(D)[4].x + cx.val(F);
	});
	wa.effect(G, (val) => {
		counter++;
		sink += hard(val, "H");
	});
	wa.effect(G, (val) => {
		counter++;
		sink += val;
	});
	wa.effect(F, (val) => {
		counter++;
		sink += hard(val, "J");
	});
	let i = 0;
	return () => {
		i++;
		wa.batch(() => {
			B.set(1);
			A.set(1 + i * 2);
		});
		wa.batch(() => {
			A.set(2 + i * 2);
			B.set(2);
		});
	};
}
function benchCreateSignals(count) {
	return () => {
		let signals = [];
		for (let i = 0; i < count; i++) signals[i] = wa.signal(i);
		return signals;
	};
}
function benchCreateComputations(count) {
	return () => {
		const src = wa.signal(0);
		for (let i = 0; i < count; i++) {
			const comp = wa.compute(src, (val) => {
				counter++;
				return val;
			});
			wa.effect(comp, (val) => {
				counter++;
				sink += val;
			});
		}
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
* Build a rectangular reactive dependency graph.
* All nodes use c.compute(). Static nodes read a fixed set of deps. Dynamic nodes conditionally skip deps.
* @param {number} width
* @param {number} totalLayers
* @param {number} staticFraction - fraction of static nodes [0, 1]
* @param {number} nSources
*/
function makeDynGraph(width, totalLayers, staticFraction, nSources) {
	const sources = new Array(width);
	for (let i = 0; i < width; i++) sources[i] = wa.signal(i);
	const random = pseudoRandom("seed");
	let prevRow = sources;
	const layers = [];
	for (let l = 0; l < totalLayers - 1; l++) {
		const row = new Array(width);
		for (let myDex = 0; myDex < width; myDex++) {
			const mySources = new Array(nSources);
			for (let s = 0; s < nSources; s++) mySources[s] = prevRow[(myDex + s) % width];
			if (random() < staticFraction) row[myDex] = wa.compute((cx) => {
				cx.stable();
				counter++;
				let sum = 0;
				for (let s = 0; s < mySources.length; s++) sum += cx.val(mySources[s]);
				return sum;
			});
			else {
				const first = mySources[0];
				const tail = mySources.slice(1);
				row[myDex] = wa.compute((cx) => {
					counter++;
					let sum = cx.val(first);
					const shouldDrop = sum & 1;
					const dropDex = sum % tail.length;
					for (let i = 0; i < tail.length; i++) {
						if (shouldDrop && i === dropDex) continue;
						sum += cx.val(tail[i]);
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
* Benchmark graph construction: each mitata call builds a fresh graph and
* reads all leaves to force materialization (so lazy frameworks do the same
* work as push frameworks).
*/
function setupDynBuild(width, totalLayers, staticFraction, nSources) {
	return () => {
		const { layers } = makeDynGraph(width, totalLayers, staticFraction, nSources);
		const leaves = layers[layers.length - 1];
		for (let r = 0; r < leaves.length; r++) sink += leaves[r].peek();
	};
}
/**
* Benchmark graph propagation: setup builds the graph and force-reads all
* leaves (materializing for lazy frameworks). The runner then writes one
* source and reads selected leaves — measuring pure propagation cost.
*/
function setupDynUpdate(width, totalLayers, staticFraction, nSources, readFraction) {
	const { sources, layers } = makeDynGraph(width, totalLayers, staticFraction, nSources);
	const leaves = layers[layers.length - 1];
	/** Force-read ALL leaves so lazy frameworks fully materialize the graph. */
	for (let r = 0; r < leaves.length; r++) sink += leaves[r].peek();
	const rand = pseudoRandom("seed");
	const readLeaves = removeElems(leaves, Math.round(leaves.length * (1 - readFraction)), rand);
	const readLen = readLeaves.length;
	const srcLen = sources.length;
	/** Persistent counter across mitata calls so each write triggers propagation. */
	let iter = 0;
	return () => {
		iter++;
		const sourceDex = iter % srcLen;
		sources[sourceDex].set(iter + sourceDex);
		for (let r = 0; r < readLen; r++) sink += readLeaves[r].peek();
	};
}
/**
* Run each benchmark once and verify the counter matches the expected value.
* Uses OVERRIDES_ANOD for push-model differences (unstable, molWire).
*/
function validate(name, setupFn) {
	const expected = EXPECTED[name];
	const run = setupFn();
	counter = 0;
	run();
	if (counter !== expected) throw new Error(`"${name}": expected counter=${expected}, got ${counter}`);
	counter = 0;
}
validate("deep", setupDeep);
validate("broad", setupBroad);
validate("diamond", setupDiamond);
validate("triangle", setupTriangle);
validate("mux", setupMux);
validate("unstable", setupUnstable);
validate("avoidable", setupAvoidable);
validate("repeatedObservers", setupRepeatedObservers);
validate("cellx10", () => setupCellx(10));
validate("molWire", setupMolWire);
validate("createComputations1k", () => benchCreateComputations(1e3));
validate("dynBuildSimple", () => setupDynBuild(10, 5, 1, 2));
validate("dynBuildLargeWebApp", () => setupDynBuild(1e3, 12, .95, 4));
validate("dynUpdateSimple", () => setupDynUpdate(10, 5, 1, 2, .2));
validate("dynUpdateDynamic", () => setupDynUpdate(10, 10, .75, 6, .2));
validate("dynUpdateLargeWebApp", () => setupDynUpdate(1e3, 12, .95, 4, 1));
validate("dynUpdateWideDense", () => setupDynUpdate(1e3, 5, 1, 25, 1));
validate("dynUpdateDeep", () => setupDynUpdate(5, 500, 1, 3, 1));
validate("dynUpdateVeryDynamic", () => setupDynUpdate(100, 15, .5, 6, 1));
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
saveRun("anod-stable", await run());
//#endregion
