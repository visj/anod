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

/* @module */
/**
 * @interface
 * @template T
 */
function Signal() { }

/**
 * @type {T}
 */
Signal.prototype.val;

/**
 * @type {Log<Computation>}
 */
 Signal.prototype.log;

/**
 * @type {number}
 */
Signal.prototype.flag;

/**
 * @returns {T}
 */
Signal.prototype.get = function () { }

/**
 * @returns {void}
 */
Signal.prototype.update = function() { }

/**
 * @typedef {Signal|function(): *}
 */
var Source;
/* @module */

//#endregion

//#region 1.2 Public API

/**
 * @template T
 * @param {T} val 
 * @returns {function(T=): T}
 */
function data(val) {
	/**
	 * @const
	 * @type {Data<T>}
	 */
	var node = new Data(val);
	return /** @type {function(T=): T} */(function (next) {
		return arguments.length === 0 ? node.get() : node.set(next);
	});
}

/**
 * @template T
 * @param {T} val 
 * @param {function(T,T): boolean=} eq 
 * @returns {function(T=): T}
 */
function value(val, eq) {
	/**
	 * @const
	 * @type {Value<T>}
	 */
	var node = new Value(val, eq);
	return /** @type {function(T=): T} */(function (next) {
		return arguments.length === 0 ? node.get() : node.set(next);
	});
}

/**
 * @template T
 * @param {function(T): T} f 
 * @param {T=} seed 
 * @param {number=} flags 
 * @param {function(): *=} disposer 
 * @returns {function(): T}
 */
function run(f, seed, flags, disposer) {
	/**
	 * @const
	 * @type {Computation<T>}
	 */
	var node = new Computation(new Log());
	Computation.setup(node, f, seed, Flag.Unbound | flags, disposer);
	return function () { return node.get(); }
}

/**
 * @template T
 * @param {Array<Source>|Source} src
 * @param {function(T): T} f 
 * @param {T=} seed 
 * @param {number=} flags 
 * @param {function(): *=} disposer 
 * @returns {function(): T}
 */
function tie(src, f, seed, flags, disposer) {
	/**
	 * @const
	 * @type {Computation<T>}
	 */
	var node = new Computation(new Log());
	if (flags & Flag.Dynamic) {
		if (flags & Flag.Wait) {
			logSource(node, src);
		}
		seed = Computation.setup(node, function (seed) {
			logSource(node, src);
			return f(seed);
		}, seed, Flag.Bound | flags, disposer);
	} else {
		logSource(node, src);
		seed = Computation.setup(node, f, seed, Flag.Bound | flags, disposer);
	}
	return function () { return node.get(); }
}

/**
 * @template T
 * @param {function(T): T} f 
 * @param {T=} seed 
 * @param {number=} flags 
 * @param {function(): *=} disposer 
 * @returns {void}
 */
function fn(f, seed, flags, disposer) {
	Computation.setup(new Computation(null), f, seed, Flag.Unbound | flags, disposer);
}


/**
 * @template T
 * @param {Array<Source>|Source} src
 * @param {function(T): T} f 
 * @param {T=} seed 
 * @param {number=} flags 
 * @param {function(): *=} disposer
 * @returns {void}
 */
function on(src, f, seed, flags, disposer) {
	/**
	 * @const
	 * @type {Computation<T>}
	 */
	var node = new Computation(null);
	if (flags & Flag.Dynamic) {
		if (flags & Flag.Wait) {
			logSource(node, src);
		}
		Computation.setup(node, function (seed) {
			logSource(node, src);
			return f(seed);
		}, seed, Flag.Bound | flags, disposer);
	} else {
		logSource(node, src);
		Computation.setup(node, f, seed, Flag.Bound | flags, disposer);
	}
}

/**
 * 
 * @param {function(): *} f
 * @returns {void}
 */
