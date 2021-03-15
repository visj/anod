//#region 1. Core reactivity library
	//#region 1.1 Type definitions
	//#endregion
	//#region 1.2 Public API
	function data(val) {
		var node = new Data(val);
		return function (next) {
			return arguments.length === 0 ? node.get() : node.set(next);
		};
	}
	function value(val, eq) {
		var node = new Value(val, eq);
		return function (next) {
			return arguments.length === 0 ? node.get() : node.set(next);
		};
	}
	function run(f, seed, flags, dispose) {
		var node = new Computation(Log());
		Computation.setup(node, f, seed, 32 | flags, dispose);
		return function () { return node.get(); }
	}
	function tie(src, f, seed, flags, dispose) {
		var node = new Computation(Log());
		if (flags & 4) {
			if (flags & 1) {
				logSource(node, src);
			}
			seed = Computation.setup(node, function (seed) {
				logSource(node, src);
				return f(seed);
			}, seed, 16 | flags, dispose);
		} else {
			logSource(node, src);
			seed = Computation.setup(node, f, seed, 16 | flags, dispose);
		}
		return function () { return node.get(); }
	}
	function fn(f, seed, flags, dispose) {
		Computation.setup(new Computation(), f, seed, 32 | flags, dispose);
	}
	function on(src, f, seed, flags, dispose) {
		var node = new Computation(null);
		if (flags & 4) {
			if (flags & 1) {
				logSource(node, src);
			}
			Computation.setup(node, function (seed) {
				logSource(node, src);
				return f(seed);
			}, seed, 16 | flags, dispose);
		} else {
			logSource(node, src);
			Computation.setup(node, f, seed, 16 | flags, dispose);
		}
	}
	function cleanup(f) {
		var owner = Owner, cleanups;
		if (owner !== null) {
			cleanups = owner.cleanups;
			if (cleanups === null) {
				owner.cleanups = [f];
			} else {
				cleanups[cleanups.length] = f;
			}
		}
	}
	function freeze(f) {
		var val;
		if (State !== 1) {
			val = f();
		} else {
			Root.changes.len = 0;
			State = 2;
			try {
				val = f();
				execute();
			} finally {
				State = 1;
			}
		}
		return val;
	}
	function root(node, f) {
		var val,
			owner = Owner,
			listener = Listener;
		if (typeof node === 'function') {
			f = node;
			node = new Computation();
		}
		Owner = node;
		Listener = null;
		try {
			val = f();
		} finally {
			Owner = owner;
			Listener = listener;
		}
		sealNode(node, null, void 0, val, 0);
		return node;
	}
	function sample(node) {
		var listener = Listener;
		try {
			Listener = null;
			return typeof node === 'function' ? node() : node.get();
		} finally {
			Listener = listener;
		}
	}
	//#endregion
	//#region 1.3 Object implementations
	//#region 1.3.1 Data
	function Data(val) {
		this.val = val;
		this.log = Log();
		this.flag = 0;
		this.pval = Void;
	}
	Data.prototype.get = function () {
		if (Listener !== null) {
			logRead(this, Listener);
		}
		return this.val;
	}
	Data.prototype.set = function (val) {
		return logWrite(this, val);
	}
	Data.prototype.update = function () {
		this.val = this.pval;
		this.pval = Void;
		if (this.flag & 512) {
			setComputationsStale(this.log, Root.time);
		}
	}
	//#endregion
	//#region 1.3.2 Value
	function Value(val, eq) {
		Data.call(this, val);
		this.eq = eq;
	}
	Value.prototype.get = function () {
		if (Listener !== null) {
			logRead(this, Listener);
		}
		return this.val;
	}
	Value.prototype.set = function (val) {
		return (this.eq ? this.eq(this.val, val) : this.val === val) ? val : logWrite(this, val);
	}
	Value.prototype.update = function () {
		this.val = this.pval;
		this.pval = Void;
		if (this.flag & 512) {
			setComputationsStale(this.log, Root.time);
		}
	}
	//#endregion
	//#region 1.3.3 Computation
	function Computation(log) {
		this.val = void 0;
		this.log = log;
		this.flag = 0;
		this.fn = null;
		this.age = -1;
		this.source1 = null;
		this.slot1 = -1;
		this.sources = null;
		this.slots = null;
		this.owner = null;
		this.traces = null;
		this.owned = null;
		this.cleanups = null;
		this.disposer = null;
	}
	Computation.setup = function (node, f, seed, flags, dispose) {
		var clock = Root,
			owner = Owner;
		seed = setupNode(node, f, seed, flags);
		sealNode(node, owner, f, seed, flags, dispose);
		if (State === 1) {
			finishToplevelExecution(clock);
		}
		return seed;
	}
	Computation.prototype.get = function () {
		if (Listener !== null) {
			var flag = this.flag;
			if (flag & 2048) {
				if (State === 8) {
					applyUpstreamUpdates(this);
				}
			}
			if (this.age === Root.time) {
				if (flag & 128) {
					throw new Error('Circular dependency');
				} else if (flag & 64) {
					this.update();
				}
			}
			logRead(this, Listener);
		}
		return this.val;
	}
	Computation.prototype.update = function () {
		var owner = Owner,
			listener = Listener,
			flag = this.flag,
			val = this.val;
		cleanupNode(this, false);
		Owner = this;
		if (flag & 32) {
			if (flag & 8) {
				Listener = null;
			} else {
				Listener = this;
			}
		} else {
			Listener = null;
		}
		this.flag &= ~64;
		this.flag |= 128;
		this.val = this.fn(val);
		if ((flag & 514) === 514) {
			if (val !== this.val) {
				setComputationsStale(this.log, Root.time);
			}
		}
		this.flag &= ~128;
		Owner = owner;
		Listener = listener;
	}
	Computation.prototype.dispose = function () {
		if (State & 33) {
			this.fn = null;
			this.log = null;
			cleanupNode(this, true);
		} else {
			Root.disposes.items[Root.disposes.len++] = this;
		}
	}
	//#endregion
	//#endregion
	//#region 1.4 System variablesconstants
	//#region 1.4.1 Enums
	var Flag = {
		Wait: 1,
		Trace: 2,
		Dynamic: 4,
		Static: 8,
	};
	//#endregion
	//#region 1.4.2 Variables
	var Void = {};
	var Root = Clock();
	var State = 1;
	var Owner = null;
	var Listener = null;
	//#endregion
	//#endregion
	//#region 1.5 Internal functionality
	function Queue() {
		return { len: 0, items: [] };
	}
	function Clock() {
		return { time: 0, changes: Queue(), traces: Queue(), updates: Queue(), disposes: Queue() };
	}
	function Log() {
		return { node1: null, slot1: -1, nodes: null, slots: null };
	}
	function setupNode(node, fn, seed, flags) {
		var clock = Root,
			owner = Owner,
			listener = Listener,
			toplevel = State === 1;
		Owner = node;
		Listener = flags & 16 ? null : node;
		if (toplevel) {
			clock.changes.len = 0;
			clock.updates.len = 0;
			try {
				State = 2;
				seed = flags & 1 ? seed : fn(seed);
			} finally {
				State = 1;
				Owner = Listener = null;
			}
		} else {
			seed = fn(seed);
		}
		Owner = owner;
		Listener = listener;
		return seed;
	}
	function sealNode(node, owner, fn, val, flags, dispose) {
		node.fn = fn;
		node.val = val;
		node.flag |= flags;
		node.age = Root.time;
		if (dispose !== void 0) {
			node.disposer = dispose;
		}
		if (owner !== null) {
			if (owner.owned === null) {
				owner.owned = [node];
			} else {
				owner.owned[owner.owned.length] = node;
			}
			if (owner.flag & 2050) {
				logPendingOwner(owner);
			}
		}
	}
	function finishToplevelExecution(clock) {
		if (clock.changes.len > 0 || clock.updates.len > 0) {
			try {
				tick(clock);
			} finally {
				State = 1;
			}
		}
	}
	function logRead(from, to) {
		var fromslot, toslot,
			log = from.log;
		to.flag |= 1024;
		from.flag |= 512;
		toslot = to.source1 === null ? -1 : to.sources === null ? 0 : to.sources.length;
		if (log.node1 === null) {
			log.node1 = to;
			log.slot1 = toslot;
			fromslot = -1;
		} else if (log.nodes === null) {
			log.nodes = [to];
			log.slots = [toslot];
			fromslot = 0;
		} else {
			fromslot = log.nodes.length;
			log.nodes[fromslot] = to;
			log.slots[fromslot] = toslot;
		}
		if (to.source1 === null) {
			to.source1 = from;
			to.slot1 = fromslot;
		} else if (to.sources === null) {
			to.sources = [from];
			to.slots = [fromslot];
		} else {
			to.sources[toslot] = from;
			to.slots[toslot] = fromslot;
		}
		if (from.flag & 2050) {
			if (to.flag & 2048) {
				if (to.traces === null) {
					to.traces = [toslot];
				} else {
					to.traces[to.traces.length] = toslot;
				}
			} else {
				to.flag |= 2;
				logPendingSource(to, toslot);
			}
		}
	}
	function logWrite(node, val) {
		var changes = Root.changes;
		if (State !== 1) {
			if (node.pval !== Void) {
				if (val !== node.pval) {
					throw new Error('Conflicting changes');
				}
			} else {
				node.pval = val;
				changes.items[changes.len++] = node;
			}
		} else {
			if (node.flag & 512) {
				node.pval = val;
				changes.items[changes.len++] = node;
				execute();
			} else {
				node.val = val;
			}
		}
		return val;
	}
	function logSource(node, src) {
		var s,
			listener = Listener;
		try {
			Listener = node;
			if (Array.isArray(src)) {
				for (var i = 0, len = src.length; i < len; i++) {
					s = src[i];
					typeof s === 'function' ? s() : s.get();
				}
			} else {
				typeof src === 'function' ? src() : src.get();
			}
		} finally {
			Listener = listener;
		}
	}
	function logPendingSource(to, slot) {
		var i, len, log, node, nodes;
		if (to.traces === null) {
			to.traces = [slot];
		} else {
			to.traces[to.traces.length] = slot;
		}
		log = to.log;
		if (log !== null) {
			node = log.node1;
			nodes = log.nodes;
			if (node !== null) {
				node.flag |= 2048;
				logPendingSource(node, -1);
			}
			if (nodes !== null) {
				for (i = 0, len = nodes.length; i < len; i++) {
					node = nodes[i];
					node.flag |= 2048;
					logPendingSource(node, i);
				}
			}
		}
		if (to.owned !== null) {
			logPendingOwner(to);
		}
	}
	function logPendingOwner(owner) {
		var i, node,
			owned = owner.owned,
			len = owned.length;
		for (i = 0; i < len; i++) {
			node = owned[i];
			node.owner = owner;
			node.flag |= 2048;
			if (node.owned !== null) {
				logPendingOwner(node);
			}
		}
	}
	function execute() {
		var owner = Owner;
		Root.updates.len = 0;
		try {
			tick(Root);
		} finally {
			Owner = owner;
			Listener = null;
			State = 1;
		}
	}
	function tick(clock) {
		var j, queue, node,
			i = 0;
		clock.disposes.len = 0;
		do {
			clock.time++;
			queue = clock.changes;
			State = 4;
			for (j = 0; j < queue.len; j++) {
				queue.items[j].update();
			}
			queue.len = 0;
			queue = clock.traces;
			State = 8;
			for (j = 0; j < queue.len; j++) {
				node = queue.items[j];
				if (node.flag & 64) {
					node.update();
				}
			}
			queue.len = 0;
			queue = clock.updates;
			State = 16;
			for (j = 0; j < queue.len; j++) {
				node = queue.items[j];
				if (node.flag & 64) {
					node.update();
				}
			}
			queue.len = 0;
			queue = clock.disposes;
			State = 32;
			for (j = 0; j < queue.len; j++) {
				node = queue.items[j];
				node.fn = null;
				node.log = null;
				cleanupNode(node, true);
			}
			queue.len = 0;
			if (i++ > 1e5) {
				throw new Error('Runaway clock');
			}
		} while (clock.changes.len !== 0 || clock.updates.len !== 0 || clock.disposes.len !== 0);
		State = 1;
	}
	function setComputationsStale(log, time) {
		var node = log.node1,
			nodes = log.nodes;
		if (node !== null) {
			if (node.age < time) {
				setComputationStale(node, time);
			}
		}
		if (nodes !== null) {
			for (var i = 0, len = nodes.length; i < len; i++) {
				node = nodes[i];
				if (node.age < time) {
					setComputationStale(node, time);
				}
			}
		}
	}
	function setComputationStale(node, time) {
		var q = node.flag & 2 ? Root.traces : Root.updates;
		q.items[q.len++] = node;
		node.age = time;
		node.flag |= 64;
		if (node.owned !== null) {
			markComputationsDisposed(node.owned, time);
		}
		if ((node.flag & 514) === 512) {
			setComputationsStale(node.log, time);
		}
	}
	function markComputationsDisposed(nodes, time) {
		var node, i, len;
		for (i = 0, len = nodes.length; i < len; i++) {
			node = nodes[i];
			if (!(node.flag & 256)) {
				node.age = time;
				node.flag &= ~64;
				node.flag |= 256;
				if (node.owned !== null) {
					markComputationsDisposed(node.owned, time);
				}
			}
		}
	}
	function applyUpstreamUpdates(node) {
		var i, len, slot,
			source, sources,
			owner = node.owner,
			traces = node.traces;
		if (owner !== null) {
			applyUpstreamUpdates(owner);
		}
		if (!(node.flag & 256)) {
			if (traces !== null) {
				sources = node.sources;
				for (i = 0, len = traces.length; i < len; i++) {
					slot = traces[i];
					source = slot === -1 ? node.source1 : sources[slot];
					if (source.flag & 2050) {
						applyUpstreamUpdates(source);
					}
					if (source.flag & 64) {
						source.update();
					}
				}
			}
			if (node.flag & 64) {
				node.update();
			}
		}
	}
	function cleanupNode(node, final) {
		var i, len,
			flag = node.flag,
			owned = node.owned,
			cleanups = node.cleanups;
		if (cleanups !== null) {
			for (i = 0, len = cleanups.length; i < len; i++) {
				cleanups[i]();
			}
			cleanups.length = 0;
		}
		if (final) {
			if (node.disposer !== null) {
				node.disposer();
				node.disposer = null;
			}
		}
		if (owned !== null) {
			for (i = 0, len = owned.length; i < len; i++) {
				owned[i].dispose();
			}
			owned.length = 0;
		}
		if (
			final ||
			(flag & 12) === 4 ||
			(flag & 44) === 32
		) {
			cleanupSources(node);
		}
	}
	function cleanupSources(node) {
		var i, len, sources, slots;
		if (node.flag & 1024) {
			if (node.source1 !== null) {
				cleanupSource(node.source1, node.slot1);
				node.source1 = null;
			}
			sources = node.sources;
			if (sources !== null) {
				slots = node.slots;
				for (i = 0, len = sources.length; i < len; i++) {
					cleanupSource(sources.pop(), slots.pop());
				}
			}
		}
		node.traces = null;
		node.flag &= ~1024;
	}
	function cleanupSource(source, slot) {
		var last, lastslot,
			nodes, slots,
			log = source.log;
		if (slot === -1) {
			log.node1 = null;
		} else {
			nodes = log.nodes;
			slots = log.slots;
			last = nodes.pop();
			lastslot = slots.pop();
			if (slot !== nodes.length) {
				nodes[slot] = last;
				slots[slot] = lastslot;
				if (lastslot === -1) {
					last.slot1 = slot;
				} else {
					last.slots[lastslot] = slot;
				}
			}
		}
	}
	//#endregion
	//#endregion
	//#region 2. Array reactivity library
	//#region 2.1 Type definitions
	//#endregion
	//#region 2.2 Public API
	 function array(val) {
		return new List(val);
	}
	//#endregion
	//#region 2.3 Object implementations
	//#region 2.3.1 IEnumerable
	 function IEnumerable(prototype) {
		prototype.mut = function () {
			return this.cs;
		}
		prototype.every = function (callback) {
			var src = this,
				pure = callback.length === 1;
			return tie(src, function (seed) {
				var i, ilen, j, jlen, c,
					cs = src.cs,
					items = src.get(),
					len = items.length;
				if (seed !== Void && pure && cs !== null) {
					if (src.flag & 4096) {
						if (seed) {
							if (cs.type & 32) {
								if (cs.type & 4) {
									for (i = 0, ilen = cs.value.length; i < ilen; i++) {
										if (!callback(cs.value[i])) {
											return false;
										}
									}
									return true;
								} else {
									return callback(cs.value);
								}
							} else {
								return true;
							}
						} else {
							if (cs.type & 160) {
								return false;
							}
						}
					} else {
						scope: {
							for (i = 0, ilen = cs.length; i < ilen; i++) {
								c = cs[i];
								if (seed) {
									if (c.type & 32) {
										if (c.type & 4) {
											for (j = 0, jlen = c.value.length; j < jlen; j++) {
												if (!callback(c.value[j])) {
													return false;
												}
											}
										} else {
											if (!callback(c.value)) {
												return false;
											}
										}
									}
								} else {
									if (c.type & 64) {
										break scope;
									}
								}
							}
							return true;
						}
					}
				}
				for (i = 0; i < len; i++) {
					if (!callback(items[i], i)) {
						return false;
					}
				}
				return true;
			}, Void, 2);
		}
		prototype.filter = function (callback) {
			var src = this,
				k = null,
				node = new Enumerable(),
				pure = callback.length === 1;
			return Enumerable.setup(node, src, function (seed) {
				var i, j, n, m, item,
					mut, mut, found,
					cs = src.cs,
					items = src.get(),
					len = items.length;
				if (seed === Void) {
					k = new Array(len);
					seed = new Array(len);
				} else if (pure && cs !== null) {
					mut = cs.type & 524032;
					if (mut & 291) {
						i = cs.i1;
						item = cs.value;
						found = callback(item);
						if (found) {
							if (seed.length > 0) {
								for (j = i, n = k.length; j < n; j++) {
									m = k[j];
									if (m !== -1) {
										seed.splice(m, 0, item);
										break;
									}
								}
								k.splice(i, 0, m);
							} else {
								n = seed.length;
								seed[n] = item;
								k.splice(i, 0, n);
							}
							node.flag |= 8192;
							for (i++; i < len; i++) {
								if (k[i] !== -1) {
									k[i]++;
								}
							}
						} else {
							k.splice(i, 0, -1);
							node.flag &= ~8192;
						}
					} else if (mut & 551) {
					} else if (mut & 1153) {
					} else if (mut & 4146) {
						found = callback(cs.value);
						i = seed.length;
						k[k.length] = found ? i : -1;
						if (found) {
							seed[i] = cs.value;
							node.flag |= 8192;
						} else {
							node.flag &= ~8192;
						}
					} else if (mut & 2128) {
						i = k[i];
						k.pop();
						if (i !== -1) {
							seed.pop();
							node.flag |= 8192;
						} else {
							node.flag &= ~8192;
						}
					} else if (mut & 8257) {
						i = cs.i1;
						j = k[i];
						if (j !== -1) {
							removeAt(k, k.length, i);
							for (i++; i < len; i++) {
								if (k[i] !== -1) {
									k[i]--;
								}
							}
							removeAt(seed, seed.length, j);
							node.flag |= 8192;
						} else {
							node.flag &= ~8192;
						}
					} else if (mut & 16453) {
						i = cs.i1;
						j = cs.i2;
						n = 0;
						for (; j >= 0; i++, j--) {
							if (k[i] !== -1) {
								n++;
								k[i] = -1;
							}
						}
						if (n > 0) {
							for (i = cs.i1; i < len; i++) {
								if (k[i] !== -1) {
									k[i] -= n;
								}
							}
							seed.splice(cs.i1, n);
							node.flag |= 8192;
						} else {
							node.flag &= ~8192;
						}
					} else if (mut & 32867) {
						i = cs.i1;
						j = k[i];
						if (j !== -1) {
							seed[j] = cs.value;
							node.flag |= 8192;
						} else {
							node.flag &= 8192;
						}
					} else if (mut & 65608) {
						j = k[0];
						k.shift();
						for (i = 1; i < len; i++) {
							if (k[i] !== -1) {
								k[i]--;
							}
						}
						if (j !== -1) {
							seed.shift();
							node.flag |= 8192;
						} else {
							node.flag &= ~8192;
						}
					} else if (mut & 131201) {
					} else if (mut & 262186) {
						found = callback(cs.value);
						k.unshift(found ? 0 : -1);
						for (i = 1; i < len; i++) {
							if (k[i] !== -1) {
								k[i]++;
							}
						}
						if (found) {
							seed.unshift(cs.value);
							node.flag |= 8192;
						} else {
							node.flag &= ~8192;
						}
					}
					return seed;
				}
				found = false;
				for (i = 0, j = 0; i < len; i++) {
					item = items[i];
					if (callback(item, i)) {
						if (k[i] !== j) {
							found = true;
							k[i] = j;
							seed[j] = item;
						}
						j++;
					} else {
						if (k[i] !== j) {
							found = true;
							k[i] = -1;
						}
					}
				}
				k.length = len;
				seed.length = j;
				if (found) {
					node.flag |= 8192;
				} else {
					node.flag &= ~8192;
				}
				return seed;
			});
		}
		prototype.find = function (callback) {
			var src = this,
				i = -1,
				pure = callback.length === 1;
			return tie(src, function (seed) {
				var item,
					cs = src.cs,
					items = src.get(),
					len = items.length;
				if (pure && seed !== Void && cs !== null) {
					i = indexOf(src.flag, cs, callback, true, i, items.length, false);
					if (i !== -2) {
						return i < 0 ? void 0 : items[i];
					}
				}
				for (i = 0; i < len; i++) {
					item = items[i];
					if (callback(item, i)) {
						return item;
					}
				}
				i = -1;
				return void 0;
			}, Void, 2);
		}
		prototype.findIndex = function (callback, index) {
			var src = this,
				index = -1,
				pure = callback.length === 1 && arguments.length === 1;
			return tie(src, function (seed) {
				var i, cs,
					items = src.get(),
					len = items.length;
				if (pure && seed !== Void) {
					cs = src.cs;
					if (cs !== null) {
						i = indexOf(src.flag, cs, callback, true, index, items.length, false);
						if (i !== -2) {
							return index = i;
						}
					}
				}
				for (i = 0; i < len; i++) {
					if (callback(items[i], i)) {
						return index = i;
					}
				}
				return index = -1;
			}, Void, 2);
		}
		prototype.forEach = function (callback) {
			var src = this,
				node = new Enumerable(),
				c = [],
				clen = 0,
				roots = [];
			cleanup(function () {
				for (var i = 0; i < len; i++) {
					roots[i].dispose();
				}
			});
			Enumerable.setup(node, src, function (seed) {
				var i, j, cs, loop,
					temps, found,
					cmin, cmax, umin, umax, ulen,
					smin, smax, temp,
					u = src.get(),
					ulen = u.length,
					remap = seed !== Void,
					mapper = function () {
						callback(u[j], j);
					}
				cs = src.cs;
				if (remap && cs !== null) {
					if (src.flag & 4096) {
						node.flag |= 4096;
						node.cs = applyMapMutation(callback, c, null, roots, clen, cs);
					} else {
						node.flag &= ~4096;
						j = cs.length;
						node.cs = new Array(j);
						for (i = 0; i < j; i++) {
							node.cs[i] = cs = applyMapMutation(callback, c, null, roots, clen, cs[i]);
						}
					}
				} else {
					node.cs = null;
					umax = u.length - 1;
					if (umax < 0) {
						if (clen > 0) {
							for (i = 0; i < clen; i++) {
								roots[i].dispose();
							}
						}
					} else if (clen === 0) {
						for (j = 0; j <= umax; j++) {
							c[j] = u[j];
							roots[j] = root(mapper);
						}
					} else {
						loop = true;
						temps = new Array(umax);
						found = new Array(umax);
						cmin = 0;
						umin = 0;
						cmax = clen - 1;
						patch: for (; loop;) {
							loop = false;
							for (; c[cmin] === u[umin]; cmin++, umin++) {
								if (cmin > cmax || umin > umax) {
									break patch;
								}
							}
							for (; c[cmax] === u[umax]; cmax--, umax--) {
								temp = roots[cmax];
								found[umax] = true;
								temps[umax] = temp;
								if (cmin > cmax || umin > umax) {
									break patch;
								}
							}
							for (; c[cmax] === u[umin]; cmax--, umin++) {
								temp = roots[cmax];
								temp[umin] = true;
								temp[umin] = temp;
								seed[umin] = temp.val;
								if (cmin > cmax || umin > umax) {
									break patch;
								}
								loop = true;
							}
							for (; c[cmin] === u[umax]; cmin++, umax--) {
								temp = roots[cmin];
								temp[umax] = true;
								temp[umax] = temp;
								if (cmin > cmax || umin > umax) {
									break patch;
								}
								loop = true;
							}
						}
						if (umin > umax) {
							for (; cmin < cmax; cmax--) {
								roots[cmin].dispose();
							}
						} else if (cmin > cmax) {
							for (j = umin; j <= umax; j++) {
								c[j] = u[j];
								roots[j] = root(mapper);
							}
						} else {
							smin = umin;
							smax = umax;
							outer: for (i = cmin; i <= cmax; i++) {
								for (j = umin; j <= umax; j++) {
									if (c[i] === u[j]) {
										found[j] = true;
										temps[j] = roots[i];
										for (j = umin; j < umax && found[j]; j++, umin++) { }
										for (j = umax; j > umin && found[j]; j--, umax--) { }
										continue outer;
									}
								}
								roots[i].dispose();
							}
							for (j = smin; j <= smax; j++) {
								if (found[j]) {
									temp = temps[j];
									roots[j] = temp;
								} else {
									c[j] = u[j];
									roots[j] = root(mapper);
								}
							}
						}
					}
				}
				clen = c.length = roots.length = ulen;
			});
		}
		prototype.includes = function (valueToFind, fromIndex) {
			var src = this,
				i = -1,
				pure = arguments.length === 1;
			return tie(src, function (seed) {
				var cs = src.cs,
					items = src.get(),
					len = items.length;
				if (pure && seed !== Void && cs !== null) {
					i = indexOf(src.flag, cs, valueToFind, false, seed, i, items.length, false);
					if (i !== -2) {
						return i !== -1;
					}
				}
				for (i = fromIndex === void 0 ? 0 : fromIndex; i < len; i++) {
					if (valueToFind === items[i]) {
						return true;
					}
				}
				i = -1;
				return false;
			}, Void, 2);
		}
		prototype.indexOf = function (searchElement, fromIndex) {
			var src = this,
				i = -1,
				pure = arguments.length === 1;
			return tie(src, function (seed) {
				var cs = src.cs,
					items = src.get(),
					len = items.length;
				if (pure && seed !== Void && cs !== null) {
					i = indexOf(src.flag, cs, searchElement, false, i, items.length, false);
					if (i !== -2) {
						return i;
					}
				}
				for (i = fromIndex === void 0 ? 0 : fromIndex; i < len; i++) {
					item = items[i];
					if (searchElement === items[i]) {
						return i;
					}
				}
				return -1;
			}, Void, 2);
		}
		prototype.join = function (separator) {
			var src = this;
			return tie(src, function () {
				return src.get().join(separator);
			}, void 0, 2);
		}
		prototype.lastIndexOf = function (searchElement, fromIndex) {
			var src = this,
				i = -1,
				pure = arguments.length === 1;
			return tie(src, function (seed) {
				var cs;
				var items = src.get();
				if (pure && seed !== Void) {
					cs = src.cs;
					if (cs !== null) {
						i = indexOf(src.flag, cs, searchElement, false, i, items.length, true);
						if (i !== -2) {
							return i;
						}
					}
				}
				for (i = fromIndex === void 0 ? items.length - 1 : fromIndex; i >= 0; i--) {
					if (searchElement === items[i]) {
						return i;
					}
				}
				return i = -1;
			}, Void, 2);
		}
		prototype.map = function (callback) {
			var src = this,
				node = new Enumerable(),
				c = [],
				clen = 0,
				roots = [];
			node.roots = roots;
			node.flag |= 8192;
			cleanup(function () {
				for (var i = 0; i < clen; i++) {
					roots[i].dispose();
				}
			});
			return Enumerable.setup(node, src, function (seed) {
				var i, j, cs, loop,
					temps, found,
					cmin, cmax, umin, umax, ulen,
					smin, smax, temp,
					u = src.get(),
					ulen = u.length,
					remap = seed !== Void,
					mapper = function () {
						return seed[j] = callback(u[j], j);
					}
				cs = src.cs;
				if (remap && cs !== null) {
					if (src.flag & 4096) {
						node.flag |= 4096;
						node.cs = applyMapMutation(callback, c, seed, roots, clen, cs);
					} else {
						node.flag &= ~4096;
						j = cs.length;
						node.cs = new Array(j);
						for (i = 0; i < j; i++) {
							node.cs[i] = cs = applyMapMutation(callback, c, seed, roots, clen, cs[i]);
						}
					}
				} else {
					node.cs = null;
					umax = u.length - 1;
					if (!remap) {
						seed = new Array(umax + 1);
					}
					if (umax < 0) {
						if (clen > 0) {
							for (i = 0; i < clen; i++) {
								roots[i].dispose();
							}
						}
					} else if (clen === 0) {
						for (j = 0; j <= umax; j++) {
							c[j] = u[j];
							roots[j] = root(mapper);
						}
					} else {
						loop = true;
						temps = new Array(umax);
						found = new Array(umax);
						cmin = 0;
						umin = 0;
						cmax = clen - 1;
						patch: for (; loop;) {
							loop = false;
							for (; c[cmin] === u[umin]; cmin++, umin++) {
								if (cmin > cmax || umin > umax) {
									break patch;
								}
							}
							for (; c[cmax] === u[umax]; cmax--, umax--) {
								temp = roots[cmax];
								found[umax] = true;
								temps[umax] = temp;
								seed[umax] = temp.val;
								if (cmin > cmax || umin > umax) {
									break patch;
								}
							}
							for (; c[cmax] === u[umin]; cmax--, umin++) {
								temp = roots[cmax];
								temp[umin] = true;
								temp[umin] = temp;
								seed[umin] = temp.val;
								if (cmin > cmax || umin > umax) {
									break patch;
								}
								loop = true;
							}
							for (; c[cmin] === u[umax]; cmin++, umax--) {
								temp = roots[cmin];
								temp[umax] = true;
								temp[umax] = temp;
								seed[umax] = temp.val;
								if (cmin > cmax || umin > umax) {
									break patch;
								}
								loop = true;
							}
						}
						if (umin > umax) {
							for (; cmin < cmax; cmax--) {
								roots[cmin].dispose();
							}
						} else if (cmin > cmax) {
							for (j = umin; j <= umax; j++) {
								c[j] = u[j];
								roots[j] = root(mapper);
							}
						} else {
							smin = umin;
							smax = umax;
							outer: for (i = cmin; i <= cmax; i++) {
								for (j = umin; j <= umax; j++) {
									if (c[i] === u[j]) {
										found[j] = true;
										temps[j] = roots[i];
										for (j = umin; j < umax && found[j]; j++, umin++) { }
										for (j = umax; j > umin && found[j]; j--, umax--) { }
										continue outer;
									}
								}
								roots[i].dispose();
							}
							for (j = smin; j <= smax; j++) {
								if (found[j]) {
									temp = temps[j];
									roots[j] = temp;
									seed[j] = temp.val;
								} else {
									c[j] = u[j];
									roots[j] = root(mapper);
								}
							}
						}
					}
				}
				clen = c.length = seed.length = roots.length = ulen;
				return seed;
			});
		}
		prototype.reduce = function (callback, initialValue) {
			var src = this,
				copy = copyValue(initialValue),
				skip = arguments.length === 1;
			return tie(src, function () {
				var i, len, result;
				var items = src.get();
				if (skip) {
					i = 1;
					result = items[0];
				} else {
					i = 0;
					result = copy();
				}
				for (len = items.length; i < len; i++) {
					result = callback(result, items[i], i);
				}
				return result;
			}, void 0, 2);
		}
		prototype.reduceRight = function (callback, initialValue) {
			var src = this,
				copy = copyValue(initialValue),
				skip = arguments.length === 1;
			return tie(src, function (seed) {
				var i, result,
					items = src.get();
				if (skip) {
					i = items.length - 2;
					result = items[items.length - 1];
				} else {
					i = items.length - 1;
					result = copy();
				}
				for (; i >= 0; i--) {
					result = callback(result, items[i], i);
				}
				return result;
			}, Void, 2);
		}
		prototype.reverse = function () {
			var src = this,
				node = new Enumerable(8192);
			return Enumerable.setup(node, src, function (seed) {
				var i,
					cs = src.cs,
					items = src.get(),
					len = items.length;
				if (seed === Void) {
					seed = new Array(len);
				} else if (cs !== null) {
					if (src.flag & 4096) {
						node.cs = applyReverseMutation(seed, cs);
					} else {
						node.cs = new Array(cs.length);
						for (i = 0, len = cs.length; i < len; i++) {
							node.cs[i] = applyReverseMutation(seed, cs[i]);
						}
					}
					return seed;
				}
				node.cs = null;
				seed.length = items.length;
				for (var i = len - 1, j = 0; i >= 0; i--, j++) {
					seed[j] = items[i];
				}
				return seed;
			});
		}
		prototype.slice = function (start, end) {
			var src = this,
				node = new Enumerable();
			return Enumerable.setup(node, src, function (seed) {
				var i,
					cs = src.cs,
					items = src.get();
				if (start !== void 0) {
					if (start < 0) {
						if (-1 * start < items.length) {
							start = items.length + start;
						} else {
							start = 0;
						}
					} else {
						if (start < items.length) {
							start = start;
						} else {
							start = 0;
						}
					}
				} else {
					start = 0;
				}
				if (end !== void 0) {
					if (end < 0) {
						if (-1 * end < items.length && items.length + end > start) {
							end = items.length + end;
						} else {
							end = items.length;
						}
					} else {
						if (end > start && end < items.length) {
							end = end;
						} else {
							end = items.length;
						}
					}
				} else {
					end = items.length;
				}
				if (seed === Void) {
					seed = new Array(end - start);
				} else if (cs !== null) {
					if (src.flag & 4096) {
					} else {
					}
				}
				node.flag |= 8192;
				seed.length = end - start;
				for (i = 0; start < end; i++, start++) {
					seed[i] = items[start];
				}
				return seed;
			});
		}
		prototype.some = function (callback) {
			var src = this,
				index = -1,
				pure = callback.length === 1;
			return tie(src, function (seed) {
				var i,
					cs = src.cs,
					items = src.get(),
					len = items.length;
				if (pure && seed !== Void && cs !== null) {
					i = indexOf(src.flag, cs, callback, true, index, items.length, false);
					if (i !== -2) {
						return (index = i) !== -1;
					}
				}
				for (i = 0; i < len; i++) {
					if (callback(items[i], i)) {
						index = i;
						return true;
					}
				}
				index = -1;
				return false;
			}, Void, 2);
		}
		prototype.sort = function (compareFunction) {
			var self = this,
				node = new Enumerable(8192);
			return Enumerable.setup(node, this, function (seed) {
				var items = self.get();
				var newItems = items.slice();
				newItems.sort(compareFunction);
				return newItems;
			});
		}
	}
	//#endregion
	//#region 2.3.2 List
	function List(val) {
		Data.call(this, val);
		this.cs = null;
		this.pcs = null;
	}
	IEnumerable(List.prototype);
	List.prototype.get = function () {
		if (Listener !== null) {
			logRead(this, Listener);
		}
		return this.val;
	}
	List.prototype.set = function (next) {
		return logWrite(this, next);
	}
	List.prototype.update = function () {
		var i, len,
			flag = this.flag;
		if (this.pval !== Void) {
			this.val = this.pval;
			this.pval = Void;
			this.cs = null;
		} else {
			this.cs = this.pcs;
			this.pcs = null;
			if (flag & 4096) {
				applyMutation(this.val, this.cs);
			}
			else {
				for (i = 0, len = this.cs.length; i < len; i++) {
					applyMutation(this.val, this.cs[i]);
				}
			}
		}
		if (flag & 512) {
			setComputationsStale(this.log, Root.time);
		}
	}
	List.prototype.insertAt = function (index, item) {
		logMutate(this, { type: 291, i1: index, value: item });
	}
	List.prototype.insertRange = function (index, items) {
		logMutate(this, { type: 551, i1: index, value: items });
	}
	List.prototype.move = function (from, to) {
		logMutate(this, { type: 1153, i1: from, i2: to });
	}
	List.prototype.pop = function () {
		logMutate(this, { type: 2128 });
	}
	List.prototype.push = function (item) {
		logMutate(this, { type: 4146, value: item });
	}
	List.prototype.removeAt = function (index) {
		logMutate(this, { type: 8257, i1: index });
	}
	List.prototype.removeRange = function (index, count) {
		logMutate(this, { type: 16453, i1: index, i2: count });
	}
	List.prototype.replace = function (index, item) {
		logMutate(this, { type: 32867, i1: index, value: item });
	}
	List.prototype.shift = function () {
		logMutate(this, { type: 65608 });
	}
	List.prototype.swap = function (i1, i2) {
		logMutate(this, { type: 131201, i1: i1, i2: i2 });
	}
	List.prototype.unshift = function (item) {
		logMutate(this, { type: 262186, value: item });
	}
	//#endregion
	//#region 2.3.3 Enumerable
	function Enumerable() {
		Computation.call(this, Log());
		this.cs = null;
		this.roots = null;
	}
	IEnumerable(Enumerable.prototype);
	Enumerable.setup = function (node, source, fn) {
		var clock = Root,
			owner = Owner;
		logRead(source, node);
		sealNode(node, owner, fn, setupNode(node, fn, Void, 16), 0);
		if (State === 1) {
			finishToplevelExecution(clock);
		}
		return node;
	}
	Enumerable.prototype.get = function () {
		if (Listener !== null) {
			var flag = this.flag;
			if (flag & 2048) {
				if (State === 8) {
					applyUpstreamUpdates(this);
				}
			}
			if (this.age === Root.time) {
				if (flag & 128) {
					throw new Error('Circular dependency');
				} else if (flag & 64) {
					this.update();
				}
			}
			logRead(this, Listener);
		}
		return this.val;
	}
	Enumerable.prototype.update = function () {
		var flag = this.flag,
			owner = Owner,
			listener = Listener;
		cleanupNode(this, false);
		Owner = this;
		Listener = null;
		this.flag &= ~64;
		this.flag |= 128;
		this.val = this.fn(this.val);
		if ((flag & 514) === 514) {
			if (flag & 8192) {
				setComputationsStale(this.log, Root.time);
			}
		}
		this.flag &= ~128;
		Owner = owner;
		Listener = listener;
	}
	Enumerable.prototype.dispose = function () {
		if (State & 33) {
			this.fn = null;
			this.log = null;
			cleanupNode(this, true);
		} else {
			Root.disposes.items[Root.disposes.len++] = this;
		}
	}
	//#endregion
	//#endregion
	//#region 2.4 System variables
	//#region 2.4.1 Enums
	var Mod = {
		Index: 1,
		Value: 2,
		Range: 4,
		Head: 8,
		Tail: 16,
		Insertion: 32,
		Deletion: 64,
		Reordering: 128,
		InsertAt: 291,
		InsertRange: 551,
		Move: 1153,
		Pop: 2128,
		Push: 4146,
		RemoveAt: 8257,
		RemoveRange: 16453,
		Replace: 32867,
		Shift: 65608,
		Swap: 131201,
		Unshift: 262186,
		Mutation: 524032,
	};
	//#endregion
	//#region 2.4.2 Variables
	//#endregion
	//#endregion
	//#region 2.5 Internal functionality
	 function logMutate(node, cs) {
		var changes = Root.changes;
		if (State !== 1) {
			if (node.pval !== Void) {
				throw new Error('Conflicting changes');
			}
			if (node.pcs === null) {
				node.pcs = cs;
				node.flag |= 4096;
				changes.items[changes.len++] = node;
			} else {
				if (node.flag & 4096) {
					node.flag &= ~4096;
					node.pcs = [node.pcs, cs];
				} else {
					node.pcs[node.pcs.length] = cs;
				}
			}
		} else {
			node.flag |= 4096;
			if (node.flag & 512) {
				node.pcs = cs;
				changes.items[changes.len++] = node;
				execute();
			} else {
				node.pcs = cs;
				node.update();
			}
		}
	}
	 function applyMutation(array, cs) {
		var i, args, value,
			len = array.length,
			type = cs.type & 524032;
		if (type & 291) {
			array.splice(cs.i1, 0, cs.value);
		} else if (type & 551) {
			args = [cs.i1, 0];
			value = cs.value;
			for (i = 0; i < value.length; i++) {
				args[i + 2] = value[i];
			}
			array.splice.apply(array, args);
		} else if (type & 1153) {
			// todo
		} else if (type & 2128) {
			if (len > 0) {
				array.length--;
			}
		} else if (type & 4146) {
			array[len] = cs.value;
		} else if (type & 8257) {
			removeAt(array, len, cs.i1);
		} else if (type & 16453) {
			array.splice(cs.i1, cs.i2);
		} else if (type & 32867) {
			array[cs.i1] = cs.value;
		} else if (type & 65608) {
			array.shift();
		} else if (type & 131201) {
			value = array[cs.i1];
			array[cs.i1] = array[cs.i2];
			array[cs.i2] = value;
		} else if (type & 262186) {
			array.unshift(cs.value);
		}
	}
	function applyMapMutation(callback, items, seed, roots, len, cs) {
		var j, j, len, item, node, value,
			type = cs.type & 524032,
			mapper = function () {
				return callback(item, j);
			}
		if (type & 291) {
			j = cs.i1;
			item = cs.value;
			node = root(mapper);
			items.splice(j, 0, item);
			roots.splice(j, 0, node);
			if (seed !== null) {
				seed.splice(j, 0, item);
			}
			cs = { type: 291, i1: j, value: node.val };
		} else if (type & 551) {
			value = cs.value;
			len = value.length;
			var itemArgs = [cs.i1, 0],
				nodeArgs = [cs.i1, 0],
				newVals = new Array(len);
			seedArgs;
			if (seed !== null) {
				seedArgs = [cs.i1, 0];
			}
			for (j = 0; j < len; j++) {
				j = cs.i1 + j;
				itemArgs[j + 2] = item = value[j];
				nodeArgs[j + 2] = node = root(mapper);
				newVals[j] = node.val;
				if (seed !== null) {
					seedArgs[j + 2] = node.val;
				}
			}
			items.splice.apply(items, itemArgs);
			roots.splice.apply(roots, nodeArgs);
			if (seed !== null) {
				seed.splice.apply(seed, seedArgs);
			}
			cs = { type: 551, i1: cs.i1, value: newVals };
		} else if (type & 8257) {
			if (len > 0) {
				j = removeAt(items, len, cs.i1);
				roots[j].dispose();
				removeAt(roots, len, j);
				if (seed !== null) {
					removeAt(seed, len, j);
				}
			}
		} else if (type & 16453) {
			for (j = cs.i1, len = cs.i2; len >= 0; j++, len--) {
				roots[j].dispose();
			}
			items.splice(cs.i1, cs.i2);
			roots.splice(cs.i1, cs.i2);
			if (seed !== null) {
				seed.splice(cs.i1, cs.i2);
			}
		} else if (type & 32867) {
			j = cs.i1;
			roots[j].dispose();
			items = cs.value;
			node = root(mapper);
			roots[j] = node;
			if (seed !== null) {
				seed[j] = node.val;
			}
		} else if (type & 65608) {
			if (len > 0) {
				roots[0].dispose();
				items.shift();
				roots.shift();
				if (seed !== null) {
					seed.shift();
				}
			}
		} else if (type & 131201) {
			i = cs.i1;
			j = cs.i2;
			value = items[i];
			items[i] = items[j];
			items[j] = items[i];
			node = roots[i];
			roots[i] = roots[j];
			roots[j] = node;
			if (seed !== null) {
				value = seed[i];
				seed[i] = seed[j];
				seed[j] = value;
			}
		} else if (type & 262186) {
			j = 0;
			items.unshift(cs.value);
			node = root(mapper)
			roots.unshift(node);
			if (seed !== null) {
				seed.unshift(node.val);
			}
			cs = { type: 262186, value: node.val };
		}
		return cs;
	}
	function applyReverseMutation(array, cs) {
		var i, value, args,
			len = array.length,
			type = cs.type & 524032;
		if (type & 291) {
			i = len - 1 - cs.i1;
			array.splice(i, 0, cs.value);
			cs = { type: InsertAt, i1: i, value: cs.value };
		} else if (type & 551) {
			i = len - 1 - cs.i1;
			value = cs.value;
			args = [i, 0];
			for (i = 0, len = value.length; i < len; i++) {
				args[i + 2] = value[i];
			}
			array.splice.apply(array, args);
			cs = { type: 551, i1: i, value: value };
		} else if (type & 1153) {
			// todo
		} else if (type & 2128) {
			array.shift();
			cs = { type: 65608 }
		} else if (type & 4146) {
			array.unshift(value);
			cs = { type: 262186, value: value };
		} else if (type & 8257) {
			i = removeAt(array, len, cs.i1)
			cs = { type: RemoveAt, i1: i };
		} else if (type & 16453) {
			i = len - 1 - cs.i1 - cs.i2;
			array.splice(i, cs.i2);
			cs = { type: 16453, i1: i, i2: cs.i2 };
		} else if (type & 32867) {
			i = len - 1 - cs.i1;
		} else if (type & 65608) {
			if (len > 0) {
				array.length--;
			}
			cs = { type: 2128 };
		} else if (type & 131201) {
		} else if (type & 262186) {
			array[len] = value;
			cs = { type: 4146, value: cs.value };
		}
		return cs;
	}
	function applySlicedMutation(array, cs) {
	}
	function indexOf(flag, cs, item, call, index, length, last) {
		var type, mut, i, len, c;
		if (cs !== null) {
			if (flag & 4096) {
				mut = cs.type & 524032;
				type = cs.type;
				if (index === -1) {
					if (type & 32) {
						if (type & 4) {
							count = cs.i2;
							for (i = cs.i1; count >= 0; count--) {
								if (call ? item(cs.value[i]) : cs.value[i] === item) {
									return i;
								}
							}
							return -1;
						} else {
							if (call ? item(cs.value) : cs.value === item) {
								if (mut & 262186) {
									return 0;
								} else if (mut & 4146) {
									return length - 1;
								} else {
									return cs.i1;
								}
							}
							return -1;
						}
					} else {
						return index;
					}
				} else {
					if (mut & 4146) {
						if (last) {
							if (call ? item(cs.value) : cs.value === item) {
								return length - 1;
							} else {
								return index;
							}
						} else {
							return index;
						}
					} else if (mut & 2128) {
						if (index === length - 1) {
							return -1;
						} else {
							return index;
						}
					} else if (mut & 65608) {
						if (index !== 0) {
							return index;
						}
					} else if (mut & 262186) {
						if (last) {
							return index;
						} else {
							if (call ? item(cs.value) : cs.value === item) {
								return 0;
							} else {
								return index;
							}
						}
					} else {
						if (mut & 1) {
							if (last) {
								if (index > cs.i1) {
									return index;
								}
							} else {
								if (index < cs.i1) {
									return index;
								}
							}
						}
					}
				}
			} else {
				if (index === -1) {
					scope: {
						for (i = 0, len = cs.length; i < len; i++) {
							if (cs[i].type & 32) {
								break scope;
							}
						}
						return index;
					}
				} else {
					scope: {
						for (i = 0, len = cs.length; i < len; i++) {
							c = cs[i];
							type = c.type;
							if (type & 16) {
								if (index === length - 1) {
									break scope;
								}
							} else if (type & 1) {
								if (index >= c.i1) {
									break scope;
								}
							} else {
								break scope;
							}
						}
						return index;
					}
				}
			}
		}
		return -2;
	}
	function removeAt(array, len, i) {
		var j;
		if (len > 0) {
			if (i < 0) {
				i = len - 1 + i;
				if (i < 0) {
					i = 0;
				}
			}
			j = i;
			if (i < len) {
				for (; i < len; i++) {
					array[i] = array[i + 1];
				}
			}
			array.length--;
		}
		return j;
	}
	function copyValue(value) {
		if (value === null || typeof value !== 'object') {
			return function () { return value; }
		} else {
			if (Array.isArray(value)) {
				return function () { return value.slice(); }
			} else {
				return function () {
					var key, result = {};
					for (key in value) {
						result[key] = value[key];
					}
					return result;
				}
			}
		}
	}
	//#endregion
	//#endregion
	//#region 3. System exports
	export {
	  array,
	  data,
	  value,
	  fn,
	  on,
	  run,
	  tie,
	  cleanup,
	  freeze,
	  root,
	  sample,
	  Flag,
	  Mod,
	  Void,
	  Owner,
	  Listener,
	  Data,
	  Value,
	  List,
	  Computation,
	  Enumerable,
	}
	//#endregion