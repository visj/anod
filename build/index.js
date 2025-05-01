/**
 * @typedef {string | number | bigint | boolean | undefined | symbol | null}
 */
var primitive;

/**
 * @interface
 */
function DisposableSignal() {}

/**
 * @returns {void}
 */
DisposableSignal.prototype.dispose = function () {};

/**
 * @interface
 * @template T
 * @extends {DisposableSignal<T>}
 */
function ReadonlySignal() {}

/**
 * @returns {T}
 */
ReadonlySignal.prototype.val = function () {};

/**
 * @returns {T}
 */
ReadonlySignal.prototype.peek = function () {};

/**
 * @interface
 * @template T
 * @extends {ReadonlySignal<T>}
 */
function Signal() {}

/**
 * @public
 * @param {T} val
 * @returns {void}
 */
Signal.prototype.set = function (val) {};

/**
 * @record
 * @template T
 */
function SignalOptions() {}

/**
 * @type {boolean | undefined}
 */
SignalOptions.prototype.unstable;

/**
 * @type {(function(T, T): boolean) | null | undefined}
 */
SignalOptions.prototype.compare;

/**
 * @interface
 * @template T
 * @extends {ReadonlySignal<ReadonlyArray<T>>}
 */
function SignalIterator() {}

/**
 * @returns {number}
 */
SignalIterator.prototype.length = function() {};

/**
 * @param {number | ReadonlySignal<number> | (function(): number)} index
 * @returns {ReadonlySignal<T | undefined>}
 */
SignalIterator.prototype.at = function (index) {};

/**
 * @param {...(T | Array<T> | ReadonlySignal<T> | ReadonlySignal<Array<T>>)} items
 * @returns {SignalIterator<T>}
 */
SignalIterator.prototype.concat = function (items) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<boolean>}
 */
SignalIterator.prototype.every = function (callbackFn) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @returns {SignalIterator<T>}
 */
SignalIterator.prototype.filter = function (callbackFn) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<T | undefined>}
 */
SignalIterator.prototype.find = function (callbackFn) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<number>}
 */
SignalIterator.prototype.findIndex = function (callbackFn) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<T | undefined>}
 */
SignalIterator.prototype.findLast = function (callbackFn) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<number>}
 */
SignalIterator.prototype.findLastIndex = function (callbackFn) {};

/**
 * @param {function(T, number): void} callbackFn
 * @returns {ReadonlySignal<void>}
 */
SignalIterator.prototype.forEach = function (callbackFn) {};

/**
 * @param {T | ReadonlySignal<T> | (function(): T)} searchElement
 * @returns {ReadonlySignal<boolean>}
 */
SignalIterator.prototype.includes = function (searchElement) {};

/**
 * @param {T | ReadonlySignal<T> | (function(): T)} searchElement
 * @param {number | Signal<number> | (function(): number)=} fromIndex
 * @returns {ReadonlySignal<number>}
 */
SignalIterator.prototype.indexOf = function (searchElement, fromIndex) {};

/**
 * @param {string | ReadonlySignal<string> | (function(): string)=} separator
 * @returns {ReadonlySignal<string>}
 */
SignalIterator.prototype.join = function (separator) {};

/**
 * @param {T | ReadonlySignal<T> | (function(): T)} searchElement
 * @param {number | ReadonlySignal<number> | (function(): number)=} fromIndex
 * @returns {ReadonlySignal<number>}
 */
SignalIterator.prototype.lastIndexOf = function (searchElement, fromIndex) {};

/**
 * @template U
 * @param {function(T, ReadonlySignal<number>): U} callbackFn
 * @param {function(T): (string | number | symbol)=} keyFn
 * @returns {SignalIterator<U>}
 */
SignalIterator.prototype.map = function (callbackFn, keyFn) {};

/**
 * @template U, V
 * @param {function((T | U), T, number): V} callbackFn
 * @param {U | ReadonlySignal<U> | (function(): U)=} initialValue
 * @returns {ReadonlySignal<V>}
 */
SignalIterator.prototype.reduce = function (callbackFn, initialValue) {};

/**
 * @template U
 * @param {function((T | U), T, number): U} callbackFn
 * @param {U | ReadonlySignal<U> | (function(): U)=} initialValue
 * @returns {ReadonlySignal<U>}
 */
SignalIterator.prototype.reduceRight = function (callbackFn, initialValue) {};

/**
 * @param {number | ReadonlySignal<number> | (function(): number)=} start
 * @param {number | ReadonlySignal<number> | (function(): number)=} end
 * @returns {SignalIterator<T>}
 */
SignalIterator.prototype.slice = function (start, end) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<boolean>}
 */
SignalIterator.prototype.some = function (callbackFn) {};

/**
 * @interface
 * @template T
 * @extends {SignalIterator<T>}
 * @extends {Signal<ReadonlyArray<T>>}
 */
function SignalArray() {}

/**
 * @param {function(Array<T>): Array<T>} callbackFn
 */
SignalArray.prototype.modify = function (callbackFn) {};

/**
 * @returns {void}
 */
SignalArray.prototype.pop = function () {};

/**
 * @param {...T} elementN
 * @returns {void}
 */
SignalArray.prototype.push = function (elementN) {};

/**
 * @returns {void}
 */
SignalArray.prototype.shift = function () {};

/**
 * @returns {void}
 */
SignalArray.prototype.reverse = function () {};

/**
 * @param {function(T, T): number=} compareFn
 * @returns {void}
 */
SignalArray.prototype.sort = function (compareFn) {};

