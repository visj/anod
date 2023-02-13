'use strict';

function owner() {
  return OWNER;
}
function listener() {
  return LISTENER;
}
function dispose(val) {
  var node = val;
  if ((node.state & (State.Dispose | State.Disposed)) === 0) {
    if (STAGE === Stage.Idle) {
      node.dispose(TIME);
    } else {
      node.state |= State.Dispose;
      DISPOSES.add(node);
    }
  }
}
function compute(fn, seed, state) {
  return new Computation(fn, seed, state);
}
function effect(fn, seed, state) {
  new Computation(fn, seed, state);
}
function root(fn) {
  var node = new Owner();
  var owner2 = OWNER;
  var listener2 = LISTENER;
  OWNER = node;
  LISTENER = null;
  if (STAGE === Stage.Idle) {
    try {
      node.value = fn();
    } finally {
      OWNER = owner2;
      LISTENER = listener2;
    }
  } else {
    node.value = fn();
    OWNER = owner2;
    LISTENER = listener2;
  }
  return node;
}
function on(src, fn, seed, onchanges) {
  return compute(singleSource(0, src, fn, onchanges), seed);
}
function singleSource(type, src, fn, onchanges) {
  var prev;
  return function(value2) {
    var s = src();
    if (onchanges) {
      onchanges = false;
    } else {
      var running = LISTENER;
      LISTENER = null;
      value2 = fn(s, value2, prev);
      LISTENER = running;
    }
    prev = s;
    return value2;
  };
}
function data(value2) {
  return new Data(value2);
}
function value(value2, eq) {
  return new Value(value2, eq);
}
function freeze(fn) {
  var result;
  if (STAGE === Stage.Idle) {
    reset();
    STAGE = Stage.Started;
    try {
      result = fn();
      event();
    } finally {
      STAGE = Stage.Idle;
    }
  } else {
    result = fn();
  }
  return result;
}
function peek(fn) {
  var listener2 = LISTENER;
  LISTENER = null;
  var result = isFunction(fn) ? fn() : fn.val;
  LISTENER = listener2;
  return result;
}
function cleanup(fn) {
  var owner2 = OWNER;
  if (owner2 !== null) {
    if (owner2.cleanups === null) {
      owner2.cleanups = [fn];
    } else {
      owner2.cleanups.push(fn);
    }
  }
}
var State = /* @__PURE__ */ ((State2) => {
  State2[State2["None"] = 0] = "None";
  State2[State2["Defer"] = 8] = "Defer";
  State2[State2["Static"] = 16] = "Static";
  State2[State2["Update"] = 32] = "Update";
  State2[State2["Dispose"] = 64] = "Dispose";
  State2[State2["Updated"] = 128] = "Updated";
  State2[State2["Disposed"] = 256] = "Disposed";
  State2[State2["Compute"] = 512] = "Compute";
  State2[State2["Send"] = 1024] = "Send";
  return State2;
})(State || {});
var Stage = /* @__PURE__ */ ((Stage2) => {
  Stage2[Stage2["Idle"] = 0] = "Idle";
  Stage2[Stage2["Started"] = 1] = "Started";
  Stage2[Stage2["Disposes"] = 1] = "Disposes";
  Stage2[Stage2["Changes"] = 2] = "Changes";
  Stage2[Stage2["Computes"] = 2] = "Computes";
  Stage2[Stage2["Updates"] = 4] = "Updates";
  return Stage2;
})(Stage || {});
function Send(owner2, state, value2) {
  this.state = 0 /* None */ | state;
  this.value = value2;
  this.node1 = null;
  this.node1slot = -1;
  this.nodes = null;
  this.nodeslots = null;
  if (owner2 !== null) {
    if (owner2.owned === null) {
      owner2.owned = [this];
    } else {
      owner2.owned.push(this);
    }
  }
}
function sendUpdate(node, time) {
  var node1 = node.node1;
  var nodes = node.nodes;
  if (node1 !== null) {
    receiveUpdate(node1, time);
  }
  if (nodes !== null) {
    var ln = nodes.length;
    for (var i = 0; i < ln; i++) {
      receiveUpdate(nodes[i], time);
    }
  }
}
function disposeSender(node) {
  node.state = 256 /* Disposed */;
  node.value = void 0;
  node.node1 = null;
  node.nodes = null;
  node.nodeslots = null;
  cleanupSender(node);
}
function Owner() {
  this.state = 0 /* None */;
  this.value = void 0;
  this.owned = null;
  this.cleanups = null;
}
function disposeOwner(time) {
  this.state = 256 /* Disposed */;
  this.value = void 0;
  var i;
  var ln;
  var owned = this.owned;
  var cleanups = this.cleanups;
  if (owned !== null && (ln = owned.length) !== 0) {
    for (i = 0; i < ln; i++) {
      owned[i].dispose(time);
    }
  }
  this.owned = null;
  if (cleanups !== null && (ln = cleanups.length) !== 0) {
    for (i = 0; i < ln; i++) {
      cleanups[i](true);
    }
  }
  this.cleanups = null;
}
Object.defineProperty(Owner.prototype, "val", { get: function() {
  return this.value;
} });
Owner.prototype.dispose = disposeOwner;
function receiveUpdate(node, time) {
  var ln;
  if (node.age < time) {
    if (node.owned !== null && (ln = node.owned.length) !== 0) {
      for (; ln-- !== 0; ) {
        node.owned.pop().dispose(time);
      }
    }
    node.age = time;
    node.state |= 32 /* Update */;
    EFFECTS.add(node);
    if ((node.state & 1024 /* Send */) !== 0) {
      sendUpdate(node, time);
    }
  }
}
function Receive(owner2, state, value2) {
  Send.call(this, owner2, state, value2);
  this.age = 0;
  this.source1 = null;
  this.source1slot = 0;
  this.sources = null;
  this.sourceslots = null;
}
function Data(value2) {
  Send.call(this, OWNER, 0 /* None */, value2);
  this.pending = NULL;
}
function getData() {
  if ((this.state & (64 /* Dispose */ | 256 /* Disposed */)) === 0) {
    if (LISTENER !== null) {
      logRead(this, LISTENER);
    }
  }
  return this.value;
}
function setData(value2) {
  var state = this.state;
  if ((state & (64 /* Dispose */ | 256 /* Disposed */)) === 0) {
    if (STAGE === 0 /* Idle */) {
      if ((state & 1024 /* Send */) !== 0) {
        reset();
        this.pending = value2;
        this.state |= 32 /* Update */;
        CHANGES.add(this);
        event();
      } else {
        this.value = value2;
      }
    } else {
      if (this.pending === NULL) {
        this.pending = value2;
        this.state |= 32 /* Update */;
        CHANGES.add(this);
      } else if (value2 !== this.pending) {
        throw new Error("conflicting changes: " + value2 + " !== " + this.pending);
      }
    }
  }
  return value2;
}
function updateData() {
  this.value = this.pending;
  this.pending = NULL;
  this.state &= ~32 /* Update */;
  if ((this.state & 1024 /* Send */) !== 0) {
    sendUpdate(this, TIME);
  }
}
function disposeData() {
  disposeSender(this);
  this.pending = void 0;
}
Object.defineProperty(Data.prototype, "val", { get: getData, set: setData });
Data.prototype.update = updateData;
Data.prototype.dispose = disposeData;
function Value(value2, eq) {
  Data.call(this, value2);
  this.eq = eq || Equals;
}
function setValue(value2) {
  if ((this.state & (64 /* Dispose */ | 256 /* Disposed */)) === 0 && !this.eq(this.value, value2)) {
    setData.call(this, value2);
  }
  return value2;
}
Object.defineProperty(Value.prototype, "val", { get: getData, set: setValue });
Value.prototype.update = updateData;
Value.prototype.dispose = function() {
  this.eq = null;
  disposeData.call(this);
};
function Computation(fn, value2, state) {
  var owner2 = OWNER;
  var listener2 = LISTENER;
  Receive.call(this, owner2, state);
  this.fn = fn;
  this.owned = null;
  this.cleanups = null;
  OWNER = LISTENER = this;
  if (STAGE === 0 /* Idle */) {
    reset();
    STAGE = 1 /* Started */;
    try {
      this.value = fn(value2);
      if (CHANGES.count > 0 || DISPOSES.count > 0) {
        start();
      }
    } finally {
      STAGE = 0 /* Idle */;
      OWNER = LISTENER = null;
    }
  } else {
    this.value = fn(value2);
  }
  OWNER = owner2;
  LISTENER = listener2;
}
Object.defineProperty(Computation.prototype, "val", {
  get: function() {
    var state = this.state;
    if ((state & (64 /* Dispose */ | 256 /* Disposed */)) === 0 && STAGE !== 0 /* Idle */) {
      if (this.age === TIME) {
        if ((state & 128 /* Updated */) !== 0) {
          throw new Error("circular dependency");
        }
        this.update();
      }
      if (LISTENER !== null) {
        logRead(this, LISTENER);
      }
    }
    return this.value;
  }
});
Computation.prototype.update = function() {
  if ((this.state & 32 /* Update */) !== 0) {
    var owner2 = OWNER;
    var listener2 = LISTENER;
    OWNER = LISTENER = null;
    if (this.cleanups !== null) {
      var ln = this.cleanups.length;
      for (; ln-- !== 0; ) {
        this.cleanups.pop()(false);
      }
    }
    if ((this.state & 16 /* Static */) === 0) {
      cleanupReceiver(this);
    }
    OWNER = this;
    LISTENER = (this.state & 16 /* Static */) !== 0 ? null : this;
    this.state |= 128 /* Updated */;
    this.value = this.fn(this.value);
    this.state &= ~(32 /* Update */ | 128 /* Updated */);
    OWNER = owner2;
    LISTENER = listener2;
  }
};
Computation.prototype.dispose = function(time) {
  this.fn = null;
  this.age = time;
  disposeOwner.call(this, time);
  disposeSender(this);
  cleanupReceiver(this);
};
function Queue(mode) {
  this.mode = mode;
  this.items = [];
  this.count = 0;
}
Queue.prototype.add = function(item) {
  this.items[this.count++] = item;
};
Queue.prototype.run = function(time) {
  STAGE = this.mode;
  for (var i = 0; i < this.count; ++i) {
    var item = this.items[i];
    if ((item.state & 32 /* Update */) !== 0) {
      item.update();
    } else if ((item.state & 64 /* Dispose */) !== 0) {
      item.dispose(time);
    }
    this.items[i] = null;
  }
  this.count = 0;
};
var NULL = {};
var TIME = 0;
var STAGE = 0 /* Idle */;
var DISPOSES = new Queue(1 /* Disposes */);
var CHANGES = new Queue(2 /* Changes */);
var COMPUTES = new Queue(2 /* Computes */);
var EFFECTS = new Queue(4 /* Updates */);
var OWNER = null;
var LISTENER = null;
function Equals(a, b) {
  return a === b;
}
function isFunction(fn) {
  return typeof fn === "function";
}
function reset() {
  DISPOSES.count = CHANGES.count = COMPUTES.count = EFFECTS.count = 0;
}
function logRead(from, to) {
  from.state |= 1024 /* Send */;
  var fromslot;
  var toslot = to.source1 === null ? -1 : to.sources === null ? 0 : to.sources.length;
  if (from.node1 === null) {
    from.node1 = to;
    from.node1slot = toslot;
    fromslot = -1;
  } else if (from.nodes === null) {
    from.nodes = [to];
    from.nodeslots = [toslot];
    fromslot = 0;
  } else {
    fromslot = from.nodes.length;
    from.nodes.push(to);
    from.nodeslots.push(toslot);
  }
  if (to.source1 === null) {
    to.source1 = from;
    to.source1slot = fromslot;
  } else if (to.sources === null) {
    to.sources = [from];
    to.sourceslots = [fromslot];
  } else {
    to.sources.push(from);
    to.sourceslots.push(fromslot);
  }
}
function event() {
  var owner2 = OWNER;
  try {
    start();
  } finally {
    STAGE = 0 /* Idle */;
    OWNER = owner2;
    LISTENER = null;
  }
}
function start() {
  var time, cycle = 0, disposes = DISPOSES, changes = CHANGES, computes = COMPUTES, effects = EFFECTS;
  do {
    time = ++TIME;
    disposes.run(time);
    changes.run(time);
    computes.run(time);
    effects.run(time);
    if (cycle++ > 1e5) {
      throw new Error("Cycle overflow");
    }
  } while (changes.count > 0 || disposes.count > 0 || computes.count !== 0 || effects.count !== 0);
}
function cleanupReceiver(node) {
  if (node.source1 !== null) {
    forgetReceiver(node.source1, node.source1slot);
    node.source1 = null;
  }
  var sources = node.sources;
  if (sources !== null) {
    var ln = sources.length;
    var sourceslots = node.sourceslots;
    for (; ln-- !== 0; ) {
      forgetReceiver(sources.pop(), sourceslots.pop());
    }
  }
}
function forgetReceiver(source, slot) {
  if ((source.state & (64 /* Dispose */ | 256 /* Disposed */)) === 0) {
    if (slot === -1) {
      source.node1 = null;
    } else {
      var nodes = source.nodes;
      var nodeslots = source.nodeslots;
      var last = nodes.pop();
      var lastslot = nodeslots.pop();
      if (slot !== nodes.length) {
        nodes[slot] = last;
        nodeslots[slot] = lastslot;
        if (lastslot === -1) {
          last.source1slot = slot;
        } else {
          last.sourceslots[lastslot] = slot;
        }
      }
    }
  }
}
function cleanupSender(send) {
  if (send.node1 !== null) {
    forgetSender(send.node1, send.node1slot);
    send.node1 = null;
  }
  var nodes = send.nodes;
  if (nodes !== null) {
    var ln = nodes.length;
    var nodeslots = send.nodeslots;
    for (; ln-- !== 0; ) {
      forgetSender(nodes.pop(), nodeslots.pop());
    }
  }
}
function forgetSender(node, slot) {
  if ((node.state & (64 /* Dispose */ | 256 /* Disposed */)) === 0) {
    if (slot === -1) {
      node.source1 = null;
    } else {
      var sources = node.sources;
      var sourceslots = node.sourceslots;
      var last = sources.pop();
      var lastslot = sourceslots.pop();
      if (slot !== sources.length) {
        sources[slot] = last;
        sourceslots[slot] = lastslot;
        if (lastslot === -1) {
          last.node1slot = slot;
        } else {
          last.nodeslots[lastslot] = slot;
        }
      }
    }
  }
}

exports.Computation = Computation;
exports.Data = Data;
exports.Value = Value;
exports.cleanup = cleanup;
exports.compute = compute;
exports.data = data;
exports.dispose = dispose;
exports.effect = effect;
exports.freeze = freeze;
exports.listener = listener;
exports.on = on;
exports.owner = owner;
exports.peek = peek;
exports.root = root;
exports.value = value;
