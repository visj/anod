/**
 * @fileoverview
 * Table of Contents
 * 1. Core reactivity library
 * 	1.1 Type definitions 
 * 	1.2 Public API
 * 	1.3 Object implementations
 * 		1.3.1 Data
 * 		1.3.2 Value
 * 		1.3.3 Computation
 * 	1.4 System variables
 * 		1.4.1 Enums
 * 		1.4.2 Variables
 * 	1.5 Internal functionality
 * 2. Array reactivity library
 * 	2.1 Type definitions
 * 	2.2 Public API
 * 	2.3 Object implementations
 * 		2.3.1 IEnumerable
 * 		2.3.2 List
 * 		2.3.3 Enumerable
 * 	2.4 System variables
 * 		2.4.1 Enums
 * 		2.4.2 Variables
 * 	2.5 Internal functionality
 * 3. System exports
 */

//#region 1. Core reactivity library

//#region 1.1 Type definitions

/**
 * @typedef {Data|Computation} Signal
 */

/**
 * @typedef {function(): *|Signal} Source
 */

/**
 * @template T
 * @typedef {Object} Log
 * @property {T} node1 
 * @property {number} slot1
 * @property {T[]} nodes
 * @property {number[]} slots
 */

/**
 * @template T
 * @typedef {Object} Queue
 * @property {T[]} items
 * @property {number} len
 */

/**
 * @typedef {Object} Clock
 * @property {number} time
 * @property {Queue<Data>} changes
 * @property {Queue<Computation>} traces
 * @property {Queue<Computation>} updates
 * @property {Queue<Computation>} disposes
 */

//#endregion

//#region 1.2 Public API

/**
 * @template T
 * @param {T} val 
 * @returns {function(T=): T}
 */
function data(val) {
	var node = new Data(val);
	return function (next) {
		return arguments.length === 0 ? node.get() : node.set(next);
	};
}

/**
 * @template T
 * @param {T} val 
 * @param {function(T,T): boolean=} eq 
 * @returns {function(T=): T}
 */
function value(val, eq) {
	var node = new Value(val, eq);
	return function (next) {
		return arguments.length === 0 ? node.get() : node.set(next);
	};
}

/**
 * @template T
 * @param {function(T): T} f 
 * @param {T=} seed 
 * @param {number=} flags 
 * @param {function(): *} dispose 
 * @returns {function(): T}
 */
function run(f, seed, flags, dispose) {
	var node = new Computation(Log());
	Computation.setup(node, f, seed, Flag.Unbound | flags, dispose);
	return function () {return node.get();}
}

/**
 * @template T
 * @param {Source|Source[]} src
 * @param {function(T): T} f 
 * @param {T=} seed 
 * @param {number=} flags 
 * @param {function(): *} dispose 
 * @returns {function(): T}
 */
function tie(src, f, seed, flags, dispose) {
	var node = new Computation(Log());
	if (flags & Flag.Dynamic) {
		if (flags & Flag.Wait) {
			logSource(node, src);
		}
		seed = Computation.setup(node, function (seed) {
			logSource(node, src);
			return f(seed);
		}, seed, Flag.Bound | flags, dispose);
	} else {
		logSource(node, src);
		seed = Computation.setup(node, f, seed, Flag.Bound | flags, dispose);
	}
	return function () {return node.get();}
}

/**
 * @template T
 * @param {function(T): T} f 
 * @param {T=} seed 
 * @param {number=} flags 
 * @param {function(): *} dispose 
 * @returns {function(): T}
 */
function fn(f, seed, flags, dispose) {
	Computation.setup(new Computation(null), f, seed, Flag.Unbound | flags, dispose);
}


/**
 * @template T
 * @param {Source|Source[]} src
 * @param {function(T): T} f 
 * @param {T=} seed 
 * @param {number=} flags 
 * @param {function(): *} dispose 
 * @returns {function(): T}
 */
function on(src, f, seed, flags, dispose) {
	var node = new Computation(null);
	if (flags & Flag.Dynamic) {
		if (flags & Flag.Wait) {
			logSource(node, src);
		}
		Computation.setup(node, function (seed) {
			logSource(node, src);
			return f(seed);
		}, seed, Flag.Bound | flags, dispose);
	} else {
		logSource(node, src);
		Computation.setup(node, f, seed, Flag.Bound | flags, dispose);
	}
}

/**
 * 
 * @param {function(): *} f 
 */
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

/**
 * @template T
 * @param {function(): T} f 
 * @returns {T}
 */
function freeze(f) {
	var val;
	if (State !== System.Idle) {
		val = f();
	} else {
		Root.changes.len = 0;
		State = System.Compute;
		try {
			val = f();
			execute();
		} finally {
			State = System.Idle;
		}
	}
	return val;
}

/**
 * @template T
 * @param {Computation<T>|function(): T} node 
 * @param {function(): T=} f 
 * @returns {Computation<T>}
 */
