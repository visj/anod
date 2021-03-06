/**
 * @public
 * @template T
 * @param {Array<T>} val
 * @returns {DataArray<T>}
 */
function array(val) {
	return new DataArray(val);
}

/**
 * @public
 * @template T
 * @param {T} val
 * @returns {function(T=): T}
 */
function data(val) {
	var node = new Data(val);
	return function (next) {
		return arguments.length > 0 ? node.set(next) : node.get();
	}
}

/**
 * @public
 * @template T
 * @param {T} val
 * @param {function(T,T): boolean=} eq
 * @returns {function(T=): T}
 */
function value(val, eq) {
	var node = new Value(val, eq);
	return function (next) {
		return arguments.length > 0 ? node.set(next) : node.get();
	}
}


/**
 * @public
 * @param {function(): void} f
 */
function cleanup(f) {
	if (Owner !== null) {
		if (Owner._cleanups === null) {
			Owner._cleanups = [f];
		} else {
			Owner._cleanups.push(f);
		}
	}
}

/**
 * @public
 * @template T
 * @param {function(): T} f
 * @returns {T}
 */
function freeze(f) {
	var val;
	if (State !== System.Idle) {
		val = f();
	} else {
		Root.changes.reset();
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
 * @public
 * @template T
 * @param {function(T): T} f
 * @param {T=} seed
 * @param {number=} flags
 * @returns {function(): T}
 */
function fn(f, seed, flags) {
	return makeComputationNode(getCandidateNode(), f, seed, Flag.Dynamic | flags);
}

/**
 * @public
 * @template T
 * @param {Array<function(): *>|function(): *} src
 * @param {function(T): T} f
 * @param {T=} seed
 * @param {number=} flags
 * @returns {Procedure<T>}
 */
function on(src, f, seed, flags) {
	var node = getCandidateNode();
	var listener = Listener;
	try {
		Listener = node;
		if (src instanceof Array) {
			for (var i = 0, ln = src.length; i < ln; i++) {
				src[i]();
			}
		} else {
			src();
		}
	} finally {
		Listener = listener;
	}
	return makeComputationNode(node, f, seed, Flag.Static | flags);
}

/**
 * @public
 * @template T
 * @param {function(): void} f
 * @returns {T}
 */
function root(f) {
	var val;
	var node;
	var unending = f.length === 0;
	var disposer = unending ? null : function () {
		if (node !== null) {
			if (State !== System.Idle) {
				if (State === System.Dispose) {
					node.dispose();
				} else {
					Root.disposes.add(node);
				}
			} else {
				node.dispose();
			}
		}
	};
	var owner = Owner;
	var listener = Listener;
	Owner = node = unending ? Unowned : getCandidateNode();
	Listener = null;
	try {
		val = unending ? f() : f(disposer);
	} finally {
		Owner = owner;
		Listener = listener;
	}
	if (unending || recycleOrClaimNode(node, null, void 0, Flag.Orphan)) {
		node = null;
	}
	return val;
}

/**
 * @public
 * @template T
 * @param {function(): T} node
 * @returns {T}
 */
function sample(node) {
	var listener = Listener;
	try {
		Listener = null;
		return node();
	} finally {
		Listener = listener;
	}
}

/**
 * @template T
 * @typedef {function(): T} Procedure
 */

/**
 * @template T
 * @typedef {function(T=): T} Signal
 */

/**
 * @template T
 * @constructor
 * @param {T} val
 */
function Data(val) {
	/**
	 * @package
	 * @type {number}
	 */
	this._flag = 0;
	/**
	 * @package
	 * @type {T}
	 */
	this._val = val;
	/**
	 * @package
	 * @type {Computation}
	 */
	this._node1 = null;
	/**
	 * @package
	 * @type {number}
	 */
	this._slot1 = -1;
	/**
	 * @package
	 * @type {Array<Computation>}
	 */
	this._nodes = null;
	/**
	 * @package 
	 * @type {Array<number>}
	 */
	this._slots = null;
	/**
	 * @package
	 * @type {T|Object}
	 */
	this._pval = NotPending;
}

/**
 * @package
 * @returns {T}
 */
Data.prototype.get = function () {
	if (Listener !== null) {
		logRead(this, Listener);
	}
	return this._val;
}

/**
 * @package
 * @param {T} val
 * @returns {T}
 */
Data.prototype.set = function (val) {
	return logWrite(this, val);
}

/**
 * @package
 */
Data.prototype.update = function () {
	this._val = this._pval;
	this._pval = NotPending;
}

/**
 * @template T
 * @constructor
 * @extends {Data<T>}
 * @param {T} val
 * @param {function(T,T): boolean)=} eq
 */
function Value(val, eq) {
	Data.call(this, val);
	/**
	 * @const
	 * @package
	 * @type {function(T,T): boolean}
	 */
	this._eq = eq;
}

/**
 * @returns {T}
 */
Value.prototype.get = function () {
	if (Listener !== null) {
		logRead(this, Listener);
	}
	return this._val;
}

/**
 * 
 * @param {T} val 
 * @returns {T}
 */
Value.prototype.set = function (val) {
	return (this._eq ? this._eq(this._val, val) : this._val === val) ? val : logWrite(this, val);
}

/**
 * @package
 * @returns {void}
 */
Value.prototype.update = function () {
	this._val = this._pval;
	this._pval = NotPending;
}

/**
 * @template T
 * @constructor
 */
function Computation() {
	/**
	 * @type {number}
	 */
	this._flag = 0;
	/**
	 * @type {T}
	 */
	this._val = null;
	/**
	 * @type {Computation}
	 */
	this._node1 = null;
	/**
	 * @type {number}
	 */
	this._slot1 = -1;
	/**
	 * @type {Array<Computation>}
	 */
	this._nodes = null;
	/**
	 * @type {Array<Computation>}
	 */
	this._slots = null;
	/**
	 * @type {null|function(T): T}
	 */
	this._fn = null;
	/**
	 * @type {number}
	 */
	this._age = -1;
	/**
	 * @type {Data|Computation}
	 */
	this._source1 = null;
	/**
	 * @type {number}
	 */
	this._source1slot = -1;
	/**
	 * @type {Array<Data|Computation>}
	 */
	this._sources = null;
	/**
	 * @type {Array<number>}
	 */
	this._sourceslots = null;
	/**
	 * @type {Computation}
	 */
	this._owner = null;
	/**
	 * @type {Array<number>}
	 */
	this._traces = null;
	/**
	 * @type {Array<Computation}
	 */
	this._owned = null;
	/**
	 * @type {Array<function(): void>}
	 */
	this._cleanups = null;
}

/**
 * @returns {T}
 */
Computation.prototype.get = function () {
	if (Listener !== null) {
		var flag = this._flag;
		if (flag & Flag.Watch) {
			if (State === System.Trace) {
				applyUpstreamUpdates(this);
			}
		}
		if (this._age === Root.time) {
			if (flag & Flag.Running) {
				throw new Error('Circular dependency');
			} else if (flag & Flag.Stale) {
				this.update();
			}
		}
		logRead(this, Listener);
	}
	return this._val;
}

Computation.prototype.update = function () {
	var owner = Owner;
	var listener = Listener;
	cleanupNode(this, false);
	Owner = this;
	Listener = this._flag & Flag.Static ? null : this;
	this._flag &= ~Flag.Stale;
	this._flag |= Flag.Running;
	var val = this._val;
	this._val = this._fn(val);
	if (this._flag & Flag.Trace) {
		if (val !== this._val) {
			markComputationsForUpdate(this, Root.time);
		}
	}
	this._flag &= ~Flag.Running;
	Owner = owner;
	Listener = listener;
}

Computation.prototype.dispose = function () {
	this.fn = null;
	this._node1 = null;
	this._nodes = null;
	cleanupNode(this, true);
}

/**
 * @abstract
 * @template T
 * @constructor
 */
function Enumerable() { }

/**
 * 
 * @param {function(T,number=): boolean} callback 
 * @returns {function(): boolean}
 */
Enumerable.prototype.every = function (callback) {
	var self = this;
	return on(self.val, function () {
		var i, ln;
		var items = self.val();
		for (i = 0, ln = items.length; i < ln; i++) {
			if (!callback(items[i], i)) {
				return false;
			}
		}
		return true;
	});
}

/**
 * 
 * @param {function(T,number=): boolean} callback 
 * @returns {Enumerable<T>}
 */
Enumerable.prototype.filter = function (callback) {
	return makeEnumerableNode(new DataEnumerable(), this, filter, { callback: callback });
}

/**
 * 
 * @param {function(T,number=): boolean} callback
 * @returns {function(): T} 
 */
Enumerable.prototype.find = function (callback) {
	var self = this;
	return on(self.val, function () {
		var i, ln, item;
		var items = self.val();
		for (i = 0, ln = items.length; i < ln; i++) {
			item = items[i];
			if (callback(item, i)) {
				return item;
			}
		}
		return void 0;
	});
}


/**
 * 
 * @param {function(T,number=): boolean} callback 
 * @param {number=} index 
 * @returns {function(): number}
 */
Enumerable.prototype.findIndex = function (callback, index) {
	var self = this;
	return on(self.val, function () {
		var i, ln, item;
		var items = self.val();
		for (i = 0, ln = items.length; i < ln; i++) {
			item = items[i];
			if (callback(item, i)) {
				return i;
			}
		}
		return -1;
	});
}

/**
 * 
 * @param {function(T,number=): void} callback 
 * @returns {void}
 */
Enumerable.prototype.forEach = function (callback) {
	makeEnumerableNode(new DataEnumerable(), this, forEach, { callback: callback });
}

/**
 * 
 * @param {T} valueToFind 
 * @param {number=} fromIndex
 * @returns {function(): boolean}
 */
Enumerable.prototype.includes = function (valueToFind, fromIndex) {
	var self = this;
	return on(self.val, function () {
		var i, ln, item;
		var items = self.val();
		for (i = fromIndex === void 0 ? 0 : fromIndex, ln = items.length; i < ln; i++) {
			item = items[i];
			if (valueToFind === items[i]) {
				return true;
			}
		}
		return false;
	});
}

/**
 * 
 * @param {T} searchElement 
 * @param {number=} fromIndex 
 * @returns {function(): number}
 */
Enumerable.prototype.indexOf = function (searchElement, fromIndex) {
	var self = this;
	return on(self.val, function (seed) {
		var i, ln, item;
		var items = self.val();
		for (i = fromIndex === void 0 ? 0 : fromIndex, ln = items.length; i < ln; i++) {
			item = items[i];
			if (searchElement === items[i]) {
				return i;
			}
		}
		return -1;
	});
}

/**
 * 
 * @param {string=} separator 
 * @returns {function(): string}
 */
Enumerable.prototype.join = function (separator) {
	var self = this;
	return on(self.val, function () { return self.val().join(separator); });
}

/**
 * 
 * @param {T} searchElement 
 * @param {number=} fromIndex
 * @returns {function(): number}
 */
Enumerable.prototype.lastIndexOf = function (searchElement, fromIndex) {
	var self = this;
	return on(self.val, function (seed) {
		var i, item;
		var items = self.val();
		for (i = fromIndex === void 0 ? items.length - 1 : fromIndex; i >= 0; i--) {
			item = items[i];
			if (searchElement === items[i]) {
				return i;
			}
		}
		return -1;
	});
}


/**
 * @template U
 * @param {function(T,number=): U} callback
 * @returns {Enumerable<U>} 
 */
Enumerable.prototype.map = function (callback) {
	return makeEnumerableNode(new DataEnumerable(), this, map, { callback: callback, items: [], nodes: [] });
}

/**
 * @template U
 * @param {function(U,T,number=): U} callback 
 * @param {U=} initialValue
 * @returns {function(): U} 
 */
Enumerable.prototype.reduce = function (callback, initialValue) {
	var self = this;
	var skip = arguments.length === 1;
	return on(self.val, function (seed) {
		var i, ln;
		var items = self.val();
		if (skip) {
			i = 1;
			initialValue = items[0];
		} else {
			i = 0;
		}
		for (ln = items.length; i < ln; i++) {
			initialValue = callback(initialValue, items[i], i);
		}
		return initialValue;
	});
}

/**
 * @template U
 * @param {function(U,T,number=): U} callback 
 * @param {U=} initialValue
 * @returns {function(): U} 
 */
Enumerable.prototype.reduceRight = function (callback, initialValue) {
	var self = this;
	var skip = arguments.length === 1;
	return on(self.val, function (seed) {
		var i;
		var items = self.val();
		if (skip) {
			i = items.length - 2;
			initialValue = items[items.length - 1];
		} else {
			i = items.length - 1;
		}
		for (; i >= 0; i--) {
			initialValue = callback(initialValue, items[i], i);
		}
		return initialValue;
	});
}

/**
 * @returns {Enumerable<T>}
 */
Enumerable.prototype.reverse = function () {
	return makeEnumerableNode(new DataEnumerable(), this, reverse, {});
}

/**
 * 
 * @param {number=} start 
 * @param {number=} end
 * @returns {Enumerable<T>}
 */
Enumerable.prototype.slice = function (start, end) {
	return makeEnumerableNode(new DataEnumerable(), this, slice, { start: start, end: end });

}

/**
 * 
 * @param {function(T,number=): boolean} callback
 * @returns {function(): boolean} 
 */
Enumerable.prototype.some = function (callback) {
	var self = this;
	return on(self.val, function (seed) {
		var i, ln;
		var items = self.val();
		for (i = 0, ln = items.length; i < ln; i++) {
			if (callback(items[i], i)) {
				return true;
			}
		}
		return false;
	});
}

/**
 * 
 * @param {function(T,T): number=} compareFunction
 * @returns {Enumerable<T>}
 */
Enumerable.prototype.sort = function (compareFunction) {
	return makeEnumerableNode(new DataEnumerable(), this, sort, { compareFunction: compareFunction });
}

/**
 * @template T
 * @constructor
 * @extends {Data<Array<T>>}
 * @extends {Enumerable<T>}
 * @param {Array<T>} val
 */
function DataArray(val) {
	var self = this;
	Data.call(self, val);
	/**
	 * @public
	 * @param {T=} next 
	 * @returns {Array<T>}
	 */
	this.val = function (next) {
		if (arguments.length > 0) {
			logWrite(self, next);
		} else {
			if (Listener !== null) {
				logRead(self, Listener);
			}
		}
		return self._val;
	}
	/**
	 * @package
	 * @type {number}
	 */
	this._age = -1;
	/**
	 * @package
	 * @type {ChangeSet|Array<ChangeSet>}
	 */
	this._mut = null;
	/**
	 * @package
	 * @type {ChangeSet|Array<ChangeSet>}
	 */
	this._pmut = null;
}

DataArray.prototype = new Enumerable();
DataArray.constructor = DataArray;

/**
 * @package
 * @returns {void}
 */
DataArray.prototype.update = function () {
	if (this._pval !== NotPending) {
		this._val = this._pval;
		this._pval = NotPending;
		this._mut = this._pmut = null;
	} else if (this._flag & Flag.Single) {
		applyMutation(this, this._pmut);
	} else {
		for (var i = 0, ln = this._pmut.length; i < ln; i++) {
			applyMutation(this, this._pmut[i]);
		}
		this._mut = this._pmut;
		this._pmut = null;
		this._age = Root.time;
	}
	if (this._node1 !== null || this._nodes !== null) {
		markComputationsForUpdate(this, Root.time);
	}
}

/**
 * 
 * @param {number} index 
 * @param {T} item 
 * @returns {void}
 */
DataArray.prototype.insertAt = function (index, item) {
	logMutate(this, { type: Mutation.InsertAt, index: index, value: item });
}

/**
 * 
 * @param {number} index 
 * @param {Array<T>} items 
 * @returns {void}
 */
DataArray.prototype.insertRange = function (index, items) {
	logMutate(this, { type: Mutation.InsertRange, index: index, value: items });
}

/**
 * @returns {void}
 */
DataArray.prototype.pop = function () {
	logMutate(this, { type: Mutation.Pop });
}

/**
 * 
 * @param {T} item 
 * @returns {void}
 */
DataArray.prototype.push = function (item) {
	logMutate(this, { type: Mutation.Push, value: item });
}

/**
 * 
 * @param {number} index 
 * @returns {void}
 */
DataArray.prototype.removeAt = function (index) {
	logMutate(this, { type: Mutation.RemoveAt, index: index });
}

/**
 * 
 * @param {number} index 
 * @param {number} count 
 * @returns {void}
 */
DataArray.prototype.removeRange = function (index, count) {
	logMutate(this, { type: Mutation.RemoveRange, index: index, count: count });
}

/**
 * @returns {void}
 */
DataArray.prototype.shift = function () {
	logMutate(this, { type: Mutation.Shift });
}

/**
 * 
 * @param {T} item
 * @returns {void}
 */
DataArray.prototype.unshift = function (item) {
	logMutate(this, { type: Mutation.Unshift, value: item });
}

/**
 * @template T
 * @constructor
 * @extends {Enumerable}
 * @extends {Computation}
 */
function DataEnumerable() {
	var self = this;
	Computation.call(self);
	/**
	 * @returns {T}
	 */
	this.val = function () {
		if (Listener !== null) {
			if (self._age === Root.time) {
				if (self._flag & Flag.Running) {
					throw new Error('Circular dependency');
				} else if (self._flag & Flag.Stale) {
					self.update();
				}
			}
			logRead(self, Listener);
		}
		return self._val;
	}
	/**
	 * @package
	 * @type {ChangeSet|Array<ChangeSet>}
	 */
	this._mut = null;
	/**
	 * @package
	 * @type {ChangeSet|Array<ChangeSet>}
	 */
	this._pmut = null;
	/**
	 * @package
	 * @type {DataEnumerable}
	 */
	this._source = null;
	/**
	 * @package
	 * @type {Object}
	 */
	this._params = null;
}

DataEnumerable.prototype = new Enumerable();
DataEnumerable.constructor = DataEnumerable;

/**
 * @package
 * @returns {void}
 */
DataEnumerable.prototype.update = function () {
	var owner = Owner;
	var listener = Listener;
	cleanupNode(this, false);
	Owner = Listener = this;
	this._flag &= ~Flag.Stale;
	this._flag |= Flag.Running;
	this._val = this._fn(this._source, this._params, this._val);
	this._flag &= ~Flag.Running;
	Owner = owner;
	Listener = listener;
}

DataEnumerable.prototype.dispose = function () {
	this._fn = null;
	this._node1 = null;
	this._nodes = null;
	cleanupNode(this, true);
}

/*
 * Internal implementation
 */

/**
 * @const
 * @enum {number}
 */
var Flag = {
	Wait: 1,
	Trace: 2,
	Dynamic: 4,
	Static: 8,
	Data: 16,
	Value: 32,
	Computation: 64,
	DataArray: 128,
	Enumerable: 256,
	Stale: 512,
	Running: 1024,
	Pending: 2048,
	Disposed: 4096,
	Watch: 8192,
	Single: 16384,
	Orphan: 32768,
};
/* @strip */
/**
 * @const
 * @enum {number}
 */
var System = {
	Idle: 0,
	Compute: 1,
	Change: 2,
	Trace: 3,
	Update: 4,
	Dispose: 5,
};

/**
 * @const
 * @enum {number}
 */
var Mutation = {
	InsertAt: 1,
	InsertRange: 2,
	Pop: 3,
	Push: 4,
	RemoveAt: 5,
	RemoveRange: 6,
	Shift: 7,
	Unshift: 8,
};
/* @strip */
/**
 * @template T
 * @typedef ChangeSet
 * @property {number} type
 * @property {number=} index
 * @property {number=} count
 * @property {T|Array<T>=} value
 */

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
 * @type {Computation}
 */
var Owner = null;
/**
 * @type {Computation}
 */
var Listener = null;
/**
 * @type {Computation}
 */
var Recycled = null;
/**
 * @const
 * @type {Computation}
 */
var Unowned = new Computation();
/**
 * @const
 * @type {Object}
 */
var NotPending = {};

/**
 * @template T
 * @constructor
 */
function Queue() {
	/**
	 * @type {number}
	 */
	this.ln = 0;
	/**
	 * @const
	 * @type {Array<T>} 
	 */
	this.items = [];
}

Queue.prototype.reset = function () {
	this.ln = 0;
}

Queue.prototype.add = function (item) {
	this.items[this.ln++] = item;
}

Queue.prototype.run = function (fn) {
	var items = this.items;
	for (var i = 0, ln = this.ln; i < ln; i++) {
		fn(items[i]);
		items[i] = null;
	}
	this.ln = 0;
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
 * @returns {Computation}
 */
function getCandidateNode() {
	var node = Recycled;
	if (node === null) {
		return new Computation();
	} else {
		Recycled = null;
		return node;
	}
}

/**
 * @template T
 * @param {Computation<T>} node 
 * @param {function(T): T} fn 
 * @param {T} seed 
 * @param {number} flags 
 * @returns {function(): T}
 */
function makeComputationNode(node, fn, seed, flags) {
	var owner = Owner;
	var listener = Listener;
	var toplevel = State === System.Idle;
	Owner = node;
	Listener = (flags & (Flag.Dynamic | Flag.Static)) === Flag.Static ? null : node;
	if (toplevel) {
		Root.changes.reset();
		Root.updates.reset();
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
	var recycled = recycleOrClaimNode(node, fn, seed, flags);
	if (toplevel) {
		if (Root.changes.ln > 0 || Root.updates.ln > 0) {
			try {
				run(Root);
			} finally {
				State = System.Idle;
			}
		}
	}
	if (recycled) {
		return function () { return seed; }
	} else {
		return function () {
			return node.get();
		}
	}
}

/**
 * @template T, U
 * @param {DataEnumerable<T>} node
 * @param {DataEnumerable} source
 * @param {function(DataEnumerable<T>, Object, Array<T>): U} fn 
 * @param {Object} params
 * @returns {DataEnumerable<U>}
 */
function makeEnumerableNode(node, source, fn, params) {
	var owner = Owner;
	var listener = Listener;
	var toplevel = State === System.Idle;
	Owner = Listener = node;
	if (toplevel) {
		Root.changes.reset();
		Root.updates.reset();
		try {
			State = System.Compute;
			node._val = fn(source, params, []);
		} finally {
			State = System.Idle;
			Owner = Listener = null;
		}
	} else {
		node._val = fn(source, params, []);
	}
	Owner = owner;
	Listener = listener;
	node._fn = fn;
	node._age = Root.time;
	node._source = source;
	node._params = params;
	if (owner !== null) {
		if (owner._flag & (Flag.Trace | Flag.Watch)) {
			node._owner = owner;
		}
		if (owner._owned === null) {
			owner._owned = [node];
		} else {
			owner._owned.push(node);
		}
	}
	if (toplevel) {
		if (Root.changes.ln > 0 || Root.updates.ln > 0) {
			try {
				run(Root);
			} finally {
				State = System.Idle;
			}
		}
	}
	return node;
}

/**
 * @template T
 * @param {Computation<T>} node 
 * @param {function(T): T} fn 
 * @param {T} val
 * @param {number} flags
 * @returns {boolean}
 */
function recycleOrClaimNode(node, fn, val, flags) {
	var i, ln;
	var owner = flags & Flag.Orphan || Owner === null || Owner === Unowned ? null : Owner;
	var recycle = node._source1 === null && (node._owned === null && node._cleanups === null || owner !== null);
	if (recycle) {
		Recycled = node;
		if (owner !== null) {
			if (node._owned !== null) {
				if (owner._owned === null) {
					owner._owned = node._owned;
				} else {
					for (i = 0, ln = node._owned.length; i < ln; i++) {
						owner._owned.push(node._owned[i]);
					}
				}
				node._owned = null;
			}
			if (node._cleanups !== null) {
				if (owner._cleanups === null) {
					owner._cleanups = node._cleanups;
				} else {
					for (i = 0, ln = node._cleanups.length; i < ln; i++) {
						owner._cleanups.push(node._cleanups[i]);
					}
				}
				node._cleanups = null;
			}
		}
	} else {
		node._fn = fn;
		node._val = val;
		node._age = Root.time;
		node._flag |= flags;
		if (owner !== null) {
			if (owner._owned === null) {
				owner._owned = [node];
			} else {
				owner._owned.push(node);
			}
			if (owner._flag & (Flag.Trace | Flag.Watch)) {
				logTracingOwner(owner);
			}
		}
	}
	return recycle;
}

/**
 * 
 * @param {Data|Computation} from 
 * @param {Computation} to
 */
function logRead(from, to) {
	var fromslot;
	var toslot = to._source1 === null ? -1 : to._sources === null ? 0 : to._sources.length;
	if (from._node1 === null) {
		from._node1 = to;
		from._slot1 = toslot;
		fromslot = -1;
	} else if (from._nodes === null) {
		from._nodes = [to];
		from._slots = [toslot];
		fromslot = 0;
	} else {
		fromslot = from._nodes.length;
		from._nodes.push(to);
		from._slots.push(toslot);
	}
	if (to._source1 === null) {
		to._source1 = from;
		to._source1slot = fromslot;
	} else if (to._sources === null) {
		to._sources = [from];
		to._sourceslots = [fromslot];
	} else {
		to._sources.push(from);
		to._sourceslots.push(fromslot);
	}
	if (from._flag & (Flag.Trace | Flag.Watch)) {
		if (to._flag & Flag.Watch) {
			if (to._traces === null) {
				to._traces = [toslot];
			} else {
				to._traces.push(toslot);
			}
		} else {
			logTracingSource(to, toslot);
		}
	}
}

/**
 * @template T
 * @param {Data<T>|Computation<T>} node
 * @param {T} val
 * @returns {T}
 */
function logWrite(node, val) {
	if (State !== System.Idle) {
		if (node._pval !== NotPending) {
			if (val !== node._pval) {
				throw new Error('Conflicting changes');
			}
		} else {
			node._pval = val;
			Root.changes.add(node);
		}
	} else {
		if (node._node1 !== null || node._nodes !== null) {
			node._pval = val;
			Root.changes.add(node);
			execute();
		} else {
			node._val = val;
		}
	}
	return val;
}

/**
 * @template T
 * @param {DataArray<T>} node 
 * @param {ChangeSet<T>} changeset 
 */
function logMutate(node, changeset) {
	if (State !== System.Idle) {
		if (node._pmut === null) {
			node._pmut = changeset;
			node._flag |= Flag.Single;
			Root.changes.add(node);
		} else {
			if (node._flag & Flag.Single) {
				node._flag &= ~Flag.Single;
				node._pmut = [node._pmut, changeset];
			} else {
				node._pmut.push(changeset);
			}
		}
	} else {
		node._flag |= Flag.Single;
		if (node._node1 !== null || node._nodes !== null) {
			node._pmut = changeset;
			Root.changes.add(node);
			execute();
		} else {
			node._pmut = changeset;
			node.update();
		}
	}
}


/**
 * 
 * @param {Signal} data 
 */
function applyChanges(data) {
	data.update();
	if (data._node1 !== null || data._nodes !== null) {
		markComputationsForUpdate(data, Root.time);
	}
}

/**
 * 
 * @param {Computation} node 
 */
function applyUpdates(node) {
	if (node._flag & Flag.Stale) {
		node.update();
	}
}

/**
 * 
 * @param {Computation} node 
 */
function applyDisposes(node) {
	node.dispose();
}

/**
 * 
 */
function execute() {
	var owner = Owner;
	Root.updates.reset();
	try {
		run(Root);
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
function run(clock) {
	var i = 0;
	clock.disposes.reset();
	do {
		clock.time++;
		State = System.Change;
		clock.changes.run(applyChanges);
		State = System.Trace;
		clock.traces.run(applyUpdates);
		State = System.Update;
		clock.updates.run(applyUpdates);
		State = System.Dispose;
		clock.disposes.run(applyDisposes);
		if (i++ > 1e5) {
			throw new Error('Runaway clock detected');
		}
	} while (clock.changes.ln !== 0 || clock.updates.ln !== 0 || clock.disposes.ln !== 0);
	State = System.Idle;
}

/**
 * @param {Signal|Computation} data
 * @param {number} time
 */
function markComputationsForUpdate(data, time) {
	var node = data._node1;
	var nodes = data._nodes;
	if (node !== null) {
		if (node._age < time) {
			markComputationForUpdate(node, time);
		}
	}
	if (nodes !== null) {
		for (var i = 0, ln = nodes.length; i < ln; i++) {
			node = nodes[i];
			if (node._age < time) {
				markComputationForUpdate(node, time);
			}
		}
	}
}

/**
 * 
 * @param {Computation} node 
 * @param {number} time
 */
function markComputationForUpdate(node, time) {
	node._age = time;
	node._flag |= Flag.Stale;
	if (node._flag & Flag.Trace) {
		Root.traces.add(node);
	} else {
		Root.updates.add(node);
	}
	if (node._owned !== null) {
		markComputationsDisposed(node._owned, time);
	}
	if (!(node._flag & Flag.Trace)) {
		if (node._node1 !== null || node._nodes !== null) {
			markComputationsForUpdate(node, time);
		}
	}
}

/**
 * 
 * @param {Computation} to
 * @param {number} slot
 */
function logTracingSource(to, slot) {
	var i, ln;
	to._flag |= Flag.Watch;
	if (to._traces === null) {
		to._traces = [slot];
	} else {
		to._traces.push(slot);
	}
	var node1 = to._node1;
	var nodes = to._nodes;
	if (node1 !== null) {
		logTracingSource(node1, -1);
	}
	if (nodes !== null) {
		for (i = 0, ln = nodes.length; i < ln; i++) {
			node1 = nodes[i];
			logTracingSource(nodes[i], i);
		}
	}
	logTracingOwner(to);
}

/**
 * 
 * @param {Computation} owner 
 */
function logTracingOwner(owner) {
	var node;
	var owned = owner._owned;
	if (owned !== null) {
		for (var i = 0, ln = owned.length; i < ln; i++) {
			node = owned[i];
			node._owner = owner;
			node._flag |= Flag.Watch;
			logTracingOwner(node);
		}
	}

}

/**
 * @param {Array<Computation>} nodes
 * @param {number} time
 */
function markComputationsDisposed(nodes, time) {
	var node;
	for (var i = 0, ln = nodes.length; i < ln; i++) {
		node = nodes[i];
		if (!(node._flag & Flag.Disposed)) {
			node._age = time;
			node._flag &= ~Flag.Stale;
			node._flag |= Flag.Disposed;
			if (node._owned !== null) {
				markComputationsDisposed(node._owned, time);
			}
		}
	}
}

/**
 * 
 * @param {Computation} node 
 */
function applyUpstreamUpdates(node) {
	var slot;
	var source;
	var sources;
	var owner = node._owner;
	var traces = node._traces;
	if (owner !== null) {
		applyUpstreamUpdates(owner);
	}
	if (!(node._flag & Flag.Disposed)) {
		if (traces !== null) {
			sources = node._sources;
			for (var i = 0, ln = traces.length; i < ln; i++) {
				slot = traces[i];
				source = slot === -1 ? node._source1 : sources[slot];
				if (source._flag & Flag.Watch) {
					applyUpstreamUpdates(source);
				}
				applyUpdates(source);
			}
		}
		applyUpdates(node);
	}
}

/**
 * 
 * @param {Computation} node 
 * @param {boolean} final 
 */
function cleanupNode(node, final) {
	var i, ln;
	var owned = node._owned;
	var cleanups = node._cleanups;
	if (cleanups !== null) {
		for (i = 0, ln = cleanups.length; i < ln; i++) {
			cleanups[i](final);
		}
	}
	if (owned !== null) {
		for (i = 0, ln = owned.length; i < ln; i++) {
			owned[i].dispose();
		}
	}
	if (final || (node._flag & Flag.Static) === 0) {
		if (node._source1 !== null) {
			cleanupSource(node._source1, node._source1slot);
		}
		var sources = node._sources;
		var sourceslots = node._sourceslots;
		if (sources !== null) {
			for (i = 0, ln = sources.length; i < ln; i++) {
				cleanupSource(sources.pop(), sourceslots.pop());
			}
		}
		node._trace1 = -1;
		node._traces = null;
	}
}

/**
 * @param {Data|Computation} source
 * @param {number} slot
 */
function cleanupSource(source, slot) {
	var last;
	var lastslot;
	if (slot === -1) {
		source._node1 = null;
	} else {
		var nodes = source._nodes;
		var nodeslots = source._slots;
		last = nodes.pop();
		lastslot = nodeslots.pop();
		if (slot !== nodes.length) {
			nodes[slot] = last;
			nodeslots[slot] = lastslot;
			if (lastslot === -1) {
				last._source1slot = slot;
			} else {
				last._sourceslots[lastslot] = slot;
			}
		}
	}
}

/**
 * @template T
 * @param {function(): T} f
 * @returns {Computation<T>} 
 */
function persist(f) {
	var node = getCandidateNode();
	var owner = Owner;
	var listener = Listener;
	Owner = node;
	Listener = null;
	try {
		node._val = f();
	} finally {
		Owner = owner;
		Listener = listener;
	}
	return node;
}

/**
 * @template T
 * @param {DataArray<T>} node 
 * @param {ChangeSet<T>} changeset
 */
function applyMutation(node, changeset) {
	var i, ln;
	var array = node._val;
	var value = changeset.value;
	switch (changeset.type) {
		case Mutation.InsertAt:
			array.splice(changeset.index, 0, value);
			break;
		case Mutation.InsertRange:
			value.unshift(0);
			value.unshift(changeset.index);
			Array.prototype.splice.apply(array, value);
			break;
		case Mutation.Pop:
			if (array.length !== 0) {
				array.length--;
			}
			break;
		case Mutation.Push:
			array[array.length] = value;
			break;
		case Mutation.RemoveAt:
			ln = array.length;
			if (ln > 0) {
				i = changeset.index;
				if (i < 0) {
					i = ln - 1 + i;
					if (i < 0) {
						i = 0;
					}
				} else {
					if (i >= ln) {
						array.length--;
						break;
					}
				}
				for (; i < ln; i++) {
					array[i] = array[i + 1];
				}
				array.length--;
			}
			break;
		case Mutation.RemoveRange:
			array.splice(changeset.index, changeset.count);
			break;
		case Mutation.Shift:
			array.shift();
			break;
		case Mutation.Unshift:
			array.unshift(value);
			break;
	}
}

/**
 * @template T
 * @param {DataEnumerable<T>} source
 * @param {Object} params
 * @param {function(T,number=): boolean} params.callback 
 * @param {Array<T>} seed
 */
function filter(source, params, seed) {
	var items = source.val();
	var newItems = [];
	for (var i = 0, ln = items.length; i < ln; i++) {
		var item = items[i];
		if (params.callback(item, i)) {
			newItems.push(item);
		}
	}
	return newItems;
}


/**
 * @template T
 * @param {DataEnumerable<T>} source 
 * @param {Object} params
 * @param {function(T,number=): void} params.callback
 * @param {Array<T>} seed
 * @returns {void}
 */
function forEach(source, params, seed) {
	var items = source.val();
	for (var i = 0, ln = items.length; i < ln; i++) {
		params.callback(items[i], i);
	}
}

/**
 * @template T,U
 * @param {DataEnumerable<T>} source 
 * @param {Object} params
 * @param {function(T,number=): U} params.callback
 * @param {Array<U>} params.items
 * @param {Array<Computation>} params.nodes
 * @param {Array<U>} seed
 * @returns {Array<U>}
 */
function map(source, params, seed) {
	var i, j, ln, node;
	var items = source.val();
	var nodes = params.nodes;
	var callback = params.callback;
	var mapper = function () {
		return callback(items[j], j);
	}
	if (items.length === 0) {
		if (nodes.length !== 0) {
			for (i = 0, ln = nodes.length; i < ln; i++) {
				nodes[i].dispose();
			}
			diposers.length = 0;
		}
	} else if (seed.length === 0) {
		for (j = 0, ln = items.length; j < ln; j++) {
			node = persist(mapper);
			nodes[j] = node;
			seed[j] = node._val;
		}
	} else {
		if (nodes.length !== 0) {
			for (i = 0, ln = nodes.length; i < ln; i++) {
				nodes[i].dispose();
			}
			nodes.length = 0;
		}
		for (j = 0, ln = items.length; j < ln; j++) {
			node = persist(mapper);
			nodes[j] = node;
			seed[j] = node._val;
		}
	}
	return seed;
}

/**
 * @template T
 * @param {DataEnumerable<T>} source 
 * @param {Object} params 
 * @param {Array<T>} seed
 * @returns {Array<T>} 
 */
function reverse(source, params, seed) {
	var items = source.val();
	var newItems = [];
	for (var i = items.length - 1, j = 0; i >= 0; i--, j++) {
		newItems[j] = items[i];
	}
	return newItems;
}

/**
 * @template T
 * @param {DataEnumerable<T>} source 
 * @param {Object} params 
 * @param {number=} params.start
 * @param {number=} params.end
 * @param {Array<T>} seed
 * @returns {Array<T>} 
 */
function slice(source, params, seed) {
	var start, end;
	var items = source.val();
	var newItems = [];
	if (params.start !== void 0) {
		if (params.start < 0) {
			if (-1 * params.start < items.length) {
				start = items.length + params.start;
			} else {
				start = 0;
			}
		} else {
			if (params.start < items.length) {
				start = params.start;
			} else {
				start = 0;
			}
		}
	} else {
		start = 0;
	}
	if (params.end !== void 0) {
		if (params.end < 0) {
			if (-1 * params.end < items.length && items.length + params.end > start) {
				end = items.length + params.end;
			} else {
				end = items.length - 1;
			}
		} else {
			if (params.end > start && params.end < items.length) {
				end = params.end;
			} else {
				end = items.length - 1;
			}
		}
	} else {
		end = items.length - 1;
	}
	for (var j = 0; start < end; j++, start++) {
		newItems[j] = items[start];
	}
	return newItems;
}

/**
 * @template T
 * @param {DataEnumerable<T>} source 
 * @param {Object} params 
 * @param {function(T,T): number=} params.compareFunction
 * @param {Array<T>} seed
 * @returns {Array<T>} 
 */
function sort(source, params, seed) {
	var items = source.val();
	var newItems = items.slice();
	newItems.sort(params.compareFunction);
	return newItems;
}

module.exports = {
	array: array,
	data: data,
	value: value,
	Flag: Flag,
	/* @strip */
	System: System,
	Mutation: Mutation,
	/* @strip */
	cleanup: cleanup,
	freeze: freeze,
	fn: fn,
	on: on,
	root: root,
	sample: sample,
	Data: Data,
	Value: Value,
	Computation: Computation,
	DataArray: DataArray,
	DataEnumerable: DataEnumerable,
};
