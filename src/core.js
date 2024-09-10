/**
 * @enum {number}
 */
var State = {
  Void: 0,
  WillDispose: 1,
  WillUpdate: 2,
  Disposed: 4,
  MayUpdate: 8,
  MayDispose: 16,
  ScheduledDispose: 32,
  Scope: 64,
  SendOne: 128,
  SendMany: 256,
  ReceiveOne: 512,
  ReceiveMany: 1024,
  Updating: 2048,
  MayCleared: 4096,
  Respond: 8192,
  Compare: 16384,
  Cleanup: 32768,
  Unstable: 65536,
  Sample: 131072,
  Defer: 262144,
  Source: 524288,
  Initial: 1048576,
  Lazy: 2097152,
  Changed: 4194304
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
  Reactive: 1,
  Value: 2,
  Array: 4,
  Object: 8,
  Function: 16
};

/**
 * @enum {number}
 */
var ErrorCode = {
  Circular: 1,
  Conflict: 2
};

/**
 * @interface
 */
function Unit() {}

/**
 * @package
 * @type {number}
 */
Unit.prototype._state;

/**
 * @package
 * @returns {void}
 */
Receive.prototype._clearMayUpdate = function () {};

/**
 * @interface
 * @extends {Unit}
 */
function Scope() {}

/**
 * @package
 * @type {Array<Module> | null}
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
 * @extends {Unit}
 */
function Send() {}

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
 * @extends {Unit}
 */
function Receive() {}

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
 * @returns {void}
 */
Receive.prototype._recordMayUpdate = function () {};

/**
 * @package
 * @returns {void}
 */
Receive.prototype._recordWillUpdate = function () {};

/**
 * @package
 * @returns {void}
 */
Receive.prototype._recordMayDispose = function () {};

/**
 * @record
 */
function Context() {}

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
 * @interface
 * @template T
 * @extends {Send}
 * @extends {Scope}
 * @extends {Receive}
 * @extends {Signal<T>}
 */
function ModuleInterface() {}

/**
 * @struct
 * @abstract
 * @template T
 * @constructor
 * @implements {ModuleInterface<T>}
 */
function Module() {}

/**
 * @package
 * @type {number}
 */
Module.prototype._state;

/**
 * @package
 * @type {Scope}
 */
Module.prototype._owner;

/**
 * @package
 * @type {Array<Module> | null}
 */
Module.prototype._children;

/**
 * @package
 * @type {Array<function(boolean): void> | null}
 */
Module.prototype._cleanups;

/**
 * @package
 * @type {Receive | null}
 */
Module.prototype._node1;

/**
 * @package
 * @type {number}
 */
Module.prototype._node1slot;

/**
 * @package
 * @type {Array<Receive> | null}
 */
Module.prototype._nodes;

/**
 * @package
 * @type {Array<number> | null}
 */
Module.prototype._nodeslots;
/**
 * @package
 * @type {T}
 */
Module.prototype._value;

/**
 * @package
 * @type {Send | null}
 */
Module.prototype._source1;

/**
 * @package
 * @type {number}
 */
Module.prototype._source1slot;

/**
 * @package
 * @type {Array<Send> | null | undefined}
 */
Module.prototype._sources;

/**
 * @package
 * @type {Array<number> | null | undefined}
 */
Module.prototype._sourceslots;

/**
 * @package
 * @type {*}
 */
Module.prototype._next;

/**
 * @returns {T}
 */
Module.prototype.val = function () {};

/**
 * @returns {T}
 */
Module.prototype.peek = function () {};

/**
 * @returns {void}
 */
Module.prototype.dispose = function () {};

/**
 * @param {T} val
 * @returns {void}
 */
Module.prototype.update = function (val) {};

/**
 * @package
 * @returns {void}
 */
Module.prototype._update = function () {};

/**
 * @package
 * @returns {void}
 */
Module.prototype._dispose = function () {};

/**
 * @package
 * @returns {void}
 */
Module.prototype._recordDispose = function () {};

/**
 * @package
 * @returns {void}
 */
Module.prototype._recordMayUpdate = function () {};

/**
 * @package
 * @returns {void}
 */
Module.prototype._recordWillUpdate = function () {};

/**
 * @package
 * @returns {void}
 */
Module.prototype._clearMayUpdate = function () {};

/**
 * @package
 * @returns {void}
 */