function root(node, f) {
	var val,
		owner = Owner,
		listener = Listener;
	if (typeof node === 'function') {
		f = node;
		node = new Computation(null);
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

/**
 * @template T
 * @param {Signal<T>|function(): T} node 
 * @returns {T}
 */
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

/**
 * @template T
 * @constructor
 * @param {T} val 
 */
function Data(val) {
	/**
	 * @type {T}
	 */
	this.val = val;
	/**
	 * @type {Log<Computation>}
	 */
	this.log = Log();
	/**
	 * @type {number}
	 */
	this.flag = 0;
	/**
	 * @type {T|Object}
	 */
	this.pval = Void;
}

/**
 * @public
 * @returns {T}
 */
Data.prototype.get = function () {
	if (Listener !== null) {
		logRead(this, Listener);
	}
	return this.val;
}

/**
 * @public
 * @param {T} val 
 * @returns {T}
 */
Data.prototype.set = function (val) {
	return logWrite(this, val);
}

/**
 * @returns {void}
 */
Data.prototype.update = function () {
	this.val = this.pval;
	this.pval = Void;
	if (this.flag & Flag.Logging) {
		setComputationsStale(this.log, Root.time);
	}
}

//#endregion

//#region 1.3.2 Value

/**
 * @template T
 * @constructor
 * @extends {Data<T>}
 * @param {T} val 
 * @param {function(T,T): boolean=} eq 
 */
function Value(val, eq) {
	Data.call(this, val);
	/**
	 * @type {function(T,T): boolean}
	 */
	this.eq = eq;
}

/**
 * @public
 * @returns {T}
 */
Value.prototype.get = function () {
	if (Listener !== null) {
		logRead(this, Listener);
	}
	return this.val;
}

/**
 * @public
 * @param {T} val 
 * @returns {T}
 */
Value.prototype.set = function (val) {
	return (this.eq ? this.eq(this.val, val) : this.val === val) ? val : logWrite(this, val);
}

/**
 * @returns {void}
 */
Value.prototype.update = function () {
	this.val = this.pval;
	this.pval = Void;
	if (this.flag & Flag.Logging) {
		setComputationsStale(this.log, Root.time);
	}
}

//#endregion

//#region 1.3.3 Computation

/**
 * @template T
 * @constructor
 * @param {Log<Computation>=} log 
 */
function Computation(log) {
	/**
	 * @type {T}
	 */
	this.val = void 0;
	/**
	 * @type {Log<Computation>}
	 */
	this.log = log;
	/**
	 * @type {number}
	 */
	this.flag = 0;
	/**
	 * @type {function(T): T}
	 */
	this.fn = null;
	/**
	 * @type {number}
	 */
	this.age = -1;
	/**
	 * @type {Signal}
	 */
	this.source1 = null;
	/**
	 * @type {number}
	 */
	this.slot1 = -1;
	/**
	 * @type {Signal[]}
	 */
	this.sources = null;
	/**
	 * @type {number[]}
	 */
	this.slots = null;
	/**
	 * @type {Computation}
	 */
	this.owner = null;
	/**
	 * @type {number[]}
	 */
	this.traces = null;
	/**
	 * @type {Computation[]}
	 */
	this.owned = null;
	/**
	 * @type {Array<function(): *>}
	 */
	this.cleanups = null;
	/**
	 * @type {function(): *}
	 */
	this.disposer = null;
}

Computation.make = function (log) {
	return new Computation(log ? Log() : null);
}

/**
 * @public
 * @static
 * @template T
 * @param {Computation<T>} node 
 * @param {function(T): T} f 
 * @param {T=} seed 
 * @param {number=} flags 
 * @param {function(): *=} dispose 
 * @returns 
 */
Computation.setup = function (node, f, seed, flags, dispose) {
	var clock = Root,
		owner = Owner;
	seed = setupNode(node, f, seed, flags);
	sealNode(node, owner, f, seed, flags, dispose);
	if (State === System.Idle) {
		finishToplevelExecution(clock);
	}
	return seed;
}

/**
 * @public
 * @returns {T}
 */
Computation.prototype.get = function () {
	if (Listener !== null) {
		var flag = this.flag;
		if (flag & Flag.Pending) {
			if (State === System.Trace) {
				applyUpstreamUpdates(this);
			}
		}
		if (this.age === Root.time) {
			if (flag & Flag.Running) {
				throw new Error('Circular dependency');
			} else if (flag & Flag.Stale) {
				this.update();
			}
		}
		logRead(this, Listener);
	}
	return this.val;
}

/**
 * @returns {void}
 */
Computation.prototype.update = function () {
	var owner = Owner,
		listener = Listener,
		flag = this.flag,
		val = this.val;
	cleanupNode(this, false);
	Owner = this;
	if (flag & Flag.Unbound) {
		if (flag & Flag.Static) {
			Listener = null;
		} else {
			Listener = this;
		}
	} else {
		Listener = null;
	}
	this.flag &= ~Flag.Stale;
	this.flag |= Flag.Running;
	this.val = this.fn(val);
	if ((flag & (Flag.Trace | Flag.Logging)) === (Flag.Trace | Flag.Logging)) {
		if (val !== this.val) {
			setComputationsStale(this.log, Root.time);
		}
	}
	this.flag &= ~Flag.Running;
	Owner = owner;
	Listener = listener;
}

/**
 * @returns {void}
 */
Computation.prototype.dispose = function () {
	if (State & (System.Idle | System.Dispose)) {
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

/* @exclude */
/**
 * @enum {number}
 */
var System = {
	Idle: 1,
	Compute: 2,
	Change: 4,
	Trace: 8,
	Update: 16,
	Dispose: 32,
};
/* @exclude */

/**
 * @enum {number}
 */
var Flag = {
	Wait: 1,
	Trace: 2,
	Dynamic: 4,
	Static: 8,
	/* @exclude */
	Bound: 16,
	Unbound: 32,
	Stale: 64,
	Running: 128,
	Disposed: 256,
	Logging: 512,
	Reading: 1024,
	Pending: 2048,
	Single: 4096,
	Changed: 8192,
	/* @exclude */
};

//#endregion

//#region 1.4.2 Variables

/**
 * @const
 * @type {{}}
 */
var Void = {};
/**
 * @const
 * @type {Clock}
 */
var Root = Clock();
/**
 * @type {number}
 */
var State = System.Idle;
/**
 * @type {Computation}
 */
var Owner = null;
/**
 * @type {Computation}
 */
var Listener = null;

//#endregion

//#endregion

//#region 1.5 Internal functionality

/**
 * @template T
 * @returns {Queue<T>}
 */
function Queue() {
	return {len: 0, items: []};
}

/**
 * 
 * @returns {Clock}
 */
function Clock() {
	return {time: 0, changes: Queue(), traces: Queue(), updates: Queue(), disposes: Queue()};
}

/**
 * @template T
 * @returns {Log<T>}
 */
function Log() {
	return {node1: null, slot1: -1, nodes: null, slots: null};
}

/**
 * @template T
 * @param {Computation<T>} node 
 * @param {function(T): T} fn 
 * @param {T=} seed 
 * @param {number=} flags 
 * @returns 
 */
function setupNode(node, fn, seed, flags) {
	var clock = Root,
		owner = Owner,
		listener = Listener,
		toplevel = State === System.Idle;
	Owner = node;
	Listener = flags & Flag.Bound ? null : node;
	if (toplevel) {
		clock.changes.len = 0;
		clock.updates.len = 0;
		try {
			State = System.Compute;
			seed = flags & Flag.Wait ? seed : fn(seed);
		} finally {
			State = System.Idle;
			Owner = Listener = null;
		}
	} else {
		seed = fn(seed);
	}
	Owner = owner;
	Listener = listener;
	return seed;
}

/**
 * @template T
 * @param {Computation<T>} node 
 * @param {Computation} owner 
 * @param {function(T): T} fn 
 * @param {T} val 
 * @param {number=} flags 
 * @param {function(): *=} dispose 
 */
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
		if (owner.flag & (Flag.Trace | Flag.Pending)) {
			logPendingOwner(owner);
		}
	}
}

/**
 * 
 * @param {Clock} clock 
 */
function finishToplevelExecution(clock) {
	if (clock.changes.len > 0 || clock.updates.len > 0) {
		try {
			tick(clock);
		} finally {
			State = System.Idle;
		}
	}
}

/**
 * 
 * @param {Signal} from 
 * @param {Computation} to 
 */
function logRead(from, to) {
	var fromslot, toslot,
		log = from.log;
	to.flag |= Flag.Reading;
	from.flag |= Flag.Logging;
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
	if (from.flag & (Flag.Trace | Flag.Pending)) {
		if (to.flag & (Flag.Trace | Flag.Pending)) {
			if (to.traces === null) {
				to.traces = [toslot];
			} else {
				to.traces[to.traces.length] = toslot;
			}
		} else {
			to.flag |= Flag.Trace;
			logPendingSource(to, toslot);
		}
	}
}

/**
 * @template T
 * @param {Data<T>} node 
 * @param {T} val 
 * @returns {T}
 */
function logWrite(node, val) {
	var changes = Root.changes;
	if (State !== System.Idle) {
		if (node.pval !== Void) {
			if (val !== node.pval) {
				throw new Error('Conflicting changes');
			}
		} else {
			node.pval = val;
			changes.items[changes.len++] = node;
		}
	} else {
		node.pval = val;
		if (node.flag & Flag.Logging) {
			changes.items[changes.len++] = node;
			execute();
		} else {
			node.update();
		}
	}
	return val;
}

/**
 * 
 * @param {Computation} node 
 * @param {Source} src 
 */
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

/**
 * 
 * @param {Computation} to 
 * @param {number} slot 
 */
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
			node.flag |= Flag.Pending;
			logPendingSource(node, -1);
		}
		if (nodes !== null) {
			for (i = 0, len = nodes.length; i < len; i++) {
				node = nodes[i];
				node.flag |= Flag.Pending;
				logPendingSource(node, i);
			}
		}
	}
	if (to.owned !== null) {
		logPendingOwner(to);
	}
}

