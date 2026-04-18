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
}, OVERRIDES_ANOD = {}, W = 2048, vl = 4096, xl = 8192, C = 134208;
var pl = null, dl = 0, bl = 0, ii = 0, ni = [], li = 0, ei = 0, Fi = [], Gi = [], Hi = 0, Mi = [], Ni = 0, Pi = 0, si = 1, ri = !0, hi = 1, ui = [], fi = 0, $i = [], ci = [], hl = 0, pi = [
	0,
	0,
	0,
	0
], di = [
	[],
	[],
	[],
	[]
], Ei = 0, vi = [], qi = 0;
function s() {
	this.j = 0, this.G = null, this.I = null, this.L = null;
}
function p(t) {
	this.j = 0, this.N = t, this.u = 0, this.O = null, this.P = 0, this.T = null;
}
function x(t, i, l, n, s) {
	this.j = 49 | t, this.N = n, this.u = 0, this.O = null, this.P = 0, this.T = null, this.V = i, this.W = l, this.D = 0, this.q = null, this.i = 0, this.st = 0, this.Y = s;
}
function z(t, i, l, n, s) {
	this.j = 32 | t, this.u = 0, this.V = i, this.W = l, this.D = 0, this.q = null, this.i = 0, this.G = null, this.I = null, this.$ = 0, this.K = n, this.L = null, this.Y = s;
}
function El(t) {
	this.tt = t, this.j = t.j, this.u = hi += 2;
}
{
	let t = s.prototype, i = p.prototype, l = x.prototype, u = z.prototype, o = El.prototype;
	function c(t, i, l, n) {
		let s = 22528 | (0 | l) & C, e = new x(s, t, this, i, n);
		return e.D = M(this, e, -1), 2 & dl && jt(pl, e), 1024 & s || bt(e), e;
	}
	function y(t, i, l, n) {
		let s = 1071104 | (0 | l) & C, e = new x(s, t, this, i, n);
		return e.D = M(this, e, -1), 2 & dl && jt(pl, e), 1024 & s || bt(e), e;
	}
	function d(t, i, l) {
		let n = 22528 | (0 | i) & C, s = 2 & dl ? pl : null, e = new z(n, t, this, s, l);
		if (e.D = M(this, e, -1), s) {
			let t = s.$ + 1;
			s.$ > 2 && t >= pi.length && (pi.push(0), di.push([])), e.$ = t, jt(s, e);
		}
		return 17408 & ~n && vt(e), e;
	}
	function v(t, i, l) {
		let n = 1071104 | (0 | i) & C, s = 2 & dl ? pl : null, e = new z(n, t, this, s, l);
		if (e.D = M(this, e, -1), s) {
			let t = s.$ + 1;
			s.$ > 2 && t >= pi.length && (pi.push(0), di.push([])), e.$ = t, jt(s, e);
		}
		return 17408 & ~n && vt(e), e;
	}
	i.st = 0, t.K = null, t.$ = -1, t.dispose = i.dispose = l.dispose = u.dispose = function() {
		8 & this.j || (ri ? this.S() : ui[fi++] = this);
	}, l.yt = u.yt = function(t, i) {
		if (i > ii && (ni[li++] = t, ni[li++] = i), 64 & this.j) if (null === this.W) {
			let i = M(t, this, -1);
			this.W = t, this.D = i;
		} else {
			let i = M(t, this, Ni - Pi);
			Mi[Ni++] = t, Mi[Ni++] = i;
		}
		else null === this.q ? (this.q = [t, 0], this.j &= -4097) : this.q.push(t, 0);
	}, l.error = u.error = function() {
		return !!(512 & this.j);
	}, l.loading = u.loading = function() {
		return !!(256 & this.j);
	}, t.S = function() {
		this.j = 8, null !== this.G && Yi(this), null !== this.I && Ct(this), this.I = this.L = null;
	}, i.val = function() {
		if (1 & dl) {
			let t = this.u;
			t !== bl && (this.u = bl, t === bl - 1 ? ei++ : pl.yt(this, t));
		}
		return this.N;
	}, i.set = function(t) {
		if (this.N !== t) if (ri) this.N = t, h(this, 1), Et();
		else {
			this.j |= 4;
			let i = hl++;
			$i[i] = this, ci[i] = t;
		}
	}, i.ct = function(t) {
		this.N = t, 4 & this.j && (this.j &= -5, h(this, 1));
	}, i.S = function() {
		this.j = 8, gt(this), this.N = null;
	}, l.val = function() {
		let t = this.j;
		if (128 & t) throw Error("Circular dependency");
		if (3 & t) if (ri) {
			ri = !1;
			try {
				(1 & t || rl(this, si)) && (ii = hi, this.rt(si)), (hl > 0 || fi > 0) && Et();
			} finally {
				ri = !0;
			}
		} else 1 & t ? this.rt(si) : t & vl ? kl(this, si) : Di(this, si);
		if (1 & dl) {
			let t = this.u;
			t !== bl && (this.u = bl, t === bl - 1 ? ei++ : pl.yt(this, t));
		}
		if (512 & this.j) throw this.N;
		return this.N;
	}, l.set = function(t) {
		if (this.N !== t) if (ri) this.N = t, this.st = si + 1, this.j &= -36, h(this, 1), Et();
		else {
			this.j |= 4;
			let i = hl++;
			$i[i] = this, ci[i] = t;
		}
	}, l.ct = function(t) {
		this.N = t, 4 & this.j && (this.j &= -37, this.st = si, h(this, 1));
	}, l.S = function() {
		let t = this.j;
		this.j = 8, gt(this), Wt(this), t & xl && this.Y.wt.S(), this.V = this.N = this.Y = null;
	}, l.rt = function(t) {
		let i = this.j;
		this.i = t, this.j = -786722 & i | 128, i & xl && (this.Y.wt.S(), this.Y = this.Y.Y, this.j &= -8193);
		let l, n = pl, s = dl;
		if (pl = this, 2048 == (2112 & i)) {
			dl = 0;
			try {
				l = 16384 & i ? this.V(this.W.val(), this.N, this.Y) : this.V(this.N, this.Y);
			} catch (l) {
				dl = s, pl = n, this.N = l, this.j = -228 & i | 512, this.st = t;
				return;
			}
		} else {
			dl = 1;
			let t = bl, n = hi += 2;
			bl = n;
			let s, e, h = li, f = 0, u = 0;
			64 & i ? (s = Pi, Pi = Ni) : (e = ei, ei = 0, u = ml(n - 1, this.W, this.q), f = null !== this.q ? this.q.length : 0);
			try {
				l = this.V(this.N, this.Y), this.j &= -513;
			} catch (t) {
				l = t, this.j |= 512;
			}
			if (64 & i) Ni > Pi ? (this.q = Mi.slice(Pi, Ni), Ni = Pi) : null !== this.W && (this.j |= vl), Pi = s;
			else {
				let t = null !== this.q ? this.q.length : 0;
				ei === u && t === f || cl(this, n, u, t), ei = e;
			}
			if (li > h) {
				let t = li, i = ni;
				for (let l = h; l < t; l += 2) i[l].u = i[l + 1];
				li = h;
			}
			bl = t;
		}
		if (dl = s, pl = n, i = this.j &= -228, 1048576 & i) {
			if (512 & i) return this.N = l, void (this.st = t);
			let n = yl(l);
			if (3 !== n) return this.j |= 256, void (1 === n ? Zt(new WeakRef(this), l, t) : $t(new WeakRef(this), l, t));
		}
		512 & i ? (this.N = l, this.st = t) : l !== this.N ? (this.N = l, 262144 & i || (this.st = t)) : 524288 & i && (this.st = t);
	}, l.ot = function() {
		h(this, 2);
	}, u.rt = function(t) {
		let i = this.j;
		this.i = t, 64 & i || (null !== this.G && Yi(this), null !== this.I && Ct(this), this.L = null), i & xl && (this.Y.wt.S(), this.Y = this.Y.Y, this.j &= -8193), 1048576 & i && (this.j &= -257);
		let l, n = pl, s = dl;
		if (pl = this, 2048 == (2112 & i)) {
			dl = 2;
			try {
				l = 16384 & i ? this.V(this.W.val(), this.Y) : this.V(this.Y);
			} finally {
				this.j &= -4, dl = s, pl = n;
			}
		} else {
			dl = 3;
			let t = bl, e = hi += 2;
			bl = e;
			let h, f, u = li, o = 0, r = 0;
			64 & i ? (h = Pi, Pi = Ni) : (f = ei, ei = 0, o = ml(e - 1, this.W, this.q), r = null !== this.q ? this.q.length : 0);
			try {
				l = this.V(this.Y);
			} finally {
				if (64 & i) Ni > Pi ? (this.q = Mi.slice(Pi, Ni), Ni = Pi) : null !== this.W && (this.j |= vl), Pi = h;
				else {
					let t = null !== this.q ? this.q.length : 0;
					ei === o && t === r || cl(this, e, o, t), ei = f;
				}
				if (li > u) {
					let t = li, i = ni;
					for (let l = u; l < t; l += 2) i[l].u = i[l + 1];
					li = u;
				}
				bl = t, this.j &= -100, dl = s, pl = n;
			}
		}
		if (1048576 & i) {
			let t = yl(l);
			if (3 !== t) return this.j |= 256, void (1 === t ? (e = new WeakRef(this), h = l, h.then((t) => {
				let i = e.deref();
				if (void 0 !== i && !(8 & i.j)) {
					if (i.j &= -257, i.j & xl) {
						let t = i.Y.wt;
						i.j |= t.j & W, t.j &= -65;
					}
					"function" == typeof t && mt(i, t);
				}
			}, (t) => {
				let i = e.deref();
				void 0 === i || 8 & i.j || (i.j &= -257, qt(i, t) || i.S());
			})) : ol(new WeakRef(this), l));
		}
		var e, h;
		"function" == typeof l && mt(this, l);
	}, u.S = function() {
		let t = this.j;
		this.j = 8, Wt(this), null !== this.G && Yi(this), null !== this.I && Ct(this), t & xl && this.Y.wt.S(), this.V = this.Y = this.I = this.K = this.L = null;
	}, u.ot = function() {
		if (null === this.I) vi[qi++] = this;
		else {
			let t = this.$, i = pi[t];
			di[t][i] = this, pi[t] = i + 1, Ei++;
		}
	}, o.val = function(t) {
		let i = this.j;
		if (8 & i) throw Error("Context disposed");
		let l = t.N;
		if (2048 == (2112 & i)) return l;
		if (t.u === this.u) return l;
		t.u = this.u;
		let n = this.tt;
		if (null === n.W) n.W = t, n.D = M(t, n, -1);
		else {
			let i = n.q, l = M(t, n, null === i ? 0 : i.length);
			null === i ? n.q = [t, l] : i.push(t, l);
		}
		return l;
	}, o.S = function() {
		this.j = 8, this.tt = null;
	}, o.equal = function(t) {
		this.j = !1 === t ? -262145 & this.j | 524288 : -524289 & this.j | 262144;
	}, o.stable = function() {
		this.j = -65 & this.j | 2048;
	}, o.cleanup = function(t) {
		if (8 & this.j) throw Error("Context disposed");
		mt(this.tt, t);
	}, o.recover = function(t) {
		if (8 & this.j) throw Error("Context disposed");
		let i = this.tt, l = i.L;
		null === l ? i.L = t : "function" == typeof l ? i.L = [l, t] : l.push(t);
	}, i.derive = l.derive = c, i.task = l.task = y, i.watch = l.watch = d, i.spawn = l.spawn = v;
}
function M(t, i, l) {
	let n = -1;
	return null === t.O ? (t.O = i, t.P = l) : null === t.T ? (n = 0, t.T = [i, l]) : (n = t.T.length, t.T.push(i, l)), n;
}
function St(t, i) {
	if (-1 === i) t.O = null;
	else {
		let l = t.T, n = l.pop(), s = l.pop();
		i !== l.length && (l[i] = s, l[i + 1] = n, -1 === n ? s.D = i : s.q[n + 1] = i);
	}
	131072 & t.j && null === t.O && (null === t.T || 0 === t.T.length) && (t.j |= 1, t.N = null);
}
function xt(t, i) {
	if (-1 === i) t.W = null;
	else {
		let l = t.q, n = l.pop(), s = l.pop();
		i !== l.length && (l[i] = s, l[i + 1] = n, -1 === n ? s.P = i : s.T[n + 1] = i);
	}
}
function Wt(t) {
	null !== t.W && (St(t.W, t.D), t.W = null);
	let i = t.q;
	if (null !== i) {
		let l = i.length;
		for (let t = 0; t < l; t += 2) St(i[t], i[t + 1]);
		t.q = null;
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
function mt(t, i) {
	let l = t.G;
	null === l ? t.G = i : "function" == typeof l ? t.G = [l, i] : l.push(i);
}
function Yi(t) {
	let i = t.G;
	if ("function" == typeof i) i(), t.G = null;
	else {
		let t = i.length;
		for (; t-- > 0;) i.pop()();
	}
}
function jt(t, i) {
	null === t.I ? t.I = [i] : t.I.push(i);
}
function Ct(t) {
	let i = t.I, l = i.length;
	for (; l-- > 0;) i.pop().S();
	t.L = null;
}
function qt(t, i) {
	let l = t.K;
	for (; null !== l;) {
		let t = l.L;
		if (null !== t) if ("function" == typeof t) {
			if (!0 === t(i)) return !0;
		} else {
			let l = t.length;
			for (let n = 0; n < l; n++) if (!0 === t[n](i)) return !0;
		}
		l = l.K;
	}
	return !1;
}
function ll(t) {
	return null === t.W && (null === t.q || 0 === t.q.length);
}
function cl(t, i, l, n) {
	let s = t.q, e = l > 1 ? 2 * (l - 1) : 0, h = n > 0 ? e : 0, f = n, u = t.W;
	if (null !== u && l >= 1 && u.u !== i && (St(u, t.D), h < f ? (t.W = s[h], t.D = M(s[h], t, -1), h += 2) : (t.W = null, t.D = 0)), null === s) return void (null !== t.W && (t.j |= vl));
	let o = e, r = 0;
	for (; r < o;) {
		let l = s[r], n = s[r + 1];
		if (l.u !== i) if (St(l, n), h < f) {
			let i = s[h], l = M(i, t, r);
			s[r] = i, s[r + 1] = l, h += 2, r += 2;
		} else {
			let t = 0;
			for (; o > r + 2;) {
				o -= 2;
				let l = s[o], n = s[o + 1];
				if (l.u === i) {
					s[r] = l, s[r + 1] = n, -1 === n ? l.P = r : l.T[n + 1] = r, t = 1;
					break;
				}
				St(l, n);
			}
			t ? r += 2 : o = r;
		}
		else r += 2;
	}
	for (; h < f;) {
		let i = s[h], l = M(i, t, o);
		s[o] = i, s[o + 1] = l, o += 2, h += 2;
	}
	if (0 === o) t.q = null, null !== t.W && (t.j |= vl);
	else if (2 === o && null === t.W) {
		let i = s[0], l = s[1];
		t.W = i, t.D = l, -1 === l ? i.P = -1 : i.T[l + 1] = -1, t.q = null, t.j |= vl;
	} else {
		t.j &= -4097;
		let i = s.length - o;
		if (i < 20) for (; i-- > 0;) s.pop();
		else s.length = o;
	}
}
function ml(t, i, l) {
	let n = 0, s = ni, e = li, h = ii;
	if (null !== i) {
		let l = i.u;
		l > h && (s[e++] = i, s[e++] = l), i.u = t, n = 1;
	}
	if (null !== l) {
		let i = l.length;
		for (let n = 0; n < i; n += 2) {
			let i = l[n], f = i.u;
			f > h && (s[e++] = i, s[e++] = f), i.u = t;
		}
		n += i >> 1;
	}
	return li = e, n;
}
function h(t, i) {
	let l = t.O;
	if (null !== l) {
		let t = l.j;
		l.j |= i, 3 & t || l.ot();
	}
	let n = t.T;
	if (null !== n) {
		let t = n.length;
		for (let s = 0; s < t; s += 2) {
			l = n[s];
			let t = l.j;
			l.j |= i, 3 & t || l.ot();
		}
	}
}
function rl(t, i) {
	let l = t.i, n = t.W;
	if (null !== n) {
		let t = n.j;
		if (1 & t ? (ii = hi, n.rt(i)) : 2 & t && (ii = hi, t & vl ? kl(n, i) : Di(n, i)), n.st > l) return !0;
	}
	let s = t.q;
	if (null !== s) {
		let t = s.length;
		for (let e = 0; e < t; e += 2) {
			n = s[e];
			let t = n.j;
			if (1 & t ? (ii = hi, n.rt(i)) : 2 & t && (ii = hi, t & vl ? kl(n, i) : Di(n, i)), n.st > l) return !0;
		}
	}
	return !1;
}
function kl(t, i) {
	let l = t.W, n = l.j;
	1 & n ? l.rt(i) : 2 & n && (n & vl ? kl(l, i) : Di(l, i)), l.st > t.i ? t.rt(i) : (t.i = i, t.j &= -4);
}
function Di(t, i) {
	let l = Hi, n = t.W;
	if (2 == (3 & n.j)) do
		Fi[Hi] = t, Gi[Hi] = -1, Hi++, n = (t = n).W;
	while (null !== n && 2 == (3 & n.j));
	let s = -2;
	t: for (;;) {
		let e, h = t.i;
		i: {
			if (-2 === s) {
				if (n = t.W, null !== n) {
					let l = n.j;
					if (1 & l) n.rt(i);
					else if (2 & l) {
						Fi[Hi] = t, Gi[Hi] = -1, Hi++, t = n;
						continue t;
					}
					if (n.st > h) {
						t.rt(i);
						break i;
					}
				}
				e = 0;
			} else if (-1 === s) {
				if (t.W.st > h) {
					t.rt(i);
					break i;
				}
				e = 0;
			} else {
				if (t.q[s].st > h) {
					t.rt(i);
					break i;
				}
				e = s + 2;
			}
			let l = t.q;
			if (null !== l) {
				let f = l.length;
				for (; e < f; e += 2) {
					n = l[e];
					let f = n.j;
					if (1 & f) n.rt(i);
					else if (2 & f) {
						Fi[Hi] = t, Gi[Hi] = e, Hi++, t = n, s = -2;
						continue t;
					}
					if (n.st > h) {
						t.rt(i);
						break i;
					}
				}
			}
			t.i = i, t.j &= -4;
		}
		for (; Hi > l;) {
			Hi--;
			let l = Fi[Hi];
			if (t.st > l.i) {
				l.rt(i), t = l;
				continue;
			}
			let n = Gi[Hi];
			if (-1 === n) {
				if (null !== l.q) {
					t = l, s = -1;
					continue t;
				}
			} else if (n + 2 < l.q.length) {
				t = l, s = n;
				continue t;
			}
			l.i = i, l.j &= -4, t = l;
		}
		return;
	}
}
function yl(t) {
	return null === t || "object" != typeof t ? 3 : "function" == typeof t.then ? 1 : "function" == typeof t[Symbol.asyncIterator] ? 2 : 3;
}
function Zt(t, i, l) {
	i.then((i) => {
		let n = t.deref();
		void 0 === n || 8 & n.j || n.i !== l || (n.j &= -513, dt(n, i));
	}, (i) => {
		let n = t.deref();
		void 0 === n || 8 & n.j || n.i !== l || (n.j |= 512, dt(n, i));
	});
}
function $t(t, i, l) {
	let n = "function" == typeof i[Symbol.asyncIterator] ? i[Symbol.asyncIterator]() : i, s = (i) => {
		let h = t.deref();
		void 0 === h || 8 & h.j || h.i !== l ? "function" == typeof n.return && n.return() : i.done || (n.next().then(s, e), h.j &= -513, dt(h, i.value));
	}, e = (i) => {
		let n = t.deref();
		void 0 === n || 8 & n.j || n.i !== l || (n.j |= 512, dt(n, i));
	};
	n.next().then(s, e);
}
function dt(t, i) {
	if (t.j &= -257, t.j & xl) {
		let i = t.Y.wt;
		t.j |= 788480 & i.j, i.j &= -65;
	}
	(i !== t.N || 512 & t.j) && (t.N = i, t.st = si + 1, t.j & xl ? null !== t.q && Sl(t) : ll(t) && (t.V = t.Y = null), h(t, 1), Et());
}
function Sl(t) {
	let i = hi += 2, l = t.W, n = t.q;
	null !== l && (l.u = i);
	let s = n.length - 2;
	for (; s >= 0;) {
		let t = n[s];
		if (t.u === i) {
			St(t, n[s + 1]);
			let i = n.pop(), l = n.pop();
			s !== n.length && (n[s] = l, n[s + 1] = i, -1 === i ? l.P = s : l.T[i + 1] = s);
		} else t.u = i;
		s -= 2;
	}
}
function ol(t, i) {
	let l = "function" == typeof i[Symbol.asyncIterator] ? i[Symbol.asyncIterator]() : i, n = (i) => {
		let e = t.deref();
		if (void 0 === e || 8 & e.j) "function" == typeof l.return && l.return();
		else if (i.done) {
			if (e.j &= -257, e.j & xl) {
				let t = e.Y.wt;
				e.j |= t.j & W, t.j &= -65;
			}
		} else {
			if (l.next().then(n, s), e.j &= -257, e.j & xl) {
				let t = e.Y.wt;
				e.j |= t.j & W, t.j &= -65;
			}
			"function" == typeof i.value && mt(e, i.value);
		}
	}, s = (i) => {
		let l = t.deref();
		void 0 === l || 8 & l.j || (l.j &= -257, qt(l, i) || l.S());
	};
	l.next().then(n, s);
}
function bt(t) {
	if (ri) {
		ri = !1;
		try {
			ii = hi, t.rt(si), (hl > 0 || fi > 0) && Et();
		} finally {
			ri = !0;
		}
	} else t.rt(si);
}
function vt(t) {
	if (ri) {
		ri = !1;
		try {
			ii = hi, t.rt(si), (hl > 0 || fi > 0) && Et();
		} catch (i) {
			let l = qt(t, i);
			if (t.S(), !l) throw i;
		} finally {
			ri = !0;
		}
	} else try {
		t.rt(si);
	} catch (i) {
		let l = qt(t, i);
		if (t.S(), !l) throw i;
	}
}
function Et() {
	let t = 0, i = 0, l = null, n = !1;
	ri = !1;
	try {
		do {
			if (t = ++si, fi > 0) {
				let t = fi;
				for (let i = 0; i < t; i++) ui[i].S(), ui[i] = null;
				fi = 0;
			}
			if (hl > 0) {
				let t = hl;
				for (let i = 0; i < t; i++) $i[i].ct(ci[i]), $i[i] = ci[i] = null;
				hl = 0;
			}
			if (Ei > 0) {
				let i = pi.length;
				for (let s = 0; s < i; s++) {
					let i = pi[s], e = di[s];
					for (let s = 0; s < i; s++) {
						let i = e[s];
						if (1 & i.j || 2 & i.j && rl(i, t)) try {
							ii = hi, i.rt(t);
						} catch (t) {
							n || qt(i, t) || (l = t, n = !0), i.S();
						}
						else i.j &= -4;
						e[s] = null;
					}
					pi[s] = 0;
				}
				Ei = 0;
			}
			if (qi > 0) {
				let i = qi;
				for (let s = 0; s < i; s++) {
					let i = vi[s];
					if (vi[s] = null, 1 & i.j || 2 & i.j && rl(i, t)) {
						ii = hi;
						try {
							i.rt(t);
						} catch (t) {
							n || qt(i, t) || (l = t, n = !0), i.S();
						}
					} else i.j &= -4;
				}
				qi = 0;
			}
			if (1e5 === i++) {
				l = Error("Runaway cycle"), n = !0;
				break;
			}
		} while (!n && (hl > 0 || fi > 0));
	} finally {
		if (ri = !0, fi = hl = qi = Ei = 0, n) throw l;
	}
}
function a(t) {
	return new p(t);
}
function f(t, i, l, n) {
	let s = 64 | (0 | l) & C, e = new x(s, t, null, i, n);
	return 2 & dl && jt(pl, e), 1024 & s || bt(e), e;
}
function at(t, i, l, n) {
	let s = 2112 | (0 | l) & C, e = new x(s, t, null, i, n);
	return 2 & dl && jt(pl, e), 1024 & s || bt(e), e;
}
function yt(t, i, l) {
	let n = 2 & dl ? pl : null, s = new z(2112 | (0 | i) & C, t, null, n, l);
	if (n) {
		let t = n.$ + 1;
		n.$ > 2 && t >= pi.length && (pi.push(0), di.push([])), s.$ = t, jt(n, s);
	}
	return vt(s), s;
}
function n(t) {
	if (ri) {
		ri = !1;
		try {
			t(), Et();
		} finally {
			ri = !0;
		}
	} else t();
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
//#region bench/reactivity/anod.js
let sink = 0;
let counter = 0;
const fib = (n) => {
	if (n < 2) return 1;
	return fib(n - 1) + fib(n - 2);
};
const hard = (n, _log) => n + fib(16);
function setupDeep() {
	const len = 50;
	const head = a(0);
	let current = head;
	for (let i = 0; i < len; i++) current = current.derive((v) => {
		counter++;
		return v + 1;
	});
	current.watch((v) => {
		counter++;
		sink += v;
	});
	let i = 0;
	return () => {
		head.set(++i);
	};
}
function setupBroad() {
	const head = a(0);
	for (let i = 0; i < 50; i++) head.derive((v) => {
		counter++;
		return v + i;
	}).derive((v) => {
		counter++;
		return v + 1;
	}).watch((v) => {
		counter++;
		sink += v;
	});
	let i = 0;
	return () => {
		head.set(++i);
	};
}
function setupDiamond() {
	const width = 5;
	const head = a(0);
	const branches = [];
	for (let i = 0; i < width; i++) branches.push(head.derive((v) => {
		counter++;
		return v + 1;
	}));
	at(() => {
		counter++;
		return branches.reduce((a, b) => a + b.val(), 0);
	}).watch((v) => {
		counter++;
		sink += v;
	});
	let i = 0;
	return () => {
		head.set(++i);
	};
}
function setupTriangle() {
	const width = 10;
	const head = a(0);
	let current = head;
	const list = [];
	for (let i = 0; i < width - 1; i++) {
		list.push(current);
		current = current.derive((v) => {
			counter++;
			return v + 1;
		});
	}
	list.push(current);
	at(() => {
		counter++;
		return list.reduce((a, b) => a + b.val(), 0);
	}).watch((v) => {
		counter++;
		sink += v;
	});
	let i = 0;
	return () => {
		head.set(++i);
	};
}
function setupMux() {
	const heads = new Array(100).fill(null).map(() => a(0));
	const mux = at(() => {
		counter++;
		return heads.map((h) => h.val());
	});
	const split = heads.map((_, index) => mux.derive((v) => {
		counter++;
		return v[index];
	})).map((x) => x.derive((v) => {
		counter++;
		return v + 1;
	}));
	for (const x of split) x.watch((v) => {
		counter++;
		sink += v;
	});
	let i = 0;
	return () => {
		heads[i % heads.length].set(++i);
	};
}
function setupUnstable() {
	const head = a(0);
	const double = head.derive((v) => {
		counter++;
		return v * 2;
	});
	const inverse = head.derive((v) => {
		counter++;
		return -v;
	});
	f(() => {
		counter++;
		let result = 0;
		for (let i = 0; i < 20; i++) result += head.val() % 2 ? double.val() : inverse.val();
		return result;
	}).watch((v) => {
		counter++;
		sink += v;
	});
	let i = 0;
	return () => {
		head.set(++i);
	};
}
function setupAvoidable() {
	const head = a(0);
	head.derive((v) => {
		counter++;
		return v;
	}).derive((v) => {
		counter++;
		return 0;
	}).derive((v) => {
		counter++;
		return v + 1;
	}).derive((v) => {
		counter++;
		return v + 2;
	}).derive((v) => {
		counter++;
		return v + 3;
	}).watch((v) => {
		counter++;
		sink += v;
	});
	let i = 0;
	return () => {
		head.set(++i);
	};
}
function setupRepeatedObservers() {
	const size = 30;
	const head = a(0);
	at(() => {
		counter++;
		let result = 0;
		for (let i = 0; i < size; i++) result += head.val();
		return result;
	}).watch((v) => {
		counter++;
		sink += v;
	});
	let i = 0;
	return () => {
		head.set(++i);
	};
}
function setupCellx(layers) {
	const start = {
		prop1: a(1),
		prop2: a(2),
		prop3: a(3),
		prop4: a(4)
	};
	let layer = start;
	for (let i = layers; i > 0; i--) {
		const m = layer;
		const s = {
			prop1: m.prop2.derive((v) => {
				counter++;
				return v;
			}),
			prop2: at(() => {
				counter++;
				return m.prop1.val() - m.prop3.val();
			}),
			prop3: at(() => {
				counter++;
				return m.prop2.val() + m.prop4.val();
			}),
			prop4: m.prop3.derive((v) => {
				counter++;
				return v;
			})
		};
		s.prop1.watch((v) => {
			counter++;
			sink += v;
		});
		s.prop2.watch((v) => {
			counter++;
			sink += v;
		});
		s.prop3.watch((v) => {
			counter++;
			sink += v;
		});
		s.prop4.watch((v) => {
			counter++;
			sink += v;
		});
		s.prop1.watch((v) => {
			counter++;
			sink += v;
		});
		s.prop2.watch((v) => {
			counter++;
			sink += v;
		});
		s.prop3.watch((v) => {
			counter++;
			sink += v;
		});
		s.prop4.watch((v) => {
			counter++;
			sink += v;
		});
		layer = s;
	}
	const end = layer;
	let toggle = false;
	return () => {
		toggle = !toggle;
		n(() => {
			start.prop1.set(toggle ? 4 : 1);
			start.prop2.set(toggle ? 3 : 2);
			start.prop3.set(toggle ? 2 : 3);
			start.prop4.set(toggle ? 1 : 4);
		});
		end.prop1.val();
		end.prop2.val();
		end.prop3.val();
		end.prop4.val();
	};
}
function setupMolWire() {
	const numbers = Array.from({ length: 5 }, (_, i) => i);
	const A = a(0);
	const B = a(0);
	const C = at(() => {
		counter++;
		return A.val() % 2 + B.val() % 2;
	});
	const D = at(() => {
		counter++;
		return numbers.map((i) => ({ x: i + A.val() % 2 - B.val() % 2 }));
	});
	const E = at(() => {
		counter++;
		return hard(C.val() + A.val() + D.val()[0].x, "E");
	});
	const F = f(() => {
		counter++;
		return hard(D.val()[2].x || B.val(), "F");
	});
	const G = f(() => {
		counter++;
		return C.val() + (C.val() || E.val() % 2) + D.val()[4].x + F.val();
	});
	yt(() => {
		counter++;
		sink += hard(G.val(), "H");
	});
	yt(() => {
		counter++;
		sink += G.val();
	});
	yt(() => {
		counter++;
		sink += hard(F.val(), "J");
	});
	let i = 0;
	return () => {
		i++;
		n(() => {
			B.set(1);
			A.set(1 + i * 2);
		});
		n(() => {
			A.set(2 + i * 2);
			B.set(2);
		});
	};
}
function benchCreateSignals(count) {
	return () => {
		let signals = [];
		for (let i = 0; i < count; i++) signals[i] = a(i);
		return signals;
	};
}
function benchCreateComputations(count) {
	return () => {
		const src = a(0);
		for (let i = 0; i < count; i++) {
			const comp = at(() => {
				counter++;
				return src.val();
			});
			yt(() => {
				counter++;
				sink += comp.val();
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
* Static nodes use derive() (stable). Dynamic nodes use compute() for conditional reads.
* @param {number} width
* @param {number} totalLayers
* @param {number} staticFraction - fraction of static nodes [0, 1]
* @param {number} nSources
*/
function makeDynGraph(width, totalLayers, staticFraction, nSources) {
	const sources = new Array(width);
	for (let i = 0; i < width; i++) sources[i] = a(i);
	const random = pseudoRandom("seed");
	let prevRow = sources;
	const layers = [];
	for (let l = 0; l < totalLayers - 1; l++) {
		const row = new Array(width);
		for (let myDex = 0; myDex < width; myDex++) {
			const mySources = new Array(nSources);
			for (let s = 0; s < nSources; s++) mySources[s] = prevRow[(myDex + s) % width];
			if (random() < staticFraction) row[myDex] = at(() => {
				counter++;
				let sum = 0;
				for (let s = 0; s < mySources.length; s++) sum += mySources[s].val();
				return sum;
			});
			else {
				const first = mySources[0];
				const tail = mySources.slice(1);
				row[myDex] = f(() => {
					counter++;
					let sum = first.val();
					const shouldDrop = sum & 1;
					const dropDex = sum % tail.length;
					for (let i = 0; i < tail.length; i++) {
						if (shouldDrop && i === dropDex) continue;
						sum += tail[i].val();
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
		for (let r = 0; r < leaves.length; r++) sink += leaves[r].val();
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
	for (let r = 0; r < leaves.length; r++) sink += leaves[r].val();
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
		for (let r = 0; r < readLen; r++) sink += readLeaves[r].val();
	};
}
/**
* Run each benchmark once and verify the counter matches the expected value.
* Uses OVERRIDES_ANOD for push-model differences (unstable, molWire).
*/
function validate(name, setupFn) {
	const expected = OVERRIDES_ANOD[name] ?? EXPECTED[name];
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
saveRun("anod", await run());
//#endregion
