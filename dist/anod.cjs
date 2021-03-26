function data(val) {
		var node = new Data(val);
		return (function (next) {
			return arguments.length === 0 ? node.get() : node.set(next);
		});
	}
	function value(val, eq) {
		var node = new Value(val, eq);
		return (function (next) {
			return arguments.length === 0 ? node.get() : node.set(next);
		});
	}
	function run(f, seed, flags, disposer) {
		var node = new Computation(new Log());
		Computation.setup(node, f, seed, 32 | flags, disposer);
		return function () { return node.get(); }
	}
	function tie(src, f, seed, flags, disposer) {
		var node = new Computation(new Log());
		if (flags & 4) {
			if (flags & 1) {
				logSource(node, src);
			}
			seed = Computation.setup(node, function (seed) {
				logSource(node, src);
				return f(seed);
			}, seed, 16 | flags, disposer);
		} else {
			logSource(node, src);
			seed = Computation.setup(node, f, seed, 16 | flags, disposer);
		}
		return function () { return node.get(); }
	}
	function fn(f, seed, flags, disposer) {
		Computation.setup(new Computation(null), f, seed, 32 | flags, disposer);
	}
	function on(src, f, seed, flags, disposer) {
		var node = new Computation(null);
		if (flags & 4) {
			if (flags & 1) {
				logSource(node, src);
			}
			Computation.setup(node, function (seed) {
				logSource(node, src);
				return f(seed);
			}, seed, 16 | flags, disposer);
		} else {
			logSource(node, src);
			Computation.setup(node, f, seed, 16 | flags, disposer);
		}
	}
	function cleanup(f) {
		var cleanups;
		var owner = Owner;
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
	function root(f) {
		var val;
		var node = new Computation(null);
		var owner = Owner;
		var listener = Listener;
		Owner = node;
		Listener = null;
		try {
			val = f();
		} finally {
			Owner = owner;
			Listener = listener;
		}
		sealNode(node, null, (void 0), val, 0);
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
	function Data(val) {
		this.val = val;
		this.log = new Log();
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
		var clock = Root;
		var owner = Owner;
		seed = setupNode(node, f, seed, flags);
		sealNode(node, owner, f, seed, flags, dispose);
		if (State === 1) {
			finishToplevelExecution(clock);
		}
		return seed;
	}
	Computation.prototype.get = function () {
		var flag;
		if (Listener !== null) {
			flag = this.flag;
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
		var owner = Owner;
		var listener = Listener;
		var flag = this.flag;
		var val = this.val;
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
			Root.disposes.add(this);
		}
	}
	var Flag = {
		Wait: 1,
		Trace: 2,
		Dynamic: 4,
		Static: 8,
	};
	var Void = {};
	var Root = new Clock();
	var State = 1;
	var Owner = null;
	var Listener = null;
	function Queue() {
		this.len = 0;
		this.items = [];
	}
	Queue.prototype.add = function (item) {
		this.items[this.len++] = item;
	}
	function Clock() {
		this.time = 0;
		this.changes = new Queue();
		this.traces = new Queue();
		this.updates = new Queue();
		this.disposes = new Queue();
	}
	function Log() {
		this.node1 = null;
		this.slot1 = -1;
		this.nodes = null;
		this.slots = null;
	}
	function setupNode(node, fn, seed, flags) {
		var clock = Root;
		var owner = Owner;
		var listener = Listener;
		var toplevel = State === 1;
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
			seed = flags & 1 ? seed : fn(seed);
		}
		Owner = owner;
		Listener = listener;
		return seed;
	}
	function sealNode(node, owner, fn, val, flags, disposer) {
		node.fn = fn;
		node.val = val;
		node.flag |= flags;
		node.age = Root.time;
		if (disposer !== void 0) {
			node.disposer = disposer;
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
		var fromslot;
		var toslot;
		var log = from.log;
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
			if (to.flag & 2050) {
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
				changes.add(node);
			}
		} else {
			node.pval = val;
			if (node.flag & 512) {
				changes.add(node);
				execute();
			} else {
				node.update();
			}
		}
		return val;
	}
	function logSource(node, src) {
		var s;
		var i;
		var len;
		var listener = Listener;
		try {
			Listener = node;
			if (Array.isArray(src)) {
				for (i = 0, len = src.length; i < len; i++) {
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
		var i;
		var len;
		var log;
		var node; 
		var nodes;
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
		var i;
		var node;
		var owned = owner.owned;
		var len = owned.length;
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
		var j;
		var queue;
		var node;
		var i = 0;
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
				node = (queue).items[j];
				if (node.flag & 64) {
					node.update();
				}
			}
			queue.len = 0;
			queue = clock.updates;
			State = 16;
			for (j = 0; j < queue.len; j++) {
				node = (queue).items[j];
				if (node.flag & 64) {
					node.update();
				}
			}
			queue.len = 0;
			queue = clock.disposes;
			State = 32;
			for (j = 0; j < queue.len; j++) {
				node = (queue).items[j];
				node.fn = null;
				node.log = null;
				cleanupNode(node, true);
			}
			queue.len = 0;
			if (i++ > 1e5) {
				throw new Error('Runaway clock');
			}
		} while (clock.changes.len > 0 || clock.updates.len > 0 || clock.disposes.len > 0);
		State = 1;
	}
	function setComputationsStale(log, time) {
		var i;
		var len;
		var node = log.node1;
		var nodes = log.nodes;
		if (node !== null) {
			if (node.age < time) {
				setComputationStale(node, time);
			}
		}
		if (nodes !== null) {
			for (i = 0, len = nodes.length; i < len; i++) {
				node = nodes[i];
				if (node.age < time) {
					setComputationStale(node, time);
				}
			}
		}
	}
	function setComputationStale(node, time) {
		if (node.flag & 2) {
			Root.traces.add(node);
		} else {
			Root.updates.add(node);
		}
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
		var i;
		var len;
		var node;
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
		var i;
		var len;
		var slot;
		var source;
		var sources;
		var owner = node.owner;
		var traces = node.traces;
		if (owner !== null) {
			applyUpstreamUpdates(owner);
		}
		if (!(node.flag & 256)) {
			if (traces !== null) {
				sources = node.sources;
				for (i = 0, len = traces.length; i < len; i++) {
					slot = traces[i];
					source = slot === -1 ? node.source1 : sources[slot];
					applyUpstreamUpdates((source));
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
		var i;
		var len;
		var flag = node.flag;
		var owned = node.owned;
		var cleanups = node.cleanups;
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
		var i;
		var len;
		var sources;
		var slots;
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
			if (node.traces !== null) {
				node.traces.length = 0;
			}
			node.flag &= ~1024;
		}
	}
	function cleanupSource(source, slot) {
		var last;
		var lastslot;
		var nodes;
		var slots;
		var log = source.log;
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
	function list(val) {
		return new List(val);
	}
	function every(callback) {
		var src = this;
		var pure = callback.length === 1;
		return tie(src,  function (seed) {
			var i, ilen, j, jlen, c,
				cs = src.cs,
				items = src.get(),
				len = items.length;
			if (seed !== Void && pure && cs !== null) {
				if (src.flag & 4096) {
					if (seed) {
						if (cs.mod & 32) {
							if (cs.mod & 4) {
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
						if (cs.mod & 160) {
							return false;
						}
					}
				} else {
					scope: {
						for (i = 0, ilen = cs.length; i < ilen; i++) {
							c = cs[i];
							if (seed) {
								if (c.mod & 32) {
									if (c.mod & 4) {
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
								if (c.mod & 64) {
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
	function filter(callback) {
		var src = this,
			k = null,
			node = new Enumerable(),
			pure = callback.length === 1;
		return Enumerable.setup(node, src,  function (seed) {
			var i, j, item, mut,
				cs = src.cs, changed,
				items = src.get(),
				len = items.length;
			if (seed === Void) {
				k = new Array(len);
				seed = new Array(len);
			} else if (pure && cs !== null) {
				mut = cs.mod & 524032;
				if (cs.mod & 128) {
				} else {
					if (cs.mod === 524288) {
						node.cs = cs;
						node.flag &= ~8192;
					} else {
						if (src.flag & 4096) {
							node.flag |= 4096;
							node.cs = cs = applyFilterMutation(callback, items, seed, k, len, cs);
							if (cs.mod !== 524288) {
								node.flag |= 8192;
							} else {
								node.flag &= ~8192;
							}
						} else {
							node.flag &= ~4096;
							j = cs.value.length;
							node.cs = new Array(j);
							for (i = 0; i < j; i++) {
								node.cs[i] = cs = applyFilterMutation(callback, items, seed, k, len, src.cs[i]);
								if (cs.mod !== 524288) {
									changed = true;
								}
							}
							if (changed) {
								node.flag |= 8192;
							} else {
								node.flag &= ~8192;
							}
						}
					}
					return seed;
				}
			}
			for (i = 0, j = 0; i < len; i++) {
				item = items[i];
				if (callback(item, i)) {
					k[i] = j;
					seed[j++] = item;
				} else {
					k[i] = -1;
				}
			}
			k.length = len;
			seed.length = j;
			node.cs = null;
			node.flag |= 8192;
			return seed;
		});
	}
	function find(callback) {
		var src = this,
			i = -1,
			pure = callback.length === 1;
		return tie(src,  function (seed) {
			var item,
				cs = src.cs,
				items = src.get(),
				len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = getIndex(src.flag, cs, callback, true, i, len, false);
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
	function findIndex(callback, index) {
		var src = this,
			index = -1,
			pure = callback.length === 1 && arguments.length === 1;
		return tie(src,  function (seed) {
			var i, cs,
				items = src.get(),
				len = items.length;
			if (pure && seed !== Void) {
				cs = src.cs;
				if (cs !== null) {
					i = getIndex(src.flag, cs, callback, true, index, len, false);
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
	function forEach(callback) {
		var src = this,
			node = new Enumerable(),
			c = [],
			clen = 0,
			roots = [];
		cleanup(function () {
			var i;
			for (i = 0; i < clen; i++) {
				roots[i].dispose();
			}
		});
		Enumerable.setup(node, src,  function (seed) {
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
					node.cs = applyRootMutation(callback, c, null, roots, clen, cs);
				} else {
					node.flag &= ~4096;
					j = cs.length;
					node.cs = new Array(j);
					for (i = 0; i < j; i++) {
						node.cs[i] = applyRootMutation(callback, c, null, roots, clen, cs[i]);
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
	function includes(valueToFind, fromIndex) {
		var src = this,
			i = -1,
			pure = arguments.length === 1;
		return tie(src,  function (seed) {
			var cs = src.cs,
				items = src.get(),
				len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = getIndex(src.flag, cs, valueToFind, false, seed, i, len, false);
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
	function indexOf(searchElement, fromIndex) {
		var src = this,
			i = -1,
			pure = arguments.length === 1;
		return tie(src,  function (seed) {
			var item,
				cs = src.cs,
				items = src.get(),
				len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = getIndex(src.flag, cs, searchElement, false, i, len, false);
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
	function join(separator) {
		var src = this;
		return tie(src, function () {
			return src.get().join(separator);
		}, void 0, 2);
	}
	function lastIndexOf(searchElement, fromIndex) {
		var src = this,
			i = -1,
			pure = arguments.length === 1;
		return tie(src, function (seed) {
			var cs = src.cs,
				items = src.get(),
				len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = getIndex(src.flag, cs, searchElement, false, i, len, true);
				if (i !== -2) {
					return i;
				}
			}
			for (i = fromIndex === void 0 ? len - 1 : fromIndex; i >= 0; i--) {
				if (searchElement === items[i]) {
					return i;
				}
			}
			return i = -1;
		}, Void, 2);
	}
	function map(callback) {
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
					node.cs = applyRootMutation(callback, c, seed, roots, clen, cs);
				} else {
					node.flag &= ~4096;
					j = cs.length;
					node.cs = new Array(j);
					for (i = 0; i < j; i++) {
						node.cs[i] = applyRootMutation(callback, c, seed, roots, clen, cs[i]);
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
	function reduce(callback, initialValue) {
		var src = this,
			copy = copyValue(initialValue),
			skip = arguments.length === 1;
		return tie(src, function () {
			var i, result,
				items = src.get(),
				len = items.length;
			if (skip) {
				i = 1;
				result = items[0];
			} else {
				i = 0;
				result = copy();
			}
			for (; i < len; i++) {
				result = callback(result, items[i], i);
			}
			return result;
		}, void 0, 2);
	}
	function reduceRight(callback, initialValue) {
		var src = this,
			copy = copyValue(initialValue),
			skip = arguments.length === 1;
		return tie(src, function (seed) {
			var i, result,
				items = src.get(),
				len = items.length;
			if (skip) {
				i = len - 2;
				result = items[len - 1];
			} else {
				i = len - 1;
				result = copy();
			}
			for (; i >= 0; i--) {
				result = callback(result, items[i], i);
			}
			return result;
		}, Void, 2);
	}
	function reverse() {
		var src = this,
			node = new Enumerable();
		node.flag |= 8192;
		return Enumerable.setup(node, src,  function (seed) {
			var i,
				cs = src.cs,
				items = src.get(),
				len = items.length;
			if (seed === Void) {
				seed = new Array(len);
			} else if (cs !== null) {
				if (src.flag & 4096) {
					node.flag |= 4096;
					node.cs = applyReverseMutation(seed, cs);
				} else {
					node.flag &= ~4096;
					node.cs = new Array(cs.length);
					for (i = 0, len = cs.length; i < len; i++) {
						node.cs[i] = applyReverseMutation(seed, cs[i]);
					}
				}
				return seed;
			}
			node.cs = null;
			seed.length = len;
			for (var i = len - 1, j = 0; i >= 0; i--, j++) {
				seed[j] = items[i];
			}
			return seed;
		});
	}
	function slice(start, end) {
		var src = this,
			node = new Enumerable();
		return Enumerable.setup(node, src,  function (seed) {
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
	function some(callback) {
		var src = this,
			index = -1,
			pure = callback.length === 1;
		return tie(src,  function (seed) {
			var i,
				cs = src.cs,
				items = src.get(),
				len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = getIndex(src.flag, cs, callback, true, index, len, false);
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
	function sort(compareFunction) {
		var src = this,
			node = new Enumerable(8192);
		return Enumerable.setup(node, this, function () {
			var items = src.get();
			var newItems = items.slice();
			newItems.sort(compareFunction);
			return newItems;
		});
	}
	function List(val) {
		Data.call(this, val);
		this.cs = null;
		this.pcs = null;
	}
	List.prototype.every = every;
	List.prototype.filter = filter;
	List.prototype.find = find;
	List.prototype.findIndex = findIndex;
	List.prototype.forEach = forEach;
	List.prototype.includes = includes;
	List.prototype.indexOf = indexOf;
	List.prototype.join = join;
	List.prototype.lastIndexOf = lastIndexOf;
	List.prototype.map = map;
	List.prototype.reduce = reduce;
	List.prototype.reduceRight = reduceRight;
	List.prototype.reverse = reverse;
	List.prototype.slice = slice;
	List.prototype.some = some;
	List.prototype.sort = sort;
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
		var i;
		var len;
		var flag = this.flag;
		if (this.pval !== Void) {
			this.cs = null;
			this.val = this.pval;
			this.pval = Void;
		} else {
			this.cs = this.pcs;
			this.pcs = null;
			if (flag & 4096) {
				this.cs = applyMutation(this.val, this.cs);
			}
			else {
				for (i = 0, len = this.cs.length; i < len; i++) {
					this.cs[i] = applyMutation(this.val, this.cs[i]);
				}
			}
		}
		if (flag & 512) {
			setComputationsStale(this.log, Root.time);
		}
	}
	List.prototype.insertAt = function (index, item) {
		logMutate(this, { mod: 291, i1: index, value: item });
	}
	List.prototype.insertRange = function (index, items) {
		logMutate(this, { mod: 551, i1: index, value: items });
	}
	List.prototype.move = function (from, to) {
		logMutate(this, { mod: 1153, i1: from, i2: to });
	}
	List.prototype.pop = function () {
		logMutate(this, { mod: 2128 });
	}
	List.prototype.push = function (item) {
		logMutate(this, { mod: 4146, value: item });
	}
	List.prototype.removeAt = function (index) {
		logMutate(this, { mod: 8257, i1: index });
	}
	List.prototype.removeRange = function (index, count) {
		logMutate(this, { mod: 16453, i1: index, i2: count });
	}
	List.prototype.replace = function (index, item) {
		logMutate(this, { mod: 32867, i1: index, value: item });
	}
	List.prototype.shift = function () {
		logMutate(this, { mod: 65608 });
	}
	List.prototype.swap = function (i1, i2) {
		logMutate(this, { mod: 131201, i1: i1, i2: i2 });
	}
	List.prototype.unshift = function (item) {
		logMutate(this, { mod: 262186, value: item });
	}
	function Enumerable() {
		Computation.call(this, new Log());
		this.cs = null;
		this.roots = null;
	}
	Enumerable.prototype.every = every;
	Enumerable.prototype.filter = filter;
	Enumerable.prototype.find = find;
	Enumerable.prototype.findIndex = findIndex;
	Enumerable.prototype.forEach = forEach;
	Enumerable.prototype.includes = includes;
	Enumerable.prototype.indexOf = indexOf;
	Enumerable.prototype.join = join;
	Enumerable.prototype.lastIndexOf = lastIndexOf;
	Enumerable.prototype.map = map;
	Enumerable.prototype.reduce = reduce;
	Enumerable.prototype.reduceRight = reduceRight;
	Enumerable.prototype.reverse = reverse;
	Enumerable.prototype.slice = slice;
	Enumerable.prototype.some = some;
	Enumerable.prototype.sort = sort;
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
		var flag;
		if (Listener !== null) {
			flag = this.flag;
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
			Root.disposes.add(this);
		}
	}
	var Mod = {
		Index: 1,
		Value: 2,
		Range: 4,
		Head: 8,
		Tail: 16,
		Add: 32,
		Delete: 64,
		Reorder: 128,
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
		Void: 524288,
		Type: 524032,
	};
	var PopMod = { mod: 2128 };
	var ShiftMod = { mod: 65608 };
	var VoidMod = { mod: 524288 };
	function logMutate(node, cs) {
		var changes = Root.changes;
		if (State !== 1) {
			if (node.pval !== Void) {
				throw new Error('Conflicting changes');
			}
			if (node.pcs === null) {
				node.pcs = cs;
				node.flag |= 4096;
				changes.add(node);
			} else {
				if (node.flag & 4096) {
					node.flag &= ~4096;
					node.pcs = [node.pcs, cs];
				} else {
					node.pcs[node.pcs.length] = cs;
				}
			}
		} else {
			node.pcs = cs;
			node.flag |= 4096;
			if (node.flag & 512) {
				changes.add(node);
				execute();
			} else {
				node.update();
			}
		}
	}
	function applyMutation(array, cs) {
		var i, j, k, args, value,
			len = array.length,
			mod = cs.mod,
			mut = mod & 524032;
		if (mod & 1) {
			cs.i1 = actualIndex(len, cs.i1);
		}
		if (mod & 128) {
			cs.i2 = actualIndex(len, cs.i2);
			i = cs.i1;
			j = cs.i2;
			if (i !== j) {
				if (i === len) {
					i = --cs.i1;
				}
				if (j === len) {
					j = --cs.i2;
				}
			} else {
				cs = VoidMod;
				return cs;
			}
		}
		if (mut & 291) {
			i = cs.i1;
			if (len === i) {
				array.push(cs.value);
				cs.mod = 4146;
			} else if (i === 0) {
				array.unshift(cs.value);
				cs.mod = 262186;
			} else {
				array.splice(cs.i1, 0, cs.value);
			}
		} else if (mut & 551) {
			args = [cs.i1, 0];
			value = cs.value;
			for (i = 0; i < value.length; i++) {
				args[i + 2] = value[i];
			}
			array.splice.apply(array, args);
		} else if (mut & 1153) {
			k = j > i ? 1 : -1;
			args = array[i];
			for (; i !== j; i += k) {
				array[i] = array[i + k];
			}
			array[j] = args;
		} else if (mut & 2128) {
			if (len > 0) {
				array.length--;
			} else {
				cs = VoidMod;
			}
		} else if (mut & 4146) {
			array[len] = cs.value;
		} else if (mut & 8257) {
			if (len > 0) {
				i = cs.i1;
				if (len === i) {
					array.pop();
					cs = PopMod;
				} else if (i === 0) {
					array.shift();
					cs = ShiftMod;
				} else {
					removeAt(array, i);
				}
			} else {
				cs = VoidMod;
			}
		} else if (mut & 16453) {
			if (cs.i1 < len) {
				if (cs.i1 + cs.i2 > len) {
					cs.i2 = len - cs.i1;
				}
				array.splice(cs.i1, cs.i2);
			} else {
				cs = VoidMod;
			}
		} else if (mut & 32867) {
			array[cs.i1] = cs.value;
		} else if (mut & 65608) {
			if (len > 0) {
				array.shift();
			} else {
				cs = VoidMod;
			}
		} else if (mut & 131201) {
			value = array[i];
			array[i] = array[j];
			array[j] = value;
		} else if (mut & 262186) {
			array.unshift(cs.value);
		}
		return cs;
	}
	function applyFilterMutation(callback, items, seed, k, len, cs) {
		var i, j, m, n, item, args,
			found, value, csval,
			mut = cs.mod & 524032;
		if (mut & 291) {
			i = cs.i1;
			value = cs.value;
			found = callback(value);
			if (found) {
				if (seed.length > 0) {
					for (j = i, n = k.length; j < n; j++) {
						m = k[j];
						if (m !== -1) {
							seed.splice(m, 0, value);
							break;
						}
					}
					k.splice(i, 0, m);
					cs = { mod: 291, i1: m, value: value };
				} else {
					m = seed.length;
					seed[m] = value;
					k.splice(i, 0, m);
					cs = { mod: 291, i1: m, value: value };
				}
				for (i++; i < len; i++) {
					if (k[i] !== -1) {
						k[i]++;
					}
				}
			} else {
				k.splice(i, 0, -1);
				cs = VoidMod;
			}
		} else if (mut & 551) {
			i = cs.i1;
			n = k.length;
			value = cs.value;
			if (len > 0 && i < n) {
				for (j = i; j < n && k[j] === -1; j++) { }
				if (j >= n) {
					j = seed.length;
				} else {
					j = k[j];
				}
			} else {
				j = seed.length;
			}
			args = [i, 0];
			for (i = 0, m = 2, n = value.length; i < n; i++) {
				args[m++] = -1;
			}
			k.splice.apply(k, args);
			csval = [];
			args[0] = j;
			for (i = cs.i1, m = 2, n = i + n; i < n; i++) {
				item = items[i];
				if (callback(item)) {
					k[i] = j++;
					args[m] = item;
					csval[m++ - 2] = item;
				}
			}
			n = csval.length;
			if (n > 0) {
				args.length = n + 2;
				for (i = cs.i1 + value.length; i < len; i++) {
					if (k[i] !== -1) {
						k[i] += n;
					}
				}
				seed.splice.apply(seed, args);
				cs = { mod: 551, i1: j - n, value: csval };
			} else {
				cs = VoidMod;
			}
		} else if (mut & 1153) {
			i = cs.i1;
			j = cs.i2;
			m = j > i ? 1 : -1;
			item = k[i];
			for (; i !== j; i += m) {
				k[i] = k[i + m];
			}
			k[j] = item;
		} else if (mut & 4146) {
			found = callback(cs.value);
			j = seed.length;
			n = k.length;
			if (found) {
				k[n] = j;
				seed[j] = cs.value;
				if (j !== cs.i1) {
					cs = { mod: 4146, i1: j, value: cs.value };
				}
			} else {
				k[n] = -1;
				cs = VoidMod;
			}
		} else if (mut & 2128) {
			i = k.pop();
			if (i !== -1) {
				seed.pop();
			} else {
				cs = VoidMod;
			}
		} else if (mut & 8257) {
			i = cs.i1;
			j = k[i];
			removeAt(k, i);
			if (j !== -1) {
				for (i++; i < len; i++) {
					if (k[i] !== -1) {
						k[i]--;
					}
				}
				removeAt(seed, j);
				if (i !== j) {
					cs = { mod: 8257, i1: j };
				}
			} else {
				cs = VoidMod;
			}
		} else if (mut & 16453) {
			i = cs.i1;
			m = 0;
			j = -1;
			n = i + cs.i2;
			for (; i < n; i++) {
				if (k[i] !== -1) {
					if (j === -1) {
						j = k[i];
					}
					m++;
				}
			}
			k.splice(cs.i1, cs.i2);
			if (m > 0) {
				for (i = cs.i1; i < len; i++) {
					if (k[i] !== -1) {
						k[i] -= n;
					}
				}
				seed.splice(j, m);
				cs = { mod: 16453, i1: j, i2: m };
			} else {
				cs = VoidMod;
			}
		} else if (mut & 32867) {
			i = cs.i1;
			n = k.length;
			for (j = i; j < n && k[j] === -1; j++) { }
			if (j >= n) {
				j = seed.length;
			} else {
				j = k[j];
			}
			found = callback(cs.value);
			if (found) {
				seed[j] = cs.value;
				cs = { mod: 32867, i1: j, value: cs.value };
			} else {
				cs = VoidMod;
			}
		} else if (mut & 65608) {
			j = k.shift();
			if (j !== -1) {
				for (i = 1; i < len; i++) {
					if (k[i] !== -1) {
						k[i]--;
					}
				}
				seed.shift();
			} else {
				cs = VoidMod;
			}
		} else if (mut & 262186) {
			found = callback(cs.value);
			if (found) {
				k.unshift(0);
				for (i = 1; i < len; i++) {
					if (k[i] !== -1) {
						k[i]++;
					}
				}
				seed.unshift(cs.value);
			} else {
				k.unshift(-1);
				cs = VoidMod;
			}
		}
		return cs;
	}
	function applyRootMutation(callback, items, seed, roots, len, cs) {
		var i, j, k, item, node, value,
			itemArgs, nodeArgs, seedArgs, newVals,
			mut = cs.mod & 524032,
			mapper = function () {
				return callback(item, j);
			}
		if (mut & 291) {
			j = cs.i1;
			item = cs.value;
			node = root(mapper);
			items.splice(j, 0, item);
			roots.splice(j, 0, node);
			if (seed !== null) {
				seed.splice(j, 0, item);
			}
			cs = { mod: 291, i1: j, value: node.val };
		} else if (mut & 551) {
			value = cs.value;
			len = value.length;
			itemArgs = [cs.i1, 0],
				nodeArgs = [cs.i1, 0],
				newVals = new Array(len);
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
			cs = { mod: 551, i1: cs.i1, value: newVals };
		} else if (mut & 1153) {
			i = cs.i1;
			j = cs.i2;
			k = j > i ? 1 : -1;
			item = items[i];
			node = roots[i];
			if (seed !== null) {
				value = seed[i];
			}
			for (; i !== j; i += k) {
				items[i] = items[i + k];
				roots[i] = roots[i + k];
				if (seed !== null) {
					seed[i] = seed[i + k];
				}
			}
			items[j] = item;
			roots[j] = node;
			if (seed !== null) {
				seed[j] = value;
			}
		} else if (mut & 8257) {
			j = cs.i1;
			removeAt(items, j);
			roots[j].dispose();
			removeAt(roots, j);
			if (seed !== null) {
				removeAt(seed, j);
			}
		} else if (mut & 16453) {
			for (j = cs.i1, len = cs.i2; len >= 0; j++, len--) {
				roots[j].dispose();
			}
			items.splice(cs.i1, cs.i2);
			roots.splice(cs.i1, cs.i2);
			if (seed !== null) {
				seed.splice(cs.i1, cs.i2);
			}
		} else if (mut & 32867) {
			j = cs.i1;
			roots[j].dispose();
			node = root(mapper);
			items[j] = cs.value;
			roots[j] = node;
			if (seed !== null) {
				seed[j] = node.val;
			}
		} else if (mut & 65608) {
			roots[0].dispose();
			items.shift();
			roots.shift();
			if (seed !== null) {
				seed.shift();
			}
		} else if (mut & 131201) {
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
		} else if (mut & 262186) {
			j = 0;
			node = root(mapper)
			items.unshift(cs.value);
			roots.unshift(node);
			if (seed !== null) {
				seed.unshift(node.val);
			}
			cs = { mod: 262186, value: node.val };
		}
		return cs;
	}
	function applyReverseMutation(array, cs) {
		var i, j, k, value, args,
			len = array.length,
			type = cs.mod & 524032;
		if (type & 291) {
			value = cs.value;
			i = len - cs.i1;
			array.splice(i, 0, value);
			cs = { mod: 291, i1: i, value: value };
		} else if (type & 551) {
			i = cs.i1;
			i = len - i;
			args = [i, 0];
			value = cs.value;
			for (j = 2, i = value.length - 1; i >= 0; i--) {
				args[j++] = value[i];
			}
			array.splice.apply(array, args);
			cs = { mod: 551, i1: i, value: value };
		} else if (type & 1153) {
			i = len - 1 - cs.i1;
			if (len === cs.i2) {
				j = 0;
			} else {
				j = len - 1 - cs.i2;
			}
			k = j > i ? 1 : -1;
			value = array[i];
			for (; i !== j; i += k) {
				array[i] = array[i + k];
			}
			array[j] = value;
			cs = { mod: 1153, i1: i, i2: j };
		} else if (type & 2128) {
			array.shift();
			cs = { mod: 65608 }
		} else if (type & 4146) {
			array.unshift(cs.value);
			cs = { mod: 262186, value: cs.value };
		} else if (type & 8257) {
			i = len - 1 - cs.i1;
			removeAt(array, i)
			cs = { mod: 8257, i1: i };
		} else if (type & 16453) {
			i = len - cs.i1 - cs.i2;
			array.splice(i, cs.i2);
			cs = { mod: 16453, i1: i, i2: cs.i2 };
		} else if (type & 32867) {
			i = len - 1 - cs.i1;
			array[i] = cs.value;
			cs = { mod: 32867, i1: i, value: cs.value };
		} else if (type & 65608) {
			array.length--;
			cs = { mod: 2128 };
		} else if (type & 131201) {
			i = len - 1 - cs.i1;
			j = len - 1 - cs.i2;
			value = array[i];
			array[i] = array[j];
			array[j] = value;
			cs = { mod: 131201, i1: i, i2: j };
		} else if (type & 262186) {
			array[len] = cs.value;
			cs = { mod: 4146, value: cs.value };
		}
		return cs;
	}
	function getIndex(flag, cs, item, call, index, length, last) {
		var i; 
		var len; 
		var mod;
		var mut;
		var c;
		var count;
		if (cs !== null) {
			if (flag & 4096) {
				mod = (cs).mod;
				mut = mod & 524032;
				if (index === -1) {
					if (mod & 32) {
						if (mod & 4) {
							count = ((cs).i2);
							for (i = ((cs).i1); count >= 0; count--) {
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
									return (cs.i1);
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
							if (cs[i].mod & 32) {
								break scope;
							}
						}
						return index;
					}
				} else {
					scope: {
						for (i = 0, len = cs.length; i < len; i++) {
							c = cs[i];
							mod = c.mod;
							if (mod & 16) {
								if (index === length - 1) {
									break scope;
								}
							} else if (mod & 1) {
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
	function actualIndex(len, i) {
		if (i < 0) {
			i = len + i;
			if (i < 0) {
				i = 0;
			} else if (i > len) {
				i = len;
			}
		} else if (i > len) {
			i = len;
		}
		return i;
	}
	function removeAt(array, i) {
		var len = array.length;
		if (len > 0) {
			if (i < len) {
				for (; i < len; i++) {
					array[i] = array[i + 1];
				}
			}
			array.length--;
		}
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
	module.exports = {
		data: data,
		value: value,
		list: list,
		fn: fn,
		on: on,
		run: run,
		tie: tie,
		cleanup: cleanup,
		freeze: freeze,
		root: root,
		sample: sample,
		Flag: Flag,
		Mod: Mod,
		Void: Void,
		Data: Data,
		Value: Value,
		List: List,
		Computation: Computation,
		Enumerable: Enumerable
	};