/**
 * 
 * @param {Computation} owner 
 */
function logPendingOwner(owner) {
	var i, node,
		owned = owner.owned,
		len = owned.length;
	for (i = 0; i < len; i++) {
		node = owned[i];
		node.owner = owner;
		node.flag |= Flag.Pending;
		if (node.owned !== null) {
			logPendingOwner(node);
		}
	}
}

/**
 * 
 */
function execute() {
	var owner = Owner;
	Root.updates.len = 0;
	try {
		tick(Root);
	} finally {
		Owner = owner;
		Listener = null;
		State = System.Idle;
	}
}

/**
 * 
 * @param {Clock} clock 
 */
function tick(clock) {
	var j, queue, node,
		i = 0;
	clock.disposes.len = 0;
	do {
		clock.time++;
		queue = clock.changes;
		State = System.Change;
		for (j = 0; j < queue.len; j++) {
			queue.items[j].update();
		}
		queue.len = 0;
		queue = clock.traces;
		State = System.Trace;
		for (j = 0; j < queue.len; j++) {
			node = queue.items[j];
			if (node.flag & Flag.Stale) {
				node.update();
			}
		}
		queue.len = 0;
		queue = clock.updates;
		State = System.Update;
		for (j = 0; j < queue.len; j++) {
			node = queue.items[j];
			if (node.flag & Flag.Stale) {
				node.update();
			}
		}
		queue.len = 0;
		queue = clock.disposes;
		State = System.Dispose;
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
	State = System.Idle;
}

/**
 * 
 * @param {Log<Computation>} log 
 * @param {number} time 
 */
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

/**
 * 
 * @param {Computation} node 
 * @param {number} time 
 */
function setComputationStale(node, time) {
	var q = node.flag & Flag.Trace ? Root.traces : Root.updates;
	q.items[q.len++] = node;
	node.age = time;
	node.flag |= Flag.Stale;
	if (node.owned !== null) {
		markComputationsDisposed(node.owned, time);
	}
	if ((node.flag & (Flag.Trace | Flag.Logging)) === Flag.Logging) {
		setComputationsStale(node.log, time);
	}
}

/**
 * 
 * @param {Computation[]} nodes 
 * @param {number} time 
 */
function markComputationsDisposed(nodes, time) {
	var node, i, len;
	for (i = 0, len = nodes.length; i < len; i++) {
		node = nodes[i];
		if (!(node.flag & Flag.Disposed)) {
			node.age = time;
			node.flag &= ~Flag.Stale;
			node.flag |= Flag.Disposed;
			if (node.owned !== null) {
				markComputationsDisposed(node.owned, time);
			}
		}
	}
}

/**
 * 
 * @param {Computation} node 
 */
function applyUpstreamUpdates(node) {
	var i, len, slot,
		source, sources,
		owner = node.owner,
		traces = node.traces;
	if (owner !== null) {
		applyUpstreamUpdates(owner);
	}
	if (!(node.flag & Flag.Disposed)) {
		if (traces !== null) {
			sources = node.sources;
			for (i = 0, len = traces.length; i < len; i++) {
				slot = traces[i];
				source = slot === -1 ? node.source1 : sources[slot];
				if (source.flag & (Flag.Trace | Flag.Pending)) {
					applyUpstreamUpdates(source);
				}
				if (source.flag & Flag.Stale) {
					source.update();
				}
			}
		}
		if (node.flag & Flag.Stale) {
			node.update();
		}
	}
}

/**
 * 
 * @param {Computation} node 
 * @param {boolean} final 
 */
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
		(flag & (Flag.Static | Flag.Dynamic)) === Flag.Dynamic ||
		(flag & (Flag.Static | Flag.Dynamic | Flag.Unbound)) === Flag.Unbound
	) {
		cleanupSources(node);
	}
}

/**
 * 
 * @param {Computation} node 
 */
