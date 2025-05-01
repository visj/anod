/**
 * @enum {number}
 */
var State = {
  Void: 0,
  Disposed: 1,
  MayDispose: 2,
  WillDispose: 4,
  QueueDispose: 8,
  MayUpdate: 16,
  WillUpdate: 32,
  SendOne: 64,
  SendMany: 128,
  Send: /* SendOne | SendMany */ 192,
  ReceiveOne: 256,
  ReceiveMany: 512,
  Receive: /* ReceiveOne | ReceiveMany */ 768,
  Updating: 1024,
  Clearing: 2048,
  Respond: 4096,
  Compare: 8192,
  Scope: 16384,
  Cleanup: 32768,
  Initial: 65536,
  Unstable: 131072,
  Bound: 262144
};
/**
 * @enum {number}
 */
var Stage = {
  Idle: 0,
  Started: 1,
  Disposes: 2,
  Changes: 3,
  Computes: 4,
  Updates: 5
};

/**
 * @final
 * @struct
 * @package
 * @template T
 * @constructor
 */
function Queue() {
  /**
   * @const
   * @package
   * @type {Array<T | null>}
   */
  this._items = [];
  /**
   * @package
   * @type {number}
   */
  this._count = 0;
}

/**
 * @package
 * @param {T} item
 * @returns {void}
 */
Queue.prototype._add = function (item) {
  this._items[this._count++] = item;
};

/**
 *
 * @param {Queue<Dispose>} queue
 * @returns {void}
 */
function drainDispose(queue) {
  var items = queue._items;
  for (var i = 0; i < queue._count; i++) {
    items[i]._dispose();
    items[i] = null;
  }
  queue._count = 0;
}

/**
 *
 * @param {Queue<Respond>} queue
 * @param {number} time
 * @returns {void}
 */
function drainUpdate(queue, time) {
  var items = queue._items;
  for (var i = 0; i < queue._count; i++) {
    var item = items[i];
    if (item._state & State.WillUpdate) {
      item._update(time);
    }
    items[i] = null;
  }
  queue._count = 0;
}

/**
 * @record
 */
function Context() { }

/**
 * @type {boolean}
 */
Context.prototype._idle;

/**
 * @type {Scope | null}
 */
Context.prototype._owner;

/**
 * @type {Receive | null}
 */
Context.prototype._listen;

/**
 * @const
 * @type {Object}
 */
var VOID = {};
/**
 * @type {number}
 */
var TIME = 1;
/**
 * @const
 * @type {Queue<Dispose>}
 */
var DISPOSES = new Queue();
/**
 * @const
 * @type {Queue<Respond>}
 */
var CHANGES = new Queue();
/**
 * @const
 * @type {Queue<Respond>}
 */
var COMPUTES = new Queue();
/**
 * @const
 * @type {Queue<Respond>}
 */
var UPDATES = new Queue();
/**
 * @const
 * @type {Queue<Respond>}
 */
var EFFECTS = new Queue();
/**
 * @nocollapse
 * @type {Context}
 */
var CONTEXT = {
  _idle: true,
  _owner: null,
  _listen: null
};

/**
 * @param {Function} child
 * @param {Function} parent
 * @returns {void}
 */
function extend(child, parent) {
  child.prototype = Object.create(parent.prototype);
  child.prototype.constructor = child;
}

/**
 * 
 * @param {Function} target 
 * @param {Function} source 
 * @returns {void}
 */
function inherit(target, source) {
  for (var proto in source.prototype) {
    target.prototype[proto] = source.prototype[proto];
  }
}

/**
 * @returns {void}
 */
function reset() {
  DISPOSES._count =
    CHANGES._count =
    COMPUTES._count =
    UPDATES._count =
    EFFECTS._count =
    0;
}

/**
 * @param {Send} send
 * @param {Receive} receive
 * @returns {void}
 */
function connect(send, receive) {
  var sendslot = -1;
  var receiveslot =
    receive._source1 === null ? -1 : receive._sources === null ? 0 : receive._sources.length;
  if (send._node1 === null) {
    send._node1 = receive;
    send._node1slot = receiveslot;
    send._state |= State.SendOne;
  } else if (send._nodes === null) {
    sendslot = 0;
    send._nodes = [receive];
    send._nodeslots = [receiveslot];
    send._state |= State.SendMany;
  } else {
    sendslot = send._nodes.length;
    send._nodes[sendslot] = receive;
    send._nodeslots[sendslot] = receiveslot;
    send._state |= State.SendMany;
  }
  if (receive._source1 === null) {
    receive._source1 = send;
    receive._source1slot = sendslot;
    receive._state |= State.ReceiveOne;
  } else if (receive._sources === null) {
    receive._sources = [send];
    receive._sourceslots = [sendslot];
    receive._state |= State.ReceiveMany;
  } else {
    receive._sources[receiveslot] = send;
    receive._sourceslots[receiveslot] = sendslot;
    receive._state |= State.ReceiveMany;
  }
}

