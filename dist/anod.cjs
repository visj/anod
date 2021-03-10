var Flag = {
	Wait: 1,
	Trace: 2,
	Dynamic: 4,
	Static: 8,
};
function array(val) {
	return new List(val);
}
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
	if (State !== 1) {
		val = f();
	} else {
		Root.changes.reset();
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
function bind(src, f, seed, flags) {
	var node = Computation.new();
	if (flags & 4) {
		if (flags & 1) {
			logSource(node, src);
		}
		Computation.setup(node, function (seed) {
			logSource(node, src);
			return f(seed);
		}, seed, 16 | flags);
	} else {
		logSource(node, src);
		Computation.setup(node, f, seed, 16 | flags);
	}
}
function run(f, seed, flags) {
	Computation.setup(Computation.new(), f, seed, 32 | flags);
}
function fn(f, seed, flags) {
	var node = Computation.new();
	seed = Computation.setup(node, f, seed, 32 | flags);
	if (node._fn === null) {
		return function () { return seed; }
	} else {
		return function () { return node.get(); }
	}
}
function on(src, f, seed, flags) {
	var node = Computation.new();
	if (flags & 4) {
		if (flags & 1) {
			logSource(node, src);
		}
		seed = Computation.setup(node, function (seed) {
			logSource(node, src);
			return f(seed);
		}, seed, 16 | flags);
	} else {
		logSource(node, src);
		seed = Computation.setup(node, f, seed, 16 | flags);
	}
	if (node._fn === null) {
		return function () { return seed; }
	} else {
		return function () { return node.get(); }
	}
}
function root(f) {
	var node = new Computation(),
		owner = Owner,
		listener = Listener;
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
		return node();
	} finally {
		Listener = listener;
	}
}
function Data(val) {
	this._val = val;
	this._log = null;
	this._flag = 0;
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
	if (this._flag & 512) {
		setComputationsStale(this._log, Root.time);
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
	if (this._flag & 512) {
		setComputationsStale(this._log, Root.time);
	}
}
function Computation() {
	this._val = void 0;
	this._log = null;
	this._flag = 0;
	this._fn = null;
	this._age = -1;
	this._src = null;
	this._owner = null;
	this._traces = null;
	this._owned = null;
	this._cleanups = null;
}
Computation.new = function () {
	var node = Recycled;
	if (node === null) {
		return new Computation();
	} else {
		Recycled = null;
		return node;
	}
}
Computation.setup = function (node, f, seed, flags) {
	var clock = Root;
	seed = setupNode(node, f, seed, flags);
	recycleOrClaimNode(node, f, seed, flags);
	if (State === 1) {
		finishToplevelExecution(clock);
	}
	return seed;
}
Computation.prototype.get = function () {
	if (Listener !== null) {
		var flag = this._flag;
		if (flag & 2048) {
			if (State === 8) {
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
	var owner = Owner,
		listener = Listener,
		flag = this._flag,
		val = this._val;
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
	this._flag &= ~64;
	this._flag |= 128;
	this._val = this._fn(val);
	if ((flag & 514) === 514) {
		if (val !== this._val) {
			setComputationsStale(this._log, Root.time);
		}
	}
	this._flag &= ~128;
	Owner = owner;
	Listener = listener;
}
Computation.prototype.dispose = function () {
	if (State & 33) {
		this._fn = null;
		this._log = null;
		cleanupNode(this, true);
	} else {
		Root.disposes.add(this);
	}
}
function IEnumerable(proto) {
	proto.every = function (callback) {
		var self = this,
			pure = callback.length === 1;
		return on(self, function (seed) {
			var i, ilen, j, jlen,
				cs = self._cs,
				items = self.get(),
				len = items.length;
			if (seed === Void) {
				seed = new Array(len);
			} else if (pure && cs !== null) {
				if (self._flag & 4096) {
					if (seed) {
						if (cs.type & 2048) {
							if (cs.type & 1024) {
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
						if (cs.type & 10240) {
							return false;
						}
					}
				} else {
					scope: {
						for (i = 0, ilen = cs.length; i < ilen; i++) {
							if (found) {
								if (cs.type & 2048) {
									if (cs.type & 1024) {
										for (j = 0, jlen = cs.value.length; j < jlen; j++) {
											if (!callback(cs.value[j])) {
												return false;
											}
										}
									} else {
										if (!callback(cs.value)) {
											return false;
										}
									}
								}
							} else {
								if (cs.type & 4096) {
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
	proto.filter = function (callback) {
		var self = this,
			node = new Enumerable(),
			pure = callback.length === 1;
		return Enumerable.setup(node, self, function (seed) {
			var i, j, item,
				cs = self._cs,
				items = self.get(),
				len = items.length;
			if (seed === Void) {
				seed = new Array(len);
			} else if (pure && cs !== null) {
			}
			for (i = 0, j = 0; i < len; i++) {
				item = items[i];
				if (callback(item, i)) {
					seed[j++] = item;
				}
			}
			node._flag |= 8192;
			seed.length = j;
			return seed;
		});
	}
	proto.find = function (callback) {
		var self = this,
			i = -1,
			pure = callback.length === 1;
		return on(self, function (seed) {
			var item,
				cs = self._cs,
				items = self.get(),
				len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = indexOf(self._flag, cs, callback, i, items.length, false);
				if (i !== -2) {
					return items[i];
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
	};
	proto.findIndex = function (callback, index) {
		var self = this,
			index = -1,
			pure = callback.length === 1 && arguments.length === 1;
		return on(self, function (seed) {
			var i, cs,
				items = self.get(),
				len = items.length;
			if (pure && seed !== Void) {
				cs = self._cs;
				if (cs !== null) {
					i = indexOf(self._flag, cs, callback, index, items.length, false);
					if (i !== Void) {
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
	proto.forEach = function (callback) {
		var self = this,
			node = new Enumerable(),
			len = 0,
			items = [],
			nodes = [];
		cleanup(function () {
			for (var i = 0; i < len; i++) {
				nodes[i].dispose();
			}
		});
		Enumerable.setup(node, self, function (seed) {
			var i, j,
				temp, start, end, found,
				newitems = self.get(),
				newlen = newitems.length,
				newstart, newend, mapper = function () {
					return callback(newitems[j], j);
				}
			if (newlen === 0) {
				if (len !== 0) {
					for (i = 0; i < len; i++) {
						nodes[i].dispose();
					}
					len = 0;
					items = [];
					nodes = [];
				}
			} else if (nodes.length === 0) {
				for (j = 0; j < newlen; j++) {
					items[j] = newitems[j];
					nodes[j] = root(mapper);
				}
				len = newlen;
			} else {
				temp = new Array(newlen);
				found = new Array(newlen);
				newstart = 0;
				for (start = 0, end = len > newlen ? len : newlen; start < end && items[start] === newitems[start]; start++, newstart++) { }
				for (end = len - 1, newend = newlen - 1; end >= 0 && newend >= 0 && items[end] === newitems[newend]; end--, newend--) {
					found[newend] = true;
					temp[newend] = nodes[end];
				}
				if (start !== end) {
					outer: for (i = start; i <= end; i++) {
						for (j = newstart; j <= newend; j++) {
							if (items[i] === newitems[j]) {
								found[j] = true;
								temp[j] = nodes[i];
								for (j = newstart; j < newend && found[j]; j++, newstart++) { }
								for (j = newend; j > newstart && found[j]; j--, newend--) { }
								continue outer;
							}
						}
						nodes[i].dispose();
					}
				}
				for (j = start; j < newlen; j++) {
					if (found[j]) {
						nodes[j] = temp[j];
					} else {
						nodes[j] = root(mapper);
					}
				}
			}
			items = newitems.slice();
			len = nodes.length = newlen;
		});
	}
	proto.includes = function (valueToFind, fromIndex) {
		var self = this,
			i = -1,
			pure = arguments.length === 1;
		return on(self, function (seed) {
			var cs = self._cs,
				items = self.get(),
				len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = indexOf(self._flag, cs, function (item) {
					return item === valueToFind;
				}, seed, i, items.length, false);
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
		}, Void, 2);
	}
	proto.indexOf = function (searchElement, fromIndex) {
		var self = this,
			i = -1,
			pure = arguments.length === 1;
		return on(self, function (seed) {
			var cs = self._cs,
				items = self.get(),
				len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = indexOf(self._flag, cs, function (item) {
					return item === searchElement;
				}, i, items.length, false);
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
		}, Void, 2);
	}
	proto.join = function (separator) {
		var self = this;
		return on(self, function () {
			return self.get().join(separator);
		}, void 0, 2);
	}
	proto.lastIndexOf = function (searchElement, fromIndex) {
		var self = this,
			i = - 1,
			pure = arguments.length === 1;
		return on(self, function (seed) {
			var cs;
			var items = self.get();
			if (pure && seed !== Void) {
				cs = self._cs;
				if (cs !== null) {
					i = indexOf(self._flag, cs, function (item) {
						return item === searchElement;
					}, i, items.length, true);
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
		}, Void, 2);
	}
	proto.map = function (callback) {
		var self = this,
			node = new Enumerable(8192),
			len = 0,
			items = [],
			nodes = [];
		cleanup(function () {
			for (var i = 0; i < len; i++) {
				nodes[i].dispose();
			}
		});
		return Enumerable.setup(node, self, function (seed) {
			var i, j, cs,
				temp, start, end, found,
				newitems = self.get(),
				newlen = newitems.length,
				newstart, newend, mapper = function () {
					return callback(newitems[j], j);
				}
			cs = self._cs;
			if (seed !== Void && cs !== null) {
				if (self._flag & 4096) {
					node._cs = cs = applyMapMutation(callback, items, nodes, len, cs);
					len += changesetLength(cs);
				} else {
					j = cs.length;
					node._cs = new Array(j);
					for (i = 0; i < j; i++) {
						node._cs[i] = cs = applyMapMutation(callback, items, nodes, len, cs[i]);
						len += changesetLength(cs);
					}
				}
			} else {
				node._cs = null;
				if (newlen === 0) {
					if (len !== 0) {
						for (i = 0; i < len; i++) {
							nodes[i].dispose();
						}
						len = 0;
						items = [];
						nodes = [];
					}
				} else if (nodes.length === 0) {
					for (j = 0; j < newlen; j++) {
						items[j] = newitems[j];
						nodes[j] = root(mapper);
					}
					len = newlen;
				} else {
					temp = new Array(newlen);
					found = new Array(newlen);
					newstart = 0;
					for (start = 0, end = len > newlen ? len : newlen; start < end && items[start] === newitems[start]; start++, newstart++) { }
					for (end = len - 1, newend = newlen - 1; end >= 0 && newend >= 0 && items[end] === newitems[newend]; end--, newend--) {
						found[newend] = true;
						temp[newend] = nodes[end];
					}
					if (start !== end) {
						outer: for (i = start; i <= end; i++) {
							for (j = newstart; j <= newend; j++) {
								if (items[i] === newitems[j]) {
									found[j] = true;
									temp[j] = nodes[i];
									for (j = newstart; j < newend && found[j]; j++, newstart++) { }
									for (j = newend; j > newstart && found[j]; j--, newend--) { }
									continue outer;
								}
							}
							nodes[i].dispose();
						}
					}
					for (j = start; j < newlen; j++) {
						if (found[j]) {
							nodes[j] = temp[j];
						} else {
							nodes[j] = root(mapper);
						}
					}
				}
				items = newitems.slice();
				len = nodes.length = newlen;
			}
			seed.length = len;
			for (i = 0; i < len; i++) {
				seed[i] = nodes[i]._val;
			}
			return seed;
		});
	}
	proto.reduce = function (callback, initialValue) {
		var self = this,
			copy = copyValue(initialValue),
			skip = arguments.length === 1;
		return on(self, function () {
			var i, len, result;
			var items = self.get();
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
	proto.reduceRight = function (callback, initialValue) {
		var self = this,
			copy = copyValue(initialValue),
			skip = arguments.length === 1;
		return on(self, function (seed) {
			var i, result,
				items = self.get();
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
	proto.reverse = function () {
		var self = this,
			node = new Enumerable(8192);
		return Enumerable.setup(node, self, function (seed) {
			var i,
				cs = self._cs,
				items = self.get(),
				len = items.length;
			if (seed === Void) {
				seed = new Array(len);
			} else if (cs !== null) {
				if (self._flag & 4096) {
					node._cs = applyReverseMutation(seed, cs);
				} else {
					node._cs = new Array(cs.length);
					for (i = 0, len = cs.length; i < len; i++) {
						node._cs[i] = applyReverseMutation(seed, cs[i]);
					}
				}
				return seed;
			}
			node._cs = null;
			seed.length = items.length;
			for (var i = len - 1, j = 0; i >= 0; i--, j++) {
				seed[j] = items[i];
			}
			return seed;
		});
	}
	proto.slice = function (start, end) {
		var self = this,
			node = new Enumerable();
		return Enumerable.setup(node, self, function (seed) {
			var i,
				cs = self._cs,
				items = self.get();
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
				if (self._flag & 4096) {
				} else {
				}
			}
			node._flag |= 8192;
			seed.length = end - start;
			for (i = 0; start < end; i++, start++) {
				seed[i] = items[start];
			}
			return seed;
		});
	}
	proto.some = function (callback) {
		var self = this;
		var index = -1;
		var pure = callback.length === 1;
		return on(self, function (seed) {
			var i,
				cs = self._cs,
				items = self.get(),
				len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = indexOf(self._flag, cs, callback, index, items.length, false);
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
		}, Void, 2);
	}
	proto.sort = function (compareFunction) {
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
function List(val) {
	Data.call(this, val);
	this._cs = null;
	this._pcs = null;
}
IEnumerable(List.prototype);
List.prototype.get = function () {
	if (Listener !== null) {
		logRead(this, Listener);
	}
	return this._val;
}
List.prototype.set = function (next) {
	return logWrite(this, next);
}
List.prototype.update = function () {
	var i, len, flag = this._flag;
	if (this._pval !== Void) {
		this._val = this._pval;
		this._pval = Void;
		this._cs = null;
	} else {
		this._cs = this._pcs;
		this._pcs = null;
		if (flag & 4096) {
			applyMutation(this._val, this._cs);
		}
		else {
			for (i = 0, len = this._cs.length; i < len; i++) {
				applyMutation(this._val, this._cs[i]);
			}
		}
	}
	if (flag & 512) {
		setComputationsStale(this._log, Root.time);
	}
}
List.prototype.insertAt = function (index, item) {
	logMutate(this, { type: 2817, index: index, value: item });
}
List.prototype.insertRange = function (index, items) {
	logMutate(this, { type: 3842, index: index, value: items });
}
List.prototype.pop = function () {
	logMutate(this, { type: 69636 });
}
List.prototype.push = function (item) {
	logMutate(this, { type: 68104, value: item });
}
List.prototype.removeAt = function (index) {
	logMutate(this, { type: 4368, index: index });
}
List.prototype.removeRange = function (index, count) {
	logMutate(this, { type: 5408, index: index, count: count });
}
List.prototype.shift = function () {
	logMutate(this, { type: 36928 });
}
List.prototype.unshift = function (item) {
	logMutate(this, { type: 35456, value: item });
}
function Enumerable(flag) {
	Computation.call(this);
	this._cs = null;
	this._pcs = null;
	this._flag |= flag;
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
		var flag = this._flag;
		if (flag & 2048) {
			if (State === 8) {
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
Enumerable.prototype.update = function () {
	var flag = this._flag,
		owner = Owner,
		listener = Listener;
	cleanupNode(this, false);
	Owner = this;
	Listener = null;
	this._flag &= ~64;
	this._flag |= 128;
	this._val = this._fn(this._val);
	if ((flag & 514) === 514) {
		if (flag & 8192) {
			setComputationsStale(this._log, Root.time);
		}
	}
	this._flag &= ~128;
	Owner = owner;
	Listener = listener;
}
Enumerable.prototype.dispose = function () {
	if (State & 33) {
		this._fn = null;
		this._log = null;
		cleanupNode(this, true);
	} else {
		Root.disposes.add(this);
	}
}
var Void = {};
var Root = new Clock();
var State = 1;
var Owner = null;
var Listener = null;
var Recycled = null;
function Queue() {
	this.len = 0;
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
	for (var i = 0, len = this.len; i < len; i++) {
		fn(items[i]);
		items[i] = null;
	}
	this.len = 0;
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
function setupNode(node, fn, seed, flags) {
	var clock = Root,
		owner = Owner,
		listener = Listener,
		toplevel = State === 1;
	Owner = node;
	Listener = flags & 16 ? null : node;
	if (toplevel) {
		clock.changes.reset();
		clock.updates.reset();
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
function sealNode(node, owner, fn, val, flags) {
	node._fn = fn;
	node._val = val;
	node._flag = flags;
	node._age = Root.time;
	if (owner !== null) {
		if (owner._owned === null) {
			owner._owned = [node];
		} else {
			owner._owned.push(node);
		}
		if (owner._flag & 2050) {
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
function recycleOrClaimNode(node, fn, val, flags) {
	var i, len,
		owner = Owner,
		recycle = node._src === null && (node._owned === null && node._cleanups === null || owner !== null);
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
		sealNode(node, owner, fn, val, flags);
	}
}
function logRead(from, to) {
	var log, src, fromslot, toslot;
	if (from._log === null) {
		from._flag |= 512;
		log = from._log = new Log();
	} else {
		log = from._log;
	}
	if (to._src === null) {
		to._flag |= 1024;
		src = to._src = new Log();
	} else {
		src = to._src;
	}
	toslot = src._node1 === null ? -1 : src._nodes === null ? 0 : src._nodes.length;
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
	if (from._flag & 2050) {
		if (to._flag & 2048) {
			if (to._traces === null) {
				to._traces = [toslot];
			} else {
				to._traces.push(toslot);
			}
		} else {
			to._flag |= 2;
			logPendingSource(to, toslot);
		}
	}
}
function logWrite(node, val) {
	if (State !== 1) {
		if (node._pval !== Void) {
			if (val !== node._pval) {
				throw new Error('Conflicting changes');
			}
		} else {
			node._pval = val;
			Root.changes.add(node);
		}
	} else {
		if (node._flag & 512) {
			node._pval = val;
			Root.changes.add(node);
			execute();
		} else {
			node._val = val;
		}
	}
	return val;
}
function logMutate(node, cs) {
	if (State !== 1) {
		if (node._pval !== Void) {
			throw new Error('Conflicting changes');
		}
		if (node._pcs === null) {
			node._pcs = cs;
			node._flag |= 4096;
			Root.changes.add(node);
		} else {
			if (node._flag & 4096) {
				node._flag &= ~4096;
				node._pcs = [node._pcs, cs];
			} else {
				node._pcs.push(cs);
			}
		}
	} else {
		node._flag |= 4096;
		if (node._flag & 512) {
			node._pcs = cs;
			Root.changes.add(node);
			execute();
		} else {
			node._pcs = cs;
			node.update();
		}
	}
}
function logPendingSource(to, slot) {
	var i, len, log, node, nodes;
	if (to._traces === null) {
		to._traces = [slot];
	} else {
		to._traces.push(slot);
	}
	log = to._log;
	if (log !== null) {
		node = log._node1;
		nodes = log._nodes;
		if (node !== null) {
			node._flag |= 2048;
			logPendingSource(node, -1);
		}
		if (nodes !== null) {
			for (i = 0, len = nodes.length; i < len; i++) {
				node = nodes[i];
				node._flag |= 2048;
				logPendingSource(node, i);
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
	for (var i = 0, len = owned.length; i < len; i++) {
		node = owned[i];
		node._owner = owner;
		node._flag |= 2048;
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
		State = 1;
	}
}
function tick(clock) {
	var i = 0;
	clock.disposes.reset();
	do {
		clock.time++;
		State = 4;
		clock.changes.run(applyChanges);
		State = 8;
		clock.traces.run(applyUpdates);
		State = 16;
		clock.updates.run(applyUpdates);
		State = 32;
		clock.disposes.run(applyDisposes);
		if (i++ > 1e5) {
			throw new Error('Runaway clock');
		}
	} while (clock.changes.len !== 0 || clock.updates.len !== 0 || clock.disposes.len !== 0);
	State = 1;
}
function setComputationsStale(log, time) {
	var node = log._node1,
		nodes = log._nodes;
	if (node !== null) {
		if (node._age < time) {
			setComputationStale(node, time);
		}
	}
	if (nodes !== null) {
		for (var i = 0, len = nodes.length; i < len; i++) {
			node = nodes[i];
			if (node._age < time) {
				setComputationStale(node, time);
			}
		}
	}
}
function setComputationStale(node, time) {
	node._age = time;
	node._flag |= 64;
	(node._flag & 2 ? Root.traces : Root.updates).add(node);
	if (node._owned !== null) {
		markComputationsDisposed(node._owned, time);
	}
	if ((node._flag & 514) === 512) {
		setComputationsStale(node._log, time);
	}
}
function markComputationsDisposed(nodes, time) {
	var node, i, len;
	for (i = 0, len = nodes.length; i < len; i++) {
		node = nodes[i];
		if (!(node._flag & 256)) {
			node._age = time;
			node._flag = 256;
			if (node._owned !== null) {
				markComputationsDisposed(node._owned, time);
			}
		}
	}
}
function applyUpstreamUpdates(node) {
	var i, len, slot, source, sources,
		src = node._src,
		owner = node._owner,
		traces = node._traces;
	if (owner !== null) {
		applyUpstreamUpdates(owner);
	}
	if (!(node._flag & 256)) {
		if (traces !== null) {
			sources = src._nodes;
			for (i = 0, len = traces.length; i < len; i++) {
				slot = traces[i];
				source = slot === -1 ? src._node1 : sources[slot];
				if (source._flag & 2050) {
					applyUpstreamUpdates(source);
				}
				applyUpdates(source);
			}
		}
		applyUpdates(node);
	}
}
function cleanupNode(node, final) {
	var i, len,
		flag = node._flag,
		owned = node._owned,
		cleanups = node._cleanups;
	if (cleanups !== null) {
		for (i = 0, len = cleanups.length; i < len; i++) {
			cleanups[i](final);
		}
	}
	if (owned !== null) {
		for (i = 0, len = owned.length; i < len; i++) {
			owned[i].dispose();
		}
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
	var i, len, sources,
		sourceslots, src = node._src;
	if (src !== null) {
		if (src._node1 !== null) {
			cleanupSource(src._node1, src._slot1);
		}
		sources = src._nodes;
		if (sources !== null) {
			sourceslots = src._slots;
			for (i = 0, len = sources.length; i < len; i++) {
				cleanupSource(sources.pop(), sourceslots.pop());
			}
		}
	}
	node._traces = null;
}
function cleanupSource(source, slot) {
	var src, last, lastslot,
		nodes, nodeslots,
		log = source._log;
	if (slot === -1) {
		log._node1 = null;
	} else {
		nodes = log._nodes;
		nodeslots = log._slots;
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
function applyMutation(array, cs) {
	var i, args,
		len = array.length,
		value = cs.value,
		type = cs.type & 255;
	if (type & 2817) {
		array.splice(cs.index, 0, value);
	} else if (type & 3842) {
		args = [cs.index, 0];
		for (i = 0; i < value.length; i++) {
			args[i + 2] = value[i];
		}
		Array.prototype.splice.apply(array, args);
	} else if (type & 69636) {
		if (len > 0) {
			array.length--;
		}
	} else if (type & 68104) {
		array[len] = value;
	} else if (type & 4368) {
		removeAt(array, len, cs.index);
	} else if (type & 5408) {
		array.splice(cs.index, cs.count);
	} else if (type & 36928) {
		array.shift();
	} else if (type & 35456) {
		array.unshift(value);
	}
}
function applyMapMutation(callback, items, nodes, len, cs) {
	var i, j, len, item, node, value,
		type = cs.type & 255;
	function mapper() {
		return callback(item, j);
	}
	if (type & 2817) {
		j = cs.index;
		item = cs.value;
		node = root(mapper);
		items.splice(j, 0, item);
		nodes.splice(j, 0, node);
		cs = { type: 2817, index: j, value: node._val };
	} else if (type & 3842) {
		value = cs.value;
		len = value.length;
		var itemArgs = [cs.index, 0],
			nodeArgs = [cs.index, 0],
			newVals = new Array(len);
		for (i = 0; i < len; i++) {
			j = cs.index + i;
			itemArgs[i + 2] = item = value[i];
			nodeArgs[i + 2] = node = root(mapper);
			newVals[i] = node._val;
		}
		Array.prototype.splice.apply(items, itemArgs);
		Array.prototype.splice.apply(nodes, nodeArgs);
		cs = { type: 3842, index: cs.index, value: newVals };
	} else if (type & 4368) {
		if (len > 0) {
			nodes[removeAt(items, len, cs.index)].dispose();
			removeAt(nodes, len, i);
		}
	} else if (type & 5408) {
		for (i = cs.index, len = cs.count; len >= 0; i++, len--) {
			nodes[i].dispose();
		}
		items.splice(cs.index, cs.count);
		nodes.splice(cs.index, cs.count);
	} else if (type & 36928) {
		if (len > 0) {
			nodes[0].dispose();
			items.shift();
			nodes.shift();
		}
	} else if (type & 35456) {
		j = 0;
		item = cs.value;
		items.unshift(item);
		nodes.unshift(node = root(mapper));
		cs = { type: 35456, value: node._val };
	}
	return cs;
}
function applyReverseMutation(array, cs) {
	var i,
		len = array.length,
		value = cs.value,
		type = cs.type & 255;
	if (type & 2817) {
		i = len - 1 - cs.index;
		array.splice(i, 0, value);
		cs = { type: InsertAt, index: i, value: value };
	} else if (type & 3842) {
		i = len - 1 - cs.index;
		var args = [i, 0];
		for (i = 0, len = value.length; i < len; i++) {
			args[i + 2] = value[i];
		}
		Array.prototype.splice.apply(array, args);
		cs = { type: 3842, index: i, value: value };
	} else if (type & 69636) {
		array.shift();
		cs = { type: 36928 }
	} else if (type & 68104) {
		array.unshift(value);
		cs = { type: 35456, value: value };
	} else if (type & 4368) {
		i = removeAt(array, len, cs.index)
		cs = { type: RemoveAt, index: i };
	} else if (type & 5408) {
		i = len - 1 - cs.index - cs.count;
		array.splice(i, cs.count);
		cs = { type: 5408, index: i, count: cs.count };
	} else if (type & 36928) {
		if (len > 0) {
			array.length--;
		}
		cs = { type: 69636 };
	} else if (type & 35456) {
		array[len] = value;
		cs = { type: 68104, value: value };
	}
	return cs;
}
function applySlicedMutation(array, cs) {
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
		return function() { return value; }
	} else {
		if (Array.isArray(value)) {
			return function() { return value.slice(); }
		} else {
			return function() {
				var key, result = {};
				for (key in value) {
					result[key] = value[key];
				}
				return result;
			}
		}
	}
}
function indexOf(flag, cs, callback, index, length, last) {
	var type;
	if (cs !== null) {
		if (flag & 4096) {
			type = cs.type;
			if (index === -1) {
				if (type & 2048) {
					if (type & 1024) {
						count = cs.count;
						for (i = cs.index; count >= 0; count--) {
							item = cs.value[i];
							if (callback(item)) {
								return i;
							}
						}
						return -1;
					} else {
						if (callback(cs.value)) {
							if (type & 35456) {
								return 0;
							} else if (type & 68104) {
								return length - 1;
							} else {
								return cs.index;
							}
						}
						return -1;
					}
				} else {
					return index;
				}
			} else {
				if (type & 68104) {
					if (last) {
						if (callback(cs.value)) {
							return length - 1;
						} else {
							return index;
						}
					} else {
						return index;
					}
				} else if (type & 69636) {
					if (index === length - 1) {
						return -1;
					} else {
						return index;
					}
				} else if (type & 36928) {
					if (index !== 0) {
						return index;
					}
				} else if (type & 35456) {
					if (last) {
						return index;
					} else {
						if (callback(cs.value)) {
							return 0;
						} else {
							return index;
						}
					}
				} else {
					if (type & 256) {
						if (last) {
							if (index > cs.index) {
								return index;
							}
						} else {
							if (index < cs.index) {
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
						if (cs[i].type & 2048) {
							break scope;
						}
					}
					return index;
				}
			} else {
				scope: {
					for (i = 0, len = cs.length; i < len; i++) {
						type = cs[i].type;
						if (type & 65536) {
							if (index === items.length - 1) {
								break scope;
							}
						} else if (type & 256) {
							if (index >= cs[i].index) {
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
function changesetLength(cs) {
	var type = cs.type;
	return type & 8192 ? 0 :
		type & 1024 ? (cs.count * (type & 2048) ? 1 : -1) : 1;
}
module.exports = {
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
	Void: Void,
	Owner: Owner,
	Listener: Listener,
	Data: Data,
	Value: Value,
	List: List,
	Computation: Computation,
	Enumerable: Enumerable
};