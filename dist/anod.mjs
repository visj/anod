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
	Computation.setup(new Computation(null), f, seed, 32 | flags, dispose);
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
function fuse(node, f) {
	var owner = Owner,
		listener = Listener;
	Owner = node;
	Listener = null;
	try {
		f();
	} finally {
		Owner = owner;
		Listener = listener;
	}
}
function root(f) {
	var val,
		node = new Computation(),
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
function IEnumerable(proto) {
	proto.mut = function () {
		return this.cs;
	}
	proto.roots = function () {
		return this.nodes || null;
	}
	proto.every = function (callback) {
		var self = this,
			pure = callback.length === 1;
		return tie(self, function (seed) {
			var i, ilen, j, jlen,
				cs = self.cs,
				items = self.get(),
				len = items.length;
			if (seed === Void) {
				seed = new Array(len);
			} else if (pure && cs !== null) {
				if (self.flag & 4096) {
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
				cs = self.cs,
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
			node.flag |= 8192;
			seed.length = j;
			return seed;
		});
	}
	proto.find = function (callback) {
		var self = this,
			i = -1,
			pure = callback.length === 1;
		return tie(self, function (seed) {
			var item,
				cs = self.cs,
				items = self.get(),
				len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = indexOf(self.flag, cs, callback, i, items.length, false);
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
		return tie(self, function (seed) {
			var i, cs,
				items = self.get(),
				len = items.length;
			if (pure && seed !== Void) {
				cs = self.cs;
				if (cs !== null) {
					i = indexOf(self.flag, cs, callback, index, items.length, false);
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
		return tie(self, function (seed) {
			var cs = self.cs,
				items = self.get(),
				len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = indexOf(self.flag, cs, function (item) {
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
		return tie(self, function (seed) {
			var cs = self.cs,
				items = self.get(),
				len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = indexOf(self.flag, cs, function (item) {
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
		return tie(self, function () {
			return self.get().join(separator);
		}, void 0, 2);
	}
	proto.lastIndexOf = function (searchElement, fromIndex) {
		var self = this,
			i = - 1,
			pure = arguments.length === 1;
		return tie(self, function (seed) {
			var cs;
			var items = self.get();
			if (pure && seed !== Void) {
				cs = self.cs;
				if (cs !== null) {
					i = indexOf(self.flag, cs, function (item) {
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
		node.nodes = nodes;
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
			cs = self.cs;
			if (seed !== Void && cs !== null) {
				if (self.flag & 4096) {
					node.cs = cs = applyMapMutation(callback, items, nodes, len, cs);
					len += changesetLength(cs);
				} else {
					j = cs.length;
					node.cs = new Array(j);
					for (i = 0; i < j; i++) {
						node.cs[i] = cs = applyMapMutation(callback, items, nodes, len, cs[i]);
						len += changesetLength(cs);
					}
				}
			} else {
				node.cs = null;
				if (newlen === 0) {
					if (len !== 0) {
						for (i = 0; i < len; i++) {
							nodes[i].dispose();
						}
						len = 0;
						items.length = 0;
						nodes.length = 0;
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
				seed[i] = nodes[i].val;
			}
			return seed;
		});
	}
	proto.reduce = function (callback, initialValue) {
		var self = this,
			copy = copyValue(initialValue),
			skip = arguments.length === 1;
		return tie(self, function () {
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
		return tie(self, function (seed) {
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
				cs = self.cs,
				items = self.get(),
				len = items.length;
			if (seed === Void) {
				seed = new Array(len);
			} else if (cs !== null) {
				if (self.flag & 4096) {
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
	proto.slice = function (start, end) {
		var self = this,
			node = new Enumerable();
		return Enumerable.setup(node, self, function (seed) {
			var i,
				cs = self.cs,
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
				if (self.flag & 4096) {
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
	proto.some = function (callback) {
		var self = this;
		var index = -1;
		var pure = callback.length === 1;
		return tie(self, function (seed) {
			var i,
				cs = self.cs,
				items = self.get(),
				len = items.length;
			if (pure && seed !== Void && cs !== null) {
				i = indexOf(self.flag, cs, callback, index, items.length, false);
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
	var i, len, flag = this.flag;
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
	Computation.call(this, Log());
	this.cs = null;
	this.pcs = null;
	this.nodes = null;
	this.flag |= flag;
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
var Void = {};
var Root = Clock();
var State = 1;
var Owner = null;
var Listener = null;
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
	var i = 0, j, queue, node;
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
	var i, len, slot, source, sources,
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
		cs = { type: 2817, index: j, value: node.val };
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
			newVals[i] = node.val;
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
		cs = { type: 35456, value: node.val };
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
export {
  array,
  data,
  value,
  Flag,
  fn,
  on,
  run,
  tie,
  cleanup,
  freeze,
  fuse,
  root,
  sample,
  Void,
  Owner,
  Listener,
  Data,
  Value,
  List,
  Computation,
  Enumerable,
}