function cleanupSources(node) {
	var i, len, sources, slots;
	if (node.flag & Flag.Reading) {
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
	node.flag &= ~Flag.Reading;
}

/**
 * 
 * @param {Signal} source 
 * @param {number} slot 
 */
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

/**
 * @template T
 * @typedef {Object} Changeset
 * @property {number} mod
 * @property {number=} i1
 * @property {number=} i2
 * @property {T|T[]=} value
 */

/**
 * @template T
 * @typedef {Object} IEnumerable
 * @property {T[]} val
 * @property {Log<Computation>} log
 * @property {number} flag
 * @property {Changeset<T>} cs
 * @property {function(): T[]} get
 * @property {function(): Changeset<T>} mut
 * @property {function(function(T,number=): boolean): (function(): boolean)} every
 * @property {function(function(T,number=): boolean): IEnumerable<T>} filter
 * @property {function(function(T,number=): boolean): (function(): number)} find
 * @property {function(function(T,number=): boolean): (function(): number)} findIndex
 * @property {function(function(T,number=): void): void} forEach
 * @property {function(T,number=): (function(): boolean)} includes
 * @property {function(T,number=): (function(): boolean)} indexOf
 * @property {function(string=): (function(): string)} join
 * @property {function(T,number=): (function(): number)} lastIndexOf
 * @property {function(function(T,number=): *): IEnumerable<*>} map
 * @property {function(function(*,T,number=):*, *=): (function(): *)} reduce
 * @property {function(function(*,T,number=):*, *=): (function(): *)} reduceRight
 * @property {function(): IEnumerable<T>} reverse
 * @property {function(number=,number=): IEnumerable<T>} slice
 * @property {function(function(T,number=): boolean): (function(): boolean)} some
 * @property {function(function(T,T): number): IEnumerable<T>} sort
 * 
 */

//#endregion

//#region 2.2 Public API

/**
 * @template T
 * @param {T} val 
 * @returns {List<T>}
 */
function list(val) {
	return new List(val);
}

//#endregion

//#region 2.3 Object implementations

//#region 2.3.1 IEnumerable

/**
 * @template T
 * @param {IEnumerable<T>} prototype 
 */
function IEnumerable(prototype) {
	/**
	 * @template T
	 * @this {IEnumerable<T>}
	 * @param {function(T,number=): boolean} callback 
	 * @returns {function(): boolean}
	 */
	prototype.every = function (callback) {
		var src = this,
			pure = callback.length === 1;
		return tie(src, /** @param {boolean} seed */ function (seed) {
			var i, ilen, j, jlen, c,
				cs = src.cs,
				items = src.get(),
				len = items.length;
			if (seed !== Void && pure && cs !== null) {
				if (src.flag & Flag.Single) {
					if (seed) {
						if (cs.mod & Mod.Add) {
							if (cs.mod & Mod.Range) {
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
						if (cs.mod & (Mod.Add | Mod.Reorder)) {
							return false;
						}
					}
				} else {
					scope: {
						for (i = 0, ilen = cs.length; i < ilen; i++) {
							c = cs[i];
							if (seed) {
								if (c.mod & Mod.Add) {
									if (c.mod & Mod.Range) {
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
								if (c.mod & Mod.Delete) {
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
		}, Void, Flag.Trace);
	}
	/**
	 * @template T
	 * @this {IEnumerable<T>}
	 * @param {function(T,number=): boolean} callback 
	 * @returns {IEnumerable<T>}
	 */
	prototype.filter = function (callback) {
		var src = this,
			k = null,
			node = new Enumerable(),
			pure = callback.length === 1;
		return Enumerable.setup(node, src, /** @param {T[]} seed */ function (seed) {
			var i, j, m, n, item, args,
				mod, found, value, csval,
				cs = src.cs,
				items = src.get(),
				len = items.length;
			if (seed === Void) {
				k = new Array(len);
				seed = new Array(len);
			} else if (pure && cs !== null) {
				mod = cs.mod & Mod.Type;
				if (cs.mod & Mod.Reorder) {
					// # Todo
				} else {
					if (mod & Mod.InsertAt) {
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
							node.flag |= Flag.Changed;
							for (i++; i < len; i++) {
								if (k[i] !== -1) {
									k[i]++;
								}
							}
						} else {
							k.splice(i, 0, -1);
							node.flag &= ~Flag.Changed;
						}
					} else if (mod & Mod.InsertRange) {
						i = cs.i1;
						n = k.length;
						value = cs.value;
						if (len > 0 && i < n) {
							for (j = i; j < n && k[j] === -1; j++) {}
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
							node.cs = {mod: Mod.InsertRange, i1: j - n, value: csval};
							node.flag |= Flag.Changed;
						} else {
							node.cs = VoidMod;
							node.flag &= ~Flag.Changed;
						}
					} else if (mod & Mod.Move) {
						i = cs.i1;
						j = cs.i2;
						m = j > i ? 1 : -1;
						item = k[i];
						for (; i !== j; i += m) {
							k[i] = k[i + m];
						}
						k[j] = item;
					} else if (mod & Mod.Push) {
						found = callback(cs.value);
						j = seed.length;
						n = k.length;
						if (found) {
							k[n] = j;
							seed[j] = cs.value;
							if (j === cs.i1) {
								node.cs = cs;
							} else {
								node.cs = {mod: Mod.Push, i1: j, value: cs.value};
							}
							node.flag |= Flag.Changed;
						} else {
							k[n] = -1;
							node.cs = VoidMod;
							node.flag &= ~Flag.Changed;
						}
					} else if (mod & Mod.Pop) {
						i = k.pop();
						if (i !== -1) {
							seed.pop();
							node.cs = cs;
							node.flag |= Flag.Changed;
						} else {
							node.cs = VoidMod;
							node.flag &= ~Flag.Changed;
						}
					} else if (mod & Mod.RemoveAt) {
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
							if (i === j) {
								node.cs = cs;
							} else {
								node.cs = {mod: Mod.RemoveAt, i1: j};
							}
							node.flag |= Flag.Changed;
						} else {
							node.cs = VoidMod;
							node.flag &= ~Flag.Changed;
						}
					} else if (mod & Mod.RemoveRange) {
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
							node.cs = {mod: Mod.RemoveRange, i1: j, i2: m};
							node.flag |= Flag.Changed;
						} else {
							node.cs = VoidMod;
							node.flag &= ~Flag.Changed;
						}
					} else if (mod & Mod.Replace) {
						i = cs.i1;
						n = k.length;
						for (j = i; j < n && k[j] === -1; j++) {}
						if (j >= n) {
							j = seed.length;
						} else {
							j = k[j];
						}
						found = callback(cs.value);
						if (found) {
							seed[j] = cs.value;
							node.cs = {mod: Mod.Replace, i1: j, value: cs.value};
							node.flag |= Flag.Changed;
						} else {
							node.cs = VoidMod;
							node.flag &= Flag.Changed;
						}
					} else if (mod & Mod.Shift) {
						j = k.shift();
						if (j !== -1) {
							for (i = 1; i < len; i++) {
								if (k[i] !== -1) {
									k[i]--;
								}
							}
							seed.shift();
							node.cs = cs;
							node.flag |= Flag.Changed;
						} else {
							node.cs = VoidMod;
							node.flag &= ~Flag.Changed;
						}
					} else if (mod & Mod.Unshift) {
						found = callback(cs.value);
						if (found) {
							k.unshift(0);
							for (i = 1; i < len; i++) {
								if (k[i] !== -1) {
									k[i]++;
								}
							}
							seed.unshift(cs.value);
							node.cs = cs;
							node.flag |= Flag.Changed;
						} else {
							k.unshift(-1);
							node.cs = VoidMod;
							node.flag &= ~Flag.Changed;
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
			node.flag |= Flag.Changed;
			return seed;
		});
	}
	/**
	 * @template T
	 * @this {IEnumerable<T>}
	 * @param {function(T,number=): boolean} callback 
	 * @returns {function(): T}
	 */
	prototype.find = function (callback) {
		var src = this,
			i = -1,
			pure = callback.length === 1;
		return tie(src, /** @param {number=} seed */ function (seed) {
			var item,
				cs = src.cs,
				items = src.get(),
				len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = indexOf(src.flag, cs, callback, true, i, items.length, false);
				if (i !== NoResult) {
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
		}, Void, Flag.Trace);
	}
	/**
	 * @template T
	 * @this {IEnumerable<T>}
	 * @param {function(T,number=): boolean} callback 
	 * @param {number} index 
	 * @returns {function(): number}
	 */
	prototype.findIndex = function (callback, index) {
		var src = this,
			index = -1,
			pure = callback.length === 1 && arguments.length === 1;
		return tie(src, /** @param {number} seed */ function (seed) {
			var i, cs,
				items = src.get(),
				len = items.length;
			if (pure && seed !== Void) {
				cs = src.cs;
				if (cs !== null) {
					i = indexOf(src.flag, cs, callback, true, index, items.length, false);
					if (i !== NoResult) {
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
		}, Void, Flag.Trace);
	}
	/**
	 * @template T
	 * @this {IEnumerable<T>}
	 * @param {function(T,number=): void} callback 
	 * @returns {void}
	 */
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
		Enumerable.setup(node, src, /** @param {{}} seed */ function (seed) {
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
				if (src.flag & Flag.Single) {
					node.flag |= Flag.Single;
					node.cs = applyMapMutation(callback, c, null, roots, clen, cs);
				} else {
					node.flag &= ~Flag.Single;
					j = cs.length;
					node.cs = new Array(j);
					for (i = 0; i < j; i++) {
						node.cs[i] = applyMapMutation(callback, c, null, roots, clen, cs[i]);
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
									for (j = umin; j < umax && found[j]; j++, umin++) {}
									for (j = umax; j > umin && found[j]; j--, umax--) {}
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
	/**
	 * @template T
	 * @this {IEnumerable<T>}
	 * @param {T} valueToFind 
	 * @param {number=} fromIndex 
	 * @returns {function(): boolean}
	 */
	prototype.includes = function (valueToFind, fromIndex) {
		var src = this,
			i = -1,
			pure = arguments.length === 1;
		return tie(src, /** @param {boolean} seed */ function (seed) {
			var cs = src.cs,
				items = src.get(),
				len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = indexOf(src.flag, cs, valueToFind, false, seed, i, items.length, false);
				if (i !== NoResult) {
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
		}, Void, Flag.Trace);
	}
	/**
	 * @template T
	 * @this {IEnumerable<T>}
	 * @param {T} searchElement 
	 * @param {number=} fromIndex 
	 * @returns {function(): number}
	 */
	prototype.indexOf = function (searchElement, fromIndex) {
		var src = this,
			i = -1,
			pure = arguments.length === 1;
		return tie(src, /** @param {number} seed */ function (seed) {
			var cs = src.cs,
				items = src.get(),
				len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = indexOf(src.flag, cs, searchElement, false, i, items.length, false);
				if (i !== NoResult) {
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
		}, Void, Flag.Trace);
	}
	/**
	 * @this {IEnumerable<T>}
	 * @param {string=} separator 
	 * @returns {function(): string}
	 */
	prototype.join = function (separator) {
		var src = this;
		return tie(src, function () {
			return src.get().join(separator);
		}, void 0, Flag.Trace);
	}
	/**
	 * @template T
	 * @this {IEnumerable<T>}
	 * @param {T} searchElement 
	 * @param {number=} fromIndex 
	 * @returns {function(): number}
	 */
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
					if (i !== NoResult) {
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
		}, Void, Flag.Trace);
	}
	/**
	 * @template T,U
	 * @this {IEnumerable<T>}
	 * @param {function(T,number): U} callback 
	 * @returns {IEnumerable<U>}
	 */
	prototype.map = function (callback) {
		var src = this,
			node = new Enumerable(),
			c = [],
			clen = 0,
			roots = [];
		node.roots = roots;
		node.flag |= Flag.Changed;
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
				if (src.flag & Flag.Single) {
					node.flag |= Flag.Single;
					node.cs = applyMapMutation(callback, c, seed, roots, clen, cs);
				} else {
					node.flag &= ~Flag.Single;
					j = cs.length;
					node.cs = new Array(j);
					for (i = 0; i < j; i++) {
						node.cs[i] = applyMapMutation(callback, c, seed, roots, clen, cs[i]);
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
									for (j = umin; j < umax && found[j]; j++, umin++) {}
									for (j = umax; j > umin && found[j]; j--, umax--) {}
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
	/**
	 * @template T,U
	 * @this {IEnumerable<T>}
	 * @param {function(U,T,number): U} callback 
	 * @param {U=} initialValue 
	 * @returns {function(): U}
	 */
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
		}, void 0, Flag.Trace);
	}
	/**
	 * @template T,U
	 * @this {IEnumerable<T>}
	 * @param {function(U,T,number): U} callback 
	 * @param {U=} initialValue 
	 * @returns {function(): U}
	 */
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
		}, Void, Flag.Trace);
	}
	/**
	 * @template T
	 * @this {IEnumerable<T>}
	 * @returns {IEnumerable<T>}
	 */
	prototype.reverse = function () {
		var src = this,
			node = new Enumerable();
		node.flag |= Flag.Changed;
		return Enumerable.setup(node, src, /** @param {T[]} seed */ function (seed) {
			var i,
				cs = src.cs,
				items = src.get(),
				len = items.length;
			if (seed === Void) {
				seed = new Array(len);
			} else if (cs !== null) {
				if (src.flag & Flag.Single) {
					node.flag |= Flag.Single;
					node.cs = applyReverseMutation(seed, cs);
				} else {
					node.flag &= ~Flag.Single;
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
	/**
	 * @template T
	 * @this {IEnumerable<T>}
	 * @param {number} start 
	 * @param {number} end 
	 * @returns {IEnumerable<T>}
	 */
	prototype.slice = function (start, end) {
		var src = this,
			node = new Enumerable();
		return Enumerable.setup(node, src, /** @param {T[]} seed */ function (seed) {
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
				if (src.flag & Flag.Single) {

				} else {

				}
			}
			node.flag |= Flag.Changed;
			seed.length = end - start;
			for (i = 0; start < end; i++, start++) {
				seed[i] = items[start];
			}
			return seed;
		});
	}
	/**
	 * @template T
	 * @this {IEnumerable<T>}
	 * @param {function(T,number): boolean} callback 
	 * @returns {function(): boolean}
	 */
	prototype.some = function (callback) {
		var src = this,
			index = -1,
			pure = callback.length === 1;
		return tie(src, /** @param {boolean} seed */ function (seed) {
			var i,
				cs = src.cs,
				items = src.get(),
				len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = indexOf(src.flag, cs, callback, true, index, items.length, false);
				if (i !== NoResult) {
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
		}, Void, Flag.Trace);
	}
	/**
	 * @template T
	 * @this {IEnumerable<T>}
	 * @param {function(T,T): number} compareFunction 
	 * @returns {IEnumerable<T>}
	 */
	prototype.sort = function (compareFunction) {
		var src = this,
			node = new Enumerable(Flag.Changed);
		return Enumerable.setup(node, this, function () {
			var items = src.get();
			var newItems = items.slice();
			newItems.sort(compareFunction);
			return newItems;
		});
	}
}

//#endregion

//#region 2.3.2 List

/**
 * @template T
 * @constructor
 * @augments Data<T>
 * @augments IEnumerable<T>
 * @param {T} val 
 */
function List(val) {
	Data.call(this, val);
	/**
	 * @type {Changeset<T>}
	 */
	this.cs = null;
	/**
	 * @type {Changeset<T>}
	 */
	this.pcs = null;
}

IEnumerable(List.prototype);

/**
 * @public
 * @returns {T[]}
 */
List.prototype.get = function () {
	if (Listener !== null) {
		logRead(this, Listener);
	}
	return this.val;
}

/**
 * @public
 * @param {T[]} next 
 * @returns {T[]}
 */
List.prototype.set = function (next) {
	return logWrite(this, next);
}

/**
 * 
 */
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
		if (flag & Flag.Single) {
			applyMutation(this.val, this.cs);
		}
		else {
			for (i = 0, len = this.cs.length; i < len; i++) {
				applyMutation(this.val, this.cs[i]);
			}
		}
	}
	if (flag & Flag.Logging) {
		setComputationsStale(this.log, Root.time);
	}
}

/**
 * 
 * @param {number} index 
 * @param {T} item 
 */
List.prototype.insertAt = function (index, item) {
	logMutate(this, {mod: Mod.InsertAt, i1: index, value: item});
}

/**
 * 
 * @param {number} index 
 * @param {T[]} items 
 */
List.prototype.insertRange = function (index, items) {
	logMutate(this, {mod: Mod.InsertRange, i1: index, value: items});
}

/**
 * 
 * @param {number} from 
 * @param {number} to 
 */
List.prototype.move = function (from, to) {
	logMutate(this, {mod: Mod.Move, i1: from, i2: to});
}

/**
 * 
 */
List.prototype.pop = function () {
	logMutate(this, {mod: Mod.Pop});
}

/**
 * 
 * @param {T} item 
 */
List.prototype.push = function (item) {
	logMutate(this, {mod: Mod.Push, value: item});
}

/**
 * 
 * @param {number} index 
 */
List.prototype.removeAt = function (index) {
	logMutate(this, {mod: Mod.RemoveAt, i1: index});
}

/**
 * 
 * @param {number} index 
 * @param {number} count 
 */
List.prototype.removeRange = function (index, count) {
	logMutate(this, {mod: Mod.RemoveRange, i1: index, i2: count});
}

/**
 * 
 * @param {number} index 
 * @param {T} item 
 */
List.prototype.replace = function (index, item) {
	logMutate(this, {mod: Mod.Replace, i1: index, value: item});
}

/**
 * 
 */
List.prototype.shift = function () {
	logMutate(this, {mod: Mod.Shift});
}

/**
 * 
 * @param {number} i1 
 * @param {number} i2 
 */
List.prototype.swap = function (i1, i2) {
	logMutate(this, {mod: Mod.Swap, i1: i1, i2: i2});
}

/**
 * 
 * @param {T} item 
 */
List.prototype.unshift = function (item) {
	logMutate(this, {mod: Mod.Unshift, value: item});
}

//#endregion

//#region 2.3.3 Enumerable

/**
 * 
 * @template T
 * @constructor
 * @augments Computation<T[]>
 * @augments IEnumerable<T>
 */
function Enumerable() {
	Computation.call(this, Log());
	/**
	 * @type {Changeset<T>}
	 */
	this.cs = null;
	/**
	 * @type {Computation[]}
	 */
	this.roots = null;
}

IEnumerable(Enumerable.prototype);

/**
 * @public
 * @static
 * @template T
 * @param {Enumerable<T>} node 
 * @param {Signal} source 
 * @param {function(T): T} fn 
 * @returns {Enumerable<T>}
 */
Enumerable.setup = function (node, source, fn) {
	var clock = Root,
		owner = Owner;
	logRead(source, node);
	sealNode(node, owner, fn, setupNode(node, fn, Void, Flag.Bound), 0);
	if (State === System.Idle) {
		finishToplevelExecution(clock);
	}
	return node;
}

/**
 * @public
 * @returns {T[]}
 */
Enumerable.prototype.get = function () {
	if (Listener !== null) {
		var flag = this.flag;
		if (flag & Flag.Pending) {
			if (State === System.Trace) {
				applyUpstreamUpdates(this);
			}
		}
		if (this.age === Root.time) {
			if (flag & Flag.Running) {
				throw new Error('Circular dependency');
			} else if (flag & Flag.Stale) {
				this.update();
			}
		}
		logRead(this, Listener);
	}
	return this.val;
}

/**
 * @returns {void}
 */
Enumerable.prototype.update = function () {
	var flag = this.flag,
		owner = Owner,
		listener = Listener;
	cleanupNode(this, false);
	Owner = this;
	Listener = null;
	this.flag &= ~Flag.Stale;
	this.flag |= Flag.Running;
	this.val = this.fn(this.val);
	if ((flag & (Flag.Trace | Flag.Logging)) === (Flag.Trace | Flag.Logging)) {
		if (flag & Flag.Changed) {
			setComputationsStale(this.log, Root.time);
		}
	}
	this.flag &= ~Flag.Running;
	Owner = owner;
	Listener = listener;
}

/**
 * @returns {void}
 */
Enumerable.prototype.dispose = function () {
	if (State & (System.Idle | System.Dispose)) {
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

/* @exclude */
var Type = {
	Index: 1,
	Value: 2,
	Range: 4,
	Head: 8,
	Tail: 16,
	Add: 32,
	Delete: 64,
	Reorder: 128,
}
/* @exclude */

/**
 * @enum {number}
 */
var Mod = {
	Index: Type.Index,
	Value: Type.Value,
	Range: Type.Range,
	Head: Type.Head,
	Tail: Type.Tail,
	Add: Type.Add,
	Delete: Type.Delete,
	Reorder: Type.Reorder,
	InsertAt: (256 | Type.Index | Type.Value | Type.Add),
	InsertRange: (512 | Type.Index | Type.Value | Type.Range | Type.Add),
	Move: (1024 | Type.Index | Type.Reorder),
	Pop: (2048 | Type.Tail | Type.Delete),
	Push: (4096 | Type.Value | Type.Tail | Type.Add),
	RemoveAt: (8192 | Type.Index | Type.Delete),
	RemoveRange: (16384 | Type.Index | Type.Range | Type.Delete),
	Replace: (32768 | Type.Index | Type.Value | Type.Add | Type.Delete),
	Shift: (65536 | Type.Head | Type.Delete),
	Swap: (131072 | Type.Index | Type.Reorder),
	Unshift: (262144 | Type.Add | Type.Value | Type.Head),
	Void: 524288,
	Type: 524032,
};

//#endregion

//#region 2.4.2 Variables

/* @exclude */
var NoResult = -2;
/* @exclude */
/**
 * @const 
 * @type {Changeset<void>}
 */
var PopMod = {mod: Mod.Pop};
/**
 * @const
 * @type {Changeset<void>}
 */
var ShiftMod = {mod: Mod.Shift};
/**
 * @const
 * @type {Changeset<void>}
 */
var VoidMod = {mod: Mod.Void};

//#endregion

//#endregion

//#region 2.5 Internal functionality

/**
 * @template T
 * @param {List<T>} node 
 * @param {Changeset<T>} cs 
 */
function logMutate(node, cs) {
	var changes = Root.changes;
	if (State !== System.Idle) {
		if (node.pval !== Void) {
			throw new Error('Conflicting changes');
		}
		if (node.pcs === null) {
			node.pcs = cs;
			node.flag |= Flag.Single;
			changes.items[changes.len++] = node;
		} else {
			if (node.flag & Flag.Single) {
				node.flag &= ~Flag.Single;
				node.pcs = [node.pcs, cs];
			} else {
				node.pcs[node.pcs.length] = cs;
			}
		}
	} else {
		node.flag |= Flag.Single;
		if (node.flag & Flag.Logging) {
			node.pcs = cs;
			changes.items[changes.len++] = node;
			execute();
		} else {
			node.pcs = cs;
			node.update();
		}
	}
}

/**
 * @template T
 * @param {Array<T>} array 
 * @param {Changeset<T>} cs 
 */
function applyMutation(array, cs) {
	var i, j, k, args, value,
		len = array.length,
		mod = cs.mod,
		mut = mod & Mod.Type;
	if (mod & Mod.Index) {
		cs.i1 = actualIndex(len, cs.i1);
	}
	if (mod & Mod.Reorder) {
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
			cs.mod = Mod.Void;
			return cs;
		}
	}
	if (mut & Mod.InsertAt) {
		i = cs.i1;
		if (len === i) {
			array.push(cs.value);
			cs.mod = Mod.Push;
		} else if (i === 0) {
			array.unshift(cs.value);
			cs.mod = Mod.Unshift;
		} else {
			array.splice(cs.i1, 0, cs.value);
		}
	} else if (mut & Mod.InsertRange) {
		args = [cs.i1, 0];
		value = cs.value;
		for (i = 0; i < value.length; i++) {
			args[i + 2] = value[i];
		}
		array.splice.apply(array, args);
	} else if (mut & Mod.Move) {
		k = j > i ? 1 : -1;
		args = array[i];
		for (; i !== j; i += k) {
			array[i] = array[i + k];
		}
		array[j] = args;
	} else if (mut & Mod.Pop) {
		if (len > 0) {
			array.length--;
		} else {
			cs.mod = Mod.Void;
		}
	} else if (mut & Mod.Push) {
		array[len] = cs.value;
	} else if (mut & Mod.RemoveAt) {
		if (len > 0) {
			i = cs.i1;
			if (len === i) {
				array.pop();
				cs.mod = Mod.Pop;
			} else if (i === 0) {
				array.shift();
				cs.mod = Mod.Shift;
			} else {
				removeAt(array, i);
			}
		} else {
			cs.mod = Mod.Void;
		}
	} else if (mut & Mod.RemoveRange) {
		if (cs.i1 < len) {
			if (cs.i1 + cs.i2 > len) {
				cs.i2 = len - cs.i1;
			}
			array.splice(cs.i1, cs.i2);
		} else {
			cs.mod = Mod.Void;
		}
	} else if (mut & Mod.Replace) {
		array[cs.i1] = cs.value;
	} else if (mut & Mod.Shift) {
		if (len > 0) {
			array.shift();
		} else {
			cs.mod = Mod.Void;
		}
	} else if (mut & Mod.Swap) {
		value = array[i];
		array[i] = array[j];
		array[j] = value;
	} else if (mut & Mod.Unshift) {
		array.unshift(cs.value);
	}
}

/**
 * @template T,U
 * @param {function(T,number): U} callback 
 * @param {Array<T>} items 
 * @param {Array<U>} seed
 * @param {Computation[]} roots 
 * @param {number} len 
 * @param {Changeset<T>} cs 
 * @returns {Changeset<T>}
 */
function applyMapMutation(callback, items, seed, roots, len, cs) {
	var i, j, k, len, item, node, value,
		itemArgs, nodeArgs, newVals,
		mut = cs.mod & Mod.Type,
		mapper = function () {
			return callback(item, j);
		}
	if (mut & Mod.InsertAt) {
		j = cs.i1;
		item = cs.value;
		node = root(mapper);
		items.splice(j, 0, item);
		roots.splice(j, 0, node);
		if (seed !== null) {
			seed.splice(j, 0, item);
		}
		cs = {mod: Mod.InsertAt, i1: j, value: node.val};
	} else if (mut & Mod.InsertRange) {
		value = cs.value;
		len = value.length;
		itemArgs = [cs.i1, 0],
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
		cs = {mod: Mod.InsertRange, i1: cs.i1, value: newVals};
	} else if (mut & Mod.Move) {
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
	} else if (mut & Mod.RemoveAt) {
		j = cs.i1;
		removeAt(items, j);
		roots[j].dispose();
		removeAt(roots, j);
		if (seed !== null) {
			removeAt(seed, j);
		}
	} else if (mut & Mod.RemoveRange) {
		for (j = cs.i1, len = cs.i2; len >= 0; j++, len--) {
			roots[j].dispose();
		}
		items.splice(cs.i1, cs.i2);
		roots.splice(cs.i1, cs.i2);
		if (seed !== null) {
			seed.splice(cs.i1, cs.i2);
		}
	} else if (mut & Mod.Replace) {
		j = cs.i1;
		roots[j].dispose();
		node = root(mapper);
		items[j] = cs.value;
		roots[j] = node;
		if (seed !== null) {
			seed[j] = node.val;
		}
	} else if (mut & Mod.Shift) {
		roots[0].dispose();
		items.shift();
		roots.shift();
		if (seed !== null) {
			seed.shift();
		}
	} else if (mut & Mod.Swap) {
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
	} else if (mut & Mod.Unshift) {
		j = 0;
		node = root(mapper)
		items.unshift(cs.value);
		roots.unshift(node);
		if (seed !== null) {
			seed.unshift(node.val);
		}
		cs = {mod: Mod.Unshift, value: node.val};
	}
	return cs;
}

/**
 * @template T
 * @param {Array<T>} array 
 * @param {Changeset<T>} cs 
 * @returns {Changeset<T>}
 */
function applyReverseMutation(array, cs) {
	var i, j, k, value, args,
		len = array.length,
		type = cs.mod & Mod.Type;
	if (type & Mod.InsertAt) {
		value = cs.value;
		i = len - cs.i1;
		array.splice(i, 0, value);
		cs = {mod: Mod.InsertAt, i1: i, value: value};
	} else if (type & Mod.InsertRange) {
		i = cs.i1;
		i = len - i;
		args = [i, 0];
		value = cs.value;
		for (j = 2, i = value.length - 1; i >= 0; i--) {
			args[j++] = value[i];
		}
		array.splice.apply(array, args);
		cs = {mod: Mod.InsertRange, i1: i, value: value};
	} else if (type & Mod.Move) {
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
		cs = {mod: Mod.Move, i1: i, i2: j};
	} else if (type & Mod.Pop) {
		array.shift();
		cs = {mod: Mod.Shift}
	} else if (type & Mod.Push) {
		array.unshift(cs.value);
		cs = {mod: Mod.Unshift, value: cs.value};
	} else if (type & Mod.RemoveAt) {
		i = len - 1 - cs.i1;
		removeAt(array, i)
		cs = {mod: Mod.RemoveAt, i1: i};
	} else if (type & Mod.RemoveRange) {
		i = len - cs.i1 - cs.i2;
		array.splice(i, cs.i2);
		cs = {mod: Mod.RemoveRange, i1: i, i2: cs.i2};
	} else if (type & Mod.Replace) {
		i = len - 1 - cs.i1;
		array[i] = cs.value;
		cs = {mod: Mod.Replace, i1: i, value: cs.value};
	} else if (type & Mod.Shift) {
		array.length--;
		cs = {mod: Mod.Pop};
	} else if (type & Mod.Swap) {
		i = len - 1 - cs.i1;
		j = len - 1 - cs.i2;
		value = array[i];
		array[i] = array[j];
		array[j] = value;
		cs = {mod: Mod.Swap, i1: i, i2: j};
	} else if (type & Mod.Unshift) {
		array[len] = cs.value;
		cs = {mod: Mod.Push, value: cs.value};
	}
	return cs;
}

/**
 * @template T
 * @param {number} flag 
 * @param {Changeset<T>} cs 
 * @param {T|function(T): boolean} item 
 * @param {boolean} call 
 * @param {number} index 
 * @param {number} length 
 * @param {boolean} last 
 * @returns {number}
 */
function indexOf(flag, cs, item, call, index, length, last) {
	var mod, type, i, len, c;
	if (cs !== null) {
		if (flag & Flag.Single) {
			mod = cs.mod;
			type = mod & Mod.Type;
			if (index === -1) {
				if (mod & Mod.Add) {
					if (mod & Mod.Range) {
						count = cs.i2;
						for (i = cs.i1; count >= 0; count--) {
							if (call ? item(cs.value[i]) : cs.value[i] === item) {
								return i;
							}
						}
						return -1;
					} else {
						if (call ? item(cs.value) : cs.value === item) {
							if (type & Mod.Unshift) {
								return 0;
							} else if (type & Mod.Push) {
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
				if (type & Mod.Push) {
					if (last) {
						if (call ? item(cs.value) : cs.value === item) {
							return length - 1;
						} else {
							return index;
						}
					} else {
						return index;
					}
				} else if (type & Mod.Pop) {
					if (index === length - 1) {
						return -1;
					} else {
						return index;
					}
				} else if (type & Mod.Shift) {
					if (index !== 0) {
						return index;
					}
				} else if (type & Mod.Unshift) {
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
					if (type & Mod.Index) {
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
						if (cs[i].mod & Mod.Add) {
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
						if (mod & Mod.Tail) {
							if (index === length - 1) {
								break scope;
							}
						} else if (mod & Mod.Index) {
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
	return NoResult;
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

/**
 * 
 * @param {Array} array 
 * @param {number} len 
 * @param {number} i 
 * @returns {number}
 */
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

/**
 * @template T
 * @param {T} value 
 * @returns {function(): T} 
 */
function copyValue(value) {
	if (value === null || typeof value !== 'object') {
		return function () {return value;}
	} else {
		if (Array.isArray(value)) {
			return function () {return value.slice();}
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

module.exports = {
	data, value, list,
	/* @exclude */
	System, Type,
	/* @exclude */
	fn, on, run, tie,
	cleanup, freeze, root, sample,
	Flag, Mod, Void,
	Data, Value, List,
	Computation, Enumerable,
};

//#endregion