/**
 * @param {number} start
 * @param {number=} deleteCount
 * @param {...T} items
 * @returns {void}
 */
SignalArray.prototype.splice = function (start, deleteCount, items) {};

/**
 * @param {...T} elementN
 * @returns {void}
 */
SignalArray.prototype.unshift = function (elementN) {};

/**
 * @interface
 * @extends {IObject<string, SignalValue>}
 */
function SignalObject() {}

/** @typedef {Signal | ReadonlySignal | SignalIterator | SignalObject} */
var SignalValue;

export {
  DisposableSignal,
  ReadonlySignal,
  Signal,
  SignalIterator,
  SignalArray,
  SignalObject,
  SignalValue,
  SignalOptions
};
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
/**
 * @const
 * @enum {number}
 */
var Mutation = {
  None: 0,
  TypeMask: 1023,
  InsertOne: 1024,
  InsertRange: 2048,
  RemoveOne: 4096,
  RemoveRange: 8192,
  OrderSort: 16384,
  OrderReverse: 32768,
  Assign: 65536,
  Modify: 131072,
  ModifyRange: 262144
};

/**
 * @const
 * @enum {number}
 */
var Mutations = {
  Set: 1,
  Pop: 2,
  Push: 3,
  Reverse: 4,
  Shift: 5,
  Sort: 6,
  Splice: 7,
  Unshift: 8,
  Fill: 9,
  CopyWithin: 10,
  Modify: 11,
};

/**
 * @const
 */
var ArrayProto = Array.prototype;

/**
 * @const
 */
var splice = ArrayProto.splice;

/**
 * @const
 */
var concat = ArrayProto.concat;

/**
 * @package
 * @type {number}
 */
var MUT_SEED = Mutations.Modify;

/**
 * @public
 * @returns {number}
 */
function mutation() {
  return ++MUT_SEED;
}

/**
 * @enum {number}
 */
var ArgType = {
  Void: 0,
  NotReactive: 1,
  Reactive: 2,
  Callback: 3,
  Variadic: 4,
};

/**
 * 
 * @param {*} arg 
 * @returns {ArgType}
 */
function argType(arg) {
  switch (typeof arg) {
    case "function":
      return ArgType.Callback;
    case "object":
      if (arg !== null && arg instanceof Reactive) {
        return ArgType.Reactive;
      }
  }
  return ArgType.NotReactive;
}

/**
 * @template T
 * @param {T | Signal<T> | (function(): T)} val 
 * @param {ArgType} type 
 * @returns {T}
 */
function argValue(val, type) {
  switch (type) {
    case ArgType.Callback:
      return /** @type {function(): T} */(val)();
    case ArgType.Reactive:
      return /** @type {Reactive<T>} */(val).val();
  }
  return /** @type {T} */(val);
}

/**
 * @final
 * @struct
 * @template T, U
 * @constructor
 * @param {T | ReadonlySignal<T> | (function(): T)=} arg1
 * @param {ArgType=} type1
 * @param {U | ReadonlySignal<U> | (function(): U)=} arg2
 * @param {ArgType=} type2
 */
function Arguments(arg1, type1, arg2, type2) {
  /**
   * @package
   * @type {number}
   */
  this.index = -1;
  /**
   * @package
   * @type {T | undefined}
   */
  this._arg1 = arg1;
  /**
   * @package
   * @type {ArgType}
   */
  this._type1 = type1 || ArgType.NotReactive;
  /**
   * @package
   * @type {U | undefined}
   */
  this._arg2 = arg2;
  /**
   * @package
   * @type {ArgType}
   */
  this._type2 = type2 || ArgType.NotReactive;
}

/**
 * @package
 * @returns {T}
 */
Arguments.prototype.arg1 = function () {
  return argValue(this._arg1, this._type1);
};

/**
 * @package
 * @returns {U}
 */
Arguments.prototype.arg2 = function () {
  return argValue(this._arg2, this._type2);
};

/**
 * @interface
 * @template T
 * @extends {Send<T>}
 * @extends {IReactive<ReadonlyArray<T>>}
 * @extends {SignalIterator<T>}
 */
function IReactiveIterator() { }

/**
 * @struct
 * @abstract
 * @template T
 * @constructor
 * @extends {Reactive<ReadonlyArray<T>>}
 * @implements {IReactiveIterator<T>}
 */
function ReactiveIterator() { }

extend(ReactiveIterator, Reactive);

/**
 * @public
 * @returns {number}
 */
