/**
 * @const
 * @enum {number}
 */
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
	/** @type {Data} */
	var node = new Data(val);
	return /** @type {function(T=): T} */(function (next) {
		return arguments.length > 0 ? node.set(next) : node.get();
	});
}

/**
 * @public
 * @template T
 * @param {T} val
 * @param {function(T,T): boolean=} eq
 * @returns {function(T=): T}
 */
function value(val, eq) {
	/** @type {Value} */
	var node = new Value(val, eq);
	return /** @type {function(T=): T} */(function (next) {
		return arguments.length > 0 ? node.set(next) : node.get();
	});
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
	/** @type {T} */
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

/**
 * @public
 * @template T
 * @param {Array<function(): ?>|(function(): ?)} src
 * @param {function(T): T} f
 * @param {T=} seed
 * @param {number=} flags
 * @returns {void}
 */
function bind(src, f, seed, flags) {
	/** @type {Computation} */
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

/**
 * @template T
 * @param {function(T): T} f
 * @param {T=} seed
 * @param {number=} flags
 * @returns {void}
 */
function run(f, seed, flags) {
	makeComputationNode(getCandidateNode(), f, seed, 32 | flags);
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
	return makeProcedureNode(getCandidateNode(), f, seed, 32 | flags);
}

/**
 * @public
 * @template T
 * @param {Array<function(): *>|function(): *} src
 * @param {function(T): T} f
 * @param {T=} seed
 * @param {number=} flags
 * @returns {function(): T}
 */
function on(src, f, seed, flags) {
	/** @type {Computation} */
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

/**
 * @public
 * @template T
 * @param {function(function(): void=): void} f
 * @returns {T}
 */
function root(f) {
	/** @type {T} */
	var val;
	/** @type {Computation<T>} */
	var node;
	/** @type {boolean} */
	var unending = f.length === 0;
	/** @type {null|function(): void} */
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
	/** @type {Computation} */
	var owner = Owner;
	/** @type {Computation} */
	var listener = Listener;
	Owner = node = unending ? Unowned : getCandidateNode();
	Listener = null;
	try {
		val = unending ? f() : f(/** @type {function(): void} */(disposer));
	} finally {
		Owner = owner;
		Listener = listener;
	}
	if (unending || recycleOrClaimNode(node, null, void 0, 2048)) {
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
	/** @type {Computation} */
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
function Data(val) {
	/**
	 * @type {T}
	 */
	this._val = val;
	/**
	 * @type {number}
	 */
	this._flag = 0;
	/**
	 * @type {Log<Computation>}
	 */
	this._log = null;
	/**
	 * @type {T|Object}
	 */
	this._pval = Void;
}

/**
 * @returns {T}
 */
Data.prototype.get = function () {
	if (Listener !== null) {
		logRead(this, Listener);
	}
	return this._val;
}

/**
 * @param {T} val
 * @returns {T}
 */
Data.prototype.set = function (val) {
	return logWrite(this, val);
}

/**
 * 
 */
Data.prototype.update = function () {
	this._val = this._pval;
	this._pval = Void;
	if (this._log !== null) {
		markComputationsForUpdate(this._log, Root.time);
	}
}

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
 * @returns {void}
 */
Value.prototype.update = function () {
	this._val = this._pval;
	this._pval = Void;
	if (this._log !== null) {
		markComputationsForUpdate(this._log, Root.time);
	}
}

/**
 * @template T
 * @constructor
 */
function Computation() {
	/**
	 * @type {T}
	 */
	this._val = void 0;
	/**
	 * @type {number}
	 */
	this._flag = 0;
	/**
	 * @type {Log<Computation>}
	 */
	this._log = null;
	/**
	 * @type {null|function(T): T}
	 */
	this._fn = null;
	/**
	 * @type {number}
	 */
	this._age = -1;
	/**
	 * @type {Log<Data|Computation>}
	 */
	this._src = null;
	/**
	 * @type {Computation}
	 */
	this._owner = null;
	/**
	 * @type {Array<number>}
	 */
	this._traces = null;
	/**
	 * @type {Array<Computation>}
	 */
	this._owned = null;
	/**
	 * @type {Array<function(boolean): void>}
	 */
	this._cleanups = null;
}

/**
 * @returns {T}
 */
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

/* @module */

/**
 * @interface
 * @template T
 */
function IEnumerable() { }

/**
 * @returns {Array<T>}
 */
IEnumerable.prototype.val = function () { }

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
 * @returns {function(): T} 
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
 * @param {U=} initialValue
 * @returns {function(): U} 
 */
IEnumerable.prototype.reduce = function (callback, initialValue) { }

/**
 * @template U
 * @param {function(U,T,number=): U} callback 
 * @param {U=} initialValue
 * @returns {function(): U} 
 */
IEnumerable.prototype.reduceRight = function (callback, initialValue) { }

/**
 * @returns {IEnumerable<T>}
 */
IEnumerable.prototype.reverse = function () { }

/**
 * 
 * @param {number=} start 
 * @param {number=} end
 * @returns {IEnumerable<T>}
 */
IEnumerable.prototype.slice = function (start, end) { }

/**
 * 
 * @param {function(T,number=): boolean} callback
 * @returns {function(): boolean} 
 */
IEnumerable.prototype.some = function (callback) { }

/**
 * 
 * @param {function(T,T): number=} compareFunction
 * @returns {IEnumerable<T>}
 */
IEnumerable.prototype.sort = function (compareFunction) { }

/* @module */

/**
 * @template T
 * @constructor
 * @implements {IEnumerable<T>}
 * @extends {Computation<Array<T>>}
 */
function Enumerable() {
	/** @type {function(): Array<T>} */
	this.val;
	/** @type {function(): (ChangeSet|Array<ChangeSet>)} */
	this.mut;
}

/**
 * @param {function(T,number=): boolean} callback 
 * @returns {function(): boolean}
 */
Enumerable.prototype.every = function (callback) {
	var self = this;
	/** @const @type {boolean} */
	var pure = callback.length === 1;
	return on(self.val, function (seed) {
		/** @type {number} */
		var i;
		/** @type {number} */
		var ln;
		/** @const @type {Array<?>} */
		var items = self.val();
		if (seed !== void 0 && pure) {
			/** @const @type {ChangeSet|Array<ChangeSet>} */
			var mut = self.mut();
			if (mut !== null) {
				/** @type {boolean|void} */
				var result;
				if (self._flag & 1024) {
					result = applyEveryMutation(/** @type {ChangeSet} */(mut), callback, seed);
					if (result !== void 0) {
						return result;
					}
				} else {
					for (i = 0, ln = /** @type {Array<ChangeSet>} */(mut).length; i < ln; i++) {
						result = applyEveryMutation(/** @type {Array<ChangeSet>} */(mut)[i], callback, seed);
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
	}, /** @type {?} */(void 0), 2);
}

/**
 * 
 * @param {function(T,number=): boolean} callback 
 * @returns {IEnumerable<T>}
 */
Enumerable.prototype.filter = function (callback) {
	/** @const @type {IEnumerable<T>} */
	var self = this;
	/** @const @type {boolean} */
	var pure = callback.length === 1;
	return makeEnumerableNode(new DataEnumerable(), /** @type {?} */(self), function (seed) {
		/** @type {number} */
		var i;
		/** @type {number} */
		var ln;
		/** @type {Array} */
		var items = self.val();
		/** @type {Array} */
		var newItems = [];
		for (i = 0, ln = items.length; i < ln; i++) {
			/** @type {?} */
			var item = items[i];
			if (callback(item, i)) {
				newItems.push(item);
			}
		}
		return newItems;
	});
}

/**
 * 
 * @param {function(T,number=): boolean} callback
 * @returns {function(): T} 
 */
Enumerable.prototype.find = function (callback) {
	/** @type {IEnumerable<T>} */
	var self = this;
	/** @type {number} */
	var index = -1;
	/** @const @type {boolean} */
	var pure = callback.length === 1;
	return on(self.val, function (seed) {
		/** @type {number} */
		var i;
		/** @type {number} */
		var ln;
		/** @type {?} */
		var item;
		/** @type {Array} */
		var items = self.val();
		if (seed !== Void && pure) {
			/** @type {ChangeSet|Array<ChangeSet>} */
			var mut = self.mut();
			if (mut !== null) {
				/** @type {?} */
				var result;
				if (self._flag & 1024) {
					var type = /** @type {ChangeSet} */(mut).type;
					if (seed === void 0) {
						if (type & 32) {
							if (type & 16) {
								var count = /** @type {ChangeSet} */(mut).count;
								for (i = /** @type {ChangeSet} */(mut).index; count >= 0; count--) {
									item = /** @type {ChangeSet} */(mut).value[i];
									if (callback(item)) {
										index = i;
										return item;
									}
								}
								return void 0;
							} else {
								if (callback(/** @type {ChangeSet} */(mut).value)) {
									switch (type & 15) {
										case 40:
											index = 0;
											break;
										case 36:
											index = items.length - 1;
											break;
										case 33:
											index = /** @type {ChangeSet} */(mut).index;
											break;
									}
									return /** @type {ChangeSet} */(mut).value;
								}
								return void 0;
							}
						} else {
							return void 0;
						}
					} else {
						
					}
				} else {

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
	}, /** @type {?} */(Void), 2);
}


/**
 * 
 * @param {function(T,number=): boolean} callback 
 * @param {number=} index 
 * @returns {function(): number}
 */
Enumerable.prototype.findIndex = function (callback, index) {
	/** @const @type {IEnumerable<T>} */
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
	}, /** @type {?} */(void 0), 2);
}

/**
 * 
 * @param {function(T,number=): void} callback 
 * @returns {void}
 */
Enumerable.prototype.forEach = function (callback) {
	/** @const @type {IEnumerable<T>} */
	var self = this;
	makeEnumerableNode(new DataEnumerable(), /** @type {?} */(self), function (seed) {
		var items = self.val();
		for (var i = 0, ln = items.length; i < ln; i++) {
			callback(items[i], i);
		}
	});
}

/**
 * 
 * @param {T} valueToFind 
 * @param {number=} fromIndex
 * @returns {function(): boolean}
 */
Enumerable.prototype.includes = function (valueToFind, fromIndex) {
	/** @const @type {IEnumerable<T>} */
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
	}, /** @type {?} */(void 0), 2);
}

/**
 * 
 * @param {T} searchElement 
 * @param {number=} fromIndex 
 * @returns {function(): number}
 */
Enumerable.prototype.indexOf = function (searchElement, fromIndex) {
	/** @const @type {IEnumerable<T>} */
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
	}, /** @type {?} */(void 0), 2);
}

/**
 * 
 * @param {string=} separator 
 * @returns {function(): string}
 */
Enumerable.prototype.join = function (separator) {
	/** @const @type {IEnumerable<T>} */
	var self = this;
	return on(self.val, function () {
		return self.val().join(separator);
	}, /** @type {?} */(void 0), 2);
}

/**
 * 
 * @param {T} searchElement 
 * @param {number=} fromIndex
 * @returns {function(): number}
 */
Enumerable.prototype.lastIndexOf = function (searchElement, fromIndex) {
	/** @const @type {IEnumerable<T>} */
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
	}, /** @type {?} */(void 0), 2);
}


/**
 * @template U
 * @param {function(T,number=): U} callback
 * @returns {IEnumerable<U>} 
 */
Enumerable.prototype.map = function (callback) {
	/** @const @type {IEnumerable<T>} */
	var self = this;
	/** @type {Array<Computation>} */
	var nodes = [];
	return makeEnumerableNode(new DataEnumerable(), /** @type {?} */(self), function (seed) {
		/** @type {number} */
		var i;
		/** @type {number} */
		var j;
		/** @type {number} */
		var ln;
		/** @type {Computation} */
		var node;
		/** @type {Array} */
		var items = self.val();
		/**
		 * @type {function(): ?}
		 */
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

/**
 * @template U
 * @param {function(U,T,number=): U} callback 
 * @param {U=} initialValue
 * @returns {function(): U} 
 */
Enumerable.prototype.reduce = function (callback, initialValue) {
	/** @const @type {IEnumerable<T>} */
	var self = this;
	/** @const @type {string} */
	var type = typeof initialValue;
	/**
	 * @const
	 * @type {boolean}
	 */
	var skip = arguments.length === 1;
	return on(self.val, function () {
		/** @type {number} */
		var i;
		/** @type {number} */
		var ln;
		/** @type {U} */
		var result;
		/** @type {Array<?>} */
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
	}, /** @type {?} */(void 0), 2);
}

/**
 * @template U
 * @param {function(U,T,number=): U} callback 
 * @param {U=} initialValue
 * @returns {function(): U} 
 */
Enumerable.prototype.reduceRight = function (callback, initialValue) {
	/** @const @type {IEnumerable<T>} */
	var self = this;
	/** @const @type {string} */
	var type = typeof initialValue;
	/** @const @type {boolean} */
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
	}, /** @type {?} */(void 0), 2);
}

/**
 * @returns {IEnumerable<T>}
 */
Enumerable.prototype.reverse = function () {
	/** @const @type {IEnumerable<T>} */
	var self = this;
	return makeEnumerableNode(new DataEnumerable(), /** @type {?} */(self), function () {
		var items = self.val();
		var newItems = [];
		for (var i = items.length - 1, j = 0; i >= 0; i--, j++) {
			newItems[j] = items[i];
		}
		return newItems;
	});
}

/**
 * 
 * @param {number=} start 
 * @param {number=} end
 * @returns {IEnumerable<T>}
 */
Enumerable.prototype.slice = function (start, end) {
	/** @const @type {IEnumerable<T>} */
	var self = this;
	return makeEnumerableNode(new DataEnumerable(), /** @type {?} */(self), function (seed) {
		/** @type {Array} */
		var items = self.val();
		/** @type {Array} */
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

/**
 * 
 * @param {function(T,number=): boolean} callback
 * @returns {function(): boolean} 
 */
Enumerable.prototype.some = function (callback) {
	/** @const @type {IEnumerable<T>} */
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
 * @returns {IEnumerable<T>}
 */
Enumerable.prototype.sort = function (compareFunction) {
	/** @const @type {IEnumerable<T>} */
	var self = this;
	return makeEnumerableNode(new DataEnumerable(), this, function (seed) {
		var items = self.val();
		var newItems = items.slice();
		newItems.sort(compareFunction);
		return newItems;
	});
}

/**
 * @template T
 * @constructor
 * @extends {Data<Array<T>>}
 * @implements {IEnumerable<T>}
 * @param {Array<T>} val
 */
function DataArray(val) {
	var self = /** @type {?} */(this);
	Data.call(self, val);
	/**
	 * @type {function(Array<T>=): Array<T>}
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
	 * @type {ChangeSet|Array<ChangeSet>}
	 */
	this._mut = null;
	/**
	 * @type {ChangeSet|Array<ChangeSet>}
	 */
	this._pmut = null;
}

DataArray.prototype = new Enumerable();
DataArray.constructor = DataArray;

/**
 * @returns {ChangeSet|Array<ChangeSet>}
 */
DataArray.prototype.mut = function () {
	return this._mut;
}

/**
 * @returns {void}
 */
DataArray.prototype.update = function () {
	if (this._pval !== Void) {
		this._val = this._pval;
		this._pval = Void;
		this._mut = null;
	} else {
		if (this._flag & 1024) {
			applyMutation(this, /** @type {ChangeSet} */(this._pmut));
		}
		else {
			for (var i = 0, ln = this._pmut.length; i < ln; i++) {
				applyMutation(this, this._pmut[i]);
			}
		}
		this._mut = this._pmut;
		this._pmut = null;
	}
	if (this._log !== null) {
		markComputationsForUpdate(this._log, Root.time);
	}
}

/**
 * 
 * @param {number} index 
 * @param {T} item 
 * @returns {void}
 */
DataArray.prototype.insertAt = function (index, item) {
	logMutate(this, { type: 33, index: index, value: item });
}

/**
 * 
 * @param {number} index 
 * @param {Array<T>} items 
 * @returns {void}
 */
DataArray.prototype.insertRange = function (index, items) {
	logMutate(this, { type: 50, index: index, value: items });
}

/**
 * @returns {void}
 */
DataArray.prototype.pop = function () {
	logMutate(this, { type: 67 });
}

/**
 * 
 * @param {T} item 
 * @returns {void}
 */
DataArray.prototype.push = function (item) {
	logMutate(this, { type: 36, value: item });
}

/**
 * 
 * @param {number} index 
 * @returns {void}
 */
DataArray.prototype.removeAt = function (index) {
	logMutate(this, { type: 69, index: index });
}

/**
 * 
 * @param {number} index 
 * @param {number} count 
 * @returns {void}
 */
DataArray.prototype.removeRange = function (index, count) {
	logMutate(this, { type: 86, index: index, count: count });
}

/**
 * @returns {void}
 */
DataArray.prototype.shift = function () {
	logMutate(this, { type: 71 });
}

/**
 * 
 * @param {T} item
 * @returns {void}
 */
DataArray.prototype.unshift = function (item) {
	logMutate(this, { type: 40, value: item });
}

/**
 * @template T
 * @constructor
 * @extends {Computation<Array<T>>}
 * @implements {IEnumerable<T>}
 */
function DataEnumerable() {
	var self = this;
	Computation.call(this);
	/**
	 * @type {function(): Array<T>}
	 */
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
	/**
	 * @type {ChangeSet|Array<ChangeSet>}
	 */
	this._mut = null;
	/**
	 * @type {ChangeSet|Array<ChangeSet>}
	 */
	this._pmut = null;
}

DataEnumerable.prototype = new Enumerable();
DataEnumerable.constructor = DataEnumerable;

/**
 * @returns {ChangeSet|Array<ChangeSet>}
 */
DataEnumerable.prototype.mut = function () {
	return this._mut;
}

/**
 * @returns {void}
 */
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

/*
 * Internal implementation
 */

/**
 * @record
 * @template T
 */
function ChangeSet() { }

/**
 * @type {number}
 */
ChangeSet.prototype.type;

/**
 * @type {number|undefined}
 */
ChangeSet.prototype.index;

/**
 * @type {number|undefined}
 */
ChangeSet.prototype.count;

/**
 * @type {T|Array<T>|undefined}
 */
ChangeSet.prototype.value;

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
var State = 0;
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
 * @template T
 * @constructor
 */
function Log() {
	/**
	 * @type {T}
	 */
	this._node1 = null;
	/**
	 * @type {number}
	 */
	this._slot1 = -1;
	/**
	 * @type {Array<T>}
	 */
	this._nodes = null;
	/**
	 * @type {Array<number>}
	 */
	this._slots = null;
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
 * 
 * @param {Computation} node 
 * @param {Array<function(): ?>|(function(): ?)} src 
 */
function bindSource(node, src) {
	/** @type {Computation} */
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
}

/**
 * @template T
 * @param {Computation<T>} node 
 * @param {function(T): T} fn 
 * @param {T} seed 
 * @param {number} flags 
 * @returns {void}
 */
function makeComputationNode(node, fn, seed, flags) {
	var owner = Owner;
	var listener = Listener;
	var toplevel = State === 0;
	Owner = node;
	Listener = flags & 16 ? null : node;
	if (toplevel) {
		Root.changes.reset();
		Root.updates.reset();
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
	recycleOrClaimNode(node, fn, seed, flags);
	if (toplevel) {
		finishToplevelExecution();
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
function makeProcedureNode(node, fn, seed, flags) {
	var owner = Owner;
	var listener = Listener;
	var toplevel = State === 0;
	Owner = node;
	Listener = flags & 16 ? null : node;
	if (toplevel) {
		Root.changes.reset();
		Root.updates.reset();
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
	var recycled = recycleOrClaimNode(node, fn, seed, flags);
	if (toplevel) {
		finishToplevelExecution();
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
 * @param {DataEnumerable<U>} node
 * @param {Computation<T>} source
 * @param {function(Array<U>): U} fn 
 * @param {number=} flags
 * @returns {IEnumerable<U>}
 */
function makeEnumerableNode(node, source, fn, flags) {
	var owner = Owner;
	var listener = Listener;
	var toplevel = State === 0;
	logRead(source, node);
	Owner = node;
	Listener = null;
	if (toplevel) {
		Root.changes.reset();
		Root.updates.reset();
		try {
			State = 1;
			node._val = fn([]);
		} finally {
			State = 0;
			Owner = Listener = null;
		}
	} else {
		node._val = fn([]);
	}
	Owner = owner;
	Listener = listener;
	node._fn = fn;
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
	if (toplevel) {
		finishToplevelExecution();
	}
	return node;
}

function finishToplevelExecution() {
	if (Root.changes.ln > 0 || Root.updates.ln > 0) {
		try {
			tick(Root);
		} finally {
			State = 0;
		}
	}
}

/**
 * @template T
 * @param {Computation<T>} node 
 * @param {null|function(T): T} fn 
 * @param {T} val
 * @param {number} flags
 * @returns {boolean}
 */
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

/**
 * 
 * @param {Data|Computation} from 
 * @param {Computation} to
 */
function logRead(from, to) {
	/** @type {Log<Computation>} */
	var log;
	/** @type {Log<Data|Computation>} */
	var src;
	/** @type {number} */
	var fromslot;
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
	/** @type {number} */
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

/**
 * @template T
 * @param {Data<T>} node
 * @param {T} val
 * @returns {T}
 */
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

/**
 * @template T
 * @param {DataArray<T>} node 
 * @param {ChangeSet<T>} changeset 
 */
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


/**
 * 
 * @param {Computation} to
 * @param {number} slot
 */
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

/**
 * 
 * @param {Computation} owner 
 */
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


/**
 * 
 * @param {Data} data 
 */
function applyChanges(data) {
	data.update();
}

/**
 * 
 * @param {Computation} node 
 */
function applyUpdates(node) {
	if (node._flag & 64) {
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
	/** @type {Computation} */
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

/**
 * 
 * @param {Clock} clock 
 */
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

/**
 * @param {Log<Computation>} log
 * @param {number} time
 */
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

/**
 * 
 * @param {Computation} node 
 * @param {number} time
 */
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

/**
 * 
 * @param {Computation} node 
 */
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


/**
 * @param {Array<Computation>} nodes
 * @param {number} time
 */
function markComputationsDisposed(nodes, time) {
	/** @type {Computation} */
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

/**
 * 
 * @param {Computation} node 
 */
function applyUpstreamUpdates(node) {
	/** @type {number} */
	var slot;
	/** @type {Log<Data|Computation>} */
	var src = node._src;
	/** @type {Computation} */
	var source;
	/** @type {Array<Data|Computation>} */
	var sources;
	/** @type {Computation} */
	var owner = node._owner;
	/** @type {Array<number>} */
	var traces = node._traces;
	if (owner !== null) {
		applyUpstreamUpdates(owner);
	}
	if (!(node._flag & 256)) {
		if (traces !== null) {
			sources = src._nodes;
			for (var i = 0, ln = traces.length; i < ln; i++) {
				slot = traces[i];
				source = /** @type {Computation} */(slot === -1 ? src._node1 : sources[slot]);
				if (source._flag & (2 | 512)) {
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
	/** @type {number} */
	var i;
	/** @type {number} */
	var ln;
	/** @type {number} */
	var flag = node._flag;
	/** @type {Array<Computation>} */
	var owned = node._owned;
	/** @type {Array<function(boolean): void>} */
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

/**
 * 
 * @param {Computation} node 
 */
function cleanupSources(node) {
	/** @type {Log<Data|Computation>} */
	var src = node._src;
	if (src !== null) {
		if (src._node1 !== null) {
			cleanupSource(src._node1, src._slot1);
		}
		/** @type {Array<Data|Computation>} */
		var sources = src._nodes;
		if (sources !== null) {
			/** @type {Array<number>} */
			var sourceslots = src._slots;
			for (var i = 0, ln = sources.length; i < ln; i++) {
				cleanupSource(sources.pop(), sourceslots.pop());
			}
		}
	}
	node._traces = null;
}

/**
 * @param {Data|Computation} source
 * @param {number} slot
 */
function cleanupSource(source, slot) {
	var src;
	/** @type {Log<Computation>} */
	var log = source._log;
	/** @type {Computation} */
	var last;
	/** @type {number} */
	var lastslot;
	if (slot === -1) {
		log._node1 = null;
	} else {
		/** @type {Array<Computation>} */
		var nodes = log._nodes;
		/** @type {Array<number>} */
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
	/** @type {number} */
	var i;
	/** @type {number} */
	var ln;
	/** @type {Array<T>} */
	var array = node._val;
	/** @type {T|Array<T>} */
	var value = changeset.value;
	switch (changeset.type) {
		case 33:
			array.splice(changeset.index, 0, value);
			break;
		case 50:
			var args = [changeset.index, 0];
			for (i = 0, ln = value.length; i < ln; i++) {
				args[i + 2] = value[i];
			}
			Array.prototype.splice.apply(array, args);
			break;
		case 67:
			if (array.length !== 0) {
				array.length--;
			}
			break;
		case 36:
			array[array.length] = value;
			break;
		case 69:
			ln = array.length;
			if (ln > 0) {
				i = /** @type {number} */(changeset.index);
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
		case 86:
			array.splice(changeset.index, changeset.count);
			break;
		case 71:
			array.shift();
			break;
		case 40:
			array.unshift(value);
			break;
	}
}

/**
 * 
 * @param {Object} object
 * @param  {string} type
 * @returns {Object}
 */
function getInitialValue(object, type) {
	if (type === 'object') {
		if (object === null) {
			return null;
		} else if (object instanceof Array) {
			return object.slice();
		} else {
			/** @type {Object} */
			var result = {};
			for (var key in object) {
				result[key] = object[key];
			}
			return result;
		}
	} else if (type === 'function') {
		return /** @type {Function} */(object)();
	} else {
		return object;
	}
}

/**
 * @template T
 * @param {ChangeSet<T>} cs 
 * @param {function(T,number=): boolean} callback
 * @param {boolean} seed 
 * @returns {boolean|void}
 */
function applyEveryMutation(cs, callback, seed) {
	if (seed) {
		if (cs.type & 32) {
			if (cs.type & 16) {
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
		if (cs.type & 64) {
			return void 0;
		} else {
			return false;
		}
	}
}

export {
  array,
  data,
  value,
  Flag,
  cleanup,
  freeze,
  bind,
  run,
  fn,
  on,
  root,
  sample,
  Data,
  Value,
  Computation,
  Enumerable,
  DataArray,
  DataEnumerable,
}
