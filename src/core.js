/**
 * @enum {number}
 */
var State = {
  Void: 0,
  Disposed: 1,
  MayDispose: 2,
  ShallDispose: 4,
  WillDispose: 8,
  MayUpdate: 16,
  WillUpdate: 32,
  Scope: 64,
  SendOne: 128,
  SendMany: 256,
  ReceiveOne: 512,
  ReceiveMany: 1024,
  Updating: 2048,
  Clearing: 4096,
  Respond: 8192,
  Compare: 16384,
  Cleanup: 32768,
  Unstable: 65536,
  Sample: 131072,
  Defer: 262144,
  Source: 524288,
  Initial: 1048576,
  Eager: 2097152,
  Changed: 4194304,
  ManualScope: 8388608
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
 * @enum {number}
 */
var Type = {
  None: 0,
  Responder: 1,
  Value: 2,
  Array: 4,
  Object: 8,
  Function: 16
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
  child.prototype = new parent();
  child.constructor = child;
}

/**
 * @returns {void}
 */
function reset() {
  DISPOSES._count =
    CHANGES._count =
    COMPUTES._count =
    UPDATES._count =
    EFFECTS._count = 0;
}

/**
 * @param {Send} from
 * @param {Receive} to
 * @returns {void}
 */
function addReceiver(from, to) {
  var fromslot = -1;
  var toslot =
    to._source1 === null ? -1 : to._sources === null ? 0 : to._sources.length;
  if (from._node1 === null) {
    from._node1 = to;
    from._node1slot = toslot;
    from._state |= State.SendOne;
  } else if (from._nodes === null) {
    fromslot = 0;
    from._nodes = [to];
    from._nodeslots = [toslot];
    from._state |= State.SendMany;
  } else {
    fromslot = from._nodes.length;
    from._nodes[fromslot] = to;
    from._nodeslots[fromslot] = toslot;
    from._state |= State.SendMany;
  }
  if (to._source1 === null) {
    to._source1 = from;
    to._source1slot = fromslot;
    to._state |= State.ReceiveOne;
  } else if (to._sources === null) {
    to._sources = [from];
    to._sourceslots = [fromslot];
    to._state |= State.ReceiveMany;
  } else {
    to._sources[toslot] = from;
    to._sourceslots[toslot] = fromslot;
    to._state |= State.ReceiveMany;
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
  var cycle = 0;
  for (
    var time = ++TIME;
    CHANGES._count !== 0 ||
    COMPUTES._count !== 0 ||
    EFFECTS._count !== 0 ||
    UPDATES._count !== 0 ||
    DISPOSES._count !== 0;
    time = ++TIME
  ) {
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
  var state = scope._state;
  if (state & State.Scope) {
    var children = scope._children;
    for (len = children.length; len--;) {
      children.pop()._dispose();
    }
    scope._state &= ~State.Scope;
  }
  if (state & State.Cleanup) {
    var cleanups = scope._cleanups;
    for (len = cleanups.length; len--;) {
      cleanups.pop()(true);
    }
    scope._state &= ~State.Cleanup;
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
 */
function Respond() { }

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
function Rebuild() {}

/**
 * @package
 * @type {(function(): T) | null}
 */
Rebuild.prototype._next;

/**
 * @interface
 * @template T
 */
function Send() { }

/**
 * @package
 * @type {Receive | null}
 */
Send.prototype._node1;

/**
 * @package
 * @type {number}
 */
Send.prototype._node1slot;

/**
 * @package
 * @type {Array<Receive> | null}
 */
Send.prototype._nodes;

/**
 * @package
 * @type {Array<number> | null}
 */
Send.prototype._nodeslots;

/**
 * @interface
 */
function Receive() { }

/**
 * @package
 * @type {Receive | null}
 */
Receive.prototype._owner;

/**
 * @package
 * @type {Send | null}
 */
Receive.prototype._source1;

/**
 * @package
 * @type {number}
 */
Receive.prototype._source1slot;

/**
 * @package
 * @type {Array<Send> | null | undefined}
 */
Receive.prototype._sources;

/**
 * @package
 * @type {Array<number> | null | undefined}
 */
Receive.prototype._sourceslots;

/**
 * @package
 * @type {number}
 */
Receive.prototype._time;

/**
 * @package
 * @type {number}
 */
Receive.prototype._utime;

/**
 * @package
 * @type {number}
 */
Receive.prototype._dtime;

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Receive.prototype._receiveMayDispose = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Receive.prototype._receiveShallDispose = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Receive.prototype._receiveMayUpdate = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Receive.prototype._receiveWillUpdate = function (time) { };

/**
 * @interface
 * @extends {Dispose}
 * @extends {RootSignal}
 */
function IDisposer() { }

/**
 * @struct
 * @abstract
 * @constructor
 * @implements {IDisposer}
 */
function Disposer() {
  /**
   * @package
   * @type {number}
   */
  this._state;
}

/**
 * @public
 * @returns {void}
 */
Disposer.prototype.dispose = function () {
  if (
    !(
      this._state &
      (State.WillDispose | State.ShallDispose | State.Disposed)
    )
  ) {
    if (CONTEXT._idle) {
      this._dispose();
    } else {
      this._state |= State.WillDispose;
      DISPOSES._add(this);
    }
  }
};

/**
 * @package
 * @abstract
 * @returns {void}
 */
Disposer.prototype._dispose = function () { };

/**
 * @interface
 * @extends {Scope}
 * @extends {Dispose}
 * @extends {RootSignal}
 */
function IRoot() { }

/**
 * @struct
 * @template T
 * @constructor
 * @param {function(): T} fn
 * @extends {Disposer}
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

extend(Root, Disposer);

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
  var state = receive._state;
  if (state !== State.Disposed) {
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
 * @param {Scope} owner
 * @param {number} time
 * @returns {void}
 */
function sendMayDispose(owner, time) {
  var children = owner._children;
  var len = children.length;
  for (var i = 0; i < len; i++) {
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
    if (!(node._state & (State.ShallDispose | State.Disposed))) {
      node._receiveShallDispose(time);
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
  node._state &= ~(State.ReceiveOne | State.ReceiveMany);
}

/**
 * 
 * @param {Receive} node
 * @param {number} time
 * @returns {void}
 */
function clearReceiver(node, time) {
  if (node._state & (State.Clearing | State.Updating)) {
    throw new Error("Circular dependency");
  }
  node._state |= State.Clearing;
  if (node._state & State.MayDispose && node._dtime === time) {
    clearReceiver(node._owner, time);
    node._state &= ~State.MayDispose;
  }
  clear: if (
    (node._state & (State.SendOne | State.SendMany)) &&
    (node._state &
      (State.WillUpdate |
        State.ShallDispose |
        State.Disposed |
        State.MayUpdate)) === State.MayUpdate
  ) {
    /** @type {Receive} */
    var source;
    if (node._state & State.ReceiveOne) {
      source = /** @type {Receive} */(node._source1);
      if ((source._state & State.MayUpdate) && source._utime === time) {
        clearReceiver(source, time);
        if (node._state & (State.ShallDispose | State.WillUpdate)) {
          break clear;
        }
      }
    }
    if (node._state & State.ReceiveMany) {
      var sources = node._sources;
      var len = sources.length;
      for (var i = 0; i < len; i++) {
        source = /** @type {Receive} */(sources[i]);
        if ((source._state & State.MayUpdate) && source._utime === time) {
          clearReceiver(source, time);
          if (node._state & (State.ShallDispose | State.WillUpdate)) {
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
 * @template T
 * @extends {Send}
 * @extends {Respond}
 * @extends {ReadonlySignal<T>}
 */
function IResponder() { }

/**
 * @struct
 * @abstract
 * @template T
 * @constructor
 * @extends {Disposer}
 * @implements {IResponder<T>}
 */
function Responder() {
  /**
   * @package
   * @type {T}
   */
  this._value;
}

extend(Responder, Disposer);

/**
 * @public
 * @returns {T}
 */
Responder.prototype.val = function () {
  /** @type {Receive} */
  var listen;
  if (
    !(
      this._state &
      (State.WillDispose | State.ShallDispose | State.Disposed)
    ) &&
    (listen = CONTEXT._listen) !== null
  ) {
    addReceiver(this, listen);
  }
  return this._value;
};

/**
 * @public
 * @returns {T}
 */
Responder.prototype.peek = function () {
  return this._value;
};

/**
 * @interface
 * @extends {Scope}
 * @extends {Dispose}
 * @extends {Respond}
 * @extends {Receive}
 * @extends {Rebuild<void>}
 * @extends {RootSignal}
 */
function IEffect() { }

/**
 * @struct
 * @constructor
 * @param {function(): void} fn
 * @param {SignalOptions=} opts
 * @extends {Disposer}
 * @implements {IEffect}
 */
function Effect(fn, opts) {
  var state = State.WillUpdate;
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
   * @type {(function(): void) | null}
   */
  this._next = fn;
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
  if (CONTEXT._idle) {
    reset();
    CONTEXT._idle = false;
    try {
      this._next();
      if (CHANGES._count !== 0 || DISPOSES._count !== 0) {
        start();
      }
    } finally {
      CONTEXT._idle = true;
      CONTEXT._owner =
        CONTEXT._listen = null;
    }
  } else {
    this._next();
    CONTEXT._owner = owner;
    CONTEXT._listen = listen;
  }
}

extend(Effect, Disposer);

/**
 * @package
 * @override
 * @returns {void}
 */
Effect.prototype._dispose = function () {
  if (this._state !== State.Disposed) {
    disposeScope(this);
    disposeReceiver(this);
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
Effect.prototype._receiveShallDispose = function (time) {
  var utime = this._time;
  this._time = time;
  this._state =
    (this._state | State.ShallDispose) &
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
  this._state = (this._state | State.WillUpdate) & ~(State.MayUpdate);
  if (this._state & State.Scope) {
    sendDispose(this._children, time);
  }
  EFFECTS._add(this);
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
  this._state = (state | State.Updating) & ~(
    State.Clearing |
    State.MayDispose |
    State.MayUpdate |
    State.WillUpdate
  );
  CONTEXT._owner = this;
  this._next();
  this._state &= ~State.Updating;
  CONTEXT._owner = owner;
  CONTEXT._listen = listen;
};

/**
 * @interface
 * @template T
 * @extends {Send}
 * @extends {Dispose}
 * @extends {Respond}
 * @extends {Receive}
 * @extends {Rebuild<T>}
 * @extends {ReadonlySignal<T>}
 */
function ICompute() { }

/**
 * @struct
 * @template T
 * @constructor
 * @param {function(): T} fn
 * @param {SignalOptions=} opts
 * @extends {Responder}
 * @implements {ICompute<T>}
 */
function Compute(fn, opts) {
  var state = State.Initial | State.WillUpdate;
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
   * @type {(function(T, T): void) | null | undefined}
   */
  this._compare = void 0;
  /**
   * @package
   * @type {(function(): T) | null}
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

extend(Compute, Responder);


/**
 * @public
 * @override
 * @returns {T}
 */
Compute.prototype.peek = function () {
  var state = this._state;
  if (!(state & (State.ShallDispose | State.Disposed))) {
    if ((state & (State.MayUpdate | State.MayDispose | State.Updating | State.WillUpdate)) === State.WillUpdate) {
      this._update(TIME);
    } else if (state & (State.WillUpdate | State.MayUpdate | State.MayDispose)) {
      clearReceiver(this, TIME);
    }
  }
  return this._value;
};

/**
 * @public
 * @returns {T}
 */
Compute.prototype.val = function () {
  var state = this._state;
  if (!(state & (State.ShallDispose | State.Disposed))) {
    if ((state & (State.MayUpdate | State.MayDispose | State.Updating | State.WillUpdate)) === State.WillUpdate) {
      this._update(TIME);
    } else if (state & (State.WillUpdate | State.MayUpdate | State.MayDispose)) {
      clearReceiver(this, TIME);
    }
    /** @type {Receive} */
    var listen;
    if (
      !(
        this._state &
        (State.WillDispose | State.ShallDispose | State.Disposed)
      ) &&
      (listen = CONTEXT._listen) !== null
    ) {
      addReceiver(this, listen);
    }
  }
  return this._value;
};

/**
 * @package
 * @returns {void}
 */
Compute.prototype._dispose = function () {
  if (this._state !== State.Disposed) {
    disposeSender(this);
    disposeReceiver(this);
    this._value =
      this._next =
      this._sources =
      this._sourceslots =
      null;
    this._state = State.Disposed;
  }
};

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Compute.prototype._update = function (time) {
  this._time = time;
  var state = this._state;
  var owner = CONTEXT._owner;
  var listen = CONTEXT._listen;
  CONTEXT._owner = CONTEXT._listen = null;
  var prev = this._value;
  this._state =
    (this._state | State.Updating) &
    ~(
      State.Clearing |
      State.MayDispose |
      State.MayUpdate
    );
  if (state & (State.Initial | State.Unstable)) {
    if (state & State.Initial) {
      this._state &= ~State.Initial;
    } else {
      disposeReceiver(this);
    }
    CONTEXT._listen = this;
  }
  if (CONTEXT._idle) {
    reset();
    CONTEXT._idle = false;
    try {
      this._value = this._next();
      if (CHANGES._count !== 0 || DISPOSES._count !== 0) {
        start();
      }
    } finally {
      CONTEXT._idle = true;
      CONTEXT._owner =
        CONTEXT._listen = null;
    }
  } else {
    this._value = this._next();
    CONTEXT._owner = owner;
    CONTEXT._listen = listen;
  }
  this._state &= ~(State.WillUpdate | State.Updating);
  if (
    state & (State.SendOne | State.SendMany) &&
    (prev !== this._value || (state & State.Initial))
  ) {
    sendWillUpdate(this, time);
  }
};

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Compute.prototype._receiveShallDispose = function (time) {
  this._time = time;
  this._state = (this._state | State.ShallDispose) & ~(State.WillUpdate | State.MayDispose | State.MayUpdate);
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
  if (this._state & (State.SendOne | State.SendMany)) {
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
  this._state = (this._state | State.WillUpdate) & ~(State.MayUpdate | State.Clearing);
  if (this._state & (State.SendOne | State.SendMany) && this._utime < time) {
    sendMayUpdate(this, time);
  }
};

/**
 * @interface
 * @template T
 * @extends {Send}
 * @extends {Dispose}
 * @extends {Respond}
 * @extends {Signal<T>}
 */
function IData() { }

/**
 * @struct
 * @template T
 * @constructor
 * @param {T} val
 * @param {(function(T,T): boolean) | null=} eq
 * @extends {Responder}
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
   * @type {null | (function(T,T): boolean) | undefined}
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
  /**
   * @package
   * @type {T | Object}
   */
  this._next = VOID;
}

extend(Data, Responder);

/**
 * @public
 * @param {T} val
 * @returns {void}
 */
Data.prototype.update = function (val) {
  var state = this._state;
  if (!(state & (State.WillDispose | State.Disposed))) {
    if (
      state & State.Respond ||
      (state & State.Compare
        ? !this._compare(val, this._value)
        : val !== this._value)
    ) {
      if (CONTEXT._idle) {
        this._value = val;
        if (state & (State.SendOne | State.SendMany)) {
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
 * @param {number} time
 * @returns {void}
 */
Data.prototype._update = function (time) {
  this._value = this._next;
  this._next = VOID;
  this._state &= ~State.WillUpdate;
  sendWillUpdate(this, time);
};

/**
 * @param {function(): void} fn
 * @returns {RootSignal}
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
 * @public
 * @param {function(): void} fn
 * @param {SignalOptions=} opts
 * @returns {RootSignal}
 */
function effect(fn, opts) {
  return new Effect(fn, opts);
}

/**
 * @template T
 * @param {function(): T} fn
 * @returns {T}
 */
function sample(fn) {
  var context = CONTEXT;
  var listen = context._listen;
  context._listen = null;
  var result = fn();
  context._listen = listen;
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
 * @param {Signal} node
 * @returns {void}
 */
function record(node) {
  var listen = CONTEXT._listen;
  if (listen !== null) {
    addReceiver(/** @type {Send} */(node), listen);
  }
}

function stable() {
  var owner = CONTEXT._owner;
  if (owner !== null) {
    owner._state &= ~State.Unstable;
    owner._source = null;
  }
}

window["anod"]["root"] = root;
window["anod"]["data"] = data;
window["anod"]["value"] = value;
window["anod"]["compute"] = compute;
window["anod"]["effect"] = effect;
window["anod"]["batch"] = batch;
window["anod"]["sample"] = sample;
window["anod"]["cleanup"] = cleanup;
window["anod"]["record"] = record;
window["anod"]["stable"] = stable;
window["anod"]["Data"] = Data;
window["anod"]["Compute"] = Compute;

export {
  State,
  Stage,
  Type,
  Scope,
  Send,
  Receive,
  Context,
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
  reset,
  addReceiver,
  exec,
  start,
  disposeScope,
  disposeSender,
  removeReceiver,
  removeSender,
  sendWillUpdate as sendWillUpdate,
  sendMayUpdate,
  sendMayDispose,
  sendDispose,
  disposeReceiver,
  Disposer,
  Root,
  Data,
  Compute,
  Effect,
  root,
  data,
  value,
  compute,
  effect,
  batch,
  sample,
  record,
  cleanup,
  stable,
};