function cleanup(f) {
	/** 
	 * @type {Array<function(): *>} 
	 */
	var cleanups;
	/** 
	 * @type {Computation}
	 */
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

/**
 * @template T
 * @param {function(): T} f 
 * @returns {T}
 */
function freeze(f) {
	/** 
	 * @type {T} 
	 */
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
 * @param {function(): T=} f 
 * @returns {Computation<T>}
 */
function root(f) {
	/** 
	 * @type {T}
	  */
	var val;
	/** 
	 * @type {Computation<T>} 
	 */
	var node = new Computation(null);
	/** 
	 * @type {Computation}
	 */
	var owner = Owner;
	/** 
	 * @type {Computation}
	 */
	var listener = Listener;
	Owner = node;
	Listener = null;
	try {
		val = f();
	} finally {
		Owner = owner;
		Listener = listener;
	}
	sealNode(node, null, /** @type {?} */(void 0), val, 0);
	return node;
}

/**
 * @template T
 * @param {Signal<T>|function(): T} node 
 * @returns {T}
 */
function sample(node) {
	/** 
	 * @type {Computation}
	 */
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
 * @implements {Signal<T>}
 */
function Data(val) {
	/**
	 * @type {T}
	 */
	this.val = val;
	/**
	 * @const
	 * @type {Log<Computation>}
	 */
	this.log = new Log();
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
	 * @const
	 * @type {(function(T,T): boolean)|undefined}
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
	return (this.eq !== void 0 ? this.eq(this.val, val) : this.val === val) ? val : logWrite(this, val);
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
 * @param {Log<Computation>} log 
 * @implements {Signal<T>}
 */
function Computation(log) {
	/**
	 * @type {T}
	 */
	this.val = void 0;
	/**
	 * @type {Log<Computation>|null}
	 */
	this.log = log;
	/**
	 * @type {number}
	 */
	this.flag = 0;
	/**
	 * @type {(function(T): T)|null}
	 */
	this.fn = null;
	/**
	 * @type {number}
	 */
	this.age = -1;
	/**
	 * @type {Signal|null}
	 */
	this.source1 = null;
	/**
	 * @type {number}
	 */
	this.slot1 = -1;
	/**
	 * @type {Array<Signal>|null}
	 */
	this.sources = null;
	/**
	 * @type {Array<number>|null}
	 */
	this.slots = null;
	/**
	 * @type {Computation|null}
	 */
	this.owner = null;
	/**
	 * @type {Array<number>|null}
	 */
	this.traces = null;
	/**
	 * @type {Array<Computation>|null}
	 */
	this.owned = null;
	/**
	 * @type {Array<function(): *>|null}
	 */
	this.cleanups = null;
	/**
	 * @type {(function(): *)|null}
	 */
	this.disposer = null;
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
 * @returns {T}
 */
Computation.setup = function (node, f, seed, flags, dispose) {
	/** 
	 * @type {Clock}
	 */
	var clock = Root;
	/** 
	 * @type {Computation|null}
	 */
	var owner = Owner;
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
	/** 
	 * @type {number}
	 */
	var flag;
	if (Listener !== null) {
		flag = this.flag;
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
	/** 
	 * @type {Computation|null}
	 */
	var owner = Owner;
	/** 
	 * @type {Computation|null}
	 */
	var listener = Listener;
	/** 
	 * @type {number}
	 */
	var flag = this.flag;
	/** 
	 * @type {T}
	 */
	var val = this.val;
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
		Root.disposes.add(this);
	}
}

//#endregion

//#endregion

//#region 1.4 System variablesconstants

//#region 1.4.1 Enums

/* @exclude */
/**
 * @const
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
 * @const
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
 * @type {Object}
 */
var Void = {};
/**
 * @const
 * @type {Clock}
 */
var Root = new Clock();
/**
 * @type {number}
 */
var State = System.Idle;
/**
 * @type {Computation|null}
 */
var Owner = null;
/**
 * @type {Computation|null}
 */
var Listener = null;

//#endregion

//#endregion

//#region 1.5 Internal functionality


/**
 * @template T
 * @constructor
 */
function Queue() {
	/**
	 * @type {number}
	 */
	this.len = 0;
	/**
	 * @const
	 * @type {Array<T>}
	 */
	this.items = [];
}

/**
 * 
 * @param {T} item
 * @returns {void} 
 */
Queue.prototype.add = function (item) {
	this.items[this.len++] = item;
}

/**
 * @constructor
 */
function Clock() {
	/**
	 * @type {number}
	 */
	this.time = 0;
	/**
	 * @const
	 * @type {Queue<Data>}
	 */
	this.changes = new Queue();
	/**
	 * @const
	 * @type {Queue<Computation>}
	 */
	this.traces = new Queue();
	/**
	 * @const
	 * @type {Queue<Computation>}
	 */
	this.updates = new Queue();
	/**
	 * @const
	 * @type {Queue<Computation>}
	 */
	this.disposes = new Queue();
}

/**
 * @template T
 * @constructor
 */
function Log() {
	/**
	 * @type {T}
	 */
	this.node1 = null;
	/**
	 * @type {number}
	 */
	this.slot1 = -1;
	/**
	 * @type {Array<T>|null}
	 */
	this.nodes = null;
	/**
	 * @type {Array<number>|null}
	 */
	this.slots = null;
}

/**
 * @template T
 * @param {Computation<T>} node 
 * @param {function(T): T} fn 
 * @param {T=} seed 
 * @param {number=} flags 
 * @returns {T}
 */
function setupNode(node, fn, seed, flags) {
	/**
	 * @type {Clock}
	 */
	var clock = Root;
	/**
	 * @type {Computation|null}
	 */
	var owner = Owner;
	/**
	 * @type {Computation|null}
	 */
	var listener = Listener;
	/**
	 * @type {boolean}
	 */
	var toplevel = State === System.Idle;
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
		seed = flags & Flag.Wait ? seed : fn(seed);
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
 * @param {function(): *=} disposer 
 * @returns {void}
 */
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
		if (owner.flag & (Flag.Trace | Flag.Pending)) {
			logPendingOwner(owner);
		}
	}
}

/**
 * 
 * @param {Clock} clock 
 * @returns {void}
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
 * @returns {void}
 */
function logRead(from, to) {
	/**
	 * @type {number}
	 */
	var fromslot;
	/**
	 * @type {number}
	 */
	var toslot;
	/**
	 * @type {Log}
	 */
	var log = from.log;
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
	/**
	 * @type {Queue<Data>}
	 */
	var changes = Root.changes;
	if (State !== System.Idle) {
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
		if (node.flag & Flag.Logging) {
			changes.add(node);
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
 * @param {Array<Source>|Source} src 
 * @returns {void}
 */
function logSource(node, src) {
	/**
	 * @type {Source}
	 */
	var s;
	/**
	 * @type {number}
	 */
	var i;
	/**
	 * @type {number}
	 */
	var len;
	/**
	 * @type {Computation|null}
	 */
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

/**
 * 
 * @param {Computation} to 
 * @param {number} slot 
 */
function logPendingSource(to, slot) {
	/**
	 * @type {number}
	 */
	var i;
	/**
	 * @type {number}
	 */
	var len;
	/**
	 * @type {Log<Computation>}
	 */
	var log;
	/**
	 * @type {Computation}
	 */
	var node;
	/**
	 * @type {Array<Computation>}
	 */
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
 * @returns {void}
 */
function logPendingOwner(owner) {
	/**
	 * @type {number}
	 */
	var i;
	/**
	 * @type {Computation}
	 */
	var node;
	/**
	 * @type {Array<Computation>}
	 */
	var owned = owner.owned;
	/**
	 * @type {number}
	 */
	var len = owned.length;
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
 * @returns {void}
 */
function execute() {
	/**
	 * @type {Computation}
	 */
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
 * @returns {void}
 */
function tick(clock) {
	/**
	 * @type {number}
	 */
	var j;
	/**
	 * @type {Queue<Data>|Queue<Computation>}
	 */
	var queue;
	/**
	 * @type {Computation}
	 */
	var node;
	/**
	 * @type {number}
	 */
	var i = 0;
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
			node = /** @type {Queue<Computation>} */(queue).items[j];
			if (node.flag & Flag.Stale) {
				node.update();
			}
		}
		queue.len = 0;
		queue = clock.updates;
		State = System.Update;
		for (j = 0; j < queue.len; j++) {
			node = /** @type {Queue<Computation>} */(queue).items[j];
			if (node.flag & Flag.Stale) {
				node.update();
			}
		}
		queue.len = 0;
		queue = clock.disposes;
		State = System.Dispose;
		for (j = 0; j < queue.len; j++) {
			node = /** @type {Queue<Computation>} */(queue).items[j];
			node.fn = null;
			node.log = null;
			cleanupNode(node, true);
		}
		queue.len = 0;
		if (i++ > 1e5) {
			throw new Error('Runaway clock');
		}
	} while (clock.changes.len > 0 || clock.updates.len > 0 || clock.disposes.len > 0);
	State = System.Idle;
}

/**
 * 
 * @param {Log<Computation>} log 
 * @param {number} time 
 */
function setComputationsStale(log, time) {
	/**
	 * @type {number}
	 */
	var i;
	/**
	 * @type {number}
	 */
	var len;
	/**
	 * @type {Computation|null}
	 */
	var node = log.node1;
	/**
	 * @type {Array<Computation>|null}
	 */
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

/**
 * 
 * @param {Computation} node 
 * @param {number} time 
 */
function setComputationStale(node, time) {
	if (node.flag & Flag.Trace) {
		Root.traces.add(node);
	} else {
		Root.updates.add(node);
	}
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
 * @param {Array<Computation>} nodes 
 * @param {number} time 
 * @returns {void}
 */
function markComputationsDisposed(nodes, time) {
	/**
	 * @type {number}
	 */
	var i;
	/**
	 * @type {number}
	 */
	var len;
	/**
	 * @type {Computation}
	 */
	var node;
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
 * @returns {void}
 */
function applyUpstreamUpdates(node) {
	/**
	 * @type {number}
	 */
	var i;
	/**
	 * @type {number}
	 */
	var len;
	/**
	 * @type {number}
	 */
	var slot;
	/**
	 * @type {Signal}
	 */
	var source;
	/**
	 * @type {Array<Signal>}
	 */
	var sources;
	/**
	 * @type {Computation}
	 */
	var owner = node.owner;
	/**
	 * @type {Array<number>}
	 */
	var traces = node.traces;
	if (owner !== null) {
		applyUpstreamUpdates(owner);
	}
	if (!(node.flag & Flag.Disposed)) {
		if (traces !== null) {
			sources = node.sources;
			for (i = 0, len = traces.length; i < len; i++) {
				slot = traces[i];
				source = slot === -1 ? node.source1 : sources[slot];
				applyUpstreamUpdates(/** @type {Computation} */(source));
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
 * @returns {void}
 */
function cleanupNode(node, final) {
	/**
	 * @type {number}
	 */
	var i;
	/**
	 * @type {number}
	 */
	var len;
	/**
	 * @type {number}
	 */
	var flag = node.flag;
	/**
	 * @type {Array<Computation>|null}
	 */
	var owned = node.owned;
	/**
	 * @type {Array<function(): *>|null}
	 */
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
		(flag & (Flag.Static | Flag.Dynamic)) === Flag.Dynamic ||
		(flag & (Flag.Static | Flag.Dynamic | Flag.Unbound)) === Flag.Unbound
	) {
		cleanupSources(node);
	}
}

/**
 * 
 * @param {Computation} node 
 * @returns {void}
 */
function cleanupSources(node) {
	/**
	 * @type {number}
	 */
	var i;
	/**
	 * @type {number}
	 */
	var len;
	/**
	 * @type {Array<Signal>|null}
	 */
	var sources;
	/**
	 * @type {Array<number>}
	 */
	var slots;
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
		if (node.traces !== null) {
			node.traces.length = 0;
		}
		node.flag &= ~Flag.Reading;
	}
}

/**
 * 
 * @param {Signal} source 
 * @param {number} slot 
 * @returns {void}
 */
function cleanupSource(source, slot) {
	/**
	 * @type {Computation}
	 */
	var last;
	/**
	 * @type {number}
	 */
	var lastslot;
	/**
	 * @type {Array<Computation>}
	 */
	var nodes;
	/**
	 * @type {Array<number>}
	 */
	var slots;
	/**
	 * @type {Log<Computation>}
	 */
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

//#endregion

//#endregion

//#region 2. Array reactivity library

//#region 2.1 Type definitions

/* @module */
/**
 * @record
 * @template T
 */
function Changeset() { }

/**
 * @type {number}
 */
Changeset.prototype.mod;

/**
 * @type {number|undefined}
 */
Changeset.prototype.i1;

/**
 * @type {number|undefined}
 */
Changeset.prototype.i2;

/**
 * @type {Array<T>|T|undefined}
 */
Changeset.prototype.value;

/**
 * @interface
 * @template T
 * @extends {Signal<Array<T>>}
 */
function IEnumerable() { }

/**
 * @type {Changeset<T>|Array<Changeset<T>>}
 */
IEnumerable.prototype.cs;

/**
 * 
 * @param {function(T,number=): boolean} callback
 * @returns {function(): boolean} 
 */
IEnumerable.prototype.every = function (callback) { }

/**
 * 
 * @param {function(T,number=): boolean} callback 
 * @returns {IEnumerable<T>}
 */
IEnumerable.prototype.filter = function (callback) { }

/**
 * 
 * @param {function(T,number=): boolean} callback 
 * @returns {function(): (T|undefined)}
 */
IEnumerable.prototype.find = function (callback) { }

/**
 * 
 * @param {function(T,number=): boolean} callback 
 * @param {number=} index
 * @returns {function(): number}
 */
IEnumerable.prototype.findIndex = function (callback, index) { }

/**
 * 
 * @param {function(T,number=): void} callback
 * @returns {void} 
 */
IEnumerable.prototype.forEach = function (callback) { }

/**
 * 
 * @param {T} valueToFind 
 * @param {number=} fromIndex 
 * @returns {function(): boolean}
 */
IEnumerable.prototype.includes = function (valueToFind, fromIndex) { }

/**
 * 
 * @param {T} searchElement 
 * @param {number=} fromIndex 
 * @returns {function(): number}
 */
IEnumerable.prototype.indexOf = function (searchElement, fromIndex) { }

/**
 * 
 * @param {string=} separator 
 * @returns {function(): string}
 */
IEnumerable.prototype.join = function (separator) { }

/**
 * 
 * @param {T} searchElement 
 * @param {number=} fromIndex 
 * @returns {function(): number}
 */
IEnumerable.prototype.lastIndexOf = function (searchElement, fromIndex) { }

/**
 * @template U
 * @param {function(T,number=): U} callback 
 * @returns {IEnumerable<U>}
 */
IEnumerable.prototype.map = function (callback) { }

/**
 * @template U
 * @param {function(U,T,number=): U} callback
 * @returns {function(): U} 
 */
IEnumerable.prototype.reduce = function(callback) { }

/**
 * @template U
 * @param {function(U,T,number=): U} callback
 * @returns {function(): U} 
 */
 IEnumerable.prototype.reduceRight = function(callback) { }

 /**
	* @returns {IEnumerable<T>}
  */
 IEnumerable.prototype.reverse = function() { }

 /**
	* 
	* @param {number=} start 
	* @param {number=} end 
	* @returns {IEnumerable<T>}
	*/
 IEnumerable.prototype.slice = function(start, end) { }

 /**
	* 
	* @param {function(T,number=): boolean} callback
	* @returns {function(): boolean} 
	*/
 IEnumerable.prototype.some = function(callback) { }

 /**
	* 
	* @param {function(T,T): number} compareFunction
	* @returns {IEnumerable<T>} 
	*/
 IEnumerable.prototype.sort = function(compareFunction) { }

/* @module */

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
 * @this {IEnumerable<T>}
 * @param {function(T,number=): boolean} callback 
 * @returns {function(): boolean}
 */
function every(callback) {
	/**
	 * @type {IEnumerable<T>}
	 */
	var src = this;
	/**
	 * @type {boolean}
	 */
	var pure = callback.length === 1;
	return /** @type {function(): boolean} */(
		tie(src, /** @param {Object|boolean} seed */ function (seed) {
			/**
			 * @type {number}
			 */
			var i;
			/**
			 * @type {number}
			 */
			var ilen;
			/**
			 * @type {number}
			 */
			var j;
			/**
			 * @type {number}
			 */
			var jlen;
			/**
			 * @type {Changeset<T>}
			 */
			var c;
			/**
			 * @type {Changeset<T>|Array<Changeset<T>>}
			 */
			var cs = src.cs;
			/**
			 * @type {Array<T>}
			 */
			var items = src.get();
			/**
			 * @type {number}
			 */
			var len = items.length;
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
		}, Void, Flag.Trace)
	);
}

/**
 * @template T
 * @this {IEnumerable<T>}
 * @param {function(T,number=): boolean} callback 
 * @returns {IEnumerable<T>}
 */
function filter(callback) {
	/**
	 * @type {IEnumerable<T>}
	 */
	var src = this;
	/**
	 * @type {Array<number>}
	 */
	var k = null;
	/**
	 * @type {Enumerable<Object|T>}
	 */
	var node = new Enumerable();
	/**
	 * @type {boolean}
	 */
	var pure = callback.length === 1;
	return /** @type {IEnumerable<T>} */(
		Enumerable.setup(node, src, /** @param {Object|Array<T>} seed */ function (seed) {
			/**
			 * @type {number}
			 */
			var i; 
			/**
			 * @type {number}
			 */
			var j;
			/**
			 * @type {T}
			 */
			var item;
			/**
			 * @type {Changeset<T>|Array<Changeset<T>>}
			 */
			var cs = src.cs;
			/**
			 * @type {boolean}
			 */
			var changed;
			/**
			 * @type {Array<T>}
			 */
			var items = src.get();
			/**
			 * @type {number}
			 */
			var len = items.length;
			if (seed === Void) {
				k = new Array(len);
				seed = new Array(len);
			} else if (pure && cs !== null) {
				if (cs.mod & Mod.Reorder) {
					// # Todo
				} else {
					if (cs.mod === Mod.Void) {
						node.cs = cs;
						node.flag |= Flag.Single;
						node.flag &= ~Flag.Changed;
					} else {
						if (src.flag & Flag.Single) {
							node.flag |= Flag.Single;
							node.cs = cs = applyFilterMutation(callback, items, /** @type {Array<T>} */(seed), k, len, /** @type {Changeset<T>} */(cs));
							if (cs.mod !== Mod.Void) {
								node.flag |= Flag.Changed;
							} else {
								node.flag &= ~Flag.Changed;
							}
						} else {
							node.flag &= ~Flag.Single;
							j = cs.value.length;
							node.cs = new Array(j);
							for (i = 0; i < j; i++) {
								node.cs[i] = cs = applyFilterMutation(callback, items, /** @type {Array<T>} */(seed), k, len, /** @type {Array<Changeset<T>>} */(src.cs)[i]);
								if (cs.mod !== Mod.Void) {
									changed = true;
								}
							}
							if (changed) {
								node.flag |= Flag.Changed;
							} else {
								node.flag &= ~Flag.Changed;
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
			node.flag |= Flag.Changed;
			return seed;
		}, Flag.Trace)
	);
}

/**
 * @template T
 * @this {IEnumerable<T>}
 * @param {function(T,number=): boolean} callback 
 * @returns {function(): T}
 */
function find(callback) {
	/**
	 * @type {IEnumerable<T>}
	 */
	var src = this;
	/**
	 * @type {number}
	 */
	var i = -1;
	/**
	 * @type {boolean}
	 */
	var pure = callback.length === 1;
	return /** @type {function(): T} */(
		tie(src, /** @param {Object|number} seed */ function (seed) {
			/**
			 * @type {T}
			 */
			var item;
			/**
			 * @type {Changeset<T>|Array<Changeset<T>>}
			 */
			var cs = src.cs;
			/**
			 * @type {Array<T>}
			 */
			var items = src.get();
			/** 
			 * @type {number}
			 */
			var len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = getIndex(src.flag, cs, callback, true, i, len, false);
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
		}, Void, Flag.Trace)
	);
}
/**
 * @template T
 * @this {IEnumerable<T>}
 * @param {function(T,number=): boolean} callback 
 * @param {number=} index 
 * @returns {function(): number}
 */
function findIndex(callback, index) {
	/**
	 * @type {IEnumerable<T>}
	 */
	var src = this;
	/**
	 * @type {boolean}
	 */
	var pure = callback.length === 1 && arguments.length === 1;
	return /** @type {function(): number} */(
		tie(src, /** @param {Object|number} seed */ function (seed) {
			/**
			 * @type {number}
			 */
			var i;
			/**
			 * @type {Changeset<T>|Array<Changeset<T>>}
			 */
			var cs = src.cs;
			/**
			 * @type {Array<T>}
			 */
			var items = src.get();
			/**
			 * @type {number}
			 */
			var len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = getIndex(src.flag, cs, callback, true, /** @type {number} */(seed), len, false);
				if (i !== NoResult) {
					return i;
				}
			}
			for (i = 0; i < len; i++) {
				if (callback(items[i], i)) {
					return i;
				}
			}
			return -1;
		}, Void, Flag.Trace)
	);
}
/**
 * @template T
 * @this {IEnumerable<T>}
 * @param {function(T,number=): void} callback 
 * @returns {void}
 */
function forEach(callback) {
	/**
	 * @type {IEnumerable<T>}
	 */
	var src = this;
	/**
	 * @type {Enumerable<Object|undefined>}
	 */
	var node = new Enumerable();
	/**
	 * @type {Array<T>}
	 */
	var c = [];
	/**
	 * @type {number}
	 */
	var clen = 0;
	/**
	 * @type {Array<Computation>}
	 */
	var roots = [];
	cleanup(function () {
		/**
		 * @type {number}
		 */
		var i;
		for (i = 0; i < clen; i++) {
			roots[i].dispose();
		}
	});
	Enumerable.setup(node, src, /** @param {Object|undefined} seed */ function (seed) {
		/**
		 * @type {number}
		 */
		var i;
		/**
		 * @type {number}
		 */
		var j;
		/**
		 * @type {Changeset<T>|Array<Changeset<T>>}
		 */
		var cs = src.cs;
		/**
		 * @type {boolean}
		 */
		var loop;
		/**
		 * @type {Array<T>}
		 */
		var temps;
		/**
		 * @type {Array<number>}
		 */
		var found;
		/**
		 * @type {number}
		 */
		var cmin;
		/**
		 * @type {number}
		 */
		var cmax;
		/**
		 * @type {number}
		 */
		var umin;
		/**
		 * @type {number}
		 */
		var umax;
		/**
		 * @type {number}
		 */
		var smin;
		/**
		 * @type {number}
		 */
		var smax;
		/**
		 * @type {T}
		 */
		var temp;
		/**
		 * @type {Array<T>}
		 */
		var u = src.get();
		/**
		 * @type {number}
		 */
		var ulen = u.length;
		/**
		 * @type {boolean}
		 */
		var remap = seed !== Void;
		/**
		 * @returns {void}
		 */
		var mapper = function () {
			callback(u[j], j);
		}
		if (remap && cs !== null) {
			if (src.flag & Flag.Single) {
				node.flag |= Flag.Single;
				node.cs = applyRootMutation(callback, c, null, roots, clen, /** @type {Changeset<T>} */(cs));
			} else {
				node.flag &= ~Flag.Single;
				j = cs.length;
				node.cs = new Array(j);
				for (i = 0; i < j; i++) {
					node.cs[i] = applyRootMutation(callback, c, null, roots, clen, /** @type {Array<Changeset<T>>} */(cs)[i]);
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
/**
 * @template T
 * @this {IEnumerable<T>}
 * @param {T} valueToFind 
 * @param {number=} fromIndex 
 * @returns {function(): boolean}
 */
function includes(valueToFind, fromIndex) {
	/**
	 * @type {IEnumerable<T>}
	 */
	var src = this;
	/**
	 * @type {number}
	 */
	var i = -1;
	/**
	 * @type {boolean}
	 */
	var pure = arguments.length === 1;
	return /** @type {function(): boolean} */(
		tie(src, /** @param {Object|boolean} seed */ function (seed) {
			/**
			 * @type {Changeset<T>|Array<Changeset<T>>}
			 */
			var cs = src.cs;
			/**
			 * @type {Array<T>}
			 */
			var items = src.get();
			/**
			 * @type {number}
			 */
			var len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = getIndex(src.flag, cs, valueToFind, false, i, len, false);
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
		}, Void, Flag.Trace)
	);
}
/**
 * @template T
 * @this {IEnumerable<T>}
 * @param {T} searchElement 
 * @param {number=} fromIndex 
 * @returns {function(): number}
 */
function indexOf(searchElement, fromIndex) {
	/**
	 * @type {IEnumerable<T>}
	 */
	var src = this;
	/**
	 * @type {number}
	 */
	var i = -1;
	/**
	 * @type {boolean}
	 */
	var pure = arguments.length === 1;
	return /** @type {function(): number} */(
		tie(src, /** @param {Object|number} seed */ function (seed) {
			/**
			 * @type {Changeset<T>|Array<Changeset<T>>}
			 */
			var cs = src.cs;
			/**
			 * @type {Array<T>}
			 */
			var items = src.get();
			/**
			 * @type {number}
			 */
			var len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = getIndex(src.flag, cs, searchElement, false, i, len, false);
				if (i !== NoResult) {
					return i;
				}
			}
			for (i = fromIndex === void 0 ? 0 : fromIndex; i < len; i++) {
				if (searchElement === items[i]) {
					return i;
				}
			}
			return -1;
		}, Void, Flag.Trace)
	);
}
/**
 * @template T
 * @this {IEnumerable<T>}
 * @param {string=} separator 
 * @returns {function(): string}
 */
function join(separator) {
	/**
	 * @type {IEnumerable<T>}
	 */
	var src = this;
	return /** @type {function(): string} */(
		tie(src, function () {
			return src.get().join(separator);
		}, /** @type {*} */(void 0), Flag.Trace)
	);
}
/**
 * @template T
 * @this {IEnumerable<T>}
 * @param {T} searchElement 
 * @param {number=} fromIndex 
 * @returns {function(): number}
 */
function lastIndexOf(searchElement, fromIndex) {
	/**
	 * @type {IEnumerable<T>}
	 */
	var src = this;
	/**
	 * @type {number}
	 */
	var i = -1;
	/**
	 * @type {boolean}
	 */
	var pure = arguments.length === 1;
	return /** @type {function(): number} */(
		tie(src, /** @param {Object|number} seed */ function (seed) {
			/**
			 * @type {Changeset<T>|Array<Changeset<T>>}
			 */
			var cs = src.cs;
			/**
			 * @type {Array<T>}
			 */
			var items = src.get();
			/**
			 * @type {number}
			 */
			var len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = getIndex(src.flag, cs, searchElement, false, i, len, true);
				if (i !== NoResult) {
					return i;
				}
			}
			for (i = fromIndex === void 0 ? len - 1 : fromIndex; i >= 0; i--) {
				if (searchElement === items[i]) {
					return i;
				}
			}
			return i = -1;
		}, Void, Flag.Trace)
	);
}
/**
 * @template T,U
 * @this {IEnumerable<T>}
 * @param {function(T,number): U} callback 
 * @returns {IEnumerable<U>}
 */
function map(callback) {
	/**
	 * @type {IEnumerable<T>}
	 */
	var src = this;
	/**
	 * @type {Enumerable<T>}
	 */
	var node = new Enumerable();
	/**
	 * @type {Array<T>}
	 */
	var c = [];
	/**
	 * @type {number}
	 */
	var clen = 0;
	/**
	 * @type {Array<Computation<U>>}
	 */
	var roots = [];
	node.roots = roots;
	node.flag |= Flag.Changed;
	cleanup(function () {
		/**
		 * @type {number}
		 */
		var i;
		for (i = 0; i < clen; i++) {
			roots[i].dispose();
		}
	});
	return /** @type {IEnumerable<T>} */(
		Enumerable.setup(node, src, function (seed) {
			/**
			 * @type {number}
			 */
			var i;
			/**
			 * @type {number}
			 */
			var j;
			/**
			 * @type {Changeset<T>|Array<Changeset<T>>}
			 */
			var cs;
			/**
			 * @type {boolean}
			 */
			var loop;
			/**
			 * @type {Array<T>}
			 */
			var temps;
			/**
			 * @type {Array<boolean>}
			 */
			var found;
			/**
			 * @type {number}
			 */
			var cmin;
			/**
			 * @type {number}
			 */
			var cmax;
			/**
			 * @type {number}
			 */
			var umin;
			/**
			 * @type {number}
			 */
			var umax;
			/**
			 * @type {number}
			 */
			var smin;
			/**
			 * @type {number}
			 */
			var smax;
			/**
			 * @type {T}
			 */
			var temp;
			/**
			 * @type {Array<T>}
			 */
			var u = src.get();
			/**
			 * @type {number}
			 */
			var ulen = u.length;
			/**
			 * @type {boolean}
			 */
			var remap = seed !== Void;
			/**
			 * 
			 * @returns {U}
			 */
			var mapper = function () {
				return seed[j] = callback(u[j], j);
			}
			cs = src.cs;
			if (remap && cs !== null) {
				if (src.flag & Flag.Single) {
					node.flag |= Flag.Single;
					node.cs = applyRootMutation(callback, c, seed, roots, clen, /** @type {Changeset<T>} */(cs));
				} else {
					node.flag &= ~Flag.Single;
					j = cs.length;
					node.cs = new Array(j);
					for (i = 0; i < j; i++) {
						node.cs[i] = applyRootMutation(callback, c, seed, roots, clen, /** @type {Array<Changeset<T>>} */(cs)[i]);
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
		})
	);
}
/**
 * @template T,U
 * @this {IEnumerable<T>}
 * @param {function(U,T,number): U} callback 
 * @param {U=} initialValue 
 * @returns {function(): U}
 */
function reduce(callback, initialValue) {
	/**
	 * @type {IEnumerable<T>}
	 */
	var src = this;
	/**
	 * @type {function(): U}
	 */
	var copy = copyValue(initialValue);
	/**
	 * @type {boolean}
	 */
	var skip = arguments.length === 1;
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
	}, void 0, Flag.Trace);
}
/**
 * @template T,U
 * @this {IEnumerable<T>}
 * @param {function(U,T,number): U} callback 
 * @param {U=} initialValue 
 * @returns {function(): U}
 */
function reduceRight(callback, initialValue) {
	/**
	 * @type {IEnumerable<T>}
	 */
	var src = this;
	/**
	 * @type {function(): U}
	 */
	var copy = copyValue(initialValue);
	/**
	 * @type {boolean}
	 */
	var skip = arguments.length === 1;
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
	}, Void, Flag.Trace);
}
/**
 * @template T
 * @this {IEnumerable<T>}
 * @returns {IEnumerable<T>}
 */
function reverse() {
	/**
	 * @type {IEnumerable<T>}
	 */
	var src = this;
	/**
	 * @type {Enumerable<Object|T>}
	 */
	var node = new Enumerable();
	node.flag |= Flag.Changed;
	return /** @type {IEnumerable<T>} */(
		Enumerable.setup(node, src, /** @param {Object|Array<T>} seed */ function (seed) {
			/**
			 * @type {number}
			 */
			var i;
			/**
			 * @type {number}
			 */
			var j;
			/**
			 * @type {Changeset<T>|Array<Changeset<T>>}
			 */
			var cs = src.cs;
			/**
			 * @type {Array<T>}
			 */
			var items = src.get();
			/**
			 * @type {number}
			 */
			var len = items.length;
			if (seed === Void) {
				seed = new Array(len);
			} else if (cs !== null) {
				if (src.flag & Flag.Single) {
					node.flag |= Flag.Single;
					node.cs = applyReverseMutation(/** @type {Array<T>} */(seed), /** @type {Changeset<T>} */(cs));
				} else {
					node.flag &= ~Flag.Single;
					node.cs = new Array(cs.length);
					for (i = 0, len = cs.length; i < len; i++) {
						node.cs[i] = applyReverseMutation(/** @type {Array<T>} */(seed), /** @type {Array<Changeset<T>>} */(cs)[i]);
					}
				}
				return seed;
			}
			node.cs = null;
			seed.length = len;
			for (i = len - 1, j = 0; i >= 0; i--, j++) {
				seed[j] = items[i];
			}
			return seed;
		})
	);
}
/**
 * @template T
 * @this {IEnumerable<T>}
 * @param {number=} start 
 * @param {number=} end 
 * @returns {IEnumerable<T>}
 */
function slice(start, end) {
	/**
	 * @type {IEnumerable<T>}
	 */
	var src = this;
	/**
	 * @type {Enumerable<Object|T>}
	 */
	var node = new Enumerable();
	return /** @type {IEnumerable<T>} */(
		Enumerable.setup(node, src, /** @param {Object|Array<T>} seed */ function (seed) {
			/**
			 * @type {number}
			 */
			var i;
			/**
			 * @type {Changeset<T>|Array<Changeset<T>>}
			 */
			var cs = src.cs;
			/**
			 * @type {Array<T>}
			 */
			var items = src.get();
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
			}
			node.flag |= Flag.Changed;
			seed.length = end - start;
			for (i = 0; start < end; i++, start++) {
				seed[i] = items[start];
			}
			return seed;
		})
	);
}
/**
 * @template T
 * @this {IEnumerable<T>}
 * @param {function(T,number): boolean} callback 
 * @returns {function(): boolean}
 */
function some(callback) {
	/**
	 * @type {IEnumerable<T>}
	 */
	var src = this;
	/**
	 * @type {number}
	 */
	var index = -1;
	/**
	 * @type {boolean}
	 */
	var pure = callback.length === 1;
	return /** @type {function(): boolean} */(
		tie(src, /** @param {Object|boolean} seed */ function (seed) {
			/**
			 * @type {number}
			 */
			var i;
			/**
			 * @type {Changeset<T>|Array<Changeset<T>>}
			 */
			var cs = src.cs;
			/**
			 * @type {Array<T>}
			 */
			var items = src.get();
			/**
			 * @type {number}
			 */
			var len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = getIndex(src.flag, cs, callback, true, index, len, false);
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
		}, Void, Flag.Trace)
	);
}
/**
 * @template T
 * @this {IEnumerable<T>}
 * @param {function(T,T): number} compareFunction 
 * @returns {IEnumerable<T>}
 */
function sort(compareFunction) {
	/**
	 * @type {IEnumerable<T>}
	 */
	var src = this;
	/**
	 * @type {Enumerable<T>}
	 */
	var node = new Enumerable();
	node.flag |= Flag.Changed;
	return Enumerable.setup(node, this, function () {
		/**
		 * @type {Array<T>}
		 */
		var items = src.get();
		var newItems = items.slice();
		newItems.sort(compareFunction);
		return newItems;
	});
}


//#endregion

//#region 2.3.2 List

/**
 * @template T
 * @constructor
 * @extends Data<Array<T>>
 * @implements {IEnumerable<T>}
 * @param {Array<T>} val 
 */
function List(val) {
	Data.call(this, val);
	/**
	 * @type {Changeset<T>|Array<Changeset<T>>}
	 */
	this.cs = null;
	/**
	 * @type {Changeset<T>|Array<Changeset<T>>}
	 */
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

/**
 * @public
 * @returns {Array<T>}
 */
List.prototype.get = function () {
	if (Listener !== null) {
		logRead(this, Listener);
	}
	return this.val;
}

/**
 * @public
 * @param {Array<T>} next 
 * @returns {Array<T>}
 */
List.prototype.set = function (next) {
	return logWrite(this, next);
}

/**
 * @returns {void}
 */
List.prototype.update = function () {
	/**
	 * @type {number}
	 */
	var i;
	/**
	 * @type {number}
	 */
	var len;
	/**
	 * @type {number}
	 */
	var flag = this.flag;
	if (this.pval !== Void) {
		this.cs = null;
		this.val = this.pval;
		this.pval = Void;
	} else {
		this.cs = this.pcs;
		this.pcs = null;
		if (flag & Flag.Single) {
			this.cs = applyMutation(this.val, /** @type {Changeset<T>} */(this.cs));
		}
		else {
			for (i = 0, len = this.cs.length; i < len; i++) {
				this.cs[i] = applyMutation(this.val, /** @type {Array<Changeset<T>>} */(this.cs)[i]);
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
 * @returns {void}
 */
List.prototype.insertAt = function (index, item) {
	logMutate(this, { mod: Mod.InsertAt, i1: index, value: item });
}

/**
 * 
 * @param {number} index 
 * @param {Array<T>} items 
 * @returns {void}
 */
List.prototype.insertRange = function (index, items) {
	logMutate(this, { mod: Mod.InsertRange, i1: index, value: items });
}

/**
 * 
 * @param {number} from 
 * @param {number} to
 * @returns {void} 
 */
List.prototype.move = function (from, to) {
	logMutate(this, { mod: Mod.Move, i1: from, i2: to });
}

/**
 * @returns {void}
 */
List.prototype.pop = function () {
	logMutate(this, { mod: Mod.Pop });
}

/**
 * 
 * @param {T} item 
 * @returns {void}
 */
List.prototype.push = function (item) {
	logMutate(this, { mod: Mod.Push, value: item });
}

/**
 * 
 * @param {number} index 
 * @returns {void}
 */
List.prototype.removeAt = function (index) {
	logMutate(this, { mod: Mod.RemoveAt, i1: index });
}

/**
 * 
 * @param {number} index 
 * @param {number} count 
 * @returns {void}
 */
List.prototype.removeRange = function (index, count) {
	logMutate(this, { mod: Mod.RemoveRange, i1: index, i2: count });
}

/**
 * 
 * @param {number} index 
 * @param {T} item 
 * @returns {void}
 */
List.prototype.replace = function (index, item) {
	logMutate(this, { mod: Mod.Replace, i1: index, value: item });
}

/**
 * @returns {void}
 */
List.prototype.shift = function () {
	logMutate(this, { mod: Mod.Shift });
}

/**
 * 
 * @param {number} i1 
 * @param {number} i2 
 * @returns {void}
 */
List.prototype.swap = function (i1, i2) {
	logMutate(this, { mod: Mod.Swap, i1: i1, i2: i2 });
}

/**
 * 
 * @param {T} item 
 * @returns {void}
 */
List.prototype.unshift = function (item) {
	logMutate(this, { mod: Mod.Unshift, value: item });
}

//#endregion

//#region 2.3.3 Enumerable

/**
 * 
 * @template T
 * @constructor
 * @extends Computation<Array<T>>
 * @implements {IEnumerable<T>}
 */
function Enumerable() {
	Computation.call(this, new Log());
	/**
	 * @type {Changeset<T>|Array<Changeset<T>>|null}
	 */
	this.cs = null;
	/**
	 * @type {Array<Computation>|null}
	 */
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

/**
 * @public
 * @static
 * @template T
 * @param {Enumerable<T>} node 
 * @param {Signal} source 
 * @param {function(T): T} fn 
 * @param {number=} flags
 * @returns {Enumerable<T>}
 */
Enumerable.setup = function (node, source, fn, flags) {
	/**
	 * @type {number}
	 */
	var flag = Flag.Bound | flags;
	/**
	 * @type {Clock}
	 */
	var clock = Root;
	/**
	 * @type {Computation|null}
	 */
	var owner = Owner;
	logRead(source, node);
	sealNode(node, owner, fn, setupNode(node, fn, /** @type {T} */(Void), flag), flag);
	if (State === System.Idle) {
		finishToplevelExecution(clock);
	}
	return node;
}

/**
 * @public
 * @returns {Array<T>}
 */
Enumerable.prototype.get = function () {
	/**
	 * @type {number}
	 */
	var flag;
	if (Listener !== null) {
		flag = this.flag;
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
	/**
	 * @type {Computation|null}
	 */
	var owner = Owner;
	/**
	 * @type {Computation|null}
	 */
	var listener = Listener;
	cleanupNode(this, false);
	Owner = this;
	Listener = null;
	this.flag &= ~Flag.Stale;
	this.flag |= Flag.Running;
	this.val = this.fn(this.val);
	if ((this.flag & (Flag.Trace | Flag.Logging)) === (Flag.Trace | Flag.Logging)) {
		if (this.flag & Flag.Changed) {
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
		Root.disposes.add(this);
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
 * @const
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
/**
 * @const
 * @type {number}
 */
var NoResult = -2;
/* @exclude */
/**
 * @const 
 * @type {Changeset<undefined>}
 */
var PopMod = { mod: Mod.Pop };
/**
 * @const
 * @type {Changeset<undefined>}
 */
var ShiftMod = { mod: Mod.Shift };
/**
 * @const
 * @type {Changeset<undefined>}
 */
var VoidMod = { mod: Mod.Void };

//#endregion

//#endregion

//#region 2.5 Internal functionality

/**
 * @template T
 * @param {List<T>} node 
 * @param {Changeset<T>} cs 
 * @returns {void}
 */
function logMutate(node, cs) {
	/**
	 * @type {Queue<Data>}
	 */
	var changes = Root.changes;
	if (State !== System.Idle) {
		if (node.pval !== Void) {
			throw new Error('Conflicting changes');
		}
		if (node.pcs === null) {
			node.pcs = cs;
			node.flag |= Flag.Single;
			changes.add(node);
		} else {
			if (node.flag & Flag.Single) {
				node.flag &= ~Flag.Single;
				node.pcs = [node.pcs, cs];
			} else {
				node.pcs[node.pcs.length] = cs;
			}
		}
	} else {
		node.pcs = cs;
		node.flag |= Flag.Single;
		if (node.flag & Flag.Logging) {
			changes.add(node);
			execute();
		} else {
			node.update();
		}
	}
}

/**
 * @template T
 * @param {Array<T>} array 
 * @param {Changeset<T>} cs 
 * @returns {Changeset<T>}
 */
function applyMutation(array, cs) {
	/**
	 * @type {number}
	 */
	var i;
	/**
	 * @type {number}
	 */
	var j;
	/**
	 * @type {number}
	 */
	var k;
	/**
	 * @type {Array<T|number>}
	 */
	var args;
	/**
	 * @type {Array<T>}
	 */
	var value;
	/**
	 * @type {number}
	 */
	var len = array.length;
	/**
	 * @type {number}
	 */
	var mod = cs.mod;
	/**
	 * @type {number}
	 */
	var mut = mod & Mod.Type;
	if (mod & Mod.Index) {
		cs.i1 = actualIndex(len, /** @type {number} */(cs.i1));
	}
	if (mod & Mod.Reorder) {
		cs.i2 = actualIndex(len, /** @type {number} */(cs.i2));
		i = /** @type {number} */(cs.i1);
		j = /** @type {number} */(cs.i2);
		if (i !== j) {
			if (i === len) {
				i = --/** @type {number} */(cs.i1);
			}
			if (j === len) {
				j = --/** @type {number} */(cs.i2);
			}
		} else {
			cs = VoidMod;
			return cs;
		}
	}
	if (mut & Mod.InsertAt) {
		i = /** @type {number} */(cs.i1);
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
		args = [/** @type {number} */(cs.i1), 0];
		value = /** @type {Array<T>} */(cs.value);
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
			cs = VoidMod;
		}
	} else if (mut & Mod.Push) {
		array[len] = cs.value;
	} else if (mut & Mod.RemoveAt) {
		if (len > 0) {
			i = /** @type {number} */(cs.i1);
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
	} else if (mut & Mod.RemoveRange) {
		if (cs.i1 < len) {
			if (cs.i1 + cs.i2 > len) {
				cs.i2 = len - cs.i1;
			}
			array.splice(cs.i1, cs.i2);
		} else {
			cs = VoidMod;
		}
	} else if (mut & Mod.Replace) {
		i = /** @type {number} */(cs.i1);
		array[i] = cs.value;
	} else if (mut & Mod.Shift) {
		if (len > 0) {
			array.shift();
		} else {
			cs = VoidMod;
		}
	} else if (mut & Mod.Swap) {
		i = /** @type {number} */(cs.i1);
		j = /** @type {number} */(cs.i2);
		value = array[i];
		array[i] = array[j];
		array[j] = value;
	} else if (mut & Mod.Unshift) {
		array.unshift(cs.value);
	}
	return cs;
}

/**
 * @template T
 * @param {function(T): boolean} callback 
 * @param {Array<T>} items 
 * @param {Array<T>} seed 
 * @param {Array<number>} k 
 * @param {number} len 
 * @param {Changeset<T>} cs 
 * @returns {Changeset<T>}
 */
function applyFilterMutation(callback, items, seed, k, len, cs) {
	/**
	 * @type {number}
	 */
	var i;
	/**
	 * @type {number}
	 */
	var j;
	/**
	 * @type {number}
	 */
	var m;
	/**
	 * @type {number}
	 */
	var n;
	/**
	 * @type {T}
	 */
	var item;
	/**
	 * @type {Array<number>}
	 */
	var kArgs;
	/**
	 * @type {Array<T>}
	 */
	var sArgs;
	/**
	 * @type {boolean}
	 */
	var found;
	/**
	 * @type {Array<T>}
	 */
	var vals;
	/**
	 * @type {Array<T>}
	 */
	var csVals;
	/**
	 * @type {number}
	 */
	var mut = cs.mod & Mod.Type;
	if (mut & Mod.InsertAt) {
		i = /** @type {number} */(cs.i1);
		item = /** @type {T} */(cs.value);
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
				cs = { mod: Mod.InsertAt, i1: m, value: item };
			} else {
				m = seed.length;
				seed[m] = item;
				k.splice(i, 0, m);
				cs = { mod: Mod.InsertAt, i1: m, value: item };
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
	} else if (mut & Mod.InsertRange) {
		i = /** @type {number} */(cs.i1);
		n = k.length;
		vals = /** @type {Array<T>} */(cs.value);
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
		kArgs = [i, 0];
		for (i = 0, m = 2, n = vals.length; i < n; i++) {
			kArgs[m++] = -1;
		}
		k.splice.apply(k, kArgs);
		csVals = [];
		sArgs = [j, 0];
		i = /** @type {number} */(cs.i1);
		for (m = 2, n = i + n; i < n; i++) {
			item = items[i];
			if (callback(item)) {
				k[i] = j++;
				sArgs[m] = item;
				csVals[m - 2] = item;
				m++;
			}
		}
		n = csVals.length;
		if (n > 0) {
			sArgs.length = n + 2;
			i = /** @type {number} */(cs.i1) + vals.length
			for (; i < len; i++) {
				if (k[i] !== -1) {
					k[i] += n;
				}
			}
			seed.splice.apply(seed, sArgs);
			cs = { mod: Mod.InsertRange, i1: j - n, value: csVals };
		} else {
			cs = VoidMod;
		}
	} else if (mut & Mod.Move) {
		i = /** @type {number} */(cs.i1);
		j = /** @type {number} */(cs.i2);
		m = j > i ? 1 : -1;
		n = k[i];
		for (; i !== j; i += m) {
			k[i] = k[i + m];
		}
		k[j] = n;
	} else if (mut & Mod.Push) {
		j = seed.length;
		n = k.length;
		found = callback(cs.value);
		if (found) {
			k[n] = j;
			seed[j] = /** @type {T} */(cs.value);
			if (j !== cs.i1) {
				cs = { mod: Mod.Push, i1: j, value: cs.value };
			}
		} else {
			k[n] = -1;
			cs = VoidMod;
		}
	} else if (mut & Mod.Pop) {
		i = k.pop();
		if (i !== -1) {
			seed.pop();
		} else {
			cs = VoidMod;
		}
	} else if (mut & Mod.RemoveAt) {
		i = /** @type {number} */(cs.i1);
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
				cs = { mod: Mod.RemoveAt, i1: j };
			}
		} else {
			cs = VoidMod;
		}
	} else if (mut & Mod.RemoveRange) {
		i = /** @type {number} */(cs.i1);
		m = 0;
		j = -1;
		n = i + /** @type {number} */(cs.i2);
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
			for (i = /** @type {number} */(cs.i1); i < len; i++) {
				if (k[i] !== -1) {
					k[i] -= n;
				}
			}
			seed.splice(j, m);
			cs = { mod: Mod.RemoveRange, i1: j, i2: m };
		} else {
			cs = VoidMod;
		}
	} else if (mut & Mod.Replace) {
		i = /** @type {number} */(cs.i1);
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
			cs = { mod: Mod.Replace, i1: j, value: cs.value };
		} else {
			cs = VoidMod;
		}
	} else if (mut & Mod.Shift) {
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
	} else if (mut & Mod.Unshift) {
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

/**
 * @template T,U
 * @param {function(T,number): U} callback 
 * @param {Array<T>} items 
 * @param {Array<U>} seed
 * @param {Array<Computation>} roots 
 * @param {number} len 
 * @param {Changeset<T>} cs 
 * @returns {Changeset<T>}
 */
function applyRootMutation(callback, items, seed, roots, len, cs) {
	/**
	 * @type {number}
	 */
	var i;
	/**
	 * @type {number}
	 */
	var j;
	/**
	 * @type {number}
	 */
	var k;
	/**
	 * @type {T}
	 */
	var item;
	/**
	 * @type {Computation<T>}
	 */
	var node;
	/**
	 * @type {Array<T>}
	 */
	var value;
	/**
	 * @type {Array<T>}
	 */
	var itemArgs;
	/**
	 * @type {Array<Computation<T>>}
	 */
	var nodeArgs;
	/**
	 * @type {Array<U>}
	 */
	var seedArgs;
	/**
	 * @type {Array<T>}
	 */
	var newVals;
	/**
	 * @type {number}
	 */
	var mut = cs.mod & Mod.Type;
	/**
	 * 
	 * @returns {U}
	 */
	var mapper = function () {
		return callback(item, j);
	}
	if (mut & Mod.InsertAt) {
		j = /** @type {number} */(cs.i1);
		item = /** @type {T} */(cs.value);
		node = root(mapper);
		items.splice(j, 0, item);
		roots.splice(j, 0, node);
		if (seed !== null) {
			seed.splice(j, 0, node.val);
		}
		cs = { mod: Mod.InsertAt, i1: j, value: node.val };
	} else if (mut & Mod.InsertRange) {
		i = /** @type {number} */(cs.i1);
		value = /** @type {Array<T>} */(cs.value);
		len = value.length;
		itemArgs = [i, 0];
		nodeArgs = [i, 0];
		newVals = new Array(len);
		if (seed !== null) {
			seedArgs = [i, 0];
		}
		for (j = 0; j < len; j++) {
			j = i + j;
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
		cs = { mod: Mod.InsertRange, i1: i, value: newVals };
	} else if (mut & Mod.Move) {
		i = /** @type {number} */(cs.i1);
		j = /** @type {number} */(cs.i2);
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
		j = /** @type {number} */(cs.i1);
		removeAt(items, j);
		roots[j].dispose();
		removeAt(roots, j);
		if (seed !== null) {
			removeAt(seed, j);
		}
	} else if (mut & Mod.RemoveRange) {
		j = /** @type {number} */(cs.i1);
		len = /** @type {number} */(cs.i2);
		for (; len >= 0; j++, len--) {
			roots[j].dispose();
		}
		items.splice(cs.i1, cs.i2);
		roots.splice(cs.i1, cs.i2);
		if (seed !== null) {
			seed.splice(cs.i1, cs.i2);
		}
	} else if (mut & Mod.Replace) {
		j = /** @type {number} */(cs.i1);
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
		i = /** @type {number} */(cs.i1);
		j = /** @type {number} */(cs.i2);
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
		items.unshift(/** @type {T} */(cs.value));
		roots.unshift(node);
		if (seed !== null) {
			seed.unshift(node.val);
		}
		cs = { mod: Mod.Unshift, value: node.val };
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
	/**
	 * @type {number}
	 */
	var i;
	/**
	 * @type {number}
	 */
	var j;
	/**
	 * @type {number}
	 */
	var k;
	/**
	 * @type {T}
	 */
	var item;
	/**
	 * @type {Array<T>}
	 */
	var value;
	/**
	 * @type {Array<T|number>}
	 */
	var args;
	/**
	 * @type {number}
	 */
	var len = array.length;
	/**
	 * @type {number}
	 */
	var mut = cs.mod & Mod.Type;
	if (mut & Mod.InsertAt) {
		item = /** @type {T} */(cs.value);
		i = len - /** @type {number} */(cs.i1);
		array.splice(i, 0, item);
		cs = { mod: Mod.InsertAt, i1: i, value: item };
	} else if (mut & Mod.InsertRange) {
		i = /** @type {number} */(cs.i1);
		i = len - i;
		args = [i, 0];
		value = /** @type {Array<T>} */(cs.value);
		for (j = 2, i = value.length - 1; i >= 0; i--) {
			args[j++] = value[i];
		}
		array.splice.apply(array, args);
		cs = { mod: Mod.InsertRange, i1: i, value: value };
	} else if (mut & Mod.Move) {
		i = len - 1 - /** @type {number} */(cs.i1);
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
		cs = { mod: Mod.Move, i1: i, i2: j };
	} else if (mut & Mod.Pop) {
		array.shift();
		cs = { mod: Mod.Shift }
	} else if (mut & Mod.Push) {
		item = /** @type {T} */(cs.value);
		array.unshift(item);
		cs = { mod: Mod.Unshift, value: item };
	} else if (mut & Mod.RemoveAt) {
		i = len - 1 - /** @type {number} */(cs.i1);
		removeAt(array, i)
		cs = { mod: Mod.RemoveAt, i1: i };
	} else if (mut & Mod.RemoveRange) {
		i = len - /** @type {number} */(cs.i1) - /** @type {number} */(cs.i2);
		array.splice(i, cs.i2);
		cs = { mod: Mod.RemoveRange, i1: i, i2: cs.i2 };
	} else if (mut & Mod.Replace) {
		i = len - 1 - /** @type {number} */(cs.i1);
		array[i] = cs.value;
		cs = { mod: Mod.Replace, i1: i, value: cs.value };
	} else if (mut & Mod.Shift) {
		array.length--;
		cs = { mod: Mod.Pop };
	} else if (mut & Mod.Swap) {
		i = len - 1 - cs.i1;
		j = len - 1 - cs.i2;
		value = array[i];
		array[i] = array[j];
		array[j] = value;
		cs = { mod: Mod.Swap, i1: i, i2: j };
	} else if (mut & Mod.Unshift) {
		array[len] = cs.value;
		cs = { mod: Mod.Push, value: cs.value };
	}
	return cs;
}

/**
 * @template T
 * @param {number} flag 
 * @param {Array<Changeset<T>>|Changeset<T>} cs 
 * @param {T|function(T): boolean} item 
 * @param {boolean} call 
 * @param {number} index 
 * @param {number} length 
 * @param {boolean} last 
 * @returns {number}
 */
function getIndex(flag, cs, item, call, index, length, last) {
	/**
	 * @type {number}
	 */
	var i;
	/**
	 * @type {number}
	 */
	var len;
	/**
	 * @type {number}
	 */
	var mod;
	/**
	 * @type {number}
	 */
	var mut;
	/**
	 * @type {Changeset<T>}
	 */
	var c;
	/**
	 * @type {number}
	 */
	var count;
	if (cs !== null) {
		if (flag & Flag.Single) {
			mod = /** @type {Changeset<T>} */(cs).mod;
			mut = mod & Mod.Type;
			if (index === -1) {
				if (mod & Mod.Add) {
					if (mod & Mod.Range) {
						count = /** @type {number} */(/** @type {Changeset<T>} */(cs).i2);
						for (i = /** @type {number} */(/** @type {Changeset<T>} */(cs).i1); count >= 0; count--) {
							if (call ? item(cs.value[i]) : cs.value[i] === item) {
								return i;
							}
						}
						return -1;
					} else {
						if (call ? item(cs.value) : cs.value === item) {
							if (mut & Mod.Unshift) {
								return 0;
							} else if (mut & Mod.Push) {
								return length - 1;
							} else {
								return /** @type {number} */(cs.i1);
							}
						}
						return -1;
					}
				} else {
					return index;
				}
			} else {
				if (mut & Mod.Push) {
					if (last) {
						if (call ? item(cs.value) : cs.value === item) {
							return length - 1;
						} else {
							return index;
						}
					} else {
						return index;
					}
				} else if (mut & Mod.Pop) {
					if (index === length - 1) {
						return -1;
					} else {
						return index;
					}
				} else if (mut & Mod.Shift) {
					if (index !== 0) {
						return index;
					}
				} else if (mut & Mod.Unshift) {
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
					if (mut & Mod.Index) {
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

/**
 * 
 * @param {number} len 
 * @param {number} i 
 * @returns {number}
 */
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
 * @param {number} i 
 * @returns {void}
 */
function removeAt(array, i) {
	/**
	 * @type {number}
	 */
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
		return function () { return value; }
	} else {
		if (Array.isArray(value)) {
			return function () { return value.slice(); }
		} else {
			return function () {
				/**
				 * @type {string}
				 */
				var key;
				/**
				 * @type {T}
				 */
				var result = {};
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
