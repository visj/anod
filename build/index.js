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
 * @returns {DisposableSignal<void>}
 */
SignalIterator.prototype.forEach = function (callbackFn) {};

/**
 * @param {T | ReadonlySignal<T> | (function(): T)} searchElement
 * @param {number | ReadonlySignal<number> | (function(): number)=} fromIndex
 * @returns {ReadonlySignal<boolean>}
 */
SignalIterator.prototype.includes = function (searchElement, fromIndex) {};

/**
 * @param {T | ReadonlySignal<T> | (function(): T)} searchElement
 * @param {number | ReadonlySignal<number> | (function(): number)=} fromIndex
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
 * @param {function(T, number): U} callbackFn
 * @returns {SignalIterator<U>}
 */
SignalIterator.prototype.map = function (callbackFn) {};

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
  Unstable: 131072
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
    item._update(time);
    items[i] = null;
  }
  queue._count = 0;
}

function drainReceive(queue, time) {
  var items = queue._items;
  for (var i = 0; i < queue._count; i++) {
    var item = items[i];
    sendMayUpdate(item, time);
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
function drainMayUpdate(queue, time) {
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
 * @type {Queue<Send>}
 */
var RECEIVES = new Queue();
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
  var source1 = receive._source1;
  var sources = receive._sources;
  var sendslot = -1;
  var receiveslot = source1 === null ? -1 : sources === null ? 0 : sources.length;
  if (!(receive._state & State.Initial) && receiveslot >= 0) {
    if (
      (source1 === send) || (receiveslot > 0 && (
        receiveslot === 1 ?
          sources[0] === send :
          (sources[receiveslot - 1] === send || sources[receiveslot - 2] === send)
      ))) {
      return;
    }
  }
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
    RECEIVES._count !== 0 ||
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
    if (RECEIVES._count !== 0) {
      drainReceive(RECEIVES, time);
    }
    if (COMPUTES._count !== 0) {
      drainMayUpdate(COMPUTES, time);
    }
    if (UPDATES._count !== 0) {
      drainMayUpdate(UPDATES, time);
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
 * @param {boolean} dispose
 * @returns {void}
 */
function disposeScope(scope, dispose) {
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
    if (dispose) {
      scope._children = null;
    } else {
      children.length = 0;
    }
  }
  if (state & State.Cleanup) {
    var cleanups = scope._cleanups;
    for (len = cleanups.length - 1; len >= 0; len--) {
      cleanups[len](true);
    }
    scope._state &= ~State.Cleanup;
    if (dispose) {
      scope._cleanups = null;
    } else {
      cleanups.length = 0;
    }
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

/** @typedef {function(boolean): void} */
var Cleanup;

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
 * @type {Array<Cleanup> | null}
 */
Scope.prototype._cleanups;

/**
 * @package
 * @param {Receive} child 
 * @returns {void}
 */
Scope.prototype._parent = function (child) { };

/**
 * @package
 * @param {Cleanup} cleanup 
 * @returns {void}
 */
Scope.prototype._cleanup = function (cleanup) { };

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
   * @type {Array<Cleanup> | null}
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
    disposeScope(this, true);
    this._state = State.Disposed;
  }
};

/**
 * @package
 * @param {Receive} child 
 * @returns {void}
 */
Root.prototype._parent = function (child) {
  this._state |= State.Scope;
  if (this._children === null) {
    this._children = [child];
  } else {
    this._children.push(child);
  }
};

/**
 * @package
 * @param {Cleanup} cleanup
 * @returns {void}
 */
Root.prototype._cleanup = function (cleanup) {
  this._state |= State.Cleanup;
  if (this._cleanups === null) {
    this._cleanups = [cleanup];
  } else {
    this._cleanups.push(cleanup);
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
      var len = nodes.length;
      if (slot !== len) {
        nodes[slot] = last;
        nodeslots[slot] = lastslot;
        if (lastslot === -1) {
          last._source1slot = slot;
        } else {
          last._sourceslots[lastslot] = slot;
        }
      }
      if (len === 0) {
        send._state &= ~State.SendMany;
      }
    }
  }
}

/**
 * @param {Receive} rec
 * @param {number} slot
 * @returns {void}
 */
function removeSender(rec, slot) {
  if (rec._state !== State.Disposed) {
    if (slot === -1) {
      rec._source1 = null;
      rec._state &= ~State.ReceiveOne;
    } else {
      var sources = rec._sources;
      var sourceslots = rec._sourceslots;
      var last = sources.pop();
      var lastslot = sourceslots.pop();
      var len = sources.length;
      if (slot !== len) {
        sources[slot] = last;
        sourceslots[slot] = lastslot;
        if (lastslot === -1) {
          last._node1slot = slot;
        } else {
          last._nodeslots[lastslot] = slot;
        }
      }
      if (len === 0) {
        rec._state &= ~State.ReceiveMany;
      }
    }
    if (!(rec._state & State.Receive)) {
      rec._detach();
    }
  }
}

/**
 * @param {Array<Receive>} children
 * @param {number} time
 * @returns {void}
 */
function sendMayDispose(children, time) {
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
function sendWillDispose(children, time) {
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
  var state = send._state;
  if (state & State.SendOne) {
    if (send._node1._time < time) {
      send._node1._receiveWillUpdate(time);
    }
  }
  if (state & State.SendMany) {
    /** @type {Receive} */
    var node;
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
 * @param {boolean} dispose
 * @returns {void}
 */
function disposeReceiver(node, dispose) {
  var state = node._state;
  if (state & State.ReceiveOne) {
    removeReceiver(node._source1, node._source1slot);
    node._source1 = null;
  }
  if (state & State.ReceiveMany) {
    var len = node._sources.length;
    for (var i = 0; i < len; i++) {
      removeReceiver(node._sources[i], node._sourceslots[i]);
    }
    if (dispose) {
      node._sources = null;
      node._sourceslots = null;
    } else {
      node._sources.length = 0;
      node._sourceslots.length = 0;
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
    node._state &= ~State.MayDispose;
    var owner = node._owner;
    if (owner._state & (State.WillUpdate | State.MayUpdate | State.MayDispose)) {
      refresh(owner, time);
    }
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
        (state & State.WillUpdate) ||
        (state & State.MayUpdate && source._utime === time)
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
          (state & State.WillUpdate) ||
          (state & State.MayUpdate && source._utime === time)
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
 * @param {function(...?): void} fn
 * @param {SignalOptions=} opts
 * @param {State=} flags
 * @extends {Root}
 * @implements {IEffect}
 */
function Effect(fn, opts, flags) {
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
   * @type {Array<Receive> | null}
   */
  this._children = null;
  /**
   * @package
   * @type {Array<Cleanup> | null}
   */
  this._cleanups = null;
  /**
   * @package
   * @type {Receive | null}
   */
  this._owner = null;
  /**
   * @package
   * @type {(function(...?): void) | null}
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
  if (CONTEXT._owner !== null) {
    CONTEXT._owner._parent(this);
  }
}

extend(Effect, Root);

/**
 * @package
 * @override
 * @returns {void}
 */
Effect.prototype._dispose = function () {
  var state = this._state;
  if (state !== State.Disposed) {
    if (state & (State.Scope | State.Cleanup)) {
      disposeScope(this, true);
    }
    if (state & State.Receive) {
      disposeReceiver(this, true);
    }
    this._next =
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
    sendMayDispose(this._children, time);
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
    sendWillDispose(this._children, time);
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
    sendMayDispose(this._children, time);
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
  EFFECTS._add(this);
  if (this._state & State.Scope) {
    sendWillDispose(this._children, time);
  }
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
  this._time = time;
  var state = this._state;
  var idle = CONTEXT._idle;
  var owner = CONTEXT._owner;
  var listen = CONTEXT._listen;
  this._state =
    (state | State.Updating) &
    ~(State.Clearing | State.MayDispose | State.MayUpdate | State.WillUpdate);
  CONTEXT._owner = CONTEXT._listen = null;
  if (!(state & State.Initial) && state & (State.Scope | State.Cleanup)) {
    disposeScope(this, false);
  }
  if (state & (State.Initial | State.Unstable)) {
    if (state & State.Initial) {
      this._state &= ~State.Initial;
    } else {
      disposeReceiver(this, false);
    }
    CONTEXT._listen = this;
  }
  if (idle) {
    reset();
    CONTEXT._idle = false;
  }
  CONTEXT._owner = this;
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
  if (CONTEXT._owner !== null) {
    CONTEXT._owner._parent(this);
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
    this._value =
      this._next =
      this._compare = null;
    if (state & State.Send) {
      disposeSender(this);
    }
    if (state & State.Receive) {
      disposeReceiver(this, true);
    }
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
      disposeReceiver(this, false);
    }
    CONTEXT._listen = this;
  }
  var prev = this._value;
  if (idle) {
    reset();
    CONTEXT._idle = false;
  }
  try {
    this._apply();
    if (state & State.Send && prev !== this._value) {
      sendWillUpdate(this, time);
      if (RECEIVES._count !== 0) {
        drainReceive(RECEIVES, time);
      }
    }
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
    RECEIVES._add(this);
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
      RECEIVES._add(this);
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
        if (this._next === VOID) {
          this._next = val;
          this._state |= State.WillUpdate;
          CHANGES._add(this);
        } else if (val !== this._next) {
          throw new Error("Conflicting values");
        }
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
    this._value =
      this._next = null;
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
 * @public
 * @param {function(): void} fn
 * @param {SignalOptions=} opts
 * @returns {DisposableSignal}
 */
function effect(fn, opts) {
  var effect = new Effect(fn, opts);
  effect._update(TIME);
  return effect;
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
 * @param {Cleanup} fn
 * @returns {void}
 */
function cleanup(fn) {
  if (CONTEXT._owner !== null) {
    CONTEXT._owner._cleanup(fn);
  }
}

/**
 * @returns {void}
 */
function stable() {
  if (CONTEXT._owner !== null) {
    CONTEXT._owner._state &= ~State.Unstable;
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
  Cleanup,
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
  sendWillDispose,
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
  effect,
  batch,
  sample,
  cleanup,
  stable
};
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
   * @type {T}
   */
  this._arg1 = arg1;
  /**
   * @package
   * @type {ArgType}
   */
  this._type1 = type1 != null ? type1 : ArgType.NotReactive;
  /**
   * @package
   * @type {U}
   */
  this._arg2 = arg2;
  /**
   * @package
   * @type {ArgType}
   */
  this._type2 = type2 != null ? type2 : ArgType.NotReactive;
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
 * @const
 * @enum {number}
 */
var Mut = {
  Mask: 15,
  InsertOne: 16,
  RemoveOne: 32,
  InsertMany: 64,
  RemoveMany: 128,
  RemoveOrInsert: 16 | 32 | 64 | 128,
  HeadOnly: 256,
  TailOnly: 512,
  Reorder: 1024,
};

/**
 * @const
 * @enum {number}
 */
var Mutation = {
  None: 0,
  Set: 1,
  Modify: 2,
  Pop: 3 | Mut.RemoveOne | Mut.TailOnly,
  PushOne: 4 | Mut.InsertOne | Mut.TailOnly,
  PushMany: 5 | Mut.InsertMany | Mut.TailOnly,
  Reverse: 6 | Mut.Reorder,
  Shift: 7 | Mut.InsertOne | Mut.HeadOnly,
  Sort: 8 | Mut.Reorder,
  Splice: 9,
  UnshiftOne: 10 | Mut.InsertOne | Mut.HeadOnly,
  UnshiftMany: 11 | Mut.InsertOne | Mut.HeadOnly,
  Fill: 12,
  CopyWithin: 13,
  Extension: 14,
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
  var length = source.length;
  if (index < 0) {
    index += length;
  }
  return index < length ? source[index] : void 0;
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
  return source.concat(args.arg1());
}

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {Array<T>} value
 * @param {Arguments<T | Array<T>, undefined>} args
 * @returns {Array<T>}
 */
function concatVariadicIterator(source, value, args) {
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
  return Array.prototype.concat.apply(source, slice);
}

/**
 * @public
 * @param {...(T | Array<T> | ReadonlySignal<T> | ReadonlySignal<Array<T>>)} items
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.concat = function (items) {
  /** @type {ComputeArray<T>} */
  var array;
  var length = arguments.length;
  if (length === 0) {
    array = new ComputeArray(this, copyIterator);
  } else {
    /**
     * @type {Array<T | Array<T> | ReadonlySignal<T> | ReadonlySignal<Signal<T>>>}
     */
    var args;
    /** @type {ArgType} */
    var type;
    /**
     * @type {function(ReadonlyArray<T>, Array<T>, Arguments<T | Array<T>, undefined>): Array<T>}
     */
    var iteratorFn;
    if (length === 1) {
      args = items;
      type = argType(items);
      iteratorFn = concatIterator;
    } else {
      args = new Array(length);
      for (var i = 0; i < length; i++) {
        args[i] = arguments[i];
      }
      type = ArgType.NotReactive;
      iteratorFn = concatVariadicIterator;
    }
    array = new ComputeArray(
      this,
      iteratorFn,
      args,
      type
    );
  }
  return array;
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
 * @param {Arguments<(function(T, number): void), undefined>} args
 * @returns {void}
 */
function forEachIterator(source, args) {
  var length = source.length;
  var callbackFn = args._arg1;
  for (var i = 0; i < length; i++) {
    callbackFn(source[i], i);
  }
}

/**
 * @param {function(T, number): void} callbackFn
 * @returns {DisposableSignal<void>}
 */
ReactiveIterator.prototype.forEach = function (callbackFn) {
  var effect = new EffectReduce(
    this,
    forEachIterator,
    callbackFn
  );
  effect._update(TIME);
  return effect;
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {boolean} prev
 * @param {Arguments<T, number>} args
 * @returns {boolean}
 */
function includesIterator(source, prev, args) {
  var searchElement = args.arg1();
  if (args._arg2 === ArgType.Void) {
    return source.includes(searchElement);
  }
  var fromIndex = args.arg2();
  return source.includes(searchElement, fromIndex);
}

/**
 * @param {T | ReadonlySignal<T> | (function(): T)} searchElement
 * @param {number | ReadonlySignal<number> | (function(): number)=} fromIndex
 * @returns {ReadonlySignal<boolean>}
 */
ReactiveIterator.prototype.includes = function (searchElement, fromIndex) {
  return new ComputeReduce(
    this,
    includesIterator,
    /** @type {T} */(searchElement),
    argType(searchElement),
    /** @type {number} */(fromIndex),
    arguments.length < 2 ? ArgType.Void : argType(fromIndex),
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
  return new ComputeReduce(
    this,
    joinIterator,
    separator,
    argType(separator)
  );
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
  return fromIndex == null ? source.lastIndexOf(searchElement) : source.lastIndexOf(searchElement, fromIndex);
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
 * @param {ReadonlyArray<T>} source
 * @param {Array<U>} values
 * @param {Arguments<(function(T, number): U), Array<T>>} args
 * @returns {Array<U>}
 */
function mapIterator(source, values, args) {
  /** @type {number} */
  var i;
  /** @type {T} */
  var val;
  var slen = source.length;
  var vlen = values.length;
  var cache = args._arg2;
  var callbackFn = args._arg1;
  if (vlen === 0) {
    if (slen > 0) {
      for (i = 0; i < slen; i++) {
        val = source[i];
        cache[i] = val;
        values[i] = callbackFn(val, i);
      }
    }
  } else if (slen === 0) {
    if (vlen > 0) {
      cache.length = 0;
      values.length = 0;
    }
  } else {
    var minlen = slen < vlen ? slen : vlen;
    for (i = 0; i < minlen; i++) {
      val = source[i];
      if (val !== cache[i]) {
        cache[i] = val;
        values[i] = callbackFn(val, i);
      }
    }
    if (slen > vlen) {
      for (; i < slen; i++) {
        val = source[i];
        cache[i] = val;
        values[i] = callbackFn(val, i);
      }
    } else if (vlen > slen) {
      cache.length = slen;
      values.length = slen;
    }
  }
  return values;
}

/**
 * @template U
 * @param {function(T, number): U} callbackFn
 * @returns {SignalIterator<U>}
 */
ReactiveIterator.prototype.map = function (callbackFn) {
  return new ComputeArray(
    this,
    mapIterator,
    callbackFn,
    ArgType.NotReactive,
    []
  );
};

/**
 * @template T, U, V
 * @param {ReadonlyArray<T>} source
 * @param {V} prev
 * @param {Arguments<(function((T | U), T, number): V), U | undefined>} args
 * @param {number} length
 * @returns {V}
 */
function reduceIterator(source, prev, args, length) {
  var i = 0;
  var initialValue;
  if (args._type2 === ArgType.Void) {
    if (length === 0) {
      throw new TypeError("Reduce of empty array with no initial value");
    }
    initialValue = source[i++];
  } else {
    initialValue = args.arg2();
  }
  var callbackFn = args._arg1;
  for (; i < length; i++) {
    initialValue = callbackFn(initialValue, source[i], i);
  }
  return initialValue;
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
 * @param {number} length
 * @returns {boolean}
 */
function someIterator(source, value, args, length) {
  var callbackFn = args.arg1();
  for (var i = 0; i < length; i++) {
    if (callbackFn(source[i], i)) {
      return true;
    }
  }
  return false;
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
 * @extends {ICompute<T>}
 */
function IComputeReduce() { }

/**
 * @struct
 * @template T, U, V, W
 * @constructor
 * @param {ReactiveIterator<T>} source
 * @param {function(Array<T>, U, Arguments<V, W>, number): U} fn
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
  var array = source.peek();
  var length = array.length;
  this._value = this._next(array, this._value, this._args, length);
};

/**
 * @interface
 * @template T
 * @extends {IEffect}
 */
function IEffectReduce() { }

/**
 * @struct
 * @template T, V, W
 * @constructor
 * @param {ReactiveIterator<T>} source
 * @param {function(Array<T>, Arguments<V, W>): void} fn
 * @param {V | Signal<V> | (function(): V)=} arg1
 * @param {ArgType=} type1
 * @param {W | Signal<W> | (function(): W)=} arg2
 * @param {ArgType=} type2
 * @extends {Effect}
 * @implements {IEffectReduce}
 */
function EffectReduce(source, fn, arg1, type1, arg2, type2) {
  Effect.call(this, fn);
  /**
   * @package
   * @type {Arguments<V, W>}
   */
  this._args = new Arguments(arg1, type1, arg2, type2);
  connect(source, this);
}

extend(EffectReduce, Effect);

/**
 * @package
 * @override
 * @returns {void}
 */
EffectReduce.prototype._apply = function () {
  var source = /** @type {ReactiveIterator<T>} */ (this._source1);
  this._next(source.peek(), this._args);
};

/**
 * This only exists because Closure Compiler
 * cannot handle multiple prototype inheritance
 * @struct
 * @abstract
 * @template T, V, W
 * @constructor
 * @extends {ReactiveIterator<T>}
 * @implements {IReactiveIterator<T>}
 */
function ComputeArrayStub() { }

/**
 * @package
 * @type {Receive | null}
 */
ComputeArrayStub.prototype._node1;

/**
 * @package
 * @type {number}
 */
ComputeArrayStub.prototype._node1slot;

/**
 * @package
 * @type {Array<Receive> | null}
 */
ComputeArrayStub.prototype._nodes;

/**
 * @package
 * @type {Array<number> | null}
 */
ComputeArrayStub.prototype._nodeslots;

/**
 * @package
 * @type {(function(...?): T) | null}
 */
ComputeArrayStub.prototype._next;

/**
 * @package
 * @type {Receive | null}
 */
ComputeArrayStub.prototype._owner;

/**
 * @package
 * @type {number}
 */
ComputeArrayStub.prototype._time;

/**
 * @package
 * @type {number}
 */
ComputeArrayStub.prototype._utime;

/**
 * @package
 * @type {number}
 */
ComputeArrayStub.prototype._dtime;

/**
 * @package
 * @type {Send | null}
 */
ComputeArrayStub.prototype._source1;

/**
 * @package
 * @type {number}
 */
ComputeArrayStub.prototype._source1slot;

/**
 * @package
 * @type {Array<Send> | null | undefined}
 */
ComputeArrayStub.prototype._sources;

/**
 * @package
 * @type {Array<number> | null | undefined}
 */
ComputeArrayStub.prototype._sourceslots;

/**
 * @package 
 * @type {Arguments<V, W>}
 */
ComputeArrayStub.prototype._args;

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
 * @param {function(ReadonlyArray<T>, Array<U>, Arguments<V, W>): Array<U>} fn
 * @param {V | ReadonlySignal<V> | (function(): V)=} arg1
 * @param {ArgType=} type1
 * @param {W | ReadonlySignal<W> | (function(): W)=} arg2
 * @param {ArgType=} type2
 * @extends {ComputeArrayStub<U, V, W>}
 * @implements {IComputeArray<U>}
 */
function ComputeArray(source, fn, arg1, type1, arg2, type2) {
  ComputeReduce.call(/** @type {?} */(this), source, fn, arg1, type1, arg2, type2);
  this._value = [];
}

extend(ComputeArray, ReactiveIterator);
inherit(ComputeArray, ComputeReduce);

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
 * @const
 * @enum {number}
 */
var MutPos = {
  Mutation: 0,
  Index: 1,
  Inserts: 2,
  Removes: 3,
  NextMutation: 4,
  NextIndex: 5,
  NextInserts: 6,
  NextRemoves: 7
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
 * @struct
 * @template T
 * @constructor
 * @param {Array<T>=} val
 * @extends {DataArrayStub<T>}
 * @implements {IDataArray<T>}
 */
function DataArray(val) {
  /**
   * @package
   * @type {number}
   */
  this._state = State.Respond;
  /**
   * @package
   * @type {ReadonlyArray<T>}
   */
  this._value = val || [];
  /**
   * @package
   * @type {T}
   */
  this._next = void 0;
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
   * @type {Array<number>}
   */
  this._mutation = [0, 0, 0, 0, 0, 0, 0, 0];
}

extend(DataArray, ReactiveIterator);
inherit(DataArray, Data);

/**
 * @package
 * @param {number} mut
 * @param {number=} index
 * @param {number=} removes
 * @param {number=} inserts
 * @param {T | Array<T> | (function(T, T): boolean)=} data
 * @returns {void}
 */
DataArray.prototype._mutate = function (mut, index, removes, inserts, data) {
  var mutation = this._mutation;
  if (mutation[MutPos.NextMutation] !== Mutation.None) {
    throw new Error("Conflicting values");
  }
  mutation[MutPos.NextMutation] = mut;
  if (index != null) {
    mutation[MutPos.NextIndex] = index;
  }
  if (inserts != null) {
    mutation[MutPos.NextInserts] = inserts;
  }
  if (removes != null) {
    mutation[MutPos.NextRemoves] = removes;
  }
  if (data != null) {
    this._next = data;
  }
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
};

/**
 * @package
 * @returns {void}
 */
DataArray.prototype._apply = function () {
  var mutation = this._mutation;
  var mut = mutation[MutPos.NextMutation];
  var args = this._next;
  var value = /** @type {Array<T>} */(this._value);
  switch (mut & Mut.Mask) {
    case Mutation.Set & Mut.Mask:
      this._value = /** @type {ReadonlyArray<T>} */(args);
      break;
    case Mutation.Pop & Mut.Mask:
      value.pop();
      break;
    case Mutation.PushOne & Mut.Mask:
      value.push(/** @type {T} */(args));
      break;
    case Mutation.PushMany & Mut.Mask:
      Array.prototype.push.apply(value, /** @type {Array<T>} */(args));
      break;
    case Mutation.Reverse & Mut.Mask:
      value.reverse();
      break;
    case Mutation.Shift & Mut.Mask:
      value.shift();
      break;
    case Mutation.Sort & Mut.Mask:
      value.sort(/** @type {function(T, T): number} */(args));
      break;
    case Mutation.Splice & Mut.Mask:
      if (mut & Mut.InsertMany) {
        Array.prototype.splice.apply(value, /** @type {Array<number | T>} */(args));
      } else if (mut & Mut.InsertOne) {
        value.splice(mutation[MutPos.NextIndex], mutation[MutPos.NextRemoves], /** @type {T} */(args))
      } else {
        value.splice(mutation[MutPos.NextIndex], mutation[MutPos.NextRemoves]);
      }
      break;
    case Mutation.UnshiftOne & Mut.Mask:
      value.unshift(/** @type {T} */(args));
      break;
    case Mutation.UnshiftMany & Mut.Mask:
      Array.prototype.unshift.apply(value, /** @type {Array<T>} */(args));
      break;
    case Mutation.Fill & Mut.Mask:
      // todo
      break;
    case Mutation.CopyWithin & Mut.Mask:
      // todo
      break;
    case Mutation.Modify & Mut.Mask:
      this._value = /** @type {function(Array<T>): Array<T>} */(args)(value);
      break;
  }
  mutation[MutPos.Mutation] = mutation[MutPos.NextMutation];
  mutation[MutPos.Index] = mutation[MutPos.NextIndex];
  mutation[MutPos.Inserts] = mutation[MutPos.NextInserts];
  mutation[MutPos.Removes] = mutation[MutPos.NextRemoves];
  mutation[MutPos.NextMutation] =
    mutation[MutPos.NextIndex] =
    mutation[MutPos.NextInserts] =
    mutation[MutPos.NextRemoves] = Mutation.None;
};

/**
 * @public
 * @param {ReadonlyArray<T>} val
 * @returns {void}
 */
DataArray.prototype.set = function (val) {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    this._mutate(Mutation.Set, 0, 0, 0, val);
  }
};

/**
 * @public
 * @param {function(Array<T>): Array<T>} callbackFn
 * @returns {void}
 */
DataArray.prototype.modify = function (callbackFn) {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    this._mutate(Mutation.Modify, 0, 0, 0, callbackFn);
  }
};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.pop = function () {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    this._mutate(Mutation.Pop, this._value.length - 1, 1, 0);
  }
};

/**
 * @public
 * @param {...T} elementN
 * @returns {void}
 */
DataArray.prototype.push = function (elementN) {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    /** @type {number} */
    var len = arguments.length;
    if (len > 0) {
      /**
       * @type {number}
       */
      var mut;
      /** @type {T | Array<T>} */
      var args;
      if (len === 1) {
        args = elementN;
        mut = Mutation.PushOne;
      } else {
        args = new Array(len);
        for (var i = 0; i < len; i++) {
          args[i] = arguments[i];
        }
        mut = Mutation.PushMany;
      }
      this._mutate(mut, this._value.length, 0, len, args);
    }
  }
};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.reverse = function () {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    this._mutate(Mutation.Reverse);
  }
};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.shift = function () {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    this._mutate(Mutation.Shift, 0, 1, 0);
  }
};

/**
 * @public
 * @param {function(T,T): number=} compareFn
 * @returns {void}
 */
DataArray.prototype.sort = function (compareFn) {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    this._mutate(Mutation.Sort, void 0, 0, 0, compareFn);
  }
};

/**
 * @public
 * @param {number} start
 * @param {number=} deleteCount
 * @param {...T} items
 * @returns {void}
 */
DataArray.prototype.splice = function (start, deleteCount, items) {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
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
      var mut = Mutation.Splice;
      if (deleteCount == null || deleteCount < 0) {
        deleteCount = 0;
      } else if (deleteCount > 0) {
        if (deleteCount > 1) {
          mut |= Mut.RemoveMany;
        } else {
          mut |= Mut.RemoveOne;
        }
      }
      if (len > 2) {
        if (len === 3) {
          args = items;
          mut |= Mut.InsertOne;
        } else {
          args = new Array(len);
          for (var i = 0; i < len; i++) {
            args[i] = arguments[i];
          }
          mut |= Mut.InsertMany;
        }
      }
      if (mut & Mut.RemoveOrInsert) {
        this._mutate(mut, start, deleteCount, len - 2, args);
      }
    }
  }
};

/**
 * @public
 * @param {...T} elementN
 * @returns {void}
 */
DataArray.prototype.unshift = function (elementN) {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
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
        mut = Mutation.UnshiftOne;
      } else {
        args = new Array(len);
        for (var i = 0; i < len; i++) {
          args[i] = arguments[i];
        }
        mut = Mutation.UnshiftMany;
      }
      this._mutate(mut, 0, 0, len, args);
    }
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
  ComputeArray
}