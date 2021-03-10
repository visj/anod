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

function bind(src, f, seed, flags) {
	var node = Computation.new();
	if (flags & Flag.Dynamic) {
		if (flags & Flag.Wait) {
			logSource(node, src);
		}
		Computation.setup(node, function (seed) {
			logSource(node, src);
			return f(seed);
		}, seed, Flag.Bound | flags);
	} else {
		logSource(node, src);
		Computation.setup(node, f, seed, Flag.Bound | flags);
	}
}

function run(f, seed, flags) {
	Computation.setup(Computation.new(), f, seed, Flag.Unbound | flags);
}

function fn(f, seed, flags) {
	var node = Computation.new();
	seed = Computation.setup(node, f, seed, Flag.Unbound | flags);
	if (node._fn === null) {
		return function () { return seed; }
	} else {
		return function () { return node.get(); }
	}
}

function on(src, f, seed, flags) {
	var node = Computation.new();
	if (flags & Flag.Dynamic) {
		if (flags & Flag.Wait) {
			logSource(node, src);
		}
		seed = Computation.setup(node, function (seed) {
			logSource(node, src);
			return f(seed);
		}, seed, Flag.Bound | flags);
	} else {
		logSource(node, src);
		seed = Computation.setup(node, f, seed, Flag.Bound | flags);
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
	if (this._flag & Flag.Logging) {
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
	if (this._flag & Flag.Logging) {
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
	if (State === System.Idle) {
		finishToplevelExecution(clock);
	}
	return seed;
}

Computation.prototype.get = function () {
	if (Listener !== null) {
		var flag = this._flag;
		if (flag & Flag.Pending) {
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
	var owner = Owner,
		listener = Listener,
		flag = this._flag,
		val = this._val;
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
	this._flag &= ~Flag.Stale;
	this._flag |= Flag.Running;
	this._val = this._fn(val);
	if ((flag & (Flag.Trace | Flag.Logging)) === (Flag.Trace | Flag.Logging)) {
		if (val !== this._val) {
			setComputationsStale(this._log, Root.time);
		}
	}
	this._flag &= ~Flag.Running;
	Owner = owner;
	Listener = listener;
}

Computation.prototype.dispose = function () {
	if (State & (System.Idle | System.Dispose)) {
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
				if (self._flag & Flag.Single) {
					if (seed) {
						if (cs.type & Mod.Insert) {
							if (cs.type & Mod.Range) {
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
						if (cs.type & (Mod.Insert | Mod.Reorder)) {
							return false;
						}
					}
				} else {
					scope: {
						for (i = 0, ilen = cs.length; i < ilen; i++) {
							if (found) {
								if (cs.type & Mod.Insert) {
									if (cs.type & Mod.Range) {
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
								if (cs.type & Mod.Delete) {
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
			node._flag |= Flag.Changed;
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
				if (i !== NoResult) {
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
		}, Void, Flag.Trace);
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
		}, Void, Flag.Trace);
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
		}, Void, Flag.Trace);
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
		}, Void, Flag.Trace);
	}
	proto.join = function (separator) {
		var self = this;
		return on(self, function () {
			return self.get().join(separator);
		}, void 0, Flag.Trace);
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
		}, Void, Flag.Trace);
	}
	proto.map = function (callback) {
		var self = this,
			node = new Enumerable(Flag.Changed),
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
				if (self._flag & Flag.Single) {
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
		}, void 0, Flag.Trace);
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
		}, Void, Flag.Trace);
	}
	proto.reverse = function () {
		var self = this,
			node = new Enumerable(Flag.Changed);
		return Enumerable.setup(node, self, function (seed) {
			var i,
				cs = self._cs,
				items = self.get(),
				len = items.length;
			if (seed === Void) {
				seed = new Array(len);
			} else if (cs !== null) {
				if (self._flag & Flag.Single) {
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
				if (self._flag & Flag.Single) {

				} else {

				}
			}
			node._flag |= Flag.Changed;
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
		}, Void, Flag.Trace);
	}
	proto.sort = function (compareFunction) {
		var self = this,
			node = new Enumerable(Flag.Changed);
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
		if (flag & Flag.Single) {
			applyMutation(this._val, this._cs);
		}
		else {
			for (i = 0, len = this._cs.length; i < len; i++) {
				applyMutation(this._val, this._cs[i]);
			}
		}
	}
	if (flag & Flag.Logging) {
		setComputationsStale(this._log, Root.time);
	}
}

List.prototype.insertAt = function (index, item) {
	logMutate(this, { type: Mutation.InsertAt, index: index, value: item });
}

List.prototype.insertRange = function (index, items) {
	logMutate(this, { type: Mutation.InsertRange, index: index, value: items });
}

List.prototype.pop = function () {
	logMutate(this, { type: Mutation.Pop });
}

List.prototype.push = function (item) {
	logMutate(this, { type: Mutation.Push, value: item });
}

List.prototype.removeAt = function (index) {
	logMutate(this, { type: Mutation.RemoveAt, index: index });
}

List.prototype.removeRange = function (index, count) {
	logMutate(this, { type: Mutation.RemoveRange, index: index, count: count });
}

List.prototype.shift = function () {
	logMutate(this, { type: Mutation.Shift });
}

List.prototype.unshift = function (item) {
	logMutate(this, { type: Mutation.Unshift, value: item });
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
	sealNode(node, owner, fn, setupNode(node, fn, Void, Flag.Bound), 0);
	if (State === System.Idle) {
		finishToplevelExecution(clock);
	}
	return node;
}

Enumerable.prototype.get = function () {
	if (Listener !== null) {
		var flag = this._flag;
		if (flag & Flag.Pending) {
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

Enumerable.prototype.update = function () {
	var flag = this._flag,
		owner = Owner,
		listener = Listener;
	cleanupNode(this, false);
	Owner = this;
	Listener = null;
	this._flag &= ~Flag.Stale;
	this._flag |= Flag.Running;
	this._val = this._fn(this._val);
	if ((flag & (Flag.Trace | Flag.Logging)) === (Flag.Trace | Flag.Logging)) {
		if (flag & Flag.Changed) {
			setComputationsStale(this._log, Root.time);
		}
	}
	this._flag &= ~Flag.Running;
	Owner = owner;
	Listener = listener;
}

Enumerable.prototype.dispose = function () {
	if (State & (System.Idle | System.Dispose)) {
		this._fn = null;
		this._log = null;
		cleanupNode(this, true);
	} else {
		Root.disposes.add(this);
	}
}

/* @exclude */
var System = {
	Idle: 1,
	Compute: 2,
	Change: 4,
	Trace: 8,
	Update: 16,
	Dispose: 32,
};

var Mod = {
	Index: 256,
	Value: 512,
	Range: 1024,
	Insert: 2048,
	Delete: 4096,
	Reorder: 8192,
	Head: 1 << 15,
	Tail: 1 << 16,
};

var Mutation = {
	InsertAt: 1 | Mod.Index | Mod.Value | Mod.Insert,
	InsertRange: 2 | Mod.Index | Mod.Value | Mod.Range | Mod.Insert,
	Pop: 4 | Mod.Delete | Mod.Tail,
	Push: 8 | Mod.Insert | Mod.Value | Mod.Tail,
	RemoveAt: 16 | Mod.Index | Mod.Delete,
	RemoveRange: 32 | Mod.Index | Mod.Range | Mod.Delete,
	Shift: 64 | Mod.Delete | Mod.Head,
	Unshift: 128 | Mod.Insert | Mod.Value | Mod.Head,
	TypeFlag: 255,
};
var NoResult = -2;
/* @exclude */
var Void = {};
var Root = new Clock();
var State = System.Idle;
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
		toplevel = State === System.Idle;
	Owner = node;
	Listener = flags & Flag.Bound ? null : node;
	if (toplevel) {
		clock.changes.reset();
		clock.updates.reset();
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
		if (owner._flag & (Flag.Trace | Flag.Pending)) {
			logPendingOwner(owner);
		}
	}
}

function finishToplevelExecution(clock) {
	if (clock.changes.len > 0 || clock.updates.len > 0) {
		try {
			tick(clock);
		} finally {
			State = System.Idle;
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
		from._flag |= Flag.Logging;
		log = from._log = new Log();
	} else {
		log = from._log;
	}
	if (to._src === null) {
		to._flag |= Flag.Reading;
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
	if (from._flag & (Flag.Trace | Flag.Pending)) {
		if (to._flag & Flag.Pending) {
			if (to._traces === null) {
				to._traces = [toslot];
			} else {
				to._traces.push(toslot);
			}
		} else {
			to._flag |= Flag.Trace;
			logPendingSource(to, toslot);
		}
	}
}

function logWrite(node, val) {
	if (State !== System.Idle) {
		if (node._pval !== Void) {
			if (val !== node._pval) {
				throw new Error('Conflicting changes');
			}
		} else {
			node._pval = val;
			Root.changes.add(node);
		}
	} else {
		if (node._flag & Flag.Logging) {
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
	if (State !== System.Idle) {
		if (node._pval !== Void) {
			throw new Error('Conflicting changes');
		}
		if (node._pcs === null) {
			node._pcs = cs;
			node._flag |= Flag.Single;
			Root.changes.add(node);
		} else {
			if (node._flag & Flag.Single) {
				node._flag &= ~Flag.Single;
				node._pcs = [node._pcs, cs];
			} else {
				node._pcs.push(cs);
			}
		}
	} else {
		node._flag |= Flag.Single;
		if (node._flag & Flag.Logging) {
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
			node._flag |= Flag.Pending;
			logPendingSource(node, -1);
		}
		if (nodes !== null) {
			for (i = 0, len = nodes.length; i < len; i++) {
				node = nodes[i];
				node._flag |= Flag.Pending;
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
		node._flag |= Flag.Pending;
		if (node._owned !== null) {
			logPendingOwner(node);
		}
	}
}

function applyChanges(data) {
	data.update();
}

function applyUpdates(node) {
	if (node._flag & Flag.Stale) {
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
		State = System.Idle;
	}
}

function tick(clock) {
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
			throw new Error('Runaway clock');
		}
	} while (clock.changes.len !== 0 || clock.updates.len !== 0 || clock.disposes.len !== 0);
	State = System.Idle;
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
	node._flag |= Flag.Stale;
	(node._flag & Flag.Trace ? Root.traces : Root.updates).add(node);
	if (node._owned !== null) {
		markComputationsDisposed(node._owned, time);
	}
	if ((node._flag & (Flag.Trace | Flag.Logging)) === Flag.Logging) {
		setComputationsStale(node._log, time);
	}
}

function markComputationsDisposed(nodes, time) {
	var node, i, len;
	for (i = 0, len = nodes.length; i < len; i++) {
		node = nodes[i];
		if (!(node._flag & Flag.Disposed)) {
			node._age = time;
			node._flag = Flag.Disposed;
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
	if (!(node._flag & Flag.Disposed)) {
		if (traces !== null) {
			sources = src._nodes;
			for (i = 0, len = traces.length; i < len; i++) {
				slot = traces[i];
				source = slot === -1 ? src._node1 : sources[slot];
				if (source._flag & (Flag.Trace | Flag.Pending)) {
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
		(flag & (Flag.Static | Flag.Dynamic)) === Flag.Dynamic ||
		(flag & (Flag.Static | Flag.Dynamic | Flag.Unbound)) === Flag.Unbound
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
		type = cs.type & Mutation.TypeFlag;
	if (type & Mutation.InsertAt) {
		array.splice(cs.index, 0, value);
	} else if (type & Mutation.InsertRange) {
		args = [cs.index, 0];
		for (i = 0; i < value.length; i++) {
			args[i + 2] = value[i];
		}
		Array.prototype.splice.apply(array, args);
	} else if (type & Mutation.Pop) {
		if (len > 0) {
			array.length--;
		}
	} else if (type & Mutation.Push) {
		array[len] = value;
	} else if (type & Mutation.RemoveAt) {
		removeAt(array, len, cs.index);
	} else if (type & Mutation.RemoveRange) {
		array.splice(cs.index, cs.count);
	} else if (type & Mutation.Shift) {
		array.shift();
	} else if (type & Mutation.Unshift) {
		array.unshift(value);
	}
}

function applyMapMutation(callback, items, nodes, len, cs) {
	var i, j, len, item, node, value,
		type = cs.type & Mutation.TypeFlag;
	function mapper() {
		return callback(item, j);
	}
	if (type & Mutation.InsertAt) {
		j = cs.index;
		item = cs.value;
		node = root(mapper);
		items.splice(j, 0, item);
		nodes.splice(j, 0, node);
		cs = { type: Mutation.InsertAt, index: j, value: node._val };
	} else if (type & Mutation.InsertRange) {
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
		cs = { type: Mutation.InsertRange, index: cs.index, value: newVals };
	} else if (type & Mutation.RemoveAt) {
		if (len > 0) {
			nodes[removeAt(items, len, cs.index)].dispose();
			removeAt(nodes, len, i);
		}
	} else if (type & Mutation.RemoveRange) {
		for (i = cs.index, len = cs.count; len >= 0; i++, len--) {
			nodes[i].dispose();
		}
		items.splice(cs.index, cs.count);
		nodes.splice(cs.index, cs.count);
	} else if (type & Mutation.Shift) {
		if (len > 0) {
			nodes[0].dispose();
			items.shift();
			nodes.shift();
		}
	} else if (type & Mutation.Unshift) {
		j = 0;
		item = cs.value;
		items.unshift(item);
		nodes.unshift(node = root(mapper));
		cs = { type: Mutation.Unshift, value: node._val };
	}
	return cs;
}

function applyReverseMutation(array, cs) {
	var i,
		len = array.length,
		value = cs.value,
		type = cs.type & Mutation.TypeFlag;
	if (type & Mutation.InsertAt) {
		i = len - 1 - cs.index;
		array.splice(i, 0, value);
		cs = { type: InsertAt, index: i, value: value };
	} else if (type & Mutation.InsertRange) {
		i = len - 1 - cs.index;
		var args = [i, 0];
		for (i = 0, len = value.length; i < len; i++) {
			args[i + 2] = value[i];
		}
		Array.prototype.splice.apply(array, args);
		cs = { type: Mutation.InsertRange, index: i, value: value };
	} else if (type & Mutation.Pop) {
		array.shift();
		cs = { type: Mutation.Shift }
	} else if (type & Mutation.Push) {
		array.unshift(value);
		cs = { type: Mutation.Unshift, value: value };
	} else if (type & Mutation.RemoveAt) {
		i = removeAt(array, len, cs.index)
		cs = { type: RemoveAt, index: i };
	} else if (type & Mutation.RemoveRange) {
		i = len - 1 - cs.index - cs.count;
		array.splice(i, cs.count);
		cs = { type: Mutation.RemoveRange, index: i, count: cs.count };
	} else if (type & Mutation.Shift) {
		if (len > 0) {
			array.length--;
		}
		cs = { type: Mutation.Pop };
	} else if (type & Mutation.Unshift) {
		array[len] = value;
		cs = { type: Mutation.Push, value: value };
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
		if (flag & Flag.Single) {
			type = cs.type;
			if (index === -1) {
				if (type & Mod.Insert) {
					if (type & Mod.Range) {
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
							if (type & Mutation.Unshift) {
								return 0;
							} else if (type & Mutation.Push) {
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
				if (type & Mutation.Push) {
					if (last) {
						if (callback(cs.value)) {
							return length - 1;
						} else {
							return index;
						}
					} else {
						return index;
					}
				} else if (type & Mutation.Pop) {
					if (index === length - 1) {
						return -1;
					} else {
						return index;
					}
				} else if (type & Mutation.Shift) {
					if (index !== 0) {
						return index;
					}
				} else if (type & Mutation.Unshift) {
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
					if (type & Mod.Index) {
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
						if (cs[i].type & Mod.Insert) {
							break scope;
						}
					}
					return index;
				}
			} else {
				scope: {
					for (i = 0, len = cs.length; i < len; i++) {
						type = cs[i].type;
						if (type & Mod.Tail) {
							if (index === items.length - 1) {
								break scope;
							}
						} else if (type & Mod.Index) {
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
	return type & Mod.Reorder ? 0 :
		type & Mod.Range ? (cs.count * (type & Mod.Insert) ? 1 : -1) : 1;
}

module.exports = {
	array, data, value, Flag,
	/* @exclude */
	System, Mod, Mutation,
	/* @exclude */
	bind, run, fn, on,
	cleanup, freeze, root, sample,
	Void, Owner, Listener,
	Data, Value, List,
	Computation, Enumerable,
};
