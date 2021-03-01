/**
 * @public
 * @template T
 * @param {Array<T>} val
 * @returns {SignalArray<T>}
 */
function array(val) {
	return new SignalArray(val);
}

/**
 * @public
 * @template T
 * @param {T} val
 * @returns {function(T=): T}
 */
function data(val) {
	var node = new Signal(val);
	/**
	 * @param {T=} next
	 * @returns {T}
	 */
	return function (next) {
		return arguments.length > 0 ? node.set(next) : node.get();
	}
}

/**
 * @public
 * @template T
 * @param {T} val
 * @param {function(T,T): boolean=} eq
 * @returns {Signal<T>}
 */
function value(val, eq) {
	var node = new Value(val, eq);
	/**
	 * @param {T=} next
	 * @returns {T}
	 */
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
	if (Running !== null) {
		val = f();
	} else {
		Root.changes.reset();
		Running = Root;
		try {
			val = f();
			execute();
		} finally {
			Running = null;
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
	return makeComputationNode(getCandidateNode(), f, seed, 0 | flags);
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
			for (var i = 0, len = src.length; i < len; i++) {
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
	var disposer = f.length === 0 ? null : function () {
		if (node !== null) {
			if (Running !== null) {
				node._flag = Flag.Disposed;
				Running.disposes.add(node);
			} else {
				node.dispose();
			}
		}
	};
	var owner = Owner;
	var listener = Listener;
	Owner = node = disposer === null ? Unowned : getCandidateNode();
	Listener = null;
	try {
		val = disposer === null ? f() : f(disposer);
	} finally {
		Owner = owner;
		Listener = listener;
	}
	if (disposer === null || recycleOrClaimNode(node, null, void 0, Flag.Orphan)) {
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
 * @constructor
 * @param {T} val
 */
function Signal(val) {
	/**
	 * @package
	 * @type {T}
	 */
	this._val = val;
	/**
	 * @package
	 * @type {T|Object}
	 */
	this._pending = NotPending;
	/**
	 * @package
	 * @type {number}
	 */
	this._flag = 0;
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
	this._nodeslots = null;
}

/**
 * @package
 * @returns {T}
 */
Signal.prototype.get = function () {
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
Signal.prototype.set = function (val) {
	return logWrite(this, val);
}

/**
 * @package
 */
Signal.prototype.update = function () {
	this._val = this._pending;
	this._pending = NotPending;
}

/**
 * @template T
 * @constructor
 * @extends {Signal<T>}
 * @param {T} val
 * @param {function(T,T): boolean)=} eq
 */
function Value(val, eq) {
	Signal.call(this, val);
	/**
	 * @const
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

Value.prototype.update = function () {
	this._val = this._pending;
	this._pending = NotPending;
}

/**
 * @template T
 * @constructor
 */
function Computation() {
	/**
	 * @package
	 * @type {null|function(T): T}
	 */
	this._fn = null;
	/**
	 * @package
	 * @type {T}
	 */
	this._val = null;
	/**
	 * @package
	 * @type {Computation}
	 */
	this._node1 = null;
	/**
	 * @package
	 * @type {number}
	 */
	this._slot1 = null;
	/**
	 * @package
	 * @type {Array<Computation>}
	 */
	this._nodes = null;
	/**
	 * @package
	 * @type {Array<Computation>}
	 */
	this._nodeslots = null;
	/**
	 * @package
	 * @type {Data}
	 */
	this._source1 = null;
	/**
	 * @package
	 * @type {number}
	 */
	this._source1slot = -1;
	/**
	 * @package
	 * @type {Array<Data>}
	 */
	this._sources = null;
	/**
	 * @package
	 * @type {Array<number>}
	 */
	this._sourceslots = null;
	/**
	 * @type {number}
	 */
	this._age = -1;
	/**
	 * @type {number}
	 */
	this._flag = 0;
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
		if (this._age === Root.time) {
			if (this._flag & Flag.Running) {
				throw new Error('Circular dependency');
			} else if (this._flag & Flag.Stale) {
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
	cleanup(this, false);
	Owner = Listener = this;
	this._flag &= ~Flag.Stale;
	this._flag |= Flag.Running;
	this._val = this._fn(this._val);
	this._flag &= ~Flag.Running;
	Owner = owner;
	Listener = listener;
}

Computation.prototype.dispose = function () {
	this.fn = null;
	this._node1 = null;
	this._nodes = null;
	cleanup(this, true);
}

/**
 * @abstract
 * @template T
 * @constructor
 */
function Enumerable() { }

/**
 * @type {function(T=): T}
 */
Enumerable.prototype.val;

/**
 * 
 * @param {function(T,function(number): void=): boolean} callback 
 * @returns {function(): boolean}
 */
Enumerable.prototype.every = function (callback) {

}

/**
 * 
 * @param {function(T,function(number): void=): boolean} callback 
 * @returns {Enumerable<T>}
 */
Enumerable.prototype.filter = function (callback) {

}

/**
 * 
 * @param {function(T,function(number): void=): boolean} callback
 * @returns {function(): T} 
 */
Enumerable.prototype.find = function (callback) {

}

/**
 * 
 * @param {function(T,function(number): void=): boolean} callback 
 * @param {number=} index 
 * @returns {function(): number}
 */
Enumerable.prototype.findIndex = function (callback, index) {

}

/**
 * 
 * @param {function(T,function(number): void=): void} callback 
 * @returns {void}
 */
Enumerable.prototype.forEach = function (callback) {

}

/**
 * 
 * @param {T} valueToFind 
 * @returns {function(): boolean}
 */
Enumerable.prototype.includes = function (valueToFind) {

}

/**
 * 
 * @param {T} searchElement 
 * @param {number=} fromIndex 
 * @returns {function(): number}
 */
Enumerable.prototype.indexOf = function (searchElement, fromIndex) {

}

/**
 * 
 * @param {string=} separator 
 * @returns {function(): string}
 */
Enumerable.prototype.join = function (separator) {

}

/**
 * 
 * @param {T} searchElement 
 * @param {number=} fromIndex
 * @returns {function(): number}
 */
Enumerable.prototype.lastIndexOf = function (searchElement, fromIndex) {

}


/**
 * @template U
 * @param {function(T,function(number): void=): U} callback
 * @returns {Enumerable<U>} 
 */
Enumerable.prototype.map = function (callback) {

}

/**
 * 
 * @param {function(T,T): number} compareFunction
 * @returns {Enumerable<T>}
 */
Enumerable.prototype.orderBy = function (compareFunction) {

}

/**
 * @template U
 * @param {function(U,T,function(number): void=): U} callback 
 * @param {U=} initialValue
 * @returns {function(): U} 
 */
Enumerable.prototype.reduce = function (callback, initialValue) {

}

/**
 * @template U
 * @param {function(U,T,function(number): void=): U} callback 
 * @param {U=} initialValue
 * @returns {function(): U} 
 */
Enumerable.prototype.reduceRight = function (callback, initialValue) {

}

/**
 * @returns {Enumerable<T>}
 */
Enumerable.prototype.reverse = function () {

}

/**
 * 
 * @param {number=} start 
 * @param {number} end
 * @returns {Enumerable<T>}
 */
Enumerable.prototype.slice = function (start, end) {

}

/**
 * 
 * @param {function(T,function(number): void=): boolean} callback
 * @returns {function(): boolean} 
 */
Enumerable.prototype.some = function (callback) {

}

/**
 * @template T
 * @constructor
 * @extends {Data<Array<T>>}
 * @extends {Enumerable<T>}
 * @param {Array<T>} val
 */
function SignalArray(val) {
	var self = this;
	Signal.call(self, val);
	/**
	 * @public
	 * @param {T=} next 
	 * @returns {Array<T>}
	 */
	this.val = function (next) {
		if (arguments.length > 0) {
			return logWrite(self, next);
		} else {
			if (Listener !== null) {
				logRead(self, Listener);
			}
			return self._val;
		}
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
}

SignalArray.prototype = new Enumerable();
SignalArray.constructor = SignalArray;

SignalArray.prototype.update = function () {
	if (this._flag & Flag.Single) {
		this._flag &= ~Flag.Single;
		applyMutation(this, this._pmut);
	} else {
		var muts = this._pmut;
		for (var i = 0, len = muts.length; i < len; i++) {
			applyMutation(this, muts[i]);
		}
	}
	this._mut = this._pmut;
	this._pmut = null;
}

/**
 * @template T
 * @param {SignalArray<T>} node 
 * @param {ChangeSet<T>} changeset
 */
function applyMutation(node, changeset) {
	var i, len;
	var array = node._val;
	switch (changeset.type) {
		case Mutation.InsertAt:

			break;
		case Mutation.InsertRange:
			break;
		case Mutation.Pop:
			array._val.length--;
			break;
		case Mutation.Push:
			array[array.length] = changeset.value;
			break;
		case Mutation.RemoveAt:
			len = array.length;
			if (len > 0) {
				for (i = changeset.index; i < len; i++) {
					arr[i] = arr[i + 1]; 
				}
				array.length--;
			}
			break;
		case Mutation.RemoveRange:
			break;
		case Mutation.Shift:
			array.shift();
			break;
		case Mutation.Unshift:
			len = array.length;
			for (len = array.length; len !== 0; len--) {
				array[len] = arr[len - 1];
			}
			arr[0] = changeset.value;
			break;
	}
}

/**
 * 
 * @param {number} index 
 * @param {T} item 
 * @returns {void}
 */
SignalArray.prototype.insertAt = function (index, item) {
	logMutate(this, { type: Mutation.InsertAt, index: index, value: item });
}

/**
 * 
 * @param {number} index 
 * @param {Array<T>} items 
 * @returns {void}
 */
SignalArray.prototype.insertRange = function (index, items) {
	logMutate(this, { type: Mutation.InsertRange, index: index, value: items });
}

/**
 * @returns {void}
 */
SignalArray.prototype.pop = function () {
	logMutate(this, { type: Mutation.Pop });
}

/**
 * 
 * @param {T} item 
 * @returns {void}
 */
SignalArray.prototype.push = function (item) {
	logMutate(this, { type: Mutation.Push, value: item });
}

/**
 * 
 * @param {number} index 
 * @returns {void}
 */
SignalArray.prototype.removeAt = function (index) {
	logMutate(this, { type: Mutation.RemoveAt, index: index });
}

/**
 * 
 * @param {number} index 
 * @param {number} count 
 * @returns {void}
 */
SignalArray.prototype.removeRange = function (index, count) {
	logMutate(this, { type: Mutation.RemoveRange, index: index, count: count });
}

/**
 * @returns {void}
 */
SignalArray.prototype.shift = function () {
	logMutate(this, { type: Mutation.Shift });
}

/**
 * 
 * @param {T} item
 * @returns {void}
 */
SignalArray.prototype.unshift = function (item) {
	logMutate(this, { type: Mutation.Unshift, value: item });
}

/**
 * @template T
 * @constructor
 * @extends {Enumerable}
 * @extends {Computation}
 */
function SignalEnumerable() {
	var self = this;
	Computation.call(self);
	/**
	 * @returns {T}
	 */
	this.val = function () {
		return self._val;
	}
}

SignalEnumerable.prototype = new Enumerable();
SignalEnumerable.constructor = SignalEnumerable;

/*
 * Internal implementation
 */

/**
 * @const
 * @enum {number}
 */
var Flag = {
	OnChange: 1,
	OnUpdate: 2,
	OnModify: 4,
	Stale: 8,
	Running: 16,
	Pending: 32,
	Disposed: 64,
	Static: 128,
	Track: 256,
	Orphan: 512,
	Single: 1024,
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
 * @type {Clock}
 */
var Running = null;
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
	this.len = 0;
	/**
	 * @const
	 * @type {Array<T>} 
	 */
	this.items = [];
}

Queue.prototype.reset = function () {
	this.len = 0;
}

Queue.prototype.add = function (item) {
	this.items[this.len++] = item;
}

Queue.prototype.run = function (fn) {
	var items = this.items;
	for (var i = 0; i < this.len; i++) {
		fn(items[i]);
		items[i] = null;
	}
	this.len = 0;
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
	 * @type {Queue<Signal>}
	 */
	this.changes = new Queue();
	/**
	 * @const
	 * @type {Queue<Procedure>}
	 */
	this.updates = new Queue();
	/**
	 * @const
	 * @type {Queue<Procedure>}
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
	var toplevel = Running === null;
	Owner = node;
	Listener = flags & Flag.Static ? null : node;
	if (toplevel) {
		Root.changes.reset();
		Root.updates.reset();
		try {
			Running = Root;
			seed = flags & Flag.OnChange ? seed : fn(seed);
		} finally {
			Owner = Listener = Running = null;
		}
	} else {
		seed = fn(seed);
	}
	Owner = owner;
	Listener = listener;
	var recycled = recycleOrClaimNode(node, fn, seed, flags);
	if (toplevel) {
		if (Root.changes.len > 0 || Root.updates.len > 0) {
			try {
				run(Root);
			} finally {
				Running = null;
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
 * @template T
 * @param {Computation<T>} node 
 * @param {function(T): T} fn 
 * @param {T} val
 * @param {number} flags
 * @returns {boolean}
 */
function recycleOrClaimNode(node, fn, val, flags) {
	var i, len;
	var owner = flags & Flag.Orphan || Owner === null || Owner === Unowned ? null : Owner;
	var recycle = node._source1 === null && (node._owned === null && node._cleanups === null || owner !== null);
	if (recycle) {
		Recycled = node;
		if (owner !== null) {
			if (node._owned !== null) {
				if (owner._owned === null) {
					owner._owned = node._owned;
				} else {
					for (i = 0, len = node._owned.length; i < len; i++) {
						owner._owned.push(node._owned[i]);
					}
				}
				node._owned = null;
			}
			if (node._cleanups !== null) {
				if (owner._cleanups === null) {
					owner._cleanups = node._cleanups;
				} else {
					for (i = 0, len = node._cleanups.length; i < len; i++) {
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
		node._flag = flags;
		if (owner !== null) {
			if (owner._owned === null) {
				owner._owned = [node];
			} else {
				owner._owned.push(node);
			}
		}
	}
	return recycle;
}

/**
 * 
 * @param {Signal|Computation} from 
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
		from._nodeslots = [toslot];
		fromslot = 0;
	} else {
		fromslot = from._nodes.length;
		from._nodes.push(to);
		from._nodeslots.push(toslot);
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
}

/**
 * @template T
 * @param {Signal<T>} node
 * @param {T} val
 * @returns {T}
 */
function logWrite(node, val) {
	if (Running !== null) {
		if (node._pending !== NotPending) {
			if (val !== node._pending) {
				throw new Error('Conflicting changes');
			}
		} else {
			node._pending = val;
			Running.changes.add(node);
		}
	} else {
		if (node._node1 !== null || node._nodes !== null) {
			node._pending = val;
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
 * @param {SignalArray<T>} node 
 * @param {ChangeSet<T>} changeset 
 */
function logMutate(node, changeset) {
	if (Running !== null) {
		if (node._pmut === null) {
			node._pmut = [changeset];
			Running.changes.add(node);
		} else {
			node._pmut.push(changeset);
		}
	} else {
		if (node._node1 !== null || node._nodes !== null) {
			node._pmut = [changeset];
			Root.changes.add(node);
			execute();
		} else {
			node._flag |= Flag.Single;
			node._mut = changeset;
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
		markProceduresForUpdate(data, Running.time);
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
		Running = Listener = null;
	}
}

/**
 * 
 * @param {Clock} clock 
 */
function run(clock) {
	var i = 0;
	var running = Running;
	Running = clock;
	clock.disposes.reset();
	do {
		clock.time++;
		clock.changes.run(applyChanges);
		clock.updates.run(applyUpdates);
		clock.disposes.run(applyDisposes);
		if (i++ > 1e5) {
			throw new Error('Runaway clock detected');
		}
	} while (clock.changes.len !== 0 || clock.updates.len !== 0 || clock.disposes.len !== 0);
	Running = running;
}

/**
 * @param {Signal|Computation} data
 * @param {number} time
 */
function markProceduresForUpdate(data, time) {
	var node = data._node1;
	var nodes = data._nodes;
	if (node !== null) {
		if (node._age < time) {
			markProcedureForUpdate(node, time);
		}
	}
	if (nodes !== null) {
		for (var i = 0, len = nodes.length; i < len; i++) {
			node = nodes[i];
			if (node._age < time) {
				markProcedureForUpdate(node, time);
			}
		}
	}
}

/**
 * 
 * @param {Computation} node 
 * @param {number} time
 */
function markProcedureForUpdate(node, time) {
	node._age = time;
	node._flag |= Flag.Stale;
	Running.updates.add(node);
	if (node._owned !== null) {
		markProceduresForDisposal(node._owned, time);
	}
	if (node._node1 !== null || node._nodes !== null) {
		markProceduresForUpdate(node, time);
	}
}

/**
 * @param {Array<Computation>} nodes
 * @param {number} time
 */
function markProceduresForDisposal(nodes, time) {
	var node;
	for (var i = 0; i < nodes.length; i++) {
		node = nodes[i];
		node._age = time;
		node._flag = Flag.Disposed;
		if (node._owned !== null) {
			markProceduresForDisposal(node._owned, time);
		}
	}
}

/**
 * 
 * @param {Computation} node 
 * @param {boolean} final 
 */
function cleanup(node, final) {
	var i, len;
	var cleanups = node._cleanups;
	if (cleanups !== null) {
		for (i = 0, len = cleanups.length; i < len; i++) {
			cleanups[i](final);
		}
	}
	var owned = node._owned;
	if (owned !== null) {
		for (i = 0, len = owned.length; i < len; i++) {
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
			for (i = 0, len = sources.length; i < len; i++) {
				cleanupSource(sources.pop(), sourceslots.pop());
			}
		}
	}
}

/**
 * @param {Signal} source
 * @param {number} slot
 */
function cleanupSource(source, slot) {
	var last;
	var lastslot;
	if (slot === -1) {
		source._node1 = null;
	} else {
		var nodes = source._nodes;
		var nodeslots = source._nodeslots;
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

module.exports = {
	array: array,
	data: data,
	value: value,
	Flag: Flag,
	cleanup: cleanup,
	freeze: freeze,
	fn: fn,
	on: on,
	root: root,
	sample: sample,
};