/**
 * @returns {void}
 */
function exec() {
  var owner = CONTEXT._owner;
  var listen = CONTEXT._listen;
  CONTEXT._idle = false;
  try {
    start();
  } finally {
    CONTEXT._idle = true;
    CONTEXT._owner = owner;
    CONTEXT._listen = listen;
  }
}

/**
 * @returns {void}
 */
function start() {
  var time = 0;
  var cycle = 0;
  while (
    CHANGES._count !== 0 ||
    COMPUTES._count !== 0 ||
    EFFECTS._count !== 0 ||
    UPDATES._count !== 0 ||
    DISPOSES._count !== 0
  ) {
    time = ++TIME;
    if (DISPOSES._count !== 0) {
      drainDispose(DISPOSES);
    }
    if (CHANGES._count !== 0) {
      drainUpdate(CHANGES, time);
    }
    if (COMPUTES._count !== 0) {
      drainUpdate(COMPUTES, time);
    }
    if (UPDATES._count !== 0) {
      drainUpdate(UPDATES, time);
    }
    if (EFFECTS._count !== 0) {
      drainUpdate(EFFECTS, time);
    }
    if (cycle++ > 1e5) {
      throw new Error("Runaway clock detected");
    }
  }
}

/**
 * @param {Scope} scope
 * @returns {void}
 */
function disposeScope(scope) {
  /** @type {number} */
  var len;
  /** @type {number} */
  var state = scope._state;
  if (state & State.Scope) {
    var children = scope._children;
    for (len = children.length - 1; len >= 0; len--) {
      children[len]._dispose();
    }
    scope._state &= ~State.Scope;
    children.length = 0;
  }
  if (state & State.Cleanup) {
    var cleanups = scope._cleanups;
    for (len = cleanups.length - 1; len >= 0; len--) {
      cleanups[len](true);
    }
    scope._state &= ~State.Cleanup;
    cleanups.length = 0;
  }
}

/**
 * @interface
 */
function Dispose() { }

/**
 * @package
 * @type {number}
 */
Dispose.prototype._state;

/**
 * @package
 * @returns {void}
 */
Dispose.prototype._dispose = function () { };

/**
 * @this {Dispose}
 * @returns {void}
 */
function dispose() {
  if (
    !(this._state & (State.QueueDispose | State.WillDispose | State.Disposed))
  ) {
    if (CONTEXT._idle) {
      this._dispose();
    } else {
      this._state |= State.QueueDispose;
      DISPOSES._add(this);
    }
  }
}

/**
 * @interface
 */
function Scope() { }

/**
 * @package
 * @type {Array<Receive> | null}
 */
Scope.prototype._children;

/**
 * @package
 * @type {Array<function(boolean): void> | null}
 */
Scope.prototype._cleanups;

/**
 * @interface
 * @template T
 */
function Respond() { }

/**
 * @package
 * @returns {void}
 */
