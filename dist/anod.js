(function() {
	var Flag = {
		Wait: 1,
		Trace: 1 << 1,
		Dynamic: 1 << 2,
		Static: 1 << 3,
		Bound: 1 << 4,
		Unbound: 1 << 5,
		Stale: 1 << 6,
		Running: 1 << 7,
		Disposed: 1 << 8,
		Watch: 1 << 9,
		Single: 1 << 10,
		Orphan: 1 << 11,
		Dirty: 1 << 12,
	};
	function array(val) {
		return new DataArray(val);
	}
	function data(val) {
		var node = new Data(val);
		return function (next) {
			return arguments.length > 0 ? node.set(next) : node.get();
		};
	}
	function value(val, eq) {
		var node = new Value(val, eq);
		return function (next) {
			return arguments.length > 0 ? node.set(next) : node.get();
		};
	}
	function cleanup(f) {
		if (Owner !== null) {
			if (Owner._cleanups === null) {
				Owner._cleanups = [f];
			} else {
				Owner._cleanups.push(f);
			}
		}
	}
	function freeze(f) {
		var val;
		if (State !== 0) {
			val = f();
		} else {
			Root.changes.reset();
			State = 1;
			try {
				val = f();
				execute();
			} finally {
				State = 0;
			}
		}
		return val;
	}
	function bind(src, f, seed, flags) {
		var node = getCandidateNode();
		if (flags & 4) {
			if (flags & 1) {
				bindSource(node, src);
			}
			makeComputationNode(node, function (seed) {
				bindSource(node, src);
				return f(seed);
			}, seed, 16 | flags);
		} else {
			bindSource(node, src);
			makeComputationNode(node, f, seed, 16 | flags);
		}
	}
	function run(f, seed, flags) {
		makeComputationNode(getCandidateNode(), f, seed, 32 | flags);
	}
	function fn(f, seed, flags) {
		return makeProcedureNode(getCandidateNode(), f, seed, 32 | flags);
	}
	function on(src, f, seed, flags) {
		var node = getCandidateNode();
		if (flags & 4) {
			if (flags & 1) {
				bindSource(node, src);
			}
			return makeProcedureNode(node, function (seed) {
				bindSource(node, src);
				return f(seed);
			}, seed, 16 | flags);
		} else {
			bindSource(node, src);
			return makeProcedureNode(node, f, seed, 16 | flags);
		}
	}
	function root(f) {
		var val, node;
		var unending = f.length === 0;
		var disposer = unending ? null : function () {
			if (node !== null) {
				if (State !== 0) {
					if (State === 5) {
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
		if (unending || recycleOrClaimNode(node, null, void 0, 2048)) {
			node = null;
		}
		return val;
	}
	function sample(node) {
		var listener = Listener;
		try {
			Listener = null;
			return node();
		} finally {
			Listener = listener;
		}
	}
	function Data(val) {
		this._val = val;
		this._flag = 0;
		this._log = null;
		this._pval = Void;
	}
	Data.prototype.get = function () {
		if (Listener !== null) {
			logRead(this, Listener);
		}
		return this._val;
	}
	Data.prototype.set = function (val) {
		return logWrite(this, val);
	}
	Data.prototype.update = function () {
		this._val = this._pval;
		this._pval = Void;
		if (this._log !== null) {
			markComputationsForUpdate(this._log, Root.time);
		}
	}
	function Value(val, eq) {
		Data.call(this, val);
		this._eq = eq;
	}
	Value.prototype.get = function () {
		if (Listener !== null) {
			logRead(this, Listener);
		}
		return this._val;
	}
	Value.prototype.set = function (val) {
		return (this._eq ? this._eq(this._val, val) : this._val === val) ? val : logWrite(this, val);
	}
	Value.prototype.update = function () {
		this._val = this._pval;
		this._pval = Void;
		if (this._log !== null) {
			markComputationsForUpdate(this._log, Root.time);
		}
	}
	function Computation() {
		this._val = void 0;
		this._flag = 0;
		this._log = null;
		this._fn = null;
		this._age = -1;
		this._src = null;
		this._owner = null;
		this._traces = null;
		this._owned = null;
		this._cleanups = null;
	}
	Computation.prototype.get = function () {
		if (Listener !== null) {
			var flag = this._flag;
			if (flag & 512) {
				if (State === 3) {
					applyUpstreamUpdates(this);
				}
			}
			if (this._age === Root.time) {
				if (flag & 128) {
					throw new Error('Circular dependency');
				} else if (flag & 64) {
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
		var flag = this._flag;
		if (flag & 32) {
			if (flag & 8) {
				Listener = null;
			} else {
				Listener = this;
			}
		} else {
			Listener = null;
		}
		this._flag &= ~64;
		this._flag |= 128;
		var val = this._val;
		this._val = this._fn.call(this, val);
		if (this._flag & 2) {
			markPendingComputations(this, val);
		}
		this._flag &= ~128;
		Owner = owner;
		Listener = listener;
	}
	Computation.prototype.dispose = function () {
		this.fn = null;
		this._log = null;
		cleanupNode(this, true);
	}
	function Enumerable() { }
	Enumerable.prototype.every = function (callback) {
		var self = this;
		var pure = callback.length === 1;
		return on(self.val, function (seed) {
			var i, ln;
			var items = self.val();
			if (seed !== void 0 && pure) {
				var mut = self._mut;
				if (mut !== null) {
					var result;
					if (self._flag & 1024) {
						result = applyEveryMutation(mut, callback, seed);
						if (result !== void 0) {
							return result;
						}
					} else {
						for (i = 0, ln = mut.length; i < ln; i++) {
							result = applyEveryMutation(mut[i], callback, seed);
							if (result === void 0) {
								break;
							}
							if (seed && !result) {
								return false;
							}
						}
						if (seed) {
							return true;
						} else {
							if (result === false) {
								return false;
							}
						}
					}
				}
			}
			for (i = 0, ln = items.length; i < ln; i++) {
				if (!callback(items[i], i)) {
					return false;
				}
			}
			return true;
		}, void 0, 2);
	}
	Enumerable.prototype.filter = function (callback) {
		var self = this;
		var pure = callback.length === 1;
		return makeEnumerableNode(new DataEnumerable(), self, function (seed) {
			var i, ln;
			var items = self.val();
			var newItems = [];
			for (i = 0, ln = items.length; i < ln; i++) {
				var item = items[i];
				if (callback(item, i)) {
					newItems.push(item);
				}
			}
			return newItems;
		});
	}
	Enumerable.prototype.find = function (callback) {
		var self = this;
		var index = { value: -1 };
		var pure = callback.length === 1;
		return on(self.val, function (seed) {
			var i;
			var ln;
			var item;
			var items = self.val();
			if (seed !== Void && pure) {
				var mut = self._mut;
				if (mut !== null) {
					var result;
					if (self._flag & 1024) {
						result = applyFindMutation(mut, callback, seed, items.length, index);
						if (result !== Void) {
							return result;
						}
					} else {
						// too complicated
					}
				}
			}
			for (i = 0, ln = items.length; i < ln; i++) {
				item = items[i];
				if (callback(item, i)) {
					index = i;
					return item;
				}
			}
			index = -1;
			return void 0;
		}, Void, 2);
	}
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
		}, void 0, 2);
	}
	Enumerable.prototype.forEach = function (callback) {
		var self = this;
		makeEnumerableNode(new DataEnumerable(), self, function (seed) {
			var items = self.val();
			for (var i = 0, ln = items.length; i < ln; i++) {
				callback(items[i], i);
			}
		});
	}
	Enumerable.prototype.includes = function (valueToFind, fromIndex) {
		var self = this;
		return on(self.val, function () {
			var i, ln;
			var items = self.val();
			for (i = fromIndex === void 0 ? 0 : fromIndex, ln = items.length; i < ln; i++) {
				if (valueToFind === items[i]) {
					return true;
				}
			}
			return false;
		}, void 0, 2);
	}
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
		}, void 0, 2);
	}
	Enumerable.prototype.join = function (separator) {
		var self = this;
		return on(self.val, function () {
			return self.val().join(separator);
		}, void 0, 2);
	}
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
		}, void 0, 2);
	}
	Enumerable.prototype.map = function (callback) {
		var self = this;
		var nodes = [];
		return makeEnumerableNode(new DataEnumerable(), self, function (seed) {
			var i, j, ln, node;
			var items = self.val();
			var mapper = function () {
				return callback(items[j], j);
			}
			if (items.length === 0) {
				if (nodes.length !== 0) {
					for (i = 0, ln = nodes.length; i < ln; i++) {
						nodes[i].dispose();
					}
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
		});
	}
	Enumerable.prototype.reduce = function (callback, initialValue) {
		var self = this;
		var type = typeof initialValue;
		var skip = arguments.length === 1;
		return on(self.val, function () {
			var i, ln, result;
			var items = self.val();
			if (skip) {
				i = 1;
				result = items[0];
			} else {
				i = 0;
				result = getInitialValue(initialValue, type);
			}
			for (ln = items.length; i < ln; i++) {
				result = callback(result, items[i], i);
			}
			return result;
		}, void 0, 2);
	}
	Enumerable.prototype.reduceRight = function (callback, initialValue) {
		var self = this;
		var type = typeof initialValue;
		var skip = arguments.length === 1;
		return on(self.val, function (seed) {
			var i;
			var result;
			var items = self.val();
			if (skip) {
				i = items.length - 2;
				result = items[items.length - 1];
			} else {
				i = items.length - 1;
				result = getInitialValue(initialValue, type);
			}
			for (; i >= 0; i--) {
				result = callback(result, items[i], i);
			}
			return result;
		}, void 0, 2);
	}
	Enumerable.prototype.reverse = function () {
		var self = this;
		return makeEnumerableNode(new DataEnumerable(), self, function () {
			var items = self.val();
			var newItems = [];
			for (var i = items.length - 1, j = 0; i >= 0; i--, j++) {
				newItems[j] = items[i];
			}
			return newItems;
		});
	}
	Enumerable.prototype.slice = function (start, end) {
		var self = this;
		return makeEnumerableNode(new DataEnumerable(), self, function (seed) {
			var items = self.val();
			var newItems = [];
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
			for (var j = 0; start < end; j++, start++) {
				newItems[j] = items[start];
			}
			return newItems;
		});
	}
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
	Enumerable.prototype.sort = function (compareFunction) {
		var self = this;
		return makeEnumerableNode(new DataEnumerable(), this, function (seed) {
			var items = self.val();
			var newItems = items.slice();
			newItems.sort(compareFunction);
			return newItems;
		});
	}
	function DataArray(val) {
		var self = this;
		Data.call(self, val);
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
		this._mut = null;
		this._pmut = null;
	}
	DataArray.prototype = new Enumerable();
	DataArray.constructor = DataArray;
	DataArray.prototype.update = function () {
		if (this._pval !== Void) {
			this._val = this._pval;
			this._pval = Void;
			this._mut = null;
		} else {
			this._mut = this._pmut;
			this._pmut = null;
			if (this._flag & 1024) {
				applyMutation(this, this._mut);
			}
			else {
				for (var i = 0, ln = this._mut.length; i < ln; i++) {
					applyMutation(this, this._mut[i]);
				}
			}
		}
		if (this._log !== null) {
			markComputationsForUpdate(this._log, Root.time);
		}
	}
	DataArray.prototype.insertAt = function (index, item) {
		logMutate(this, { type: 513, index: index, value: item });
	}
	DataArray.prototype.insertRange = function (index, items) {
		logMutate(this, { type: 770, index: index, value: items });
	}
	DataArray.prototype.pop = function () {
		logMutate(this, { type: 1028 });
	}
	DataArray.prototype.push = function (item) {
		logMutate(this, { type: 520, value: item });
	}
	DataArray.prototype.removeAt = function (index) {
		logMutate(this, { type: 1040, index: index });
	}
	DataArray.prototype.removeRange = function (index, count) {
		logMutate(this, { type: 1312, index: index, count: count });
	}
	DataArray.prototype.shift = function () {
		logMutate(this, { type: 1088 });
	}
	DataArray.prototype.unshift = function (item) {
		logMutate(this, { type: 640, value: item });
	}
	function DataEnumerable() {
		var self = this;
		Computation.call(this);
		this.val = function () {
			if (Listener !== null) {
				var flag = self._flag;
				if (flag & 512) {
					if (State === 3) {
						applyUpstreamUpdates(self);
					}
				}
				if (self._age === Root.time) {
					if (flag & 128) {
						throw new Error('Circular dependency');
					} else if (flag & 64) {
						self.update();
					}
				}
				logRead(self, Listener);
			}
			return self._val;
		}
		this._mut = null;
		this._pmut = null;
	}
	DataEnumerable.prototype = new Enumerable();
	DataEnumerable.constructor = DataEnumerable;
	DataEnumerable.prototype.update = function () {
		var owner = Owner;
		var listener = Listener;
		cleanupNode(this, false);
		Owner = this;
		Listener = null;
		this._flag &= ~64;
		this._flag |= 128;
		var val = this._val;
		this._val = this._fn.call(this, val);
		if (this._flag & 2) {
			markPendingComputations(this, val);
		}
		this._flag &= ~128;
		Owner = owner;
		Listener = listener;
	}
	DataEnumerable.prototype.dispose = function () {
		this._fn = null;
		this._log = null;
		cleanupNode(this, true);
	}
	var Void = {};
	var Root = new Clock();
	var State = 0;
	var Owner = null;
	var Listener = null;
	var Recycled = null;
	var Unowned = new Computation();
	function Queue() {
		this.ln = 0;
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
	function Clock() {
		this.time = 0;
		this.changes = new Queue();
		this.traces = new Queue();
		this.updates = new Queue();
		this.disposes = new Queue();
	}
	function Log() {
		this._node1 = null;
		this._slot1 = -1;
		this._nodes = null;
		this._slots = null;
	}
	function getCandidateNode() {
		var node = Recycled;
		if (node === null) {
			return new Computation();
		} else {
			Recycled = null;
			return node;
		}
	}
	function bindSource(node, src) {
		var listener = Listener;
		try {
			Listener = node;
			if (isArray(src)) {
				for (var i = 0, ln = src.length; i < ln; i++) {
					src[i]();
				}
			} else {
				src();
			}
		} finally {
			Listener = listener;
		}
	}
	function makeComputationNode(node, fn, seed, flags) {
		var clock = Root;
		seed = initComputationNode(node, fn, seed, flags);
		recycleOrClaimNode(node, fn, seed, flags);
		if (State === 0) {
			finishToplevelExecution(clock);
		}
	}
	function makeProcedureNode(node, fn, seed, flags) {
		var clock = Root;
		seed = initComputationNode(node, fn, seed, flags);
		var recycled = recycleOrClaimNode(node, fn, seed, flags);
		if (State === 0) {
			finishToplevelExecution(clock);
		}
		if (recycled) {
			return function () { return seed; }
		} else {
			return function () {
				return node.get();
			}
		}
	}
	function makeEnumerableNode(node, source, fn, flags) {
		var clock = Root;
		var owner = Owner;
		node._fn = fn;
		node._age = clock.time;
		node._flag |= flags;
		logRead(source, node);
		node._val = initComputationNode(node, fn, [], 16 | flags);
		if (owner !== null) {
			if (owner._owned === null) {
				owner._owned = [node];
			} else {
				owner._owned.push(node);
			}
			if (owner._flag & (2 | 512)) {
				logPendingOwner(owner);
			}
		}
		if (State === 0) {
			finishToplevelExecution(clock);
		}
		return node;
	}
	function initComputationNode(node, fn, seed, flags) {
		var clock = Root;
		var owner = Owner;
		var listener = Listener;
		var toplevel = State === 0;
		Owner = node;
		Listener = flags & 16 ? null : node;
		if (toplevel) {
			clock.changes.reset();
			clock.updates.reset();
			try {
				State = 1;
				seed = flags & 1 ? seed : fn(seed);
			} finally {
				State = 0;
				Owner = Listener = null;
			}
		} else {
			seed = fn(seed);
		}
		Owner = owner;
		Listener = listener;
		return seed;
	}
	function finishToplevelExecution(clock) {
		if (clock.changes.ln > 0 || clock.updates.ln > 0) {
			try {
				tick(clock);
			} finally {
				State = 0;
			}
		}
	}
	function recycleOrClaimNode(node, fn, val, flags) {
		var i, ln;
		var owner = flags & 2048 || Owner === null || Owner === Unowned ? null : Owner;
		var recycle = node._src === null && (node._owned === null && node._cleanups === null || owner !== null);
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
				if (owner._flag & (2 | 512)) {
					logPendingOwner(owner);
				}
			}
		}
		return recycle;
	}
	function logRead(from, to) {
		var log, src, fromslot;
		if (from._log === null) {
			log = from._log = new Log();
		} else {
			log = from._log;
		}
		if (to._src === null) {
			src = to._src = new Log();
		} else {
			src = to._src;
		}
		var toslot = src._node1 === null ? -1 : src._nodes === null ? 0 : src._nodes.length;
		if (log._node1 === null) {
			log._node1 = to;
			log._slot1 = toslot;
			fromslot = -1;
		} else if (log._nodes === null) {
			log._nodes = [to];
			log._slots = [toslot];
			fromslot = 0;
		} else {
			fromslot = log._nodes.length;
			log._nodes.push(to);
			log._slots.push(toslot);
		}
		if (src._node1 === null) {
			src._node1 = from;
			src._slot1 = fromslot;
		} else if (src._nodes === null) {
			src._nodes = [from];
			src._slots = [fromslot];
		} else {
			src._nodes.push(from);
			src._slots.push(fromslot);
		}
		if (from._flag & (2 | 512)) {
			if (to._flag & 512) {
				if (to._traces === null) {
					to._traces = [toslot];
				} else {
					to._traces.push(toslot);
				}
			} else {
				logPendingSource(to, toslot);
			}
		}
	}
	function logWrite(node, val) {
		if (State !== 0) {
			if (node._pval !== Void) {
				if (val !== node._pval) {
					throw new Error('Conflicting changes');
				}
			} else {
				node._pval = val;
				Root.changes.add(node);
			}
		} else {
			if (node._log !== null) {
				node._pval = val;
				Root.changes.add(node);
				execute();
			} else {
				node._val = val;
			}
		}
		return val;
	}
	function logMutate(node, changeset) {
		if (State !== 0) {
			if (node._pval !== Void) {
				throw new Error('Conflicting changes');
			}
			if (node._pmut === null) {
				node._pmut = changeset;
				node._flag |= 1024;
				Root.changes.add(node);
			} else {
				if (node._flag & 1024) {
					node._flag &= ~1024;
					node._pmut = [node._pmut, changeset];
				} else {
					node._pmut.push(changeset);
				}
			}
		} else {
			node._flag |= 1024;
			if (node._log !== null) {
				node._pmut = changeset;
				Root.changes.add(node);
				execute();
			} else {
				node._pmut = changeset;
				node.update();
			}
		}
	}
	function logPendingSource(to, slot) {
		var i, ln;
		to._flag |= 512;
		if (to._traces === null) {
			to._traces = [slot];
		} else {
			to._traces.push(slot);
		}
		var log = to._log;
		if (log !== null) {
			var node1 = log._node1;
			var nodes = log._nodes;
			if (node1 !== null) {
				logPendingSource(node1, -1);
			}
			if (nodes !== null) {
				for (i = 0, ln = nodes.length; i < ln; i++) {
					node1 = nodes[i];
					logPendingSource(nodes[i], i);
				}
			}
		}
		if (to._owned !== null) {
			logPendingOwner(to);
		}
	}
	function logPendingOwner(owner) {
		var node;
		var owned = owner._owned;
		for (var i = 0, ln = owned.length; i < ln; i++) {
			node = owned[i];
			node._owner = owner;
			node._flag |= 512;
			if (node._owned !== null) {
				logPendingOwner(node);
			}
		}
	}
	function applyChanges(data) {
		data.update();
	}
	function applyUpdates(node) {
		if (node._flag & 64) {
			node.update();
		}
	}
	function applyDisposes(node) {
		node.dispose();
	}
	function execute() {
		var owner = Owner;
		Root.updates.reset();
		try {
			tick(Root);
		} finally {
			Owner = owner;
			Listener = null;
			State = 0;
		}
	}
	function tick(clock) {
		var i = 0;
		clock.disposes.reset();
		do {
			clock.time++;
			State = 2;
			clock.changes.run(applyChanges);
			State = 3;
			clock.traces.run(applyUpdates);
			State = 4;
			clock.updates.run(applyUpdates);
			State = 5;
			clock.disposes.run(applyDisposes);
			if (i++ > 1e5) {
				throw new Error('Runaway clock');
			}
		} while (clock.changes.ln !== 0 || clock.updates.ln !== 0 || clock.disposes.ln !== 0);
		State = 0;
	}
	function markComputationsForUpdate(log, time) {
		var node = log._node1;
		var nodes = log._nodes;
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
	function markComputationForUpdate(node, time) {
		node._age = time;
		node._flag |= 64;
		if (node._flag & 2) {
			Root.traces.add(node);
		} else {
			Root.updates.add(node);
		}
		if (node._owned !== null) {
			markComputationsDisposed(node._owned, time);
		}
		if (!(node._flag & 2)) {
			if (node._log !== null) {
				markComputationsForUpdate(node._log, time);
			}
		}
	}
	function markPendingComputations(node, val) {
		if (node._flag & 4096) {
			node._flag &= ~4096;
		} else if (node._val === val) {
			return;
		}
		if (node._log !== null) {
			markComputationsForUpdate(node._log, Root.time);
		}
	}
	function markComputationsDisposed(nodes, time) {
		var node;
		for (var i = 0, ln = nodes.length; i < ln; i++) {
			node = nodes[i];
			if (!(node._flag & 256)) {
				node._age = time;
				node._flag &= ~64;
				node._flag |= 256;
				if (node._owned !== null) {
					markComputationsDisposed(node._owned, time);
				}
			}
		}
	}
	function applyUpstreamUpdates(node) {
		var slot, source, sources;
		var src = node._src;
		var owner = node._owner;
		var traces = node._traces;
		if (owner !== null) {
			applyUpstreamUpdates(owner);
		}
		if (!(node._flag & 256)) {
			if (traces !== null) {
				sources = src._nodes;
				for (var i = 0, ln = traces.length; i < ln; i++) {
					slot = traces[i];
					source = slot === -1 ? src._node1 : sources[slot];
					if (source._flag & (2 | 512)) {
						applyUpstreamUpdates(source);
					}
					applyUpdates(source);
				}
			}
			applyUpdates(node);
		}
	}
	function cleanupNode(node, final) {
		var i, ln;
		var flag = node._flag;
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
		if (final) {
			cleanupSources(node);
		} else if (flag & (8 | 4)) {
			if (flag & 4) {
				cleanupSources(node);
			}
		} else if (flag & 32) {
			cleanupSources(node);
		}
	}
	function cleanupSources(node) {
		var src = node._src;
		if (src !== null) {
			if (src._node1 !== null) {
				cleanupSource(src._node1, src._slot1);
			}
			var sources = src._nodes;
			if (sources !== null) {
				var sourceslots = src._slots;
				for (var i = 0, ln = sources.length; i < ln; i++) {
					cleanupSource(sources.pop(), sourceslots.pop());
				}
			}
		}
		node._traces = null;
	}
	function cleanupSource(source, slot) {
		var src, last, lastslot;
		var log = source._log;
		if (slot === -1) {
			log._node1 = null;
		} else {
			var nodes = log._nodes;
			var nodeslots = log._slots;
			last = nodes.pop();
			lastslot = nodeslots.pop();
			if (slot !== nodes.length) {
				src = last._src;
				nodes[slot] = last;
				nodeslots[slot] = lastslot;
				if (lastslot === -1) {
					src._slot1 = slot;
				} else {
					src._slots[lastslot] = slot;
				}
			}
		}
	}
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
	function applyMutation(node, changeset) {
		var i, ln;
		var array = node._val;
		var type = changeset.type & 255;
		var value = changeset.value;
		if (type & 513) {
			array.splice(changeset.index, 0, value);
		} else if (type & 770) {
			var args = [changeset.index, 0];
			for (i = 0, ln = value.length; i < ln; i++) {
				args[i + 2] = value[i];
			}
			Array.prototype.splice.apply(array, args);
		} else if (type & 1028) {
			if (array.length !== 0) {
				array.length--;
			}
		} else if (type & 520) {
			array[array.length] = value;
		} else if (type & 1040) {
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
						return;
					}
				}
				for (; i < ln; i++) {
					array[i] = array[i + 1];
				}
				array.length--;
			}
		} else if (type & 1312) {
			array.splice(changeset.index, changeset.count);
		} else if (type & 1088) {
			array.shift();
		} else if (type & 640) {
			array.unshift(value);
		}
	}
	function isArray(obj) {
		return Object.prototype.toString.call(obj) === '[object Array]';
	}
	function getInitialValue(object, type) {
		if (type === 'object') {
			if (object === null) {
				return null;
			} else if (isArray(object)) {
				return object.slice();
			} else {
				var result = {};
				for (var key in object) {
					result[key] = object[key];
				}
				return result;
			}
		} else if (type === 'function') {
			return object();
		} else {
			return object;
		}
	}
	function applyEveryMutation(cs, callback, seed) {
		if (seed) {
			if (cs.type & 512) {
				if (cs.type & 256) {
					for (var i = 0, ln = cs.value.length; i < ln; i++) {
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
			if (cs.type & 1024) {
				return void 0;
			} else {
				return false;
			}
		}
	}
	function applyFindMutation(cs, callback, seed, length, index) {
		var type = cs.type;
		if (seed === void 0) {
			if (type & 512) {
				if (type & 256) {
					var count = cs.count;
					for (i = cs.index; count >= 0; count--) {
						item = cs.value[i];
						if (callback(item)) {
							index.value = i;
							return item;
						}
					}
					return seed;
				} else {
					if (callback(cs.value)) {
						if (type & 640) {
							index.value = 0;
						} else if (type & 520) {
							index.value = length - 1;
						} else {
							index.value = cs.index;
						}
						return cs.value;
					}
					return seed;
				}
			} else {
				return seed;
			}
		} else {
			if (type & 520) {
				return seed;
			} else if (type & 1028) {
				if (index.value === length - 1) {
					index.value = -1;
					return void 0;
				} else {
					return seed;
				}
			} else if (type & 1088) {
				if (index.value !== 0) {
					return seed;
				}
			} else if (type & 640) {
				if (callback(cs.value)) {
					index.value = 0;
					return cs.value;
				}
			} else {
				if (cs.index !== void 0 && index < cs.index) {
					return seed;
				}
			}
		}
		return Void;
	}
	window.anod = {
		array: array,
		data: data,
		value: value,
		Flag: Flag,
		bind: bind,
		run: run,
		fn: fn,
		on: on,
		cleanup: cleanup,
		freeze: freeze,
		root: root,
		sample: sample,
		Data: Data,
		Value: Value,
		Computation: Computation,
		Enumerable: Enumerable,
		DataArray: DataArray,
		DataEnumerable: DataEnumerable
	};
})();