Module.prototype._recordMayDispose = function () {};

/**
 * @struct
 * @abstract
 * @template T
 * @constructor
 * @extends {Module<T>}
 */
function Reactive() {}

/**
 * @interface
 * @extends {Scope}
 */
function RootInterface() {}

/**
 * @interface
 * @template T
 * @extends {Send}
 * @extends {SignalData<T>}
 */
function DataInterface() {}

/**
 * @interface
 * @template T
 * @extends {Send}
 * @extends {Scope}
 * @extends {Receive}
 * @extends {Signal<T>}
 */
function ComputeInterface() {}

/**
 * @final
 * @struct
 * @package
 * @constructor
 */
function Queue() {
  /**
   * @const
   * @package
   * @type {Array<Module | null>}
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
 * @param {Module} item
 * @returns {void}
 */
Queue.prototype._add = function (item) {
  this._items[this._count++] = item;
};

/**
 * @package
 * @returns {void}
 */
Queue.prototype._dispose = function () {
  for (var i = 0; i < this._count; i++) {
    this._items[i]._dispose();
    this._items[i] = null;
  }
  this._count = 0;
};

/**
 * @package
 * @returns {void}
 */
Queue.prototype._update = function () {
  for (var i = 0; i < this._count; i++) {
    var item = this._items[i];
    if (item._state & State.WillUpdate) {
      item._update();
    }
    this._items[i] = null;
  }
  this._count = 0;
};
/**
 * @const
 * @type {Object}
 */
var VOID = {};
/**
 * @const
 * @type {Queue}
 */
var DISPOSES = new Queue();
/**
 * @const
 * @type {Queue}
 */
var CHANGES = new Queue();
/**
 * @const
 * @type {Queue}
 */
var COMPUTES = new Queue();
/**
 * @const
 * @type {Queue}
 */
var UPDATES = new Queue();
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
 *
 * @param {?} val
 * @returns {number}
 */
function type(val) {
  switch (typeof val) {
    case "function":
      return Type.Function;
    case "object":
      if (val !== null) {
        return val instanceof Reactive
          ? Type.Reactive
          : val instanceof Array
            ? Type.Array
            : Type.Object;
      }
  }
  return Type.Value;
}

/**
 * @param {Function} ctor
 * @param {Function} parent
 * @param {Function=} mixin
 * @returns {void}
 */
function extend(ctor, parent, mixin) {
  ctor.prototype = new parent();
  ctor.constructor = ctor;
  if (mixin !== void 0) {
    for (var key in mixin.prototype) {
      ctor.prototype[key] = mixin.prototype[key];
    }
  }
}

/**
 * @returns {void}
 */
function reset() {
  DISPOSES._count = CHANGES._count = COMPUTES._count = UPDATES._count = 0;
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
  var context = CONTEXT;
  var owner = context._owner;
  var listen = context._listen;
  context._idle = false;
  try {
    start();
  } finally {
    context._idle = true;
    context._owner = owner;
    context._listen = listen;
  }
}

/**
 * @returns {void}
 */
function start() {
  var cycle = 0;
  var disposes = DISPOSES;
  var changes = CHANGES;
  var computes = COMPUTES;
  var updates = UPDATES;
  while (
    changes._count !== 0 ||
    computes._count !== 0 ||
    updates._count !== 0 ||
    disposes._count !== 0
  ) {
    if (disposes._count !== 0) {
      disposes._dispose();
    }
    if (changes._count !== 0) {
      changes._update();
    }
    if (computes._count !== 0) {
      computes._update();
    }
    if (updates._count !== 0) {
      updates._update();
    }
    if (cycle++ > 1e5) {
      throw new Error(ErrorCode.Circular);
    }
  }
}

/**
 * @param {Scope} scope
 * @returns {void}
 */
function disposeScope(scope) {
  /** @type {number} */
  var ln;
  var state = scope._state;
  if (state & State.Scope) {
    var children = scope._children;
    for (ln = children.length; ln--; ) {
      children.pop()._dispose();
    }
    scope._state &= ~State.Scope;
  }
  if (state & State.Cleanup) {
    var cleanups = scope._cleanups;
    for (ln = cleanups.length; ln--; ) {
      cleanups.pop()(true);
    }
    scope._state &= ~State.Cleanup;
  }
}

/**
 * @struct
 * @constructor
 * @extends {Reactive}
 * @implements {RootInterface}
 */
function Root() {
  /**
   * @package
   * @type {number}
   */
  this._state = 0;
  /**
   * @package
   * @type {Array<Module> | null}
   */
  this._children = [];
  /**
   * @package
   * @type {Array<function(boolean): void> | null}
   */
  this._cleanups = null;
}

/**
 * @package
 * @override
 * @returns {void}
 */
Root.prototype._dispose = function () {
  if (this._state !== State.Disposed) {
    disposeScope(this);
    this._children = this._cleanups = null;
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
    for (var ln = send._nodes.length; ln--; ) {
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
 * @returns {void}
 */
function sendWillUpdate(send) {
  var state = send._state;
  var node1 = send._node1;
  if (state & State.SendOne) {
    if (!(node1._state & (State.WillUpdate | State.WillDispose))) {
      node1._recordWillUpdate();
    }
  }
  if (state & State.SendMany) {
    var nodes = send._nodes;
    var ln = nodes.length;
    for (var i = 0; i < ln; i++) {
      node1 = nodes[i];
      if (!(node1._state & (State.WillUpdate | State.WillDispose))) {
        node1._recordWillUpdate();
      }
    }
  }
}

/**
 * @param {Send} send
 * @returns {void}
 */
function sendMayUpdate(send) {
  var state = send._state;
  var node1 = send._node1;
  if (state & State.SendOne) {
    if (
      !(node1._state & (State.MayUpdate | State.WillUpdate | State.WillDispose))
    ) {
      node1._recordMayUpdate();
    }
  }
  if (state & State.SendMany) {
    var nodes = send._nodes;
    var len = nodes.length;
    for (var i = 0; i < len; i++) {
      node1 = nodes[i];
      if (
        !(
          node1._state &
          (State.MayUpdate | State.WillUpdate | State.WillDispose)
        )
      ) {
        node1._recordMayUpdate();
      }
    }
  }
}

/**
 * @param {Scope} owner
 * @returns {void}
 */
function sendMayDispose(owner) {
  var children = owner._children;
  for (var i = 0, ln = children.length; i < ln; i++) {
    var node = children[i];
    if (
      node._state & (State.SendOne | State.SendMany) &&
      node._state & (State.ReceiveOne | State.ReceiveMany) &&
      !(node._state & (State.MayDispose | State.WillDispose | State.Disposed))
    ) {
      node._owner = owner;
      node._recordMayDispose();
    }
  }
}

/**
 * @param {Array<Module>} nodes
 * @returns {void}
 */
function sendDispose(nodes) {
  for (var i = 0, ln = nodes.length; i < ln; i++) {
    var node = nodes[i];
    if (!(node._state & (State.WillDispose | State.Disposed))) {
      node._recordDispose();
    }
  }
}

/**
 * @struct
 * @template T
 * @constructor
 * @param {T} val
 * @param {(function(T,T): boolean) | null=} eq
 * @extends {Reactive<T>}
 * @implements {DataInterface<T>}
 */
function Data(val, eq) {
  /**
   * @package
   * @type {number}
   */
  this._state =
    eq === void 0 ? State.Void : eq === null ? State.Respond : State.Compare;
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

extend(Data, Reactive);

/**
 * @public
 * @returns {T}
 */
Data.prototype.val = function () {
  /** @type {Receive | null} */
  var listen;
  if (
    !(
      this._state &
      (State.ScheduledDispose | State.WillDispose | State.Disposed)
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
Data.prototype.peek = function () {
  return this._value;
};

/**
 * @public
 * @param {T} val
 * @returns {void}
 */
Data.prototype.update = function (val) {
  var state = this._state;
  if (
    !(state & (State.ScheduledDispose | State.WillDispose | State.Disposed))
  ) {
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
          sendWillUpdate(this);
          exec();
        }
      } else {
        if (this._next !== VOID && val !== this._next) {
          throw new Error(ErrorCode.Conflict);
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
 * @returns {void}
 */
Data.prototype._update = function () {
  this._value = this._next;
  this._next = VOID;
  this._state &= ~State.WillUpdate;
  sendWillUpdate(this);
};

/**
 * @package
 * @returns {void}
 */
Data.prototype._recordDispose = function () {
  this._state = State.WillDispose;
};

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
    for (var ln = node._sources.length; ln--; ) {
      removeReceiver(node._sources.pop(), node._sourceslots.pop());
    }
  }
  node._state &= ~(State.ReceiveOne | State.ReceiveMany);
}

/**
 * @param {Signal | Array<Signal> | (function(): void) | undefined} source
 * @param {Receive} owner
 * @returns {void}
 */
function readSource(source, owner) {
  switch (type(source)) {
    case Type.Reactive:
      addReceiver(/** @type {Send} */ (source), owner);
      break;
    case Type.Array:
      var len = /** @type {Array<Send>} */ (source).length;
      for (var i = 0; i < len; i++) {
        addReceiver(/** @type {Array<Send>} */ (source)[i], owner);
      }
      break;
    case Type.Function:
      /** @type {function(): void} */ (source)();
  }
}

/**
 * @struct
 * @template T, U
 * @constructor
 * @param {function(T, U): T} fn
 * @param {T} seed
 * @param {SignalOptions<T, U> | undefined} opts
 * @extends {Reactive<T>}
 * @implements {ComputeInterface<T>}
 */
function Compute(fn, seed, opts) {
  var state = State.Void;
  /** @type {U | undefined} */
  var args;
  /** @type {(function(T, T): boolean) | null | undefined} */
  var compare;
  /** @type {Signal | Array<Signal> | (function(): void) | undefined} */
  var source;
  if (opts != null) {
    if (opts.compare != null) {
      compare = opts.compare;
      if (opts.compare === null) {
        state |= State.Respond;
      } else {
        state |= State.Compare;
      }
    }
    if (opts.unstable) {
      state |= State.Unstable;
    }
    if (opts.defer) {
      state |= State.Defer;
    }
    if (opts.sample) {
      state |= State.Sample;
    }
    if (opts.lazy) {
      state |= State.Lazy;
    }
    args = opts.args;
    if (opts.source != null) {
      state |= State.Source;
      source = opts.source;
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
  this._value = seed;
  /**
   * @package
   * @type {(function(T,T): boolean) | null | undefined}
   */
  this._compare = compare;
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
   * @type {null | (function(T,U): T)}
   */
  this._next = fn;
  /**
   * @package
   * @type {Array<Module> | null}
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
   * @type {U | undefined}
   */
  this._args = args;
  /**
   * @package
   * @type {Signal | Array<Signal> | (function(): void) | undefined}
   */
  this._source = source;
  var context = CONTEXT;
  var owner = context._owner;
  var listen = context._listen;
  if (owner !== null) {
    if (owner._state & State.Lazy) {
      throw new Error("Lazy computations cannot own child computations");
    }
    owner._state |= State.Scope;
    var children = owner._children;
    if (children === null) {
      owner._children = [this];
    } else {
      children[children.length] = this;
    }
  }
  if (state & State.Source) {
    context._owner = null;
    context._listen = this;
    readSource(source, this);
    if (!(state & State.Unstable)) {
      this._source = null;
      this._state &= ~State.Source;
    }
  }
  if (!(state & State.Defer)) {
    context._owner = this;
    context._listen = state & State.Sample ? null : this;
    this._state |= State.Initial;
    if (context._idle) {
      reset();
      context._idle = false;
      try {
        this._value = this._next(this._value, this._args);
        if (CHANGES._count !== 0 || DISPOSES._count !== 0) {
          start();
        }
      } finally {
        context._idle = true;
        context._owner = owner;
        context._listen = listen;
      }
    } else {
      this._value = this._next(this._value, this._args);
      context._owner = owner;
      context._listen = listen;
    }
  }
}

extend(Compute, Reactive);

/**
 * @public
 * @override
 * @returns {T}
 */
Compute.prototype.val = function () {
  var state = this._state;
  if (!(state & (State.WillDispose | State.Disposed))) {
    if (
      state & State.MayDispose ||
      (state & (State.MayUpdate | State.WillUpdate)) === State.MayUpdate
    ) {
      this._clearMayUpdate();
    } else if (state & State.WillUpdate) {
      if (state & State.Updating) {
        throw new Error(ErrorCode.Circular);
      }
      this._update();
    }
    /** @type {Receive | null | undefined} */
    var listen;
    if (
      !(
        this._state &
        (State.ScheduledDispose | State.WillDispose | State.Disposed)
      ) &&
      (listen = CONTEXT._listen) !== null
    ) {
      addReceiver(this, listen);
    }
  }
  return this._value;
};

/**
 * @public
 * @override
 * @returns {T}
 */
Compute.prototype.peek = function () {
  var state = this._state;
  if (!(state & (State.WillDispose | State.Disposed))) {
    if (
      state & State.MayDispose ||
      (state & (State.MayUpdate | State.WillUpdate)) === State.MayUpdate
    ) {
      this._clearMayUpdate();
    } else if (state & State.WillUpdate) {
      if (state & State.Updating) {
        throw new Error(ErrorCode.Circular);
      }
      this._update();
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
  if (this._state !== State.Disposed) {
    disposeScope(this);
    disposeSender(this);
    disposeReceiver(this);
    this._children =
      this._cleanups =
      this._value =
      this._next =
      this._args =
      this._source =
      this._sources =
      this._sourceslots =
        null;
    this._state = State.Disposed;
  }
};

/**
 * @package
 * @override
 * @returns {void}
 */
Compute.prototype._update = function () {
  var context = CONTEXT;
  var owner = context._owner;
  var listen = context._listen;
  context._owner = context._listen = null;
  var state = this._state;
  if (state & (State.Scope | State.Cleanup)) {
    disposeScope(this);
  }
  if (state & State.Unstable) {
    disposeReceiver(this);
    context._listen = this;
    if (state & State.Source) {
      readSource(this._source, this);
    }
    if (state & State.Sample) {
      context._listen = null;
    }
  }
  context._owner = this;
  var prev = this._value;
  this._state =
    (this._state | State.Updating) & ~(State.Initial | State.MayCleared);
  this._value = this._next(prev, this._args);
  this._state &= ~(
    State.Updating |
    State.WillUpdate |
    State.MayUpdate |
    State.MayDispose |
    State.MayCleared
  );
  if (
    !(state & State.Respond) &&
    state & (State.SendOne | State.SendMany) &&
    (state & State.Changed ||
      (state & State.Compare
        ? !this._compare(prev, this._value)
        : prev !== this._value))
  ) {
    sendWillUpdate(this);
  }
  context._owner = owner;
  context._listen = listen;
};

/**
 * @package
 * @override
 * @returns {void}
 */
Compute.prototype._recordDispose = function () {
  var state = this._state;
  this._state =
    (state | State.WillDispose) &
    ~(State.WillUpdate | State.MayDispose | State.MayUpdate);
  if ((state & (State.WillUpdate | State.Scope)) === State.Scope) {
    sendDispose(this._children);
  }
};

/**
 * @package
 * @override
 * @returns {void}
 */
Compute.prototype._recordMayDispose = function () {
  var state = this._state;
  this._state = (state | State.MayDispose) & ~State.MayCleared;
  if ((state & (State.MayUpdate | State.Scope)) === State.Scope) {
    sendMayDispose(this);
  }
};

/**
 * @package
 * @override
 * @returns {void}
 */
Compute.prototype._recordMayUpdate = function () {
  var state = this._state;
  this._state |= State.MayUpdate;
  if ((state & (State.MayDispose | State.Scope)) === State.Scope) {
    sendMayDispose(this);
  }
  if (state & (State.SendOne | State.SendMany)) {
    sendMayUpdate(this);
  }
};

/**
 * @package
 * @override
 * @returns {void}
 */
Compute.prototype._recordWillUpdate = function () {
  var state = this._state;
  this._state =
    (state | State.WillUpdate) & ~(State.MayUpdate | State.MayCleared);
  if (state & State.Scope) {
    sendDispose(this._children);
  }
  if (!(state & State.Respond) && state & (State.SendOne | State.SendMany)) {
    if (!(state & State.Lazy)) {
      COMPUTES._add(this);
    }
    if (!(state & State.MayUpdate)) {
      sendMayUpdate(this);
    }
  } else {
    if (!(state & State.Lazy)) {
      UPDATES._add(this);
    }
    if (state & (State.SendOne | State.SendMany)) {
      sendWillUpdate(this);
    }
  }
};

/**
 * @package
 * @override
 * @returns {void}
 */
Compute.prototype._clearMayUpdate = function () {
  if (this._state & State.MayCleared) {
    throw new Error(ErrorCode.Circular);
  }
  this._state |= State.MayCleared;
  if (this._state & State.MayDispose) {
    this._state &= ~State.MayDispose;
    this._owner._clearMayUpdate();
    this._owner = null;
  }
  check: if (
    (this._state &
      (State.WillUpdate |
        State.WillDispose |
        State.Disposed |
        State.MayUpdate)) ===
    State.MayUpdate
  ) {
    if (this._state & State.ReceiveOne) {
      var source1 = this._source1;
      if (source1._state & (State.MayUpdate | State.WillUpdate)) {
        source1._clearMayUpdate();
        if (this._state & (State.WillDispose | State.WillUpdate)) {
          break check;
        }
      }
    }
    if (this._state & State.ReceiveMany) {
      var sources = this._sources;
      var ln = sources.length;
      for (var i = 0; i < ln; i++) {
        source1 = sources[i];
        if (source1._state & (State.MayUpdate | State.WillUpdate)) {
          source1._clearMayUpdate();
          if (this._state & (State.WillDispose | State.WillUpdate)) {
            break check;
          }
        }
      }
    }
  }
  this._state &= ~(State.MayDispose | State.MayUpdate | State.MayCleared);
  if (this._state & State.WillUpdate) {
    if (this._state & State.Updating) {
      throw new Error(ErrorCode.Circular);
    }
    this._update();
  }
};

/**
 * @template T
 * @param {function(function(): void): T} fn
 * @returns {T}
 */
function root(fn) {
  /** @type {Root} */
  var node = null;
  /** @type {function(): void} */
  var disposer;
  var context = CONTEXT;
  var owner = context._owner;
  var listen = context._listen;
  if (fn.length !== 0) {
    node = new Root();
    disposer = function () {
      dispose(node);
    };
  }
  context._owner = node;
  context._listen = null;
  try {
    return fn(disposer);
  } finally {
    context._owner = owner;
    context._listen = listen;
  }
}

/**
 * @param {Reactive} node
 * @returns {void}
 */
function dispose(node) {
  if (
    !(
      node._state &
      (State.ScheduledDispose | State.WillDispose | State.Disposed)
    )
  ) {
    if (CONTEXT._idle) {
      node._dispose();
    } else {
      node._state |= State.ScheduledDispose;
      DISPOSES._add(node);
    }
  }
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
 * @param {Signal} node
 * @returns {void}
 */
function record(node) {
  var listen = CONTEXT._listen;
  if (listen !== null) {
    addReceiver(/** @type {Send} */ (node), listen);
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

function stable() {
  if (CONTEXT._owner !== null) {
    CONTEXT._owner._state &= ~State.Unstable;
  }
}

/**
 * @template T
 * @param {T} value
 * @returns {SignalData<T>}
 */
function data(value) {
  return new Data(value, null);
}

/**
 * @template T
 * @param {T} value
 * @param {function(T,T): boolean=} eq
 * @returns {SignalData<T>}
 */
function value(value, eq) {
  return new Data(value, eq);
}

/**
 * @public
 * @template T, U
 * @param {function(T, U): T} fn
 * @param {T=} seed
 * @param {SignalOptions<T, U>=} opts
 * @returns {Signal<T>}
 */
function compute(fn, seed, opts) {
  return new Compute(fn, seed, opts);
}

window["anod"]["root"] = root;
window["anod"]["dispose"] = dispose;
window["anod"]["sample"] = sample;
window["anod"]["batch"] = batch;
window["anod"]["record"] = record;
window["anod"]["cleanup"] = cleanup;
window["anod"]["stable"] = stable;
window["anod"]["data"] = data;
window["anod"]["value"] = value;
window["anod"]["compute"] = compute;
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
  ModuleInterface,
  Module,
  RootInterface,
  DataInterface,
  ComputeInterface,
  Queue,
  VOID,
  DISPOSES,
  CHANGES,
  COMPUTES,
  UPDATES,
  CONTEXT,
  extend,
  type,
  reset,
  addReceiver,
  exec,
  start,
  disposeScope,
  Reactive,
  Root,
  disposeSender,
  removeReceiver,
  removeSender,
  sendWillUpdate,
  sendMayUpdate,
  sendMayDispose,
  sendDispose,
  disposeReceiver,
  readSource,
  Data,
  Compute,
  root,
  sample,
  batch,
  dispose,
  record,
  cleanup,
  stable,
  data,
  value,
  compute
};