Respond.prototype._apply = function () { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Respond.prototype._update = function (time) { };

/**
 * @interface
 * @template T
 */
function SendBase() { }

/**
 * @package
 * @type {(function(T, T): boolean) | null | undefined}
 */
SendBase.prototype._compare;

/**
 * @interface
 * @template T
 * @extends {SendBase<T>}
 */
function SendOne() { }

/**
 * @package
 * @type {Receive | null}
 */
SendOne.prototype._node1;

/**
 * @package
 * @type {number}
 */
SendOne.prototype._node1slot;

/**
 * @interface
 * @template T
 * @extends {SendBase<T>}
 */
function SendMany() { }

/**
 * @package
 * @type {Array<Receive> | null}
 */
SendMany.prototype._nodes;

/**
 * @package
 * @type {Array<number> | null}
 */
SendMany.prototype._nodeslots;

/**
 * @interface
 * @template T
 * @extends {SendOne<T>}
 * @extends {SendMany<T>}
 */
function Send() { }

/**
 * @interface
 * @template T
 */
function ReceiveBase() { }

/**
 * @package
 * @type {Receive | null}
 */
ReceiveBase.prototype._owner;

/**
 * @package
 * @type {(function(...?): T) | null}
 */
ReceiveBase.prototype._next;

/**
 * @package
 * @type {number}
 */
ReceiveBase.prototype._time;

/**
 * @package
 * @type {number}
 */
ReceiveBase.prototype._utime;

/**
 * @package
 * @type {number}
 */
ReceiveBase.prototype._dtime;

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
ReceiveBase.prototype._receiveMayDispose = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
ReceiveBase.prototype._receiveWillDispose = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
ReceiveBase.prototype._receiveMayUpdate = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
ReceiveBase.prototype._receiveWillUpdate = function (time) { };

/**
 * @interface
 * @template T
 * @extends {ReceiveBase<T>}
 */
function ReceiveOne() { }

/**
 * @package
 * @type {Send | null}
 */
ReceiveOne.prototype._source1;

/**
 * @package
 * @type {number}
 */
ReceiveOne.prototype._source1slot;

/**
 * @interface
 * @template T
 * @extends {ReceiveBase<T>}
 */
function ReceiveMany() { }

/**
 * @package
 * @type {Array<Send> | null | undefined}
 */
ReceiveMany.prototype._sources;

/**
 * @package
 * @type {Array<number> | null | undefined}
 */
ReceiveMany.prototype._sourceslots;

/**
 * @interface
 * @template T
 * @extends {ReceiveOne<T>}
 * @extends {ReceiveMany<T>}
 */
function Receive() { }

/**
 * @interface
 * @extends {Dispose}
 * @extends {DisposableSignal}
 */
function IDisposable() { }

/**
 * @struct
 * @abstract
 * @constructor
 * @implements {IDisposable}
 */
function Disposable() { }

/**
 * @package
 * @type {State}
 */
Disposable.prototype._state;

/**
 * @public
 * @returns {void}
 */
Disposable.prototype.dispose = dispose;

/**
 * @package
 * @abstract
 * @returns {void}
 */
Disposable.prototype._dispose = function () { };

/**
 * @interface
 * @template T
 * @extends {IDisposable}
 * @extends {ReadonlySignal<T>}
 */
function IReactive() { }

/**
 * @struct
 * @abstract
 * @constructor
 * @template T
 * @implements {IReactive}
 * @extends {Disposable}
 */
function Reactive() { }

extend(Reactive, Disposable);

/**
 * @package
 * @type {T}
 */
Reactive.prototype._value;

/**
 * @abstract
 * @returns {T}
 */
Reactive.prototype.val = function () { };

/**
 * @public
 * @returns {T}
 */
Reactive.prototype.peek = function () {
  return this._value;
};

/**
 * @interface
 * @extends {Scope}
 * @extends {IDisposable}
 */
function IRoot() { }

/**
 * @struct
 * @constructor
 * @param {function(): *} fn
 * @extends {Disposable}
 * @implements {IRoot}
 */
function Root(fn) {
  /**
   * @package
   * @type {number}
   */
  this._state = State.Void;
  /**
   * @package
   * @type {Array<Receive> | null}
   */
  this._children = [];
  /**
   * @package
   * @type {Array<function(boolean): void> | null}
   */
  this._cleanups = null;
  var owner = CONTEXT._owner;
  var listen = CONTEXT._listen;
  CONTEXT._owner = this;
  CONTEXT._listen = null;
  try {
    fn();
  } finally {
    CONTEXT._owner = owner;
    CONTEXT._listen = listen;
  }
}

extend(Root, Disposable);

/**
 * @package
 * @override
 * @returns {void}
 */
Root.prototype._dispose = function () {
  if (this._state !== State.Disposed) {
    disposeScope(this);
    this._children =
      this._cleanups = null;
    this._state = State.Disposed;
  }
};

/**
 * @param {Send} send
 * @returns {void}
 */
function disposeSender(send) {
  var state = send._state;
  if (state & State.SendOne) {
    removeSender(send._node1, send._node1slot);
    send._node1 = null;
  }
  if (state & State.SendMany) {
    for (var ln = send._nodes.length; ln--;) {
      removeSender(send._nodes[ln], send._nodeslots[ln]);
    }
  }
  send._compare = send._nodes = send._nodeslots = null;
}

/**
 * @param {Send} send
 * @param {number} slot
 * @returns {void}
 */
function removeReceiver(send, slot) {
  if (send._state !== State.Disposed) {
    if (slot === -1) {
      send._node1 = null;
      send._state &= ~State.SendOne;
    } else {
      var nodes = send._nodes;
      var nodeslots = send._nodeslots;
      var last = nodes.pop();
      var lastslot = nodeslots.pop();
      var ln = nodes.length;
      if (slot !== ln) {
        nodes[slot] = last;
        nodeslots[slot] = lastslot;
        if (lastslot === -1) {
          last._source1slot = slot;
        } else {
          last._sourceslots[lastslot] = slot;
        }
      }
      if (ln === 0) {
        send._state &= ~State.SendMany;
      }
    }
  }
}

/**
 * @param {Receive} receive
 * @param {number} slot
 * @returns {void}
 */
function removeSender(receive, slot) {
  if (receive._state !== State.Disposed) {
    if (slot === -1) {
      receive._source1 = null;
      receive._state &= ~State.ReceiveOne;
    } else {
      var sources = receive._sources;
      var sourceslots = receive._sourceslots;
      var last = sources.pop();
      var lastslot = sourceslots.pop();
      var ln = sources.length;
      if (slot !== ln) {
        sources[slot] = last;
        sourceslots[slot] = lastslot;
        if (lastslot === -1) {
          last._node1slot = slot;
        } else {
          last._nodeslots[lastslot] = slot;
        }
      }
      if (ln === 0) {
        receive._state &= ~State.ReceiveMany;
      }
    }
    if (!(receive._state & State.Receive)) {
      receive._detach();
    }
  }
}

/**
 * @param {Scope} owner
 * @param {number} time
 * @returns {void}
 */
function sendMayDispose(owner, time) {
  var children = owner._children;
  var ln = children.length;
  for (var i = 0; i < ln; i++) {
    var node = children[i];
    if (node._time < time && node._dtime < time) {
      node._receiveMayDispose(time);
    }
  }
}

/**
 * @param {Array<Receive>} children
 * @param {number} time
 * @returns {void}
 */
function sendDispose(children, time) {
  var len = children.length;
  for (var i = 0; i < len; i++) {
    var node = children[i];
    if (!(node._state & (State.WillDispose | State.Disposed))) {
      node._receiveWillDispose(time);
    }
  }
}

/**
 * @param {Send} send
 * @param {number} time
 * @returns {void}
 */
function sendMayUpdate(send, time) {
  /** @type {Receive} */
  var node;
  var state = send._state;
  if (state & State.SendOne) {
    node = send._node1;
    if (node._time < time && node._utime < time) {
      node._receiveMayUpdate(time);
    }
  }
  if (state & State.SendMany) {
    var nodes = send._nodes;
    var len = nodes.length;
    for (var i = 0; i < len; i++) {
      node = nodes[i];
      if (node._time < time && node._utime < time) {
        node._receiveMayUpdate(time);
      }
    }
  }
}


/**
 * @param {Send} send
 * @param {number} time
 * @returns {void}
 */
function sendWillUpdate(send, time) {
  /** @type {Receive} */
  var node;
  var state = send._state;
  if (state & State.SendOne) {
    node = send._node1;
    if (node._time < time) {
      node._receiveWillUpdate(time);
    }
  }
  if (state & State.SendMany) {
    var nodes = send._nodes;
    var len = nodes.length;
    for (var i = 0; i < len; i++) {
      node = nodes[i];
      if (node._time < time) {
        node._receiveWillUpdate(time);
      }
    }
  }
}

/**
 * @param {Receive} node
 * @returns {void}
 */
function disposeReceiver(node) {
  var state = node._state;
  if (state & State.ReceiveOne) {
    removeReceiver(node._source1, node._source1slot);
    node._source1 = null;
  }
  if (state & State.ReceiveMany) {
    for (var ln = node._sources.length; ln--;) {
      removeReceiver(node._sources.pop(), node._sourceslots.pop());
    }
  }
  node._state &= ~State.Receive;
}

/**
 * 
 * @param {Receive} node
 * @param {number} time
 * @returns {void}
 */
function refresh(node, time) {
  var state = node._state;
  if (state & State.Updating) {
    throw new Error("Circular dependency");
  }
  if (
    (state & State.WillUpdate) &&
    node._dtime < time
  ) {
    node._update(time);
  } else if (
    (state & (State.MayUpdate | State.MayDispose | State.WillUpdate)) &&
    (node._utime === time || node._dtime === time)
  ) {
    if (state & State.Clearing) {
      throw new Error("Circular clearing dependency");
    }
    clearReceiver(node, time);
  }
}

/**
 *
 * @param {Receive} node
 * @param {number} time
 * @returns {void}
 */
function clearReceiver(node, time) {
  node._state |= State.Clearing;
  if (node._state & State.MayDispose && node._dtime === time) {
    var owner = node._owner;
    if (owner._state & (State.WillUpdate | State.MayUpdate | State.MayDispose)) {
      refresh(owner, time);
    }
    node._state &= ~State.MayDispose;
  }
  clear: if (
    (node._state &
      (State.WillUpdate |
        State.WillDispose |
        State.Disposed |
        State.MayUpdate)) ===
    State.MayUpdate && node._utime === time
  ) {
    /** @type {number} */
    var state;
    /** @type {Receive} */
    var source;
    if (node._state & State.ReceiveOne) {
      source = /** @type {Receive} */ (node._source1);
      state = source._state;
      if (
        state & State.Receive && (
          (state & State.WillUpdate) ||
          (state & State.MayUpdate && source._utime === time)
        )
      ) {
        refresh(source, time);
        if (node._state & (State.WillDispose | State.WillUpdate)) {
          break clear;
        }
      }
    }
    if (node._state & State.ReceiveMany) {
      var sources = node._sources;
      var len = sources.length;
      for (var i = 0; i < len; i++) {
        source = /** @type {Receive} */ (sources[i]);
        state = source._state;
        if (
          state & State.Receive && (
            (state & State.WillUpdate) ||
            (state & State.MayUpdate && source._utime === time)
          )
        ) {
          refresh(source, time);
          if (node._state & (State.WillDispose | State.WillUpdate)) {
            break clear;
          }
        }
      }
    }
  }
  node._state &= ~(State.MayDispose | State.MayUpdate | State.Clearing);
  if (node._state & State.WillUpdate) {
    node._update(time);
  }
}

/**
 * @interface
 * @extends {Scope}
 * @extends {Respond}
 * @extends {Receive<void>}
 * @extends {IDisposable}
 */
function IEffect() { }

/**
 * @struct
 * @constructor
 * @param {function(): void} fn
 * @param {SignalOptions=} opts
 * @param {State=} flags
 * @extends {Disposable}
 * @implements {IEffect}
 */
function Effect(fn, opts, flags) {
  var state = State.WillUpdate | flags;
  if (opts != null) {
    if (opts.unstable) {
      state |= State.Unstable;
    }
  }
  /**
   * @package
   * @type {number}
   */
  this._state = state;
  /**
   * @package
   * @type {Array<Receive> | null}
   */
  this._children = null;
  /**
   * @package
   * @type {Array<function(boolean): void> | null}
   */
  this._cleanups = null;
  /**
   * @package
   * @type {Receive | null}
   */
  this._owner = null;
  /**
   * @package
   * @type {(function(): void) | null}
   */
  this._next = fn;
  /**
   * @package
   * @type {Send | null}
   */
  this._source1 = null;
  /**
   * @package
   * @type {number}
   */
  this._source1slot = 0;
  /**
   * @package
   * @type {Array<Send> | null}
   */
  this._sources = null;
  /**
   * @package
   * @type {Array<number> | null}
   */
  this._sourceslots = null;
  /**
   * @package
   * @type {number}
   */
  this._time = 0;
  /**
   * @package
   * @type {number}
   */
  this._utime = 0;
  /**
   * @package
   * @type {number}
   */
  this._dtime = 0;
  var idle = CONTEXT._idle;
  var owner = CONTEXT._owner;
  var listen = CONTEXT._listen;
  if (owner !== null) {
    owner._state |= State.Scope;
    var children = owner._children;
    if (children === null) {
      owner._children = [this];
    } else {
      children[children.length] = this;
    }
  }
  CONTEXT._owner = CONTEXT._listen = this;
  if (idle) {
    reset();
    CONTEXT._idle = false;
  }
  try {
    this._apply();
    if (idle && (CHANGES._count !== 0 || DISPOSES._count !== 0)) {
      start();
    }
  } finally {
    CONTEXT._idle = idle;
    CONTEXT._owner = owner;
    CONTEXT._listen = listen;
    if (!(this._state & State.Receive)) {
      this._detach();
    }
  }
}

extend(Effect, Disposable);

/**
 * @package
 * @override
 * @returns {void}
 */
Effect.prototype._dispose = function () {
  var state = this._state;
  if (state !== State.Disposed) {
    if (state & (State.Scope | State.Cleanup)) {
      disposeScope(this);
    }
    if (state & State.Receive) {
      disposeReceiver(this);
    }
    this._children =
      this._cleanups =
      this._next =
      this._sources =
      this._sourceslots =
      null;
    this._state = State.Disposed;
  }
};

/**
 * @package
 * @returns {void}
 */
Effect.prototype._detach = function () {
  this._next =
    this._owner =
    this._sources =
    this._sourceslots = null;
};

/**
 * @package
 * @override
 * @param {number} time
 * @returns {void}
 */
Effect.prototype._receiveMayDispose = function (time) {
  this._dtime = time;
  this._state = (this._state | State.MayDispose) & ~State.Clearing;
  if (this._utime < time && this._state & State.Scope) {
    sendMayDispose(this, time);
  }
};

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Effect.prototype._receiveWillDispose = function (time) {
  var utime = this._time;
  this._time = time;
  this._state =
    (this._state | State.WillDispose) &
    ~(State.WillUpdate | State.MayDispose | State.MayUpdate);
  if (utime < time && this._state & State.Scope) {
    sendDispose(this._children, time);
  }
};

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Effect.prototype._receiveMayUpdate = function (time) {
  this._utime = time;
  this._state = (this._state | State.MayUpdate) & ~State.Clearing;
  if (this._dtime < time && this._state & State.Scope) {
    sendMayDispose(this, time);
  }
};

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Effect.prototype._receiveWillUpdate = function (time) {
  this._time = time;
  this._state = (this._state | State.WillUpdate) & ~State.MayUpdate;
  if (this._state & State.Scope) {
    sendDispose(this._children, time);
  }
  EFFECTS._add(this);
};

/**
 * @package
 * @returns {void}
 */
Effect.prototype._apply = function () {
  this._next();
};

/**
 * @package
 * @override
 * @param {number} time
 * @returns {void}
 */
Effect.prototype._update = function (time) {
  var state = this._state;
  var owner = CONTEXT._owner;
  var listen = CONTEXT._listen;
  CONTEXT._owner = CONTEXT._listen = null;
  if (state & (State.Scope | State.Cleanup)) {
    disposeScope(this);
  }
  if (state & State.Unstable) {
    disposeReceiver(this);
    CONTEXT._listen = this;
  }
  this._state =
    (state | State.Updating) &
    ~(State.Clearing | State.MayDispose | State.MayUpdate | State.WillUpdate);
  CONTEXT._owner = this;
  try {
    this._apply();
  } finally {
    this._state &= ~State.Updating;
    CONTEXT._owner = owner;
    CONTEXT._listen = listen;
    if (!(this._state & State.Receive)) {
      this._detach();
    }
  }
};

/**
 * @interface
 * @template T
 * @extends {Send<T>}
 * @extends {Respond}
 * @extends {Receive<T>}
 * @extends {ReadonlySignal<T>}
 */
function ICompute() { }

/**
 * @struct
 * @template T
 * @constructor
 * @param {function(...?): T} fn
 * @param {SignalOptions=} opts
 * @param {State=} flags
 * @extends {Reactive<T>}
 * @implements {ICompute<T>}
 */
function Compute(fn, opts, flags) {
  var state = State.Initial | State.WillUpdate | flags;
  if (opts != null) {
    if (opts.unstable) {
      state |= State.Unstable;
    }
  }
  /**
   * @package
   * @type {number}
   */
  this._state = state;
  /**
   * @package
   * @type {T}
   */
  this._value = void 0;
  /**
   * @package
   * @type {Receive | null}
   */
  this._node1 = null;
  /**
   * @package
   * @type {number}
   */
  this._node1slot = -1;
  /**
   * @package
   * @type {Array<Receive> | null}
   */
  this._nodes = null;
  /**
   * @package
   * @type {Array<number> | null}
   */
  this._nodeslots = null;
  /**
   * @package
   * @type {Receive | null}
   */
  this._owner = null;
  /**
   * @package
   * @type {Send | null}
   */
  this._source1 = null;
  /**
   * @package
   * @type {number}
   */
  this._source1slot = 0;
  /**
   * @package
   * @type {Array<Send> | null}
   */
  this._sources = null;
  /**
   * @package
   * @type {Array<number> | null}
   */
  this._sourceslots = null;
  /**
   * @package
   * @type {number}
   */
  this._time = 0;
  /**
   * @package
   * @type {number}
   */
  this._utime = 0;
  /**
   * @package
   * @type {number}
   */
  this._dtime = 0;
  /**
   * @package
   * @type {(function(T, T): boolean) | null | undefined}
   */
  this._compare = void 0;
  /**
   * @package
   * @type {(function(...?): T) | null}
   */
  this._next = fn;
  var owner = CONTEXT._owner;
  if (owner !== null) {
    owner._state |= State.Scope;
    var children = owner._children;
    if (children === null) {
      owner._children = [this];
    } else {
      children[children.length] = this;
    }
  }
}

extend(Compute, Reactive);

/**
 * @public
 * @override
 * @returns {T}
 */
Compute.prototype.peek = function () {
  var state = this._state;
  if (
    !(state & (State.WillDispose | State.Disposed)) &&
    (state & (State.WillUpdate | State.MayUpdate | State.MayDispose | State.Updating))
  ) {
    refresh(this, TIME);
  }
  return this._value;
};

/**
 * @public
 * @returns {T}
 */
Compute.prototype.val = function () {
  var state = this._state;
  if (!(state & (State.WillDispose | State.Disposed))) {
    if (state & (State.MayDispose | State.MayUpdate | State.WillUpdate | State.Updating)) {
      refresh(this, TIME);
    }
    /** @type {Receive} */
    var listen;
    if (
      !(
        this._state &
        (State.QueueDispose | State.WillDispose | State.Disposed)
      ) &&
      (listen = CONTEXT._listen) !== null
    ) {
      connect(this, listen);
    }
  }
  return this._value;
};

/**
 * @package
 * @override
 * @returns {void}
 */
Compute.prototype._dispose = function () {
  var state = this._state;
  if (state !== State.Disposed) {
    if (state & State.Send) {
      disposeSender(this);
    }
    if (state & State.Receive) {
      disposeReceiver(this);
    }
    this._value =
      this._next =
      this._compare =
      this._sources =
      this._sourceslots = null;
    this._state = State.Disposed;
  }
};

/**
 * @package
 * @returns {void}
 */
Compute.prototype._detach = function () {
  if (this._state & State.Send) {
    disposeSender(this);
  }
  this._next =
    this._compare = null;
};

/**
 * @package
 * @returns {void}
 */
Compute.prototype._apply = function () {
  this._value = this._next();
};

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Compute.prototype._update = function (time) {
  this._time = time;
  var state = this._state;
  var idle = CONTEXT._idle;
  var owner = CONTEXT._owner;
  var listen = CONTEXT._listen;
  CONTEXT._owner = CONTEXT._listen = null;
  this._state =
    (this._state | State.Updating) &
    ~(State.WillUpdate | State.Clearing | State.MayDispose | State.MayUpdate);
  if (state & (State.Initial | State.Unstable)) {
    if (state & State.Initial) {
      this._state &= ~State.Initial;
    } else {
      disposeReceiver(this);
    }
    if (!(state & State.Bound)) {
      CONTEXT._listen = this;
    }
  }
  var prev = this._value;
  if (idle) {
    reset();
    CONTEXT._idle = false;
  }
  try {
    this._apply();
    if (idle && (CHANGES._count !== 0 || DISPOSES._count !== 0)) {
      start();
    }
  } finally {
    this._state &= ~State.Updating;
    CONTEXT._idle = idle;
    CONTEXT._owner = owner;
    CONTEXT._listen = listen;
    if (!(this._state & State.Receive)) {
      this._detach();
    }
  }
  if (state & State.Send && prev !== this._value) {
    sendWillUpdate(this, time);
  }
};

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Compute.prototype._receiveWillDispose = function (time) {
  this._time = time;
  this._state =
    (this._state | State.WillDispose) &
    ~(State.WillUpdate | State.MayDispose | State.MayUpdate);
};

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Compute.prototype._receiveMayDispose = function (time) {
  this._dtime = time;
  this._state = (this._state | State.MayDispose) & ~State.Clearing;
};

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Compute.prototype._receiveMayUpdate = function (time) {
  this._utime = time;
  this._state = (this._state | State.MayUpdate) & ~State.Clearing;
  if (this._state & State.Send) {
    sendMayUpdate(this, time);
  }
};

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Compute.prototype._receiveWillUpdate = function (time) {
  this._time = time;
  this._state =
    (this._state | State.WillUpdate) & ~(State.MayUpdate | State.Clearing);
  if (this._state & State.Send) {
    COMPUTES._add(this);
    if (this._utime < time) {
      sendMayUpdate(this, time);
    }
  }
};

/**
 * @interface
 * @template T
 * @extends {Send}
 * @extends {Respond}
 * @extends {Signal<T>}
 * @extends {IReactive<T>}
 */
function IData() { }

/**
 * @struct
 * @template T
 * @constructor
 * @param {T} val
 * @param {(function(T, T): boolean) | null=} eq
 * @extends {Reactive<T>}
 * @implements {IData<T>}
 */
function Data(val, eq) {
  var state = State.Void;
  if (eq !== void 0) {
    if (eq === null) {
      state |= State.Respond;
    } else {
      state |= State.Compare;
    }
  }
  /**
   * @package
   * @type {number}
   */
  this._state = state;
  /**
   * @package
   * @type {T}
   */
  this._value = val;
  /**
   * @package
   * @type {T | Object}
   */
  this._next = VOID;
  /**
   * @package
   * @type {(function(T, T): boolean) | null | undefined}
   */
  this._compare = eq;
  /**
   * @package
   * @type {Receive | null}
   */
  this._node1 = null;
  /**
   * @package
   * @type {number}
   */
  this._node1slot = -1;
  /**
   * @package
   * @type {Array<Receive> | null}
   */
  this._nodes = null;
  /**
   * @package
   * @type {Array<number> | null}
   */
  this._nodeslots = null;
}

extend(Data, Reactive);

/**
 * @public
 * @returns {T}
 */
Data.prototype.val = function () {
  /** @type {Receive} */
  var listen;
  if (
    !(
      this._state &
      (State.QueueDispose | State.WillDispose | State.Disposed)
    ) &&
    (listen = CONTEXT._listen) !== null
  ) {
    connect(this, listen);
  }
  return this._value;
};

/**
 * @public
 * @param {T} val
 * @returns {void}
 */
Data.prototype.set = function (val) {
  var state = this._state;
  if (!(state & (State.QueueDispose | State.Disposed))) {
    if (
      state & State.Respond ||
      (state & State.Compare
        ? !this._compare(val, this._value)
        : val !== this._value)
    ) {
      if (CONTEXT._idle) {
        this._value = val;
        if (state & State.Send) {
          reset();
          sendWillUpdate(this, TIME + 1);
          exec();
        }
      } else {
        if (this._next !== VOID && val !== this._next) {
          throw new Error("Conflicting values");
        }
        this._next = val;
        this._state |= State.WillUpdate;
        CHANGES._add(this);
      }
    }
  }
};

/**
 * @package
 * @override
 * @returns {void}
 */
Data.prototype._dispose = function () {
  if (this._state !== State.Disposed) {
    disposeSender(this);
    this._value = this._next = null;
    this._state = State.Disposed;
  }
};

/**
 * @package
 * @returns {void}
 */
Data.prototype._apply = function () {
  this._value = this._next;
  this._next = VOID;
  this._state &= ~State.WillUpdate;
};

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Data.prototype._update = function (time) {
  this._apply();
  sendWillUpdate(this, time);
};

/**
 * @template T
 * @param {function(): T} fn
 * @returns {DisposableSignal<T>}
 */
function root(fn) {
  return new Root(fn);
}

/**
 * @template T
 * @param {T} value
 * @returns {Signal<T>}
 */
function data(value) {
  return new Data(value, null);
}

/**
 * @template T
 * @param {T} value
 * @param {function(T, T): boolean=} eq
 * @returns {Signal<T>}
 */
function value(value, eq) {
  return new Data(value, eq);
}

/**
 * @template T
 * @param {function(): T} fn
 * @param {SignalOptions<T>=} opts
 * @returns {ReadonlySignal<T>}
 */
function compute(fn, opts) {
  return new Compute(fn, opts);
}

/**
 * @template T
 * @param {function(): T} fn
 * @param {SignalOptions<T>=} opts
 * @returns {ReadonlySignal<T>}
 */
function $compute(fn, opts) {
  return new Compute(fn, opts, State.Unstable);
}

/**
 * @public
 * @param {function(): void} fn
 * @param {SignalOptions=} opts
 * @returns {DisposableSignal}
 */
function effect(fn, opts) {
  return new Effect(fn, opts);
}

/**
 * @public
 * @param {function(): void} fn
 * @param {SignalOptions=} opts
 * @returns {DisposableSignal}
 */
function $effect(fn, opts) {
  return new Effect(fn, opts, State.Unstable);
}

/**
 * @template T
 * @param {function(): T} fn
 * @returns {T}
 */
function sample(fn) {
  var listen = CONTEXT._listen;
  CONTEXT._listen = null;
  var result = fn();
  CONTEXT._listen = listen;
  return result;
}

/**
 * @param {function(): void} fn
 * @returns {void}
 */
function batch(fn) {
  if (CONTEXT._idle) {
    CONTEXT._idle = false;
    reset();
    fn();
    exec();
  } else {
    fn();
  }
}

/**
 * @param {function(boolean): void} fn
 * @returns {void}
 */
function cleanup(fn) {
  var owner = CONTEXT._owner;
  if (owner !== null) {
    owner._state |= State.Cleanup;
    var cleanups = owner._cleanups;
    if (cleanups === null) {
      owner._cleanups = [fn];
    } else {
      cleanups[cleanups.length] = fn;
    }
  }
}

/**
 * @returns {void}
 */
function stable() {
  var owner = CONTEXT._owner;
  if (owner !== null) {
    owner._state &= ~State.Unstable;
  }
}

window["anod"]["root"] = root;
window["anod"]["data"] = data;
window["anod"]["value"] = value;
window["anod"]["compute"] = compute;
window["anod"]["$compute"] = $compute;
window["anod"]["effect"] = effect;
window["anod"]["$effect"] = $effect;
window["anod"]["batch"] = batch;
window["anod"]["sample"] = sample;
window["anod"]["cleanup"] = cleanup;
window["anod"]["stable"] = stable;
window["anod"]["Root"] = Root;
window["anod"]["Data"] = Data;
window["anod"]["Effect"] = Effect;
window["anod"]["Compute"] = Compute;

export {
  State,
  Stage,
  Scope,
  Send,
  SendOne,
  SendMany,
  Receive,
  ReceiveOne,
  ReceiveMany,
  Respond,
  Context,
  IReactive,
  IRoot,
  IData,
  ICompute,
  IEffect,
  Queue,
  VOID,
  TIME,
  DISPOSES,
  CHANGES,
  COMPUTES,
  UPDATES,
  CONTEXT,
  extend,
  inherit,
  reset,
  connect,
  exec,
  start,
  dispose,
  disposeScope,
  disposeSender,
  removeReceiver,
  removeSender,
  sendWillUpdate,
  sendMayUpdate,
  sendMayDispose,
  sendDispose,
  disposeReceiver,
  Reactive,
  Root,
  Data,
  Compute,
  Effect,
  root,
  data,
  value,
  compute,
  $compute,
  effect,
  $effect,
  batch,
  sample,
  cleanup,
  stable
};