ReactiveIterator.prototype.length = function () {
  return this.val().length;
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {T | undefined} value
 * @param {Arguments<number, undefined>} args
 * @returns {T | undefined}
 */
function atIterator(source, value, args) {
  var index = args.arg1();
  return source.at(index);
}

/**
 * @param {number | ReadonlySignal<number> | (function(): number)} index
 * @returns {ReadonlySignal<T | undefined>}
 */
ReactiveIterator.prototype.at = function (index) {
  return new ComputeReduce(
    this,
    atIterator,
    /** @type {number} */(index),
    argType(index)
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {Array<T>} value
 * @param {Arguments<T | Array<T>, undefined>} args
 * @returns {Array<T>}
 */
function copyIterator(source, value, args) {
  return source.slice();
}

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {Array<T>} value
 * @param {Arguments<T | Array<T>, undefined>} args
 * @returns {Array<T>}
 */
function concatIterator(source, value, args) {
  if (args._type1 === ArgType.Variadic) {
    /**
     * @type {Array<T | Array<T> | Signal<T> | Array<Signal<T>>>}
     */
    var params = args.arg1();
    /**
     * @const
     * @type {number}
     */
    var len = params.length;
    /**
     * @type {Array<T | Array<T>>}
     */
    var slice = new Array(len);
    for (var i = 0; i < len; i++) {
      var param = params[i];
      slice[i] = argValue(param, argType(param));
    }
    return concat.apply(source, slice);
  }
  return source.concat(args.arg1());
}

/**
 * @public
 * @param {...(T | Array<T> | ReadonlySignal<T> | ReadonlySignal<Array<T>>)} items
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.concat = function (items) {
  var len = arguments.length;
  switch (len) {
    case 0:
      return new ComputeArray(this, copyIterator);
    case 1:
      return new ComputeArray(this, concatIterator, items, argType(items));
  }
  /**
   * @type {Array<T | Array<T> | ReadonlySignal<T> | ReadonlySignal<Signal<T>>>}
   */
  var args = new Array(len);
  for (var i = 0; i < len; i++) {
    args[i] = arguments[i];
  }
  return new ComputeArray(
    this,
    concatIterator,
    args,
    ArgType.Variadic
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source 
 * @param {boolean} value 
 * @param {Arguments<function(T, number): boolean, undefined>} args 
 * @returns {boolean}
 */
function everyIterator(source, value, args) {
  var callbackFn = args.arg1();
  return source.every(callbackFn);
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<boolean>}
 */
ReactiveIterator.prototype.every = function (callbackFn) {
  return new ComputeReduce(
    this,
    everyIterator,
    callbackFn
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {Array<T>} value
 * @param {Arguments<(function(T, number): boolean), undefined>} args
 * @returns {Array<T>}
 */
function filterIterator(source, value, args) {
  var callbackFn = args.arg1();
  return source.filter(callbackFn);
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.filter = function (callbackFn) {
  return new ComputeArray(
    this,
    filterIterator,
    callbackFn
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {T | undefined} value
 * @param {Arguments<(function(T, number): boolean), undefined>} args
 * @returns {T | undefined}
 */
function findIterator(source, value, args) {
  var callbackFn = args.arg1();
  return source.find(callbackFn);
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<T | undefined>}
 */
ReactiveIterator.prototype.find = function (callbackFn) {
  return new ComputeReduce(
    this,
    findIterator,
    callbackFn
  )
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {number} value
 * @param {Arguments<function(T, number): boolean, undefined>} args
 * @returns {number}
 */
function findIndexIterator(source, value, args) {
  var callbackFn = args.arg1();
  return source.findIndex(callbackFn);
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<number>}
 */
ReactiveIterator.prototype.findIndex = function (callbackFn) {
  return new ComputeReduce(
    this,
    findIndexIterator,
    callbackFn
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {T | undefined} value
 * @param {Arguments<(function(T, number): boolean), undefined>} args
 * @returns {T | undefined}
 */
function findLastIterator(source, value, args) {
  var callbackFn = args.arg1();
  return source.findLast(callbackFn);
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<T | undefined>}
 */
ReactiveIterator.prototype.findLast = function (callbackFn) {
  return new ComputeReduce(
    this,
    findLastIterator,
    callbackFn
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {number} value
 * @param {Arguments<(function(T, number): boolean), undefined>} args
 * @returns {number}
 */
function findLastIndexIterator(source, value, args) {
  var callbackFn = args.arg1();
  return source.findLastIndex(callbackFn);
}

/**
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<number>}
 */
ReactiveIterator.prototype.findLastIndex = function (callbackFn) {
  return new ComputeReduce(
    this,
    findLastIndexIterator,
    callbackFn
  )
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {void} value
 * @param {Arguments<(function(T, number): void), undefined>} args
 * @returns {void}
 */
function forEachIterator(source, value, args) {
  var callbackFn = args.arg1();
  source.forEach(callbackFn);
}

/**
 * @param {function(T, number): void} callbackFn
 * @returns {ReadonlySignal<void>}
 */
ReactiveIterator.prototype.forEach = function (callbackFn) {
  return new ComputeReduce(
    this,
    forEachIterator,
    callbackFn
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {boolean} prev
 * @param {Arguments<T, undefined>} args
 * @returns {boolean}
 */
function includesIterator(source, prev, args) {
  var searchElement = args.arg1();
  return source.includes(searchElement);
}

/**
 * @param {T | ReadonlySignal<T> | (function(): T)} searchElement
 * @returns {ReadonlySignal<boolean>}
 */
ReactiveIterator.prototype.includes = function (searchElement) {
  return new ComputeReduce(
    this,
    includesIterator,
    searchElement,
    argType(searchElement)
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {number} value
 * @param {Arguments<T, number | undefined>} args
 * @returns {number}
 */
function indexOfIterator(source, value, args) {
  var searchElement = args.arg1();
  var fromIndex = args.arg2();
  return source.indexOf(searchElement, fromIndex);
}

/**
 * @param {T | ReadonlySignal<T> | (function(): T)} searchElement
 * @param {number | ReadonlySignal<number> | (function(): number)=} fromIndex
 * @returns {ReadonlySignal<number>}
 */
ReactiveIterator.prototype.indexOf = function (searchElement, fromIndex) {
  return new ComputeReduce(
    this,
    indexOfIterator,
    /** @type {T} */(searchElement),
    argType(searchElement),
    /** @type {number} */(fromIndex),
    argType(searchElement)
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {string} value
 * @param {Arguments<T, string | undefined>} args
 * @returns {string}
 */
function joinIterator(source, value, args) {
  var separator = args.arg1();
  return source.join(separator);
}

/**
 * @param {string | ReadonlySignal<string> | (function(): string)=} separator
 * @returns {ReadonlySignal<string>}
 */
ReactiveIterator.prototype.join = function (separator) {
  return new ComputeReduce(this, joinIterator, separator, argType(separator));
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {number} value
 * @param {Arguments<T, number | undefined>} args
 * @returns {number}
 */
function lastIndexOfIterator(source, value, args) {
  var searchElement = args.arg1();
  var fromIndex = args.arg2();
  return source.lastIndexOf(searchElement, fromIndex);
}

/**
 * @param {T | ReadonlySignal<T> | (function(): T)} searchElement
 * @param {number | ReadonlySignal<number> | (function(): number)=} fromIndex
 * @returns {ReadonlySignal<number>}
 */
ReactiveIterator.prototype.lastIndexOf = function (searchElement, fromIndex) {
  return new ComputeReduce(
    this,
    lastIndexOfIterator,
    searchElement,
    argType(searchElement),
    /** @type {number} */(fromIndex),
    argType(fromIndex)
  );
};

/**
 * @template T, U
 * @this {ComputeMapArray<T, U>}
 * @param {ReadonlyArray<T>} source
 * @param {Array<U>} value
 * @param {Arguments<(function(T, ReadonlySignal<number>): U), (function(T): (string | number | symbol)) | undefined>} args
 * @param {Array<MapRoot<T>>} roots
 * @returns {Array<U>}
 */
function mapIterator(source, value, args, roots) {
  /** @type {number} */
  var i;
  /** @type {number} */
  var j;
  /** @type {T} */
  var val;
  /** @type {MapRoot<T>} */
  var root;
  var rlen = value.length;
  var slen = source.length;
  var map = args._arg1;
  var pure = map.length < 2;
  if (rlen === 0) {
    if (slen > 0) {
      for (i = 0; i < slen; i++) {
        root = new MapRoot(source[i], pure ? null : new MapIndex(i));
        roots[i] = root;
        value[i] = mapRoot(root, map);
      }
    }
  } else if (slen === 0) {
    if (rlen > 0) {
      value.length = 0;
      for (i = 0; i < rlen; i++) {
        roots[i]._dispose();
        roots[i] = null;
      }
    }
  } else {
    if (args._type2 === ArgType.Callback) {
      var keyFn = args._arg1;
    } else {
      var rmin = 0;
      var rmax = rlen - 1;
      var smin = 0;
      var smax = slen - 1;
      while (
        rmin <= rmax &&
        smin <= smax &&
        roots[rmin]._value === source[smin]
      ) {
        // Common prefix, just increment forward
        rmin++;
        smin++;
      }
      while (
        rmin <= rmax &&
        smin <= smax &&
        roots[rmax]._value === source[smax]
      ) {
        // Common suffix, we don't know if the index
        // will change until we have diffed the middle part
        rmax--;
        smax--;
      }
      /** @type {Array<MapRoot>} */
      var newRoots;
      /** @type {Array<U>} */
      var newValue;
      if (smin > smax) {
        // We matched all source values
        if (rmin <= rmax) {
          // But not all root values,
          // simple remove cases
          for (i = rmin; i <= rmax; i++) {
            roots[i]._dispose();
          }
          roots.splice(rmin, rmax - rmin + 1);
          value.splice(rmin, rmax - rmin + 1);
          if (!pure) {
            for (i = rmin; i < rlen; i++) {
              // todo
            }
          }
        }
      } else if (rmin > rmax) {
        // We matched all existing
        if (smin <= smax) {
          // But not all source values,
          // simple insert cases
          newRoots = [rmin, 0];
          newValue = [rmin, 0];
          for (i = smin, j = 2; i <= smax; i++, j++) {
            root = new MapRoot(source[i], pure ? null : new MapIndex(i));
            newRoots[j] = root;
            newValue[j] = mapRoot(root, map);
          }
          splice.apply(roots, newRoots);
          splice.apply(value, newValue);
        }
      } else {
        // Need to reconcile
        var oldLen = rmax - rmin + 1;
        var newLen = smax - smin + 1;
        // 1) Build newIndices (item → headIndex) + newIndicesNext (linked list)
        /** @type {Map<T, number>} */
        var indexMap = new Map();
        /** @type {TypedArray<number>} */
        var indexNext = new Int32Array(newLen);
        for (i = smax; i >= smin; i--) {
          val = source[i];
          j = indexMap.get(val);
          indexMap.set(val, i);
          indexNext[i - smin] = (j === void 0 ? -1 : j);
        }

        // 2) Allocate temp slots
        newRoots = new Array(newLen);
        newValue = new Array(newLen);

        // // 3) Sweep old roots: reuse or dispose
        // for (i = rmin; i <= rmax; i++) {
        //   val = roots[i]._value;
        //   j = indexMap.get(val);
        //   if (j !== void 0 && j !== -1) {
        //     // reuse this root at new position j
        //     var idx = j - smin;
        //     tempRoots[idx] = oldRoots[i];
        //     tempValues[idx] = oldValues[i];
        //     if (!noindex) oldRoots[i]._index.set(j);
        //     // advance the linked list for this key
        //     prev = indexNext[idx];
        //     if (prev === -1) {
        //       indexMap.delete(key);
        //     } else {
        //       indexMap.set(key, smin + prev);
        //     }
        //   } else {
        //     // no match → dispose
        //     oldRoots[i]._dispose();
        //   }
        // }

        // // 4) Overwrite in-place & collect fresh inserts
        // var insRoots = [];
        // var insValues = [];
        // for (var k = 0; k < newLen; k++) {
        //   var dest = rmin + k;
        //   var reused = tempRoots[k];
        //   if (reused !== undefined) {
        //     // keep existing root/value
        //     roots[dest] = reused;
        //     value[dest] = tempValues[k];
        //   } else {
        //     // create new root
        //     var nr = new MapRoot(source[smin + k], pure ? new MapIndex(smin + k) : null);
        //     var mv = mapRoot(nr, cb);
        //     roots[dest] = nr;
        //     value[dest] = mv;
        //     insRoots.push(nr);
        //     insValues.push(mv);
        //   }
        // }
        // // 5) Single splice to remove old‐tail or insert new‐tail
        // if (newLen < oldLen) {
        //   // drop the excess old slots
        //   roots.splice(rmin + newLen, oldLen - newLen);
        //   value.splice(rmin + newLen, oldLen - newLen);
        // } else if (insRoots.length) {
        //   // insert the extra new slots
        //   splice.apply(
        //     roots,
        //     [rmin + oldLen, 0].concat(insRoots)
        //   );
        //   splice.apply(
        //     value,
        //     [rmin + oldLen, 0].concat(insValues)
        //   );
        // }
        // done—prefix [0..rmin-1] and suffix remain untouched
      }
    }

  }
  return value;
}

/**
 * @template U
 * @param {function(T, ReadonlySignal<number>): U} callbackFn
 * @param {function(T): (string | number | symbol)=} keyFn
 * @returns {SignalIterator<U>}
 */
ReactiveIterator.prototype.map = function (callbackFn, keyFn) {
  return new ComputeMapArray(
    this,
    mapIterator,
    callbackFn,
    ArgType.NotReactive,
    keyFn,
    argType(keyFn)
  );
};

/**
 * @template T, U, V
 * @param {ReadonlyArray<T>} source
 * @param {V} prev
 * @param {Arguments<(function((T | U), T, number): V), U | undefined>} args
 * @returns {V}
 */
function reduceIterator(source, prev, args) {
  var callbackFn = args.arg1();
  if (args._type2 === ArgType.Void) {
    return source.reduce(callbackFn);
  }
  var initialValue = args.arg2();
  return source.reduce(callbackFn, initialValue);
}

/**
 * @template U, V
 * @param {function((T | U), T, number): V} callbackFn
 * @param {U | ReadonlySignal<U> | (function(): U)=} initialValue
 * @returns {ReadonlySignal<V>}
 */
ReactiveIterator.prototype.reduce = function (callbackFn, initialValue) {
  return new ComputeReduce(
    this,
    reduceIterator,
    callbackFn,
    ArgType.NotReactive,
    initialValue,
    arguments.length < 2 ? ArgType.Void : argType(initialValue)
  );
};

/**
 * @template T, U
 * @param {ReadonlyArray<T>} source
 * @param {U} prev
 * @param {Arguments<(function((T | U), T, number): U), U | undefined>} args
 * @returns {U}
 */
function reduceRightIterator(source, prev, args) {
  var callbackFn = args.arg1();
  if (args._type2 === ArgType.Void) {
    return source.reduceRight(callbackFn);
  }
  var initialValue = args.arg2();
  return source.reduceRight(callbackFn, initialValue);
}

/**
 * @template U
 * @param {function((T | U), T, number): U} callbackFn
 * @param {U | ReadonlySignal<U> | (function(): U)=} initialValue
 * @returns {ReadonlySignal<U>}
 */
ReactiveIterator.prototype.reduceRight = function (callbackFn, initialValue) {
  return new ComputeReduce(
    this,
    reduceRightIterator,
    callbackFn,
    ArgType.NotReactive,
    initialValue,
    arguments.length < 2 ? ArgType.Void : argType(initialValue)
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {Array<T>} value
 * @param {Arguments<number, number>} args
 * @returns {Array<T>}
 */
function sliceIterator(source, value, args) {
  var start = args.arg1();
  var end = args.arg2();
  return source.slice(start, end);
}

/**
 * @param {number | ReadonlySignal<number> | (function(): number)=} start
 * @param {number | ReadonlySignal<number> | (function(): number)=} end
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.slice = function (start, end) {
  return new ComputeArray(
    this,
    sliceIterator,
    /** @type {number} */(start),
    argType(start),
    /** @type {number} */(end),
    argType(end)
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {boolean} value
 * @param {Arguments<function(T, number): boolean, void>} args
 * @returns {boolean}
 */
function someIterator(source, value, args) {
  var callbackFn = args.arg1();
  return source.some(callbackFn);
}

/**
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<boolean>}
 */
ReactiveIterator.prototype.some = function (callbackFn) {
  return new ComputeReduce(this, someIterator, callbackFn);
};

/**
 * @interface
 * @template T
 * @extends {Receive<T>}
 * @extends {ICompute<T>}
 */
function IComputeReduce() { }

/**
 * @struct
 * @template T, U, V, W
 * @constructor
 * @param {ReactiveIterator<T>} source
 * @param {function(Array<T>, U, Arguments<V, W>): U} fn
 * @param {V | Signal<V> | (function(): V)=} arg1
 * @param {ArgType=} type1
 * @param {W | Signal<W> | (function(): W)=} arg2
 * @param {ArgType=} type2
 * @extends {Compute<U>}
 * @implements {IComputeReduce<U>}
 */
function ComputeReduce(source, fn, arg1, type1, arg2, type2) {
  Compute.call(this, fn);
  /**
   * @package
   * @type {Arguments<V, W>}
   */
  this._args = new Arguments(arg1, type1, arg2, type2);
  connect(source, this);
}

extend(ComputeReduce, Compute);

/**
 * @package
 * @override
 * @returns {void}
 */
ComputeReduce.prototype._apply = function () {
  var source = /** @type {ReactiveIterator<T>} */ (this._source1);
  this._value = this._next(source.peek(), this._value, this._args);
};

/**
 * This only exists because Closure Compiler
 * cannot handle multiple prototype inheritance
 * @struct
 * @abstract
 * @template T
 * @constructor
 * @extends {ReactiveIterator<T>}
 * @implements {IReactiveIterator<T>}
 */
function ComputeArrayStub() { }

/**
 * @package
 * @returns {void}
 */
ComputeArrayStub.prototype._dispose = function () { };

/**
 * @package
 * @returns {void}
 */
ComputeArrayStub.prototype._apply = function () { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
ComputeArrayStub.prototype._update = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
ComputeArrayStub.prototype._receiveMayDispose = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
ComputeArrayStub.prototype._receiveWillDispose = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
ComputeArrayStub.prototype._receiveMayUpdate = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
ComputeArrayStub.prototype._receiveWillUpdate = function (time) { };

/**
 * @interface
 * @template T
 * @extends {IReactiveIterator<T>}
 * @extends {ICompute<ReadonlyArray<T>>}
 */
function IComputeArray() { }

/**
 * @struct
 * @template T, U, V, W
 * @constructor
 * @param {ReactiveIterator<T>} source
 * @param {function(ReadonlyArray<T>, Array<U>, Arguments<V, W>, ...?): Array<U>} fn
 * @param {V | ReadonlySignal<V> | (function(): V)=} arg1
 * @param {ArgType=} type1
 * @param {W | ReadonlySignal<W> | (function(): W)=} arg2
 * @param {ArgType=} type2
 * @extends {ComputeArrayStub<U>}
 * @implements {IComputeArray<U>}
 */
function ComputeArray(source, fn, arg1, type1, arg2, type2) {
  /**
   * @package
   * @type {number}
   */
  this._state = State.Initial | State.WillUpdate | State.Bound;
  /**
   * @package
   * @type {Array<U>}
   */
  this._value = [];
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
   * @type {function(ReadonlyArray<T>, Array<U>, Arguments<V, W>, ...?): Array<U>}
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
  /**
   * @package
   * @type {Arguments<V, W>}
   */
  this._args = new Arguments(arg1, type1, arg2, type2);
  connect(source, this);
}

extend(ComputeArray, ReactiveIterator);
inherit(ComputeArray, Compute);

/**
 * @package
 * @override
 * @returns {void}
 */
ComputeArray.prototype._apply = function () {
  var source = /** @type {ReactiveIterator<T>} */ (this._source1);
  this._value = this._next(source.peek(), this._value, this._args);
};

/**
 * @struct
 * @constructor
 * @param {number} val
 * @extends {Compute<number>}
 */
function MapIndex(val) {
  /**
   * @package
   * @type {number}
   */
  this._state = State.Void;
  /**
   * @package
   * @type {T}
   */
  this._value = val;
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
   * @type {number}
   */
  this._time = 0;
}

extend(MapIndex, Compute);

/**
 * @package
 * @override
 * @returns {void}
 */
MapIndex.prototype._dispose = function () {
  var state = this._state;
  if (state !== State.Disposed) {
    if (state & State.Send) {
      disposeSender(this);
    }
    this._value = null;
    this._state = State.Disposed;
  }
};

/**
 * @struct
 * @template T
 * @constructor
 * @param {T} val
 * @param {MapIndex | null} index
 * @param {string | number | symbol=} key
 * @extends {Root}
 */
function MapRoot(val, index, key) {
  /**
   * @package
   * @type {number}
   */
  this._state = State.Void;
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
   * @type {T}
   */
  this._value = val;
  /**
   * @package
   * @type {MapIndex | null}
   */
  this._index = index;
  /**
   * @package 
   * @type {string | number | symbol | undefined}
   */
  this._key = key;
}

extend(MapRoot, Root);

/**
 * @package
 * @override
 * @returns {void}
 */
MapRoot.prototype._dispose = function () {
  if (this._state !== State.Disposed) {
    disposeScope(this);
    if (this._index !== null) {
      this._index._dispose();
    }
    this._children =
      this._cleanups = null;
    this._state = State.Disposed;
  }
};

/**
 * @package
 * @template T, U
 * @param {MapRoot<T, U>} root 
 * @param {(function(T): U) | (function(T, ReadonlySignal<number>): U)} fn 
 * @returns {U}
 */
function mapRoot(root, fn) {
  var owner = CONTEXT._owner;
  var listen = CONTEXT._listen;
  CONTEXT._owner = root;
  CONTEXT._listen = null;
  try {
    return fn(root._value, root._index);
  } finally {
    CONTEXT._owner = owner;
    CONTEXT._listen = listen;
  }
}

/**
 * @struct
 * @template T, U, V, W
 * @constructor
 * @param {ReactiveIterator<T>} source
 * @param {function(ReadonlyArray<T>, Array<U>, Arguments<V, W>, Array<MapRoot<T>>): Array<U>} fn
 * @param {V | ReadonlySignal<V> | (function(): V)=} arg1
 * @param {ArgType=} type1
 * @param {W | ReadonlySignal<W> | (function(): W)=} arg2
 * @param {ArgType=} type2
 * @extends {ComputeArray<U>}
 * @implements {IComputeArray<U>}
 */
function ComputeMapArray(source, fn, arg1, type1, arg2, type2) {
  ComputeArray.call(this, source, fn, arg1, type1, arg2, type2);
  /**
   * @package
   * @type {Array<MapRoot<T>>}
   */
  this._roots = [];
}

extend(ComputeMapArray, ComputeArray);

/**
 * @package
 * @override
 * @returns {void}
 */
ComputeMapArray.prototype._apply = function () {
  var source = /** @type {ReactiveIterator<T>} */ (this._source1);
  this._value = this._next(source.peek(), this._value, this._args, this._roots);
};

/**
 * @interface
 * @template T
 * @extends {IData<ReadonlyArray<T>>}
 * @extends {IReactiveIterator<T>}
 */
function IDataArrayStub() { }

/**
 * @struct
 * @abstract
 * @constructor
 * @template T
 * @extends {ReactiveIterator<T>}
 * @implements {IDataArrayStub<T>}
 */
function DataArrayStub() { }

/**
 * @package
 * @type {T | Object}
 */
DataArrayStub.prototype._next;

/**
 * @package
 * @type {Receive | null}
 */
DataArrayStub.prototype._node1;

/**
 * @package
 * @type {number}
 */
DataArrayStub.prototype._node1slot;

/**
 * @package
 * @type {Array<Receive> | null}
 */
DataArrayStub.prototype._nodes;

/**
 * @package
 * @type {Array<number> | null}
 */
DataArrayStub.prototype._nodeslots;

/**
 * @package
 * @returns {void}
 */
DataArrayStub.prototype._dispose = function () { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
DataArrayStub.prototype._update = function (time) { };

/**
 * @interface
 * @template T
 * @extends {SignalArray<T>}
 * @extends {IDataArrayStub<T>}
 */
function IDataArray() { }

/**
 * @final
 * @struct
 * @template T
 * @constructor
 */
function Change() {
  /**
   * @package
   * @type {number}
   * Mutation flag
   */
  this.m = Mutation.None;
  /**
   * @package 
   * @type {number}
   * Index of mutation
   */
  this.i = -1;
  /**
   * @package
   * @type {number}
   * Number of added items
   */
  this.n = -1;
  /**
   * @package
   * @type {number}
   * Number of removed items
   */
  this.r = -1;
  /**
   * @package
   * @type {T | Array<T> | (function(T, T): number) | (function(Array<T>): Array<T>) | Array<(function(Array<T>): Array<T>)> | null | undefined}
   * Mutation data
   */
  this.d = null;
}

/**
 * @package
 * @param {number} mut 
 * @param {number=} index 
 * @param {number=} deletes
 * @param {number=} inserts
 * @param {T | Array<T> | (function(T, T): number) | (function(Array<T>): Array<T>)=} data
 * @returns {void}
 */
Change.prototype.add = function (mut, index, deletes, inserts, data) {
  if (this.m === Mutation.None) {
    this.m = mut;
    this.d = data;
    this.i = index || -1;
    this.r = deletes || -1;
    this.n = inserts || -1;
  } else if ((this.m & Mutation.Modify) && (mut & Mutation.Modify)) {
    if (this.m & Mutation.ModifyRange) {
      /** @type {Array<(function(Array<T>): Array<T>)>} */(this.d).push(data);
    } else {
      this.m |= Mutation.ModifyRange;
      this.d = /** @type {Array<(function(Array<T>): Array<T>)>} */([this.d, data]);
    }
  } else {
    throw new Error("Conflicting mutation");
  }
};

/**
 * @package
 * @returns {void}
 */
Change.prototype.reset = function () {
  this.m = Mutation.None;
  this.i =
    this.n =
    this.r = -1;
  this.d = null;
};

/**
 * @struct
 * @template T
 * @constructor
 * @param {Array<T>=} val
 * @extends {DataArrayStub<T>}
 * @implements {IDataArray<T>}
 */
function DataArray(val) {
  Data.call(/** @type {?} */(this), val || []);
  this._next = new Change();
  /**
   * @package
   * @type {Change}
   */
  this._change = new Change();
}

extend(DataArray, ReactiveIterator);
inherit(DataArray, Data);

/**
 * @package
 * @param {number} mut
 * @param {number=} index
 * @param {number=} deletes
 * @param {number=} inserts
 * @param {T | Array<T> | (function(T, T): boolean)=} data
 * @returns {void}
 */
DataArray.prototype._mutate = function (mut, index, deletes, inserts, data) {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    this._next.add(mut, index, deletes, inserts, data);
    if (CONTEXT._idle) {
      this._apply();
      if (this._state & State.Send) {
        reset();
        sendWillUpdate(this, TIME + 1);
        exec();
      }
    } else {
      this._state |= State.WillUpdate;
      CHANGES._add(this);
    }
  }
};

/**
 * @package
 * @returns {void}
 */
DataArray.prototype._apply = function () {
  var next = this._next;
  var mut = next.m;
  var args = next.d;
  var value = /** @type {Array<T>} */(this._value);
  switch (mut & Mutation.TypeMask) {
    case Mutations.Set:
      this._value = /** @type {ReadonlyArray<T>} */(args);
      break;
    case Mutations.Pop:
      value.pop();
      break;
    case Mutations.Push:
      if (mut & Mutation.InsertRange) {
        ArrayProto.push.apply(value, /** @type {Array<T>} */(args));
      } else {
        value.push(/** @type {T} */(args));
      }
      break;
    case Mutations.Reverse:
      value.reverse();
      break;
    case Mutations.Shift:
      value.shift();
      break;
    case Mutations.Sort:
      value.sort(/** @type {function(T, T): number} */(args));
      break;
    case Mutations.Splice:
      if (mut & Mutation.InsertRange) {
        ArrayProto.splice.apply(value, /** @type {Array<number | T>} */(args));
      } else if (mut & Mutation.InsertOne) {
        value.splice(next.i, next.r, /** @type {T} */(args))
      } else {
        value.splice(next.i, next.r);
      }
      break;
    case Mutations.Unshift:
      if (mut & Mutation.InsertRange) {
        ArrayProto.unshift.apply(value, /** @type {Array<T>} */(args));
      } else {
        value.unshift(/** @type {T} */(args));
      }
      break;
    case Mutations.Fill:
      // todo
      break;
    case Mutations.CopyWithin:
      // todo
      break;
    case Mutations.Modify:
      if (mut & Mutation.ModifyRange) {
        /** @type {Array<(function(Array<T>): Array<T>)>} */(args).forEach(function (callbackFn) {
        value = callbackFn(value);
      });
      } else {
        value = /** @type {function(Array<T>): Array<T>} */(args)(value);
      }
      this._value = value;
      break;
  }
  this._change.m = next.m;
  this._change.i = next.i;
  this._change.r = next.r;
  this._change.n = next.n;
  next.reset();
};

/**
 * @public
 * @param {ReadonlyArray<T>} val
 * @returns {void}
 */
DataArray.prototype.set = function (val) {
  this._mutate(Mutations.Set | Mutation.Assign, -1, -1, -1, val);
};

/**
 * @public
 * @param {function(Array<T>): Array<T>} callbackFn
 * @returns {void}
 */
DataArray.prototype.modify = function (callbackFn) {
  this._mutate(Mutations.Modify | Mutation.Modify, -1, -1, -1, callbackFn);
};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.pop = function () {
  this._mutate(Mutations.Pop | Mutation.RemoveOne, this._value.length - 1, 1, 0);
};

/**
 * @public
 * @param {...T} elementN
 * @returns {void}
 */
DataArray.prototype.push = function (elementN) {
  /**
   * @type {number}
   */
  var mut;
  /** @type {T | Array<T>} */
  var args;
  /** @type {number} */
  var len = arguments.length;
  if (len > 0) {
    if (len === 1) {
      args = elementN;
      mut = Mutation.InsertOne;
    } else {
      args = new Array(len);
      for (var i = 0; i < len; i++) {
        args[i] = arguments[i];
      }
      mut = Mutation.InsertRange;
    }
    this._mutate(Mutations.Push | mut, this._value.length, 0, len, args);
  }
};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.reverse = function () {
  this._mutate(Mutations.Reverse | Mutation.OrderReverse);
};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.shift = function () {
  this._mutate(Mutations.Shift | Mutation.RemoveOne, 0, 1, 0);
};

/**
 * @public
 * @param {function(T,T): number=} compareFn
 * @returns {void}
 */
DataArray.prototype.sort = function (compareFn) {
  this._mutate(Mutations.Sort | Mutation.OrderSort, void 0, 0, 0, compareFn);
};

/**
 * @public
 * @param {number} start
 * @param {number=} deleteCount
 * @param {...T} items
 * @returns {void}
 */
DataArray.prototype.splice = function (start, deleteCount, items) {
  /**
   * @type {T | Array<number | T>} 
   */
  var args;
  /**
   * @const
   * @type {number}
   */
  var len = arguments.length;
  if (len > 1) {
    /**
     * @type {number}
     */
    var mut = Mutation.None;
    if (deleteCount == null || deleteCount < 0) {
      deleteCount = 0;
    } else if (deleteCount > 0) {
      if (deleteCount > 1) {
        mut |= Mutation.RemoveRange;
      } else {
        mut |= Mutation.RemoveOne;
      }
    }
    if (len > 2) {
      if (len === 3) {
        args = items;
        mut |= Mutation.InsertOne;
      } else {
        args = new Array(len);
        for (var i = 0; i < len; i++) {
          args[i] = arguments[i];
        }
        mut |= Mutation.InsertRange;
      }
    }
    if (mut !== Mutation.None) {
      this._mutate(Mutations.Splice | mut, start, deleteCount, len - 2, args);
    }
  }
};

/**
 * @public
 * @param {...T} elementN
 * @returns {void}
 */
DataArray.prototype.unshift = function (elementN) {
  /** @type {T | Array<T>} */
  var args;
  /** @type {number} */
  var len = arguments.length;
  if (len > 0) {
    /** 
     * @type {number}
     */
    var mut;
    if (len === 1) {
      args = elementN;
      mut = Mutation.InsertOne;
    } else {
      args = new Array(len);
      for (var i = 0; i < len; i++) {
        args[i] = arguments[i];
      }
      mut = Mutation.InsertRange;
    }
    this._mutate(Mutations.Unshift | mut, 0, 0, len, args);
  }
};

/**
 * @template T
 * @param {Array<T>=} val
 * @returns {SignalArray<T>}
 */
function array(val) {
  return new DataArray(val);
}

export {
  array,
  DataArray,
  ComputeReduce,
  ComputeArray,
  ComputeMapArray
}