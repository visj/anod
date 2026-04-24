import {
  Disposer,
  Owner,
  Sender,
  Receiver,
  ISignal,
  ICompute,
  IEffect
} from "./types.js";

/* Sender flags (bits 0-6) — readable on any Sender (Signal or Compute).
 * Bits 7+ on a plain Signal are free for extension (e.g. mod encoding
 * in anod-list). */
const FLAG_STALE = 1 << 0;
const FLAG_PENDING = 1 << 1;
const FLAG_SCHEDULED = 1 << 2;
const FLAG_DISPOSED = 1 << 3;
const FLAG_ERROR = 1 << 4;
const FLAG_RELAY = 1 << 5;
const FLAG_WEAK = 1 << 6;

/* Receiver flags (bits 7+) — only valid on Compute/Effect nodes. */
const FLAG_INIT = 1 << 7;
const FLAG_SETUP = 1 << 8;
const FLAG_LOADING = 1 << 9;
const FLAG_DEFER = 1 << 10;
const FLAG_STABLE = 1 << 11;
const FLAG_EQUAL = 1 << 12;
const FLAG_NOTEQUAL = 1 << 13;
const FLAG_ASYNC = 1 << 14;
const FLAG_BOUND = 1 << 15;
const FLAG_WAITER = 1 << 16;
const FLAG_CHANNEL = 1 << 17;
const FLAG_BLOCKED = 1 << 18;
const FLAG_LOCK = 1 << 19;
const FLAG_SUSPEND = 1 << 20;
const FLAG_PANIC = 1 << 21;
const FLAG_SINGLE = 1 << 22;
const FLAG_EAGER = 1 << 23;
const FLAG_PURGE = 1 << 24;

/** Error type constants for { error, type } POJOs. */
const REFUSE = 1;
const PANIC = 2;
const FATAL = 3;

/* Option flags */
const OPT_DEFER = FLAG_DEFER;
const OPT_STABLE = FLAG_STABLE;
const OPT_SETUP = FLAG_SETUP;
const OPT_WEAK = FLAG_WEAK;
const OPT_EAGER = FLAG_EAGER;

const OPTIONS = OPT_DEFER | OPT_STABLE | OPT_SETUP | OPT_WEAK | OPT_EAGER;


/* Async dispatch kinds — asyncKind() returns one of these so callers can
 * branch without re-sniffing the value. */
const ASYNC_PROMISE = 1;
const ASYNC_ITERATOR = 2;
const ASYNC_SYNC = 3;

/**
 * A thenable that silently swallows .then() callbacks. When an async
 * node is disposed or re-run mid-flight, `await c.suspend(promise)`
 * resolves to REGRET — the awaiter calls `.then()` on it, which does
 * nothing, so the continuation never resumes and the closure is GC'd.
 * @const
 */
const REGRET = { then: function () { } };

/** @const */
const NOOP = function () { };

/**
 * Thrown (synchronously) when an async node's fn returns a non-sync
 * value (promise/iterator) without having called `c.suspend()`. This
 * catches the common mistake of forgetting `c.suspend()`, which would
 * let code continue executing after the node is disposed.
 * @const
 */
const ASSERT_DISPOSED = "Cannot access a disposed node";

/**
 * @type {Array<Sender | number>}
 */
var VSTACK = [];
/** @type {number} Tail pointer into VSTACK */
var VCOUNT = 0;
/** @type {number} Count of existing deps confirmed during dynamic re-execution */
var REUSED = 0;

/**
 * Pre-allocated stack for iterative checkRun.
 * CSTACK holds node references, CINDEX holds dep iteration positions.
 * @type {Array<Compute>}
 */
var CSTACK = [];
/**
 * Position encoding: -1 = was checking dep1, >= 0 = index in _deps array.
 * @type {Array<number>}
 */
var CINDEX = [];
/**
 * Global stack pointer for checkRun. Supports re-entrant calls via
 * base-pointer saving (each call saves CTOP on entry).
 * @type {number}
 */
var CTOP = 0;

/**
 * Pre-allocated stack for batching deps during setup execution.
 * During FLAG_SETUP _update, deps are written here as flat [sender, ...]
 * entries. After the fn returns, _deps is created via slice() with
 * exact capacity — avoiding V8's push-based over-allocation.
 * @type {Array<Sender>}
 */
var DSTACK = [];
/** @type {number} Tail pointer into DSTACK */
var DCOUNT = 0;
/**
 * Base pointer for the current node's deps region in DSTACK.
 * Saved/restored for nesting (compute A's fn triggers compute B's setup).
 * @type {number}
 */
var DBASE = 0;

/**
 * @type {number}
 */
var TIME = 1;

/**
 * @type {boolean}
 */
var IDLE = true;

/** Whether a microtask flush is already scheduled. */
var POSTING = false;

/**
 * @type {number}
 */
var SEED = 1;

/**
 * @type {number}
 */
var VERSION = 0;

/**
 * @type {number}
 */
var TRANSACTION = 0;

/** @const @type {Array<Disposer>} */
var DISPOSES = [];

var DISPOSER_COUNT = 0;

/**
 * Writable senders (Signal + writable Compute) pending an assignment
 * during a batch. Paired with PAYLOADS — both are indexed by a shared
 * tail pointer and cleared back to null on drain. Sized to the longest
 * queued burst the session has seen.
 * @const
 * @type {Array<Sender>}
 */
var SENDERS = [];
/**
 * @const
 * @type {Array}
 */
var PAYLOADS = [];
/** @const @type {Array<Function>} */
var UPDATES = [];
var SENDER_COUNT = 0;

/** @const @type {Array<Compute>} */
var COMPUTES = [];

var COMPUTE_COUNT = 0;

/** @const @type {Array<number>} */
var LEVELS = [0, 0, 0, 0];
/** @const @type {Array<Array<Effect>>} */
var SCOPES = [[], [], [], []];

var SCOPE_COUNT = 0;

/** @const @type {Array<Effect>} */
var RECEIVERS = [];

var RECEIVER_COUNT = 0;

/** @const @type {Array<Sender>} */
var PURGES = [];
var PURGE_COUNT = 0;

/**
 * @constructor
 * @implements {Owner}
 */
function Root() {
  /** @type {number} */
  this._flag = 0;
  /** @type {(function(): void) | Array<(function(): void)> | null} */
  this._cleanup = null;
  /** @type {Array<Receiver> | null} */
  this._owned = null;
  /** @type {(function(*): boolean) | Array<(function(*): boolean)> | null} */
  this._recover = null;
}

/**
 * @template T
 * @constructor
 * @implements {ISignal<T>}
 * @param {T} value
 */
function Signal(value) {
  /** @type {number} */
  this._flag = 0;
  /** @type {T} */
  this._value = value;
  /** @type {number} */
  this._version = -1;
  /** @type {Receiver} */
  this._sub1 = null;
  /** @type {Array<Receiver> | null} */
  this._subs = null;
  /** @type {number} */
  this._tombstones = 0;
}

/**
 * @constructor
 * @template T,U,W
 * @param {number} opts
 * @param {(function(T,W): T) | (function(U,T,W,number): T)} fn
 * @param {Sender<U> | null} dep1
 * @param {T=} seed
 * @param {W=} args
 * @implements {ICompute<T>}
 */
function Compute(opts, fn, dep1, seed, args) {
  /** @type {number} */
  this._flag = FLAG_INIT | FLAG_STALE | opts;
  /** @type {T} */
  this._value = seed;
  /** @type {number} */
  this._version = -1;
  /** @type {Receiver} */
  this._sub1 = null;
  /** @type {Array<Receiver> | null} */
  this._subs = null;
  /** @type {number} */
  this._tombstones = 0;
  /** @type {(function(T): T) | (function(T, U): T) | (function(T,U,V): T) | null} */
  this._fn = fn;
  /** @type {Sender<U>} */
  this._dep1 = dep1;
  /** @type {Array<Sender> | null} */
  this._deps = null;
  /** @type {number} */
  this._time = 0;
  /** @type {number} */
  this._ctime = 0;
  /** @type {Function | Array<Function> | null} */
  this._cleanup = null;
  /** @type {Channel | null} */
  this._chan = null;
  /** @type {W | undefined} */
  this._args = args;
}

/**
 * @constructor
 * @template U,W
 * @param {number} opts
 * @param {(function(W): (function(): void | void)) | (function(U,W): (function(): void | void))} fn
 * @param {Sender<U> | null} dep1
 * @param {Owner | null} owner - parent owner, null for top-level effects
 * @param {W=} args
 * @implements {IEffect}
 */
function Effect(opts, fn, dep1, owner, args) {
  /** @type {number} */
  this._flag = FLAG_INIT | (0 | opts);
  /** @type {(function(W): (function(): void | void)) | (function(U,W): (function(): void | void)) | (function(U,V,W): (function(): void | void)) | null} */
  this._fn = fn;
  /** @type {Sender<U> | null} */
  this._dep1 = dep1;
  /** @type {Array<Sender> | null} */
  this._deps = null;
  /** @type {number} */
  this._version = 0;
  /** @type {number} */
  this._time = 0;
  /** @type {(function(): void) | Array<(function(): void)> | null} */
  this._cleanup = null;
  /** @type {Array<Receiver> | null} */
  this._owned = null;
  /** @type {number} */
  this._level = 0;
  /** @type {Owner | null} */
  this._owner = owner;
  /** @type {(function(*): boolean) | Array<(function(*): boolean)> | null} */
  this._recover = null;
  /** @type {(function(): void) | Array<(function(): void)> | null} */
  this._finalize = null;
  /** @type {Channel | null} */
  this._chan = null;
  /** @type {W | undefined} */
  this._args = args;
}

/**
 * Unified async context for task/spawn nodes. Created lazily on first
 * async utility call (controller(), defer(), suspend(task)). Stored
 * in the node's dedicated _channel field.
 * @constructor
 */
function Channel() {
  /** @type {Compute | null} First responder we're waiting on. */
  this._res1 = null;
  /** @type {Array<Compute> | null} Additional responders. */
  this._responds = null;
  /** @type {Array | null} 3-stride: [awaiter, resolve, reject]. */
  this._waiters = null;
  /** @type {AbortController | null} */
  this._controller = null;
  /** @type {Sender | null} First deferred dep (inline fast path). */
  this._defer1 = null;
  /** @type {*} Snapshot of _defer1's value at defer() time. */
  this._defer1val = undefined;
  /** @type {Array<Sender | *> | null} Paired [sender, value] entries for 2+ defers. */
  this._defers = null;
}

// Top-level named functions so they aren't anonymous closures and can be
// shared between prototypes. Installed onto prototypes in the single
// assignment block further down.

/**
 * Shared across Root/Signal/Compute/Effect. Routes to `_dispose` directly
 * when idle, otherwise queues onto DISPOSES so the batch drain runs it in
 * the same transaction as any pending sets.
 * @this {Disposer}
 * @returns {void}
 */
function dispose() {
  if (!(this._flag & FLAG_DISPOSED)) {
    if (IDLE) {
      this._dispose();
    } else {
      DISPOSES[DISPOSER_COUNT++] = this;
    }
  }
}

/**
 * @throws
 * @template T
 * @this {Receiver}
 * @param {Sender<T>} sender
 * @returns {T}
 */
function val(sender) {
  let flag = this._flag;
  if (sender._flag & FLAG_DISPOSED) {
    throw new Error(ASSERT_DISPOSED);
  }
  if (flag & FLAG_LOADING) {
    return this._readAsync(sender);
  }
  /** Sync path: version-tagged dep tracking with VSTACK restore. */
  let version = VERSION;
  if (sender._version === version) {
    return sender._value;
  }
  if (sender._flag & (FLAG_STALE | FLAG_PENDING)) {
    sender._refresh();
  }
  if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
    if (sender._flag & FLAG_ERROR) {
      throw sender._value;
    }
    return sender._value;
  }
  let stamp = sender._version;
  sender._version = version;
  if (stamp === version - 1) {
    REUSED++;
  } else {
    this._read(sender, stamp);
  }
  if (sender._flag & FLAG_ERROR) {
    throw sender._value;
  }
  return sender._value;
}

/**
 * Reads a sender's current value without subscribing. Refreshes
 * stale/pending senders so the value is always current, but does
 * not create a dependency link.
 * @this {Compute | !Effect}
 * @param {Sender} sender
 * @returns {*}
 */
function peek(sender) {
  if (sender._flag & FLAG_DISPOSED) {
    throw new Error(ASSERT_DISPOSED);
  }
  if (sender._flag & (FLAG_STALE | FLAG_PENDING)) {
    sender._refresh();
  }
  if (sender._flag & FLAG_ERROR) {
    throw sender._value;
  }
  return sender._value;
}

/**
 * Shared set implementation for Signal and Compute. When IDLE,
 * resolves updater functions, writes via _assign, notifies and
 * flushes. When not IDLE, schedules for drain. Updater functions
 * are resolved at drain time by assign() to see the latest value.
 * @this {Signal | !Compute}
 * @param {*} value
 */
function set(value) {
  if (this._flag & FLAG_DISPOSED) {
    throw new Error(ASSERT_DISPOSED);
  }
  if (IDLE) {
    if (typeof value === "function") {
      value = value(this._value);
    }
    if (this._flag & FLAG_RELAY || this._value !== value) {
      this._assign(value, TIME + 1);
      notify(this, FLAG_STALE);
      flush();
    }
  } else if (typeof value === "function" || this._flag & FLAG_RELAY || this._value !== value) {
    schedule(this, value, assign);
  }
}

/**
 * Batch-drain handler for both Signal and Compute. Resolves updater
 * functions against the current value at drain time, compares, and
 * only writes + notifies if the value actually changed. Delegates
 * the actual write to node._assign() which handles type-specific
 * fields (_ctime, FLAG_INIT for Compute; plain _value for Signal).
 * @param {Signal | !Compute} node
 * @param {*} value
 * @param {number} time
 */
function assign(node, value, time) {
  if (typeof value === "function") {
    value = value(node._value);
  }
  if (node._flag & FLAG_RELAY || node._value !== value) {
    node._assign(value, time);
    if (node._flag & FLAG_SCHEDULED) {
      node._flag &= ~FLAG_SCHEDULED;
      notify(node, FLAG_STALE);
    }
  } else {
    node._flag &= ~FLAG_SCHEDULED;
  }
}

/**
 * Batch-drain handler for notify(). No value write — just clears
 * FLAG_SCHEDULED and notifies subscribers.
 * @param {Signal | !Compute} node
 * @param {*} _
 * @param {number} time
 */
function poke(node, _, time) {
  if (node._flag & FLAG_SCHEDULED) {
    node._flag &= ~FLAG_SCHEDULED;
    notify(node, FLAG_STALE);
  }
}

/**
 * Enqueues a deferred update to run during the next drain cycle.
 * Used by extension packages (e.g. anod-list) to schedule custom
 * mutations like push, pop, splice without branching in the drain loop.
 * @param {Sender} node
 * @param {*} payload
 * @param {function(!Sender, *)} fn
 */
function schedule(node, payload, fn) {
  node._flag |= FLAG_SCHEDULED;
  let index = SENDER_COUNT++;
  SENDERS[index] = node;
  PAYLOADS[index] = payload;
  UPDATES[index] = fn;
}

/**
 * Registers a dependency link from sender -> this (the tracking node).
 * Called from val() only for non-reuse cases (new dep or conflict).
 * The common reuse case (stamp === RVER - 1) is handled inline in val().
 *
 * @this {Receiver}
 * @param {Sender} sender
 * @param {number} stamp - sender's previous _version before tagging
 * @returns {void}
 */
function _read(sender, stamp) {
  /** Conflict: tagged by some other running node in this execution
   *  tree. Save [sender, oldVersion] to VSTACK for restoration. */
  if (stamp > TRANSACTION) {
    VSTACK[VCOUNT++] = sender;
    VSTACK[VCOUNT++] = stamp;
  }

  if (this._flag & FLAG_SETUP) {
    /** Setup path: first run, push deps to DSTACK. */
    if (this._dep1 === null) {
      connect(sender, this);
      this._dep1 = sender;
    } else {
      connect(sender, this);
      DSTACK[DCOUNT++] = sender;
    }
  } else if (this._deps === null) {
    this._deps = [sender];
    this._flag &= ~FLAG_SINGLE;
  } else {
    this._deps.push(sender);
  }
}

/**
 * @this {Receiver}
 * @param {Sender} sender
 * @returns {void}
 */
function _readAsync(sender) {
  if (sender._flag & (FLAG_STALE | FLAG_PENDING)) {
    sender._refresh();
  }
  if ((this._flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
    if (sender._flag & FLAG_ERROR) {
      throw sender._value;
    }
    return sender._value;
  }
  subscribe(this, sender);
  if (sender._flag & FLAG_ERROR) {
    throw sender._value;
  }
  return sender._value;
}

/**
 * @param {*} value
 * @returns {Signal}
 */
/**
 * @template T
 * @param {T} value
 * @param {(function(T,T): boolean)=} guard - Equality function: (prev, next) => true if equal (skip update).
 *   To validate/assert, throw inside the guard when the value is invalid.
 * @returns {Signal<T>}
 */
function signal(value) {
  return new Signal(value);
}

/**
 * Creates a relay signal — a signal that always propagates on
 * set(), bypassing the equality check. Useful for mutable
 * objects where reference equality doesn't reflect changes.
 * @template T
 * @param {T} value
 * @returns {Signal<T>}
 */
function relay(value) {
  let node = new Signal(value);
  node._flag = FLAG_RELAY;
  return node;
}

/**
 * @param {function(!Root): ((function(): void) | void)} fn
 * @returns {Root}
 */
function root(fn) {
  let node = new Root();
  startRoot(node, fn);
  return node;
}

{
  /** @const */
  let RootProto = Root.prototype;
  /** @const */
  let SignalProto = Signal.prototype;
  /** @const */
  let ComputeProto = Compute.prototype;
  /** @const */
  let EffectProto = Effect.prototype;

  RootProto._owner = null;
  RootProto._level = -1;

  SignalProto._ctime = 0;

  /**
   * Signal._assign: just writes the value.
   * @this {Signal}
   * @param {*} value
   * @param {number} time
   */
  SignalProto._assign = function (value, time) {
    this._value = value;
  };

  /**
   * Compute._assign: writes value and stamps _ctime. Does NOT
   * clear FLAG_STALE — if a dep also changed this cycle, the
   * dep update re-runs fn on the next read and takes precedence.
   * @this {Compute}
   * @param {*} value
   * @param {number} time
   */
  ComputeProto._assign = function (value, time) {
    this._value = value;
    this._ctime = time;
  };

  /** Signal._drop: NOOP — signals don't drop values. */
  SignalProto._drop = function () { };

  /**
   * Compute._drop: releases cached value and marks STALE. Called
   * from clearReceiver when FLAG_WEAK is set and no subscribers
   * remain. Loading nodes keep their value — active channel
   * waiters re-subscribe on settle.
   * @this {Compute}
   */
  ComputeProto._drop = function () {
    if (this._flag & FLAG_LOADING) {
      return;
    }
    this._flag |= FLAG_STALE;
    this._value = null;
    if (this._cleanup !== null) {
      clearCleanup(this._cleanup);
    }
  };

  /**
   * Compacts _subs by removing FLAG_DISPOSED entries.
   * Pop-from-back for low churn, forward scan for high churn.
   * @this {Signal | !Compute}
   */
  SignalProto._purge = ComputeProto._purge = function () {
    let subs = this._subs;
    let disposed = this._tombstones;
    this._flag &= ~FLAG_PURGE;
    if (subs === null) {
      return;
    }
    if (disposed >= subs.length) {
      this._subs = null;
      this._tombstones = 0;
      return;
    }
    this._tombstones = 0;
    if (disposed > (subs.length >> 2)) {
      let write = 0;
      for (let read = 0; read < subs.length; read++) {
        let node = subs[read];
        if (!(node._flag & FLAG_DISPOSED)) {
          subs[write++] = node;
        }
      }
      subs.length = write;
      return;
    }
    let i = 0;
    while (i < subs.length) {
      if (subs[i]._flag & FLAG_DISPOSED) {
        let tail;
        do {
          tail = subs.pop();
          if (i >= subs.length) {
            return;
          }
        } while (tail._flag & FLAG_DISPOSED);
        subs[i] = tail;
      }
      i++;
    }
  };

  // Disposer#dispose — shared by all four node types
  RootProto.dispose =
    SignalProto.dispose =
    ComputeProto.dispose =
    EffectProto.dispose =
    dispose;

  // Receiver#_read — internal dep tracking, called from val() when listening
  ComputeProto._read = EffectProto._read = _read;

  ComputeProto._readAsync = EffectProto._readAsync = _readAsync;
  ComputeProto.peek = EffectProto.peek = peek;

  let disposed = { get() { return (this._flag & FLAG_DISPOSED) !== 0; } };

  let _disposed = { disposed };
  Object.defineProperties(SignalProto, _disposed);
  Object.defineProperties(RootProto, _disposed);
  // IAwaitable — Compute + Effect (getters)
  let states = {
    disposed,
    error: { get() { return (this._flag & FLAG_ERROR) ? this._value : null; } },
    loading: { get() { return (this._flag & FLAG_LOADING) !== 0; } }
  };
  Object.defineProperties(ComputeProto, states);
  Object.defineProperties(EffectProto, states);

  /**
   * Registers a cleanup fn on this owner. Stored compactly: _cleanup holds
   * a single fn for count=1, graduating to an array on the second.
   * @this {Root | !Effect}
   * @param {function(): void} fn
   * @returns {void}
   */
  function cleanup(fn) {
    let cleanup = this._cleanup;
    if (cleanup === null) {
      this._cleanup = fn;
    } else if (typeof cleanup === "function") {
      this._cleanup = [cleanup, fn];
    } else {
      cleanup.push(fn);
    }
  }

  /**
   * Registers a recover handler on this owner.
   * @this {Root | !Effect}
   * @param {function(*): boolean} fn
   * @returns {void}
   */
  function recover(fn) {
    let recover = this._recover;
    if (recover === null) {
      this._recover = fn;
    } else if (typeof recover === "function") {
      this._recover = [recover, fn];
    } else {
      recover.push(fn);
    }
  }

  /**
   * Marks the node's output semantically equal (or not) to its previous
   * value. Shared by Compute and Effect — all carry a _flag.
   * @this {Compute | !Effect}
   * @param {boolean=} eq
   * @returns {void}
   */
  function equal(eq) {
    if (eq === false) {
      this._flag = (this._flag | FLAG_NOTEQUAL) & ~FLAG_EQUAL;
    } else {
      this._flag = (this._flag | FLAG_EQUAL) & ~FLAG_NOTEQUAL;
    }
  }

  /**
   * Marks the node stable — no dynamic dep tracking on subsequent runs.
   * For async nodes, also clears FLAG_SETUP so the stable short-circuit
   * in val() fires immediately (SETUP persists across awaits). For sync
   * nodes, SETUP is left in place — the natural cleanup at the end of
   * _update clears it, and during setup, deps must still be tracked via
   * the DSTACK mechanism.
   * @this {Compute | !Effect}
   * @returns {void}
   */
  function stable() {
    if (this._flag & FLAG_ASYNC) {
      this._flag = (this._flag | FLAG_STABLE) & ~FLAG_SETUP;
    } else {
      this._flag |= FLAG_STABLE;
    }
  }

  /** IOwner: cleanup/recover exposed on Root + Effect prototypes */
  RootProto.cleanup = EffectProto.cleanup = ComputeProto.cleanup = cleanup;
  RootProto.recover = EffectProto.recover = recover;

  /**
   * Registers a finalize callback that runs immediately when this
   * activation completes, regardless of error. Effect-level `finally`.
   * @this {Effect}
   * @param {function(): void} fn
   */
  EffectProto.finalize = function (fn) {
    let finalize = this._finalize;
    if (finalize === null) {
      this._finalize = fn;
    } else if (typeof finalize === "function") {
      this._finalize = [finalize, fn];
    } else {
      finalize.push(fn);
    }
  };

  ComputeProto.equal = EffectProto.equal = equal;
  ComputeProto.stable = EffectProto.stable = stable;

  /**
   * Signals an expected error from a compute. Sets FLAG_ERROR and
   * returns a { error, type: ERROR } POJO. The caller returns this
   * from their fn — _update sees FLAG_ERROR and stores it as the
   * compute's error value without hitting the catch path.
   * Named `fail` to avoid collision with the `.error` getter.
   * @this {Compute}
   * @param {*} val
   * @returns {{ error: *, type: number }}
   */
  ComputeProto.refuse = function (val) {
    this._flag |= FLAG_ERROR;
    return { error: val, type: REFUSE };
  };

  /**
   * Signals an expected panic from a compute or effect. Sets
   * FLAG_PANIC and throws a { error, type: PANIC } POJO. The
   * catch block checks FLAG_PANIC to distinguish this from
   * unexpected throws (which are wrapped as FATAL).
   * @this {Compute | !Effect}
   * @param {*} val
   * @returns {void}
   */
  function panic(val) {
    this._flag |= FLAG_PANIC;
    throw { error: val, type: PANIC };
  }

  ComputeProto.panic = EffectProto.panic = panic;

  /**
   * Marks this compute as eager (push-based). Once set, the node
   * eagerly re-runs on notification instead of waiting for a pull.
   * @this {Compute}
   */
  ComputeProto.eager = function () {
    this._flag |= FLAG_EAGER;
  };

  /**
   * Intercepts a promise so the async continuation is silently dropped
   * when the owning node has been disposed or re-run since this call.
   * Uses an activation timestamp to detect staleness.
   *
   * If the node is still current, resolves/rejects normally.
   * If stale or disposed, resolves to REGRET — a thenable whose
   * `.then()` is a no-op, so `await` never resumes and the closure
   * becomes eligible for GC.
   * @this {Compute | !Effect}
   * @param {Promise | !Compute} promiseOrTask
   * @returns {*}
   */
  function suspend(promiseOrTask) {
    /** Branch: setup function → callback constructor path.
     *  Sets FLAG_SUSPEND so _update knows the node is waiting
     *  for a callback-driven settlement, not a returned promise. */
    if (typeof promiseOrTask === "function") {
      if (this._flag & FLAG_SUSPEND) {
        throw new Error("Cannot call suspend() with callbacks after a previous suspend()");
      }
      this._flag |= FLAG_SUSPEND | FLAG_LOADING;
      let node = this;
      let time = this._time;
      promiseOrTask(
        function (val) {
          if (node._time !== time || (node._flag & FLAG_DISPOSED && !(node._flag & FLAG_LOCK))) {
            return;
          }
          if (!(node._flag & FLAG_LOCK)) {
            if (node._flag & FLAG_STALE) {
              return;
            }
            if (node._flag & FLAG_PENDING && needsUpdate(node, TIME)) {
              node._flag |= FLAG_STALE;
              return;
            }
          }
          node._settle(val);
        },
        function (err) {
          if (node._time !== time || (node._flag & FLAG_DISPOSED && !(node._flag & FLAG_LOCK))) {
            return;
          }
          if (!(node._flag & FLAG_LOCK)) {
            if (node._flag & FLAG_STALE) {
              return;
            }
            if (node._flag & FLAG_PENDING && needsUpdate(node, TIME)) {
              node._flag |= FLAG_STALE;
              return;
            }
          }
          node._error(err);
        }
      );
      return;
    }
    this._flag |= FLAG_SUSPEND;
    /** Branch: array of tasks → concurrent await. */
    if (Array.isArray(promiseOrTask)) {
      return _suspendArray.call(this, promiseOrTask);
    }
    /** Branch: Compute node with FLAG_ASYNC → task-await path. */
    if (promiseOrTask._flag !== undefined && promiseOrTask._flag & FLAG_ASYNC) {
      return _suspendTask.call(this, promiseOrTask);
    }
    /** Promise path — wrap with staleness guard. */
    let node = this;
    let time = this._time;
    return promiseOrTask.then(
      function (val) {
        if (
          node._time === time &&
          (!(node._flag & FLAG_DISPOSED) || node._flag & FLAG_LOCK)
        ) {
          return val;
        }
        return REGRET;
      },
      function (err) {
        if (
          node._time === time &&
          (!(node._flag & FLAG_DISPOSED) || node._flag & FLAG_LOCK)
        ) {
          throw err;
        }
        return REGRET;
      }
    );
  }

  /**
   * Awaits an async Compute (task) node. Two paths:
   *
   * **Fast-path** (task already settled): subscribes as a dep and returns
   * the raw value immediately. `await nonThenable` costs one microtask.
   *
   * **Slow-path** (task is loading): creates a two-way binding between
   * this node (IAwaiter) and the task (IResponder). Returns a Promise
   * that resolves when the task settles. At settle time, the task also
   * subscribes the awaiter as a dep for future reactive updates.
   *
   * @this {Compute | !Effect}
   * @param {Compute} taskNode
   * @returns {*}
   */
  function _suspendTask(taskNode) {
    if (taskNode._flag & FLAG_DISPOSED) {
      throw new Error(ASSERT_DISPOSED);
    }
    if (taskNode._flag & (FLAG_STALE | FLAG_PENDING)) {
      taskNode._refresh();
    }

    /** Fast-path: task is settled — track as dep and return value.
     *  Mirrors val(): in the sync scope use version stamping so
     *  patchDeps handles lifecycle; in async scope use subscribe()
     *  and let settleDeps deduplicate. */
    if (!(taskNode._flag & FLAG_LOADING)) {
      if (this._flag & FLAG_LOADING) {
        subscribe(this, taskNode);
      } else {
        let version = VERSION;
        let stamp = taskNode._version;
        taskNode._version = version;
        if (stamp !== version - 1) {
          this._read(taskNode, stamp);
        } else {
          REUSED++;
        }
      }
      if (taskNode._flag & FLAG_ERROR) {
        throw taskNode._value;
      }
      return taskNode._value;
    }

    /** Task is loading — create channel binding and return a Promise.
     *  Staleness is handled by resetChannel: if the node re-runs,
     *  the old waiter is removed and this Promise never resolves. */
    let self = this;
    return new Promise(function (resolve, reject) {
      send(self, taskNode, resolve, reject);
    });
  }

  /**
   * Awaits an array of task nodes using a single-cursor walk.
   * Allocates exactly ONE Promise. The walk is callback-driven
   * via the global `_stepArray` helper: settled tasks are collected
   * synchronously; when a loading task is hit, addWaiter binds a
   * callback that re-enters `_stepArray` from the next index.
   *
   * FLAG_BLOCKED prevents resolveWaiters from subscribing the
   * awaiter during the walk. After all slots are filled, we
   * subscribe to every task in one pass and resolve the Promise.
   *
   * @this {Compute | !Effect}
   * @param {Array<!Compute>} tasks
   * @returns {Array | !Promise<!Array>}
   */
  function _suspendArray(tasks) {
    this._flag |= FLAG_BLOCKED;
    let count = tasks.length;
    if (count === 0) {
      this._flag &= ~FLAG_BLOCKED;
      return [];
    }
    let results = new Array(count);

    /** Fast-path: try to collect everything synchronously. */
    let allSettled = true;
    for (let i = 0; i < count; i++) {
      let task = tasks[i];
      if (task._flag & (FLAG_STALE | FLAG_PENDING)) {
        task._refresh();
      }
      if (task._flag & FLAG_LOADING) {
        allSettled = false;
        break;
      }
      if (task._flag & FLAG_ERROR) {
        throw task._value;
      }
      results[i] = task._value;
    }

    if (allSettled) {
      this._flag &= ~FLAG_BLOCKED;
      for (let i = 0; i < count; i++) {
        subscribe(this, tasks[i]);
      }
      return results;
    }

    /** At least one is loading — allocate one Promise.
     *  _stepArray re-scans from scratch on each wake-up,
     *  guaranteeing a consistent snapshot when it resolves. */
    let self = this;
    return new Promise(function (resolve, reject) {
      _stepArray(self, tasks, results, resolve, reject);
    });
  }

  /**
   * Scan all tasks for a consistent settled snapshot. Walks every
   * task — if any is loading, binds a waiter that re-scans from
   * scratch when it settles. Only resolves when a full scan finds
   * zero loading tasks, guaranteeing a consistent snapshot (all
   * values from the same moment). Mirrors c.pending() semantics.
   * @param {Compute | !Effect} node
   * @param {Array<!Compute>} tasks
   * @param {Array} results
   * @param {function(!Array)} resolve
   * @param {function(*)} reject
   */
  function _stepArray(node, tasks, results, resolve, reject) {
    let count = tasks.length;
    let blocked = -1;
    for (let i = 0; i < count; i++) {
      let task = tasks[i];
      if (task._flag & (FLAG_STALE | FLAG_PENDING)) {
        task._refresh();
      }
      if (task._flag & FLAG_LOADING) {
        blocked = i;
        break;
      }
      if (task._flag & FLAG_ERROR) {
        reject(task._value);
        return;
      }
      results[i] = task._value;
    }

    /** All settled — subscribe and resolve with consistent snapshot. */
    if (blocked === -1) {
      node._flag &= ~FLAG_BLOCKED;
      for (let i = 0; i < count; i++) {
        subscribe(node, tasks[i]);
      }
      resolve(results);
      return;
    }

    /** Peek remaining tasks so they're current. */
    for (let j = blocked + 1; j < count; j++) {
      let t = tasks[j];
      if (t._flag & (FLAG_STALE | FLAG_PENDING)) {
        t._refresh();
      }
    }

    /** Bind waiter to the blocked task. On settle, re-scan
     *  ALL tasks from scratch — a previously settled task may
     *  have gone back to loading. */
    let task = tasks[blocked];
    send(node, task,
      function () {
        _stepArray(node, tasks, results, resolve, reject);
      },
      reject
    );
  }

  ComputeProto.suspend = EffectProto.suspend = suspend;

  /** @this {Compute | !Effect} */
  ComputeProto.lock = EffectProto.lock = function () {
    this._flag |= FLAG_LOCK;
  };

  /** @this {Compute | !Effect} */
  ComputeProto.unlock = EffectProto.unlock = function () {
    this._flag &= ~FLAG_LOCK;
  };

  /**
   * Lazily allocates the Channel for this node. Lifts _args into
   * the Channel so the original args are preserved but the node's
   * _args slot points directly to the Channel.
   * @this {Compute | !Effect}
   * @returns {Channel}
   */
  function _channel() {
    if (this._flag & FLAG_CHANNEL) {
      return this._chan;
    }
    let channel = new Channel();
    this._chan = channel;
    this._flag |= FLAG_CHANNEL;
    return channel;
  }

  ComputeProto._channel = EffectProto._channel = _channel;

  /**
   * Creates a fresh AbortController for this async activation.
   * The controller is automatically aborted on re-run or dispose.
   * @this {Compute | !Effect}
   * @returns {AbortController}
   */
  function controller() {
    let channel = this._channel();
    let ctrl = new AbortController();
    channel._controller = ctrl;
    return ctrl;
  }

  ComputeProto.controller = EffectProto.controller = controller;

  /**
   * Reads a sender's current value without subscribing immediately.
   * The subscription is deferred until settle time. For sync nodes
   * (FLAG_ASYNC not set), falls back to val().
   * @this {Compute | !Effect}
   * @param {Sender} sender
   * @returns {*}
   */
  function defer(sender) {
    if (!(this._flag & FLAG_ASYNC)) {
      return val.call(this, sender);
    }
    if (sender._flag & (FLAG_STALE | FLAG_PENDING)) {
      sender._refresh();
    }
    let value = sender._value;
    let channel = this._channel();
    if (channel._defer1 === null) {
      channel._defer1 = sender;
      channel._defer1val = value;
    } else {
      let defers = channel._defers;
      if (defers === null) {
        channel._defers = [sender, value];
      } else {
        defers.push(sender, value);
      }
    }
    if (sender._flag & FLAG_ERROR) {
      throw value;
    }
    return value;
  }

  ComputeProto.defer = EffectProto.defer = defer;

  /**
   * Checks if one or more tasks are currently loading. Subscribes to
   * each task as a dep (so the caller re-runs when they settle).
   * Accepts a single task or an array of tasks.
   *
   * Usage: `if (c.pending([taskA, taskB])) return;`
   *
   * @this {Compute | !Effect}
   * @param {Compute | !Array<!Compute>} tasks
   * @returns {boolean} true if any task has FLAG_LOADING set
   */
  function pending(tasks) {
    let loading = false;
    if (tasks._flag !== undefined) {
      /** Single task. */
      // this.val(tasks); @Claude why not like this? you wrote the line below.
      val.call(this, tasks);
      if (tasks._flag & FLAG_LOADING) {
        loading = true;
      }
    } else {
      /** Array of tasks. */
      let count = tasks.length;
      for (let i = 0; i < count; i++) {
        let t = tasks[i];
        val.call(this, t);
        if (t._flag & FLAG_LOADING) {
          loading = true;
        }
      }
    }
    return loading;
  }

  ComputeProto.pending = EffectProto.pending = pending;

  /**
   * @this {Root}
   * @returns {void}
   */
  RootProto._dispose = function () {
    this._flag = FLAG_DISPOSED;
    if (this._cleanup !== null) {
      clearCleanup(this);
    }
    if (this._owned !== null) {
      clearOwned(this);
    }
    this._owned = this._recover = null;
  };

  /**
   * Returns the signal's current value. No dependency tracking —
   * tracking happens via `c.val(sender)` on the context.
   * @this {Signal<T>}
   * @returns {T}
   */
  SignalProto.get = function () {
    return this._value;
  };

  SignalProto.set = set;

  /**
   * Notifies subscribers without changing the value. Useful after
   * mutating an object held by the signal in place.
   * @this {Signal | !Compute}
   */
  function signal_notify() {
    if (this._flag & FLAG_DISPOSED) {
      throw new Error(ASSERT_DISPOSED);
    }
    if (IDLE) {
      notify(this, FLAG_STALE);
      flush();
    } else {
      schedule(this, null, poke);
    }
  }

  SignalProto.notify = ComputeProto.notify = signal_notify;

  /**
   * Microtask-deferred set. Never writes the value immediately —
   * always schedules the update to the drain queue. The flush is
   * deferred to the next microtask so multiple post() calls
   * coalesce into a single flush. If called from inside a flush
   * cycle (not IDLE), the current flush picks up the scheduled
   * value without needing a microtask.
   *
   * Fast exit: when not already posting and the value is unchanged
   * (non-function), nothing to do.
   * @this {Signal<T>}
   * @param {T | function(T): T} value
   * @returns {void}
   */
  SignalProto.post = function (value) {
    if (this._flag & FLAG_DISPOSED) {
      throw new Error(ASSERT_DISPOSED);
    }
    if (!POSTING && !(this._flag & FLAG_RELAY) && typeof value !== "function" && this._value === value) {
      return;
    }
    schedule(this, value, assign);
    if (!POSTING) {
      POSTING = true;
      queueMicrotask(microflush);
    }
  };

  /**
   * Returns true if the sender's current value differs from `value`.
   * Used by deferred dep settlement to detect changes.
   * @this {Signal<T> | !Compute<T>}
   * @param {T} value
   * @returns {boolean}
   */
  SignalProto._changed = ComputeProto._changed = function (value) {
    return this._value !== value;
  };

  /**
   * @this {Signal<T>}
   * @returns {void}
   */
  SignalProto._dispose = function () {
    this._flag = FLAG_DISPOSED;
    clearSubs(this);
    this._value = null;
  };

  /**
   * Pulls and returns the compute's current value. Triggers lazy
   * re-evaluation if stale or pending. Rethrows if in error state.
   * @this {Compute<T,U,V,W>}
   * @returns {T}
   */
  ComputeProto.get = function () {
    let flag = this._flag;
    if (flag & (FLAG_STALE | FLAG_PENDING)) {
      if (IDLE) {
        IDLE = false;
        try {
          if (flag & FLAG_STALE || needsUpdate(this, TIME)) {
            TRANSACTION = SEED;
            this._update(TIME);
          }
          if (SENDER_COUNT > 0 || DISPOSER_COUNT > 0) {
            flush();
          }
        } finally {
          IDLE = true;
        }
      } else {
        this._refresh();
      }
    }
    if (this._flag & FLAG_BOUND && (this._dep1 === null || this._dep1._flag & FLAG_DISPOSED)) {
      this._flag |= FLAG_ERROR;
      this._value = { error: ASSERT_DISPOSED, type: FATAL };
    }
    if (this._flag & FLAG_ERROR) {
      throw this._value;
    }
    return this._value;
  };

  /**
   * IReader: dependency-tracking read. Pulls the sender up to date,
   * registers it as a dependency, and returns its value.
   * @this {Compute<T,U,V,W>}
   * @param {Sender} sender
   * @returns {*}
   */
  ComputeProto.val = val;

  /**
   * Writable-compute entry point. Mirrors `SignalProto.set` so a Compute
   * can be overwritten in place — useful for derived-from-prop state that
   * the user should still be able to pin (form inputs defaulted from
   * server data, local optimistic state, etc.). The manual value lasts
   * until a tracked dep changes and fires the compute's fn again.
   *
   * `_ctime = TIME + 1` anticipates the `++TIME` at the top of the next
   * `flush()` cycle, so downstream `_ctime > lastRun` sees this change
   * on the very next read — matches what `settle()` does on async
   * resolution.
   * @public
   * @this {Compute<T,U,V,W>}
   * @param {T} value
   * @returns {void}
   */
  ComputeProto.set = set;


  /**
   * @this {Compute}
   * @returns {void}
   */
  ComputeProto._refresh = function () {
    let flag = this._flag;
    if (flag & FLAG_STALE) {
      this._update(TIME);
    } else if (flag & FLAG_SINGLE) {
      checkSingle(this, TIME);
    } else {
      checkRun(this, TIME);
    }
  };

  /**
   * Settles an async compute. Clears loading/lock/init, handles deferred
   * dispose, resolves waiters, notifies subscribers, and re-runs if the
   * node was marked stale while locked. Handles both value and error:
   * when FLAG_ERROR is set before calling, the value is treated as an
   * error. Uses err || { error: err } guard on errors to guarantee a
   * non-falsy value (prevents skipping the comparison branch when user
   * throws null/undefined/0).
   * @this {Compute}
   * @param {*} value
   */
  ComputeProto._settle = function (value) {
    let flag = this._flag;
    let isError = flag & FLAG_ERROR;
    this._flag &= ~(FLAG_LOADING | FLAG_INIT | FLAG_LOCK);

    /** Deferred dispose: owner disposed while we were locked.
     *  FLAG_LOCK was cleared above, so _dispose runs full cleanup. */
    if (flag & FLAG_DISPOSED) {
      this._dispose();
      return;
    }

    if (value !== this._value || flag & (FLAG_INIT | FLAG_ERROR)) {
      this._value = value;
      let time = TIME + 1;
      this._ctime = time;

      let stale = false;
      if (this._flag & FLAG_ASYNC) {
        let hasDefers =
          this._flag & FLAG_CHANNEL && (this._chan._defer1 !== null || this._chan._defers !== null);
        if (this._deps !== null || hasDefers) {
          stale = settleDeps(this);
        }
      }

      let waiters = null;
      if (this._flag & FLAG_CHANNEL) {
        let ch = this._chan;
        if (ch !== null && ch._waiters !== null) {
          waiters = ch._waiters;
          let waiterCount = waiters.length;
          settleNotify(this, value, !!isError, waiters, waiterCount);
          ch._waiters = null;
          this._flag &= ~FLAG_WAITER;
        }
      }
      if (waiters === null) {
        notify(this, FLAG_STALE);
      }

      flush();

      if (stale || (flag & FLAG_LOCK && (this._flag & FLAG_STALE || (this._flag & FLAG_PENDING && needsUpdate(this, TIME))))) {
        this._flag |= FLAG_STALE;
        this._update(TIME);
      }
    } else if (flag & FLAG_LOCK && (this._flag & FLAG_STALE || (this._flag & FLAG_PENDING && needsUpdate(this, TIME)))) {
      this._flag |= FLAG_STALE;
      this._update(TIME);
    }

    /** Weak node with no subscribers after settle — release value. */
    if (
      this._flag & FLAG_WEAK &&
      this._sub1 === null &&
      (this._subs === null || this._tombstones >= this._subs.length)
    ) {
      this._drop();
    }
  };

  /**
   * Settles an async compute with an error. Wraps as FATAL,
   * sets FLAG_ERROR, and delegates to _settle.
   * @this {Compute}
   * @param {*} err
   */
  ComputeProto._error = function (err) {
    this._flag |= FLAG_ERROR;
    this._settle({ error: err, type: FATAL });
  };

  ComputeProto._dispose = function () {
    if (this._flag & FLAG_LOCK) {
      this._flag |= FLAG_DISPOSED;
      return;
    }
    let flag = this._flag;
    this._flag = FLAG_DISPOSED;
    clearSubs(this);
    clearDeps(this);
    if (flag & FLAG_CHANNEL) {
      let ch = this._chan;
      if (ch._controller !== null) {
        ch._controller.abort();
      }
      /** Panic any nodes awaiting this task. */
      if (ch._waiters !== null) {
        resolveWaiters(this, ch, new Error("Awaited task was disposed"), true, true);
      }
      /** Remove ourselves from any responders we were awaiting. */
      if (ch._res1 !== null) {
        clearChannel(ch, this);
      }
    }
    if (this._cleanup !== null) {
      clearCleanup(this);
    }
    this._fn = this._value = this._args = this._chan = null;
  };

  /**
   * Unified update for compute nodes. Two branches:
   * 1. Stable — no dep tracking, fn receives (val, this, prev, args) or (this, prev, args)
   * 2. Setup/dynamic — version-tracked dep reconciliation
   *
   * Async nodes share the same path. During fn execution FLAG_ASYNC is
   * temporarily cleared so val() uses the normal VERSION tracking. After
   * fn returns, FLAG_ASYNC is restored and the result is routed to either
   * the sync value-comparison path or the async promise/iterator path.
   * @this {Compute<T,U,V,W>}
   * @param {number} time
   */
  ComputeProto._update = function (time) {
    let flag = this._flag;
    if (flag & FLAG_LOCK) {
      return;
    }
    this._time = time;
    this._flag =
      flag & ~(FLAG_STALE | FLAG_LOADING | FLAG_ERROR | FLAG_EQUAL | FLAG_NOTEQUAL | FLAG_SUSPEND | FLAG_PANIC);

    if (!(flag & FLAG_INIT) && this._cleanup !== null) {
      clearCleanup(this);
    }

    /** Async prep: reset fiber state. */
    if (flag & FLAG_ASYNC) {
      if (flag & FLAG_CHANNEL) {
        resetChannel(this);
      }
    }

    let value;
    let args = this._args;

    if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
      run: try {
        if (flag & FLAG_BOUND) {
          let dep = this._dep1;
          if (dep._flag & (FLAG_STALE | FLAG_PENDING)) {
            dep._refresh();
          }
          if (dep._flag & FLAG_ERROR) {
            value = dep._value;
            this._flag |= FLAG_ERROR;
            break run;
          }
          value = this._fn(dep._value, this, this._value, args);
        } else {
          value = this._fn(this, this._value, args);
        }
      } catch (err) {
        if (this._flag & FLAG_PANIC) {
          value = err;
          this._flag &= ~FLAG_PANIC;
        } else {
          value = { error: err, type: FATAL };
        }
        this._flag |= FLAG_ERROR;
      }
    } else {
      /** Setup or dynamic: bump VERSION for dep tracking */
      let prevRVer = VERSION;
      let version = (SEED += 2);
      VERSION = version;
      let saveStart = VCOUNT;
      let depsLen = 0;
      let depCount = 0;
      let prevDBase;
      let prevReused;
      if (flag & FLAG_SETUP) {
        prevDBase = DBASE;
        DBASE = DCOUNT;
      } else {
        prevReused = REUSED;
        REUSED = 0;
        depCount = sweepDeps(version - 1, this._dep1, this._deps);
        depsLen = this._deps !== null ? this._deps.length : 0;
      }

      call: try {
        if (flag & FLAG_BOUND) {
          /** Bound + setup/dynamic: refresh dep1, stamp its version
           *  so val() treats it as already-tracked, then pass its
           *  value as the first argument. */
          let dep = this._dep1;
          if (dep._flag & (FLAG_STALE | FLAG_PENDING)) {
            dep._refresh();
          }
          if (dep._flag & FLAG_ERROR) {
            value = dep._value;
            this._flag |= FLAG_ERROR;
            break call;
          }
          dep._version = version;
          value = this._fn(dep._value, this, this._value, args);
        } else {
          value = this._fn(this, this._value, args);
        }
      } catch (err) {
        if (this._flag & FLAG_PANIC) {
          value = err;
          this._flag &= ~FLAG_PANIC;
        } else {
          value = { error: err, type: FATAL };
        }
        this._flag |= FLAG_ERROR;
      }

      if (flag & FLAG_SETUP) {
        if (DCOUNT > DBASE) {
          let stack = DSTACK;
          this._deps = stack.slice(DBASE, DCOUNT);
          for (let i = DBASE; i < DCOUNT; i++) {
            stack[i] = null;
          }
          DCOUNT = DBASE;
        } else if (this._dep1 !== null) {
          this._flag |= FLAG_SINGLE;
        }
        DBASE = prevDBase;
      } else {
        let newLen = this._deps !== null ? this._deps.length : 0;
        if (REUSED !== depCount || newLen !== depsLen) {
          patchDeps(this, version, depCount, newLen);
        }
        REUSED = prevReused;
      }

      if (VCOUNT > saveStart) {
        let count = VCOUNT;
        let stack = VSTACK;
        for (let i = saveStart; i < count; i += 2) {
          stack[i]._version = stack[i + 1];
          stack[i] = null;
        }
        VCOUNT = saveStart;
      }
      VERSION = prevRVer;
    }

    this._flag &= ~(FLAG_STALE | FLAG_PENDING | FLAG_SETUP);
    flag = this._flag;

    /** Async: if fn used callback suspend, the node is already
     *  FLAG_LOADING via the setup function. Skip async dispatch.
     *  Check both FLAG_SUSPEND and FLAG_LOADING: the callback path
     *  sets both, while promise/task paths only set FLAG_SUSPEND
     *  (FLAG_LOADING is set later by this dispatch code). */
    if (flag & FLAG_ASYNC) {
      if (this._flag & FLAG_SUSPEND && this._flag & FLAG_LOADING) {
        this._flag &= ~FLAG_INIT;
        return;
      }
      let kind = asyncKind(value);
      if (kind !== ASYNC_SYNC) {
        this._flag |= FLAG_LOADING;
        if (kind === ASYNC_PROMISE) {
          resolvePromise(
            this,
            /** @type {IThenable} */(value),
            time
          );
        } else {
          resolveIterator(
            this,
            /** @type {AsyncIterator | AsyncIterable} */(value),
            time
          );
        }
        return;
      }
    }

    flag = this._flag &= ~FLAG_INIT;
    if (flag & FLAG_ERROR) {
      this._value = value;
      this._ctime = time;
    } else if (value !== this._value) {
      this._value = value;
      if (!(flag & FLAG_EQUAL)) {
        this._ctime = time;
      }
    } else if (flag & FLAG_NOTEQUAL) {
      this._ctime = time;
    }
  };

  /**
   * Compute notification handler.
   * 1. Default: propagate PENDING downstream (pure pull).
   * 2. FLAG_LOADING: abort in-flight async work immediately so
   *    stale fetches/promises are cancelled without waiting for a pull.
   * 3. FLAG_WAITER: enqueue to COMPUTES + notify PENDING.
   * 4. FLAG_EAGER + FLAG_ASYNC: enqueue to COMPUTES for eager re-run.
   * 5. FLAG_EAGER + sync: notify FLAG_STALE directly (pure push).
   * @this {Compute}
   * @returns {void}
   */
  ComputeProto._receive = function () {
    let flag = this._flag;
    if (!(flag & (FLAG_EAGER | FLAG_WAITER | FLAG_LOADING | FLAG_LOCK | FLAG_DISPOSED))) {
      notify(this, FLAG_PENDING);
    } else if (flag & (FLAG_LOCK | FLAG_DISPOSED)) {
      return;
    } else {
      /** Abort in-flight async work. The stale/pending flag check
       *  in resolvePromise ensures old callbacks are rejected. */
      if (flag & FLAG_LOADING && flag & FLAG_CHANNEL) {
        resetChannel(this);
      }
      if (!(flag & (FLAG_EAGER | FLAG_WAITER))) {
        notify(this, FLAG_PENDING);
        return;
      }
      COMPUTES[COMPUTE_COUNT++] = this;
      if (flag & FLAG_EAGER) {
        if (!(flag & FLAG_ASYNC)) {
          notify(this, FLAG_STALE);
        }
      } else {
        notify(this, FLAG_PENDING);
      }
    }
  };

  /**
   * @this {Effect}
   * @param {Sender} sender
   * @returns {*}
   */
  EffectProto.val = val;

  /**
   * Sync update for effect nodes. Two branches:
   * 1. Stable (no SETUP) — no dep tracking, fn receives (this, args)
   * 2. Setup/dynamic — version bump, dep tracking, fn receives (this, args)
   * Pre-execution cleanup and scope save happen before branching.
   * Async nodes delegate to _updateAsync.
   * @this {Effect<U,V,W>}
   * @param {number} time
   */
  /**
   * Unified update for effect nodes. Handles both sync and async.
   * @this {Effect<U,V,W>}
   * @param {number} time
   */
  EffectProto._update = function (time) {
    let flag = this._flag;
    if (flag & FLAG_LOCK) {
      return;
    }

    this._time = time;
    if (!(flag & FLAG_INIT)) {
      if (this._cleanup !== null) {
        clearCleanup(this);
      }
      if (this._owned !== null) {
        clearOwned(this);
      }
      this._recover = null;
      if (this._finalize !== null) {
        clearFinalize(this);
      }
    }

    /** Async prep: clear loading/suspend from previous activation.
     *  Channel reset is handled eagerly in _receive, not here. */
    if (flag & FLAG_ASYNC) {
      this._flag &= ~(FLAG_LOADING | FLAG_SUSPEND);
    }

    /** @type {(function(): void) | null | undefined} */
    let value;
    let args = this._args;

    if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
      try {
        if (flag & FLAG_BOUND) {
          let dep = this._dep1;
          if (dep._flag & (FLAG_STALE | FLAG_PENDING)) {
            dep._refresh();
          }
          if (dep._flag & FLAG_ERROR) {
            throw dep._value;
          }
          value = this._fn(dep._value, this, args);
        } else {
          value = this._fn(this, args);
        }
      } finally {
        this._flag &= ~(FLAG_STALE | FLAG_PENDING);
      }
    } else {
      /** Setup or dynamic: bump VERSION for dep tracking */
      let current = VERSION;
      let version = (SEED += 2);
      VERSION = version;
      let saveStart = VCOUNT;
      let depCount = 0;
      let depsLen = 0;
      let dbase;
      let reused;
      if (flag & FLAG_SETUP) {
        dbase = DBASE;
        DBASE = DCOUNT;
      } else {
        reused = REUSED;
        REUSED = 0;
        let deps = this._deps;
        depCount = sweepDeps(version - 1, this._dep1, deps);
        depsLen = deps !== null ? deps.length : 0;
      }

      try {
        if (flag & FLAG_BOUND) {
          let dep = this._dep1;
          if (dep._flag & (FLAG_STALE | FLAG_PENDING)) {
            dep._refresh();
          }
          if (dep._flag & FLAG_ERROR) {
            throw dep._value;
          }
          value = this._fn(dep._value, this, args);
        } else {
          value = this._fn(this, args);
        }
      } finally {
        if (flag & FLAG_SETUP) {
          if (DCOUNT > DBASE) {
            let stack = DSTACK;
            this._deps = stack.slice(DBASE, DCOUNT);
            for (let i = DBASE; i < DCOUNT; i++) {
              stack[i] = null;
            }
            DCOUNT = DBASE;
          } else if (this._dep1 !== null) {
            this._flag |= FLAG_SINGLE;
          }
          DBASE = dbase;
        } else {
          let newLen = this._deps !== null ? this._deps.length : 0;
          if (REUSED !== depCount || newLen !== depsLen) {
            patchDeps(this, version, depCount, newLen);
          }
          REUSED = reused;
        }
        if (VCOUNT > saveStart) {
          let count = VCOUNT;
          let stack = VSTACK;
          for (let i = saveStart; i < count; i += 2) {
            stack[i]._version = stack[i + 1];
            stack[i] = null;
          }
          VCOUNT = saveStart;
        }
        VERSION = current;
        this._flag &= ~(FLAG_SETUP | FLAG_STALE | FLAG_PENDING);
      }
    }

    if (flag & FLAG_ASYNC) {
      if (this._flag & FLAG_SUSPEND && this._flag & FLAG_LOADING) {
        this._flag &= ~FLAG_INIT;
        return;
      }
      let kind = asyncKind(value);
      if (kind !== ASYNC_SYNC) {
        this._flag |= FLAG_LOADING;
        if (kind === ASYNC_PROMISE) {
          resolvePromise(this, value, time);
        } else {
          resolveIterator(this, value, time);
        }
        return;
      }
    }

    this._flag &= ~FLAG_INIT;
    if (this._finalize !== null) {
      clearFinalize(this);
    }
  };

  /**
   * Settles an async effect. Clears loading/lock, handles deferred
   * dispose, checks deferred deps, re-runs if stale. When FLAG_ERROR
   * is set before calling, treats the value as an error: attempts
   * recovery, disposes if unrecoverable.
   * @this {Effect}
   * @param {*=} err
   */
  EffectProto._settle = function (err) {
    let flag = this._flag;
    this._flag &= ~(FLAG_LOADING | FLAG_LOCK);

    /** Deferred dispose: owner disposed while we were locked.
     *  FLAG_LOCK was cleared above, so _dispose runs full cleanup. */
    if (flag & FLAG_DISPOSED) {
      this._dispose();
      return;
    }

    if (flag & FLAG_ERROR) {
      this._flag &= ~FLAG_ERROR;
      if (this._finalize !== null) {
        clearFinalize(this);
      }
      let result = tryRecover(this, err);
      if (result !== RECOVER_SELF) {
        this._dispose();
      }
      return;
    }

    if (this._finalize !== null) {
      clearFinalize(this);
    }

    let stale = false;
    if (this._flag & FLAG_CHANNEL && (this._chan._defer1 !== null || this._chan._defers !== null)) {
      stale = settleDeps(this);
    }
    if (stale || (flag & FLAG_LOCK && (this._flag & FLAG_STALE || (this._flag & FLAG_PENDING && needsUpdate(this, TIME))))) {
      this._flag |= FLAG_STALE;
      this._receive();
      flush();
    }
  };

  /**
   * Settles an async effect with an error. Wraps as FATAL,
   * sets FLAG_ERROR, and delegates to _settle.
   * @this {Effect}
   * @param {*} err
   */
  EffectProto._error = function (err) {
    this._flag |= FLAG_ERROR;
    this._settle({ error: err, type: FATAL });
  };

  /**
   * @this {Effect}
   * @returns {void}
   */
  EffectProto._dispose = function () {
    if (this._flag & FLAG_LOCK) {
      this._flag |= FLAG_DISPOSED;
      return;
    }
    let flag = this._flag;
    this._flag = FLAG_DISPOSED;
    if (this._finalize !== null) {
      clearFinalize(this);
    }
    clearDeps(this);
    if (this._cleanup !== null) {
      clearCleanup(this);
    }
    if (this._owned !== null) {
      clearOwned(this);
    }
    if (flag & FLAG_CHANNEL) {
      let ch = this._chan;
      if (ch._controller !== null) {
        ch._controller.abort();
      }
      if (ch._res1 !== null) {
        clearChannel(ch, this);
      }
    }
    this._fn = this._args = this._chan = this._owned = this._owner = this._recover = this._finalize = null;
  };

  /**
   * @this {Effect}
   * @returns {void}
   */
  EffectProto._receive = function () {
    let flag = this._flag;
    if (flag & (FLAG_LOCK | FLAG_DISPOSED)) {
      return;
    }
    /** Abort in-flight async work eagerly so stale fetches/promises
     *  are cancelled without waiting for _update to run. */
    if (flag & FLAG_LOADING && flag & FLAG_CHANNEL) {
      resetChannel(this);
    }
    if (this._owned === null) {
      RECEIVERS[RECEIVER_COUNT++] = this;
    } else {
      let level = this._level;
      let count = LEVELS[level];
      SCOPES[level][count] = this;
      LEVELS[level] = count + 1;
      SCOPE_COUNT++;
    }
  };

  /** @this {Root | !Effect} */
  function _compute(depOrFn, fnOrSeed, optsOrSeed, argsOrOpts, args) {
    if (this._flag & FLAG_DISPOSED) {
      throw new Error(ASSERT_DISPOSED);
    }
    let flag, node;
    if (typeof depOrFn === "function") {
      flag = FLAG_SETUP | ((0 | optsOrSeed) & OPTIONS);
      node = new Compute(flag, depOrFn, null, fnOrSeed, argsOrOpts);
    } else {
      flag = FLAG_STABLE | FLAG_BOUND | FLAG_SINGLE | ((0 | argsOrOpts) & OPTIONS);
      node = new Compute(flag, fnOrSeed, depOrFn, optsOrSeed, args);
      connect(depOrFn, node);
    }
    addOwned(this, node);
    if (!(flag & FLAG_DEFER)) {
      startCompute(node);
    }
    return node;
  }

  /** @this {Root | !Effect} */
  function _task(depOrFn, fnOrSeed, optsOrSeed, argsOrOpts, args) {
    if (this._flag & FLAG_DISPOSED) {
      throw new Error(ASSERT_DISPOSED);
    }
    let flag, node;
    if (typeof depOrFn === "function") {
      flag = FLAG_ASYNC | FLAG_SETUP | ((0 | optsOrSeed) & OPTIONS);
      node = new Compute(flag, depOrFn, null, fnOrSeed, argsOrOpts);
    } else {
      flag =
        FLAG_ASYNC |
        FLAG_STABLE |
        FLAG_BOUND |
        FLAG_SINGLE |
        ((0 | argsOrOpts) & OPTIONS);
      node = new Compute(flag, fnOrSeed, depOrFn, optsOrSeed, args);
      connect(depOrFn, node);
    }
    addOwned(this, node);
    if (!(flag & FLAG_DEFER)) {
      startCompute(node);
    }
    return node;
  }

  /** @this {Root | !Effect} */
  function _effect(depOrFn, fnOrOpts, optsOrArgs, args) {
    if (this._flag & FLAG_DISPOSED) {
      throw new Error(ASSERT_DISPOSED);
    }
    let flag, node;
    if (typeof depOrFn === "function") {
      flag = FLAG_SETUP | ((0 | fnOrOpts) & OPTIONS);
      node = new Effect(flag, depOrFn, null, this, optsOrArgs);
    } else {
      flag = FLAG_STABLE | FLAG_BOUND | FLAG_SINGLE | ((0 | optsOrArgs) & OPTIONS);
      node = new Effect(flag, fnOrOpts, depOrFn, this, args);
      connect(depOrFn, node);
    }
    let level = this._level + 1;
    if (this._level > 2 && level >= LEVELS.length) {
      LEVELS.push(0);
      SCOPES.push([]);
    }
    node._level = level;
    addOwned(this, node);
    startEffect(node);
    return node;
  }

  /** @this {Root | !Effect} */
  function _spawn(depOrFn, fnOrOpts, optsOrArgs, args) {
    if (this._flag & FLAG_DISPOSED) {
      throw new Error(ASSERT_DISPOSED);
    }
    let flag, node;
    if (typeof depOrFn === "function") {
      flag = FLAG_ASYNC | FLAG_SETUP | ((0 | fnOrOpts) & OPTIONS);
      node = new Effect(flag, depOrFn, null, this, optsOrArgs);
    } else {
      flag =
        FLAG_ASYNC |
        FLAG_STABLE |
        FLAG_BOUND |
        FLAG_SINGLE |
        ((0 | optsOrArgs) & OPTIONS);
      node = new Effect(flag, fnOrOpts, depOrFn, this, args);
      connect(depOrFn, node);
    }
    let level = this._level + 1;
    if (this._level > 2 && level >= LEVELS.length) {
      LEVELS.push(0);
      SCOPES.push([]);
    }
    node._level = level;
    addOwned(this, node);
    startEffect(node);
    return node;
  }

  /** Install factory methods on Root and Effect prototypes */
  RootProto.signal = EffectProto.signal = signal;
  RootProto.compute = EffectProto.compute = _compute;
  RootProto.task = EffectProto.task = _task;
  RootProto.effect = EffectProto.effect = _effect;
  RootProto.spawn = EffectProto.spawn = _spawn;
  RootProto.root = EffectProto.root = root;
}

/**
 * @param {Receiver} receiver
 * @param {Sender} sender
 */
function subscribe(receiver, sender) {
  if (receiver._dep1 === null) {
    receiver._dep1 = sender;
    connect(sender, receiver);
  } else {
    let deps = receiver._deps;
    if (deps === null) {
      receiver._deps = [sender];
    } else {
      deps.push(sender);
    }
    connect(sender, receiver);
  }
}

/**
 * @param {Sender} send
 * @param {Receiver} receiver
 * @returns {void}
 */
function connect(send, receiver) {
  if (send._sub1 === null) {
    send._sub1 = receiver;
  } else if (send._subs === null) {
    send._subs = [receiver];
  } else {
    send._subs.push(receiver);
  }
}

/**
 * Marks receiver as removed from sender's subscriber list.
 * For _sub1, clears immediately. For _subs array entries,
 * defers compaction via _tombstones and purge heuristic.
 * @param {Sender} send
 * @param {Receiver} receiver
 * @returns {void}
 */
function clearReceiver(send, receiver) {
  if (send._sub1 === receiver) {
    send._sub1 = null;
  } else {
    let disposed = ++send._tombstones;
    let subs = send._subs;
    if (subs !== null) {
      if (disposed >= subs.length) {
        /** All subs are dead — release the array immediately. */
        send._subs = null;
        send._tombstones = 0;
      } else if (!(send._flag & FLAG_PURGE) && disposed >= (subs.length >> 2)) {
        send._flag |= FLAG_PURGE;
        PURGES[PURGE_COUNT++] = send;
      }
    }
  }
  if (
    send._flag & FLAG_WEAK &&
    send._sub1 === null &&
    (send._subs === null || send._tombstones >= send._subs.length)
  ) {
    send._drop();
  }
}

/**
 * Removes receive from all its deps' subscriber lists.
 * @param {Receiver} receive
 * @returns {void}
 */
function clearDeps(receive) {
  if (receive._dep1 !== null) {
    clearReceiver(receive._dep1, receive);
    receive._dep1 = null;
  }
  let deps = receive._deps;
  if (deps !== null) {
    let count = deps.length;
    for (let i = 0; i < count; i++) {
      clearReceiver(deps[i], receive);
    }
    receive._deps = null;
  }
}

/**
 * Nulls out sender's subscriber list on disposal.
 * Receivers self-heal: dynamic nodes remove stale deps via
 * patchDeps on next re-run; stable bound nodes detect disposed
 * dep1 in _update via refreshDep1.
 * @param {Sender} send
 * @returns {void}
 */
function clearSubs(send) {
  send._sub1 = null;
  send._subs = null;
  send._tombstones = 0;
}

/**
 *
 * @param {Disposer} node
 */
function clearCleanup(node) {
  let cleanup = node._cleanup;
  if (typeof cleanup === "function") {
    cleanup();
    node._cleanup = null;
  } else {
    /** array form */
    let count = cleanup.length;
    while (count-- > 0) {
      cleanup.pop()();
    }
  }
}

/**
 * Runs all finalize callbacks registered on this effect and
 * clears the field. Errors inside finalizers are swallowed to
 * preserve finally semantics (mirroring JS try/finally).
 * @param {Effect} node
 * @returns {void}
 */
function clearFinalize(node) {
  let finalize = node._finalize;
  node._finalize = null;
  if (typeof finalize === "function") {
    try { finalize(); } catch (err) { /* swallow — finally semantics */ }
  } else {
    let count = finalize.length;
    for (let i = 0; i < count; i++) {
      try { finalize[i](); } catch (err) { /* swallow */ }
    }
  }
}

/**
 * Appends `child` to `owner._owned`, lazily allocating the array. Used by
 * the proto ownership methods after the top-level factory returns a new
 * node, so `_owned` is populated even when the factory runs the node's fn
 * inside its startup path.
 * @param {Owner} owner
 * @param {Receiver | !Root} child
 * @returns {void}
 */
function addOwned(owner, child) {
  if (owner._owned === null) {
    owner._owned = [child];
  } else {
    owner._owned.push(child);
  }
}

/**
 * Disposes all owned children. Called before re-running an owner effect
 * and on disposal. Only call when `_owned !== null` — owned is lazy and
 * only allocated when an effect or root actually adopts children.
 * @param {Owner} owner
 * @returns {void}
 */
function clearOwned(owner) {
  let owned = owner._owned;
  let count = owned.length;
  while (count-- > 0) {
    owned.pop()._dispose();
  }
  owner._recover = null;
}

/**
 * Checks a single owner's _recover handlers.
 * @param {Owner} owner
 * @param {*} error
 * @returns {boolean}
 */
function _checkRecover(owner, error) {
  let recover = owner._recover;
  if (recover !== null) {
    if (typeof recover === "function") {
      if (recover(error) === true) {
        return true;
      }
    } else {
      let count = recover.length;
      for (let i = 0; i < count; i++) {
        if (recover[i](error) === true) {
          return true;
        }
      }
    }
  }
  return false;
}

const RECOVER_NONE = 0;
const RECOVER_SELF = 1;
const RECOVER_OWNER = 2;

/**
 * Attempts to recover from an error.
 * - RECOVER_SELF: the node's own _recover handled it — node survives.
 * - RECOVER_OWNER: an ancestor handled it — node still disposes, error swallowed.
 * - RECOVER_NONE: unhandled — node disposes, error propagates.
 *
 * @param {Effect} node
 * @param {*} error
 * @returns {number}
 */
function tryRecover(node, error) {
  /** Self-recovery: node stays alive. */
  if (node._recover !== null && _checkRecover(node, error)) {
    return RECOVER_SELF;
  }
  /** Bubble up the owner chain. Node will be disposed by caller. */
  let owner = node._owner;
  while (owner !== null) {
    if (_checkRecover(owner, error)) {
      return RECOVER_OWNER;
    }
    owner = owner._owner;
  }
  return RECOVER_NONE;
}

/**
 * After a dynamic fn re-execution, reconciles dep subscriptions.
 * Does three things in a single pass over the first _depCount entries:
 *
 * 1. Keep or drop each dep based on whether _version === execVersion
 * 2. Restore _vstack for each dep inline (no separate restore loop)
 * 3. Compact the kept deps in-place
 *
 * New deps pushed beyond _depCount during fn() are already subscribed.
 * They just need to be shifted into the compacted region.
 *
 * @param {Receiver} node
 * @param {number} version
 * @param {number} depCount
 * @returns {void}
 */
function patchDeps(node, version, depCount, newLen) {
  let deps = node._deps;
  let existingLen = depCount > 1 ? depCount - 1 : 0;
  let newidx = existingLen;

  /** Check dep1 — always exists when depCount >= 1, and _read never
   *  writes new deps into dep1 (only setup does), so the only
   *  question is whether dep1 was reused or dropped. */
  let dep1 = node._dep1;
  if (dep1 !== null) {
    if (dep1._version !== version) {
      clearReceiver(dep1, node);
      if (newidx < newLen) {
        let newDep = deps[newidx];
        node._dep1 = newDep;
        connect(newDep, node);
        newidx++;
      } else {
        node._dep1 = null;
      }
    }
  }

  if (deps === null) {
    if (node._dep1 !== null) {
      node._flag |= FLAG_SINGLE;
    }
    return;
  }

  /**
   * Three-pointer scan:
   *   i 			-	forward through existing region
   *   newidx -	next new dep to consume (unsubscribed, in new region)
   *   tail 	-	end of live region, shrinks when we pop reused deps from the back
   */
  let i = 0;
  let tail = existingLen;
  while (i < tail) {
    let dep = deps[i];
    if (dep._version === version) {
      i++;
      continue;
    }
    /** Dropped — unbind */
    clearReceiver(dep, node);
    if (newidx < newLen) {
      let newDep = deps[newidx];
      connect(newDep, node);
      deps[i] = newDep;
      newidx++;
      i++;
    } else {
      let found = 0;
      while (tail > i + 1) {
        tail--;
        let tDep = deps[tail];
        if (tDep._version === version) {
          deps[i] = tDep;
          found = 1;
          break;
        } else {
          clearReceiver(tDep, node);
        }
      }
      if (found) {
        i++;
      } else {
        tail = i;
      }
    }
  }
  if (newidx < newLen) {
    if (node._dep1 === null) {
      let newDep = deps[newidx];
      connect(newDep, node);
      deps[i] = newDep;
      newidx++;
    }
    while (newidx < newLen) {
      let dep = deps[newidx];
      connect(dep, node);
      deps[tail] = dep;
      tail++;
      newidx++;
    }
  }

  /** Promote last array entry to dep1 when dep1 is empty. */
  if (node._dep1 === null && tail > 0) {
    tail--;
    node._dep1 = deps[tail];
  }

  /** Trim or null out, update FLAG_SINGLE */
  if (tail === 0) {
    node._deps = null;
    if (node._dep1 !== null) {
      node._flag |= FLAG_SINGLE;
    }
  } else {
    node._flag &= ~FLAG_SINGLE;
    let excess = deps.length - tail;
    if (excess > 0) {
      if (excess < 20) {
        while (excess-- > 0) {
          deps.pop();
        }
      } else {
        deps.length = tail;
      }
    }
  }
}

/**
 * @param {number} stamp
 * @param {Receiver | null} dep1
 * @param {Array<Receiver> | null} deps
 * @returns {number}
 */
function sweepDeps(stamp, dep1, deps) {
  let depCount = 0;
  let vstack = VSTACK;
  let vcount = VCOUNT;
  let transaction = TRANSACTION;
  if (dep1 !== null) {
    let depver = dep1._version;
    if (depver > transaction) {
      vstack[vcount++] = dep1;
      vstack[vcount++] = depver;
    }
    dep1._version = stamp;
    depCount = 1;
  }
  if (deps !== null) {
    let count = deps.length;
    for (let i = 0; i < count; i++) {
      let dep = deps[i];
      let depver = dep._version;
      if (depver > transaction) {
        vstack[vcount++] = dep;
        vstack[vcount++] = depver;
      }
      dep._version = stamp;
    }
    depCount += count;
  }
  VCOUNT = vcount;
  return depCount;
}

/**
 * @param {Sender} node
 * @param {number} flag
 */
function notify(node, flag) {
  let sub = node._sub1;
  if (sub !== null) {
    let flags = sub._flag;
    sub._flag |= flag;
    if (!(flags & (FLAG_PENDING | FLAG_STALE | FLAG_DISPOSED | FLAG_LOCK))) {
      sub._receive();
    }
  }
  let subs = node._subs;
  if (subs !== null) {
    let count = subs.length;
    for (let i = 0; i < count; i++) {
      sub = subs[i];
      let flags = sub._flag;
      sub._flag |= flag;
      if (!(flags & (FLAG_PENDING | FLAG_STALE | FLAG_DISPOSED | FLAG_LOCK))) {
        sub._receive();
      }
    }
  }
}

/**
 * Checks if any dep of a receiver actually changed since it
 * last ran. Pulls stale compute deps to ensure they're current.
 * @param {Receiver} node
 * @param {number} time
 * @returns {boolean}
 */
function needsUpdate(node, time) {
  let lastRun = node._time;
  let dep = node._dep1;
  if (dep !== null) {
    let flag = dep._flag;
    if (flag & FLAG_STALE) {
      TRANSACTION = SEED;
      dep._update(time);
    } else if (flag & FLAG_PENDING) {
      TRANSACTION = SEED;
      if (flag & FLAG_SINGLE) {
        checkSingle(dep, time);
      } else {
        checkRun(dep, time);
      }
    }
    if (dep._ctime > lastRun) {
      return true;
    }
  }
  let deps = node._deps;
  if (deps !== null) {
    let len = deps.length;
    for (let i = 0; i < len; i++) {
			dep = deps[i];
      let flag = dep._flag;
      if (flag & FLAG_STALE) {
        TRANSACTION = SEED;
        dep._update(time);
      } else if (flag & FLAG_PENDING) {
        TRANSACTION = SEED;
        if (flag & FLAG_SINGLE) {
          checkSingle(dep, time);
        } else {
          checkRun(dep, time);
        }
      }
      if (dep._ctime > lastRun) {
        return true;
      }
    }
  }
  return false;
}

/**
 * @param {Receiver} node
 * @param {number} time
 * @returns {void}
 */
function checkSingle(node, time) {
  let dep = node._dep1;
  let flag = dep._flag;
  if (flag & FLAG_STALE) {
    dep._update(time);
  } else if (flag & FLAG_PENDING) {
    if (flag & FLAG_SINGLE) {
      checkSingle(dep, time);
    } else {
      checkRun(dep, time);
    }
  }
  if (dep._ctime > node._time) {
    node._update(time);
  } else {
    node._time = time;
    node._flag &= ~(FLAG_STALE | FLAG_PENDING);
  }
}

/**
 * @param {Compute} node
 * @param {number} time
 * @returns {void}
 */
function checkRun(node, time) {
  let base = CTOP;
  let dep = node._dep1;

  /**
   * Fast descent: walk single-dep PENDING chains without the overhead
   * of the full scan loop (no resumeFrom branching, no updated flag).
   * Stops when dep1 is STALE, clean, null, or both STALE+PENDING.
   */
  if ((dep._flag & (FLAG_STALE | FLAG_PENDING)) === FLAG_PENDING) {
    do {
      CSTACK[CTOP] = node;
      CINDEX[CTOP] = -1;
      CTOP++;
      node = dep;
      dep = node._dep1;
    } while (
      dep !== null &&
      (dep._flag & (FLAG_STALE | FLAG_PENDING)) === FLAG_PENDING
    );
  }

  /** -2 = fresh entry (scan from dep1), -1 = resume after dep1, >= 0 = resume after _deps[n] */
  let resumeFrom = -2;

  outer: for (; ;) {
    let lastRun = node._time;
    let i;

    /**
     * Labeled block: `break scan` skips the flag-clearing code and
     * jumps directly to the ascend loop when a dep has changed.
     * This eliminates the `updated` boolean and its branches.
     */
    scan: {
      if (resumeFrom === -2) {
        /** Fresh entry: start scanning from dep1 */
        dep = node._dep1;
        if (dep !== null) {
          let flag = dep._flag;
          if (flag & FLAG_STALE) {
            dep._update(time);
          } else if (flag & FLAG_PENDING) {
            /** Descend into dep1 — push current node, resume later */
            CSTACK[CTOP] = node;
            CINDEX[CTOP] = -1;
            CTOP++;
            node = dep;
            continue outer;
          }
          if (dep._ctime > lastRun) {
            node._update(time);
            break scan;
          }
        }
        i = 0;
      } else if (resumeFrom === -1) {
        /** Returned from processing dep1 — check if it changed */
        if (node._dep1._ctime > lastRun) {
          node._update(time);
          break scan;
        }
        i = 0;
      } else {
        /** Returned from processing _deps[resumeFrom] — check ctime */
        if (node._deps[resumeFrom]._ctime > lastRun) {
          node._update(time);
          break scan;
        }
        i = resumeFrom + 1;
      }

      let deps = node._deps;
      if (deps !== null) {
        let count = deps.length;
        for (; i < count; i++) {
          dep = deps[i];
          let flag = dep._flag;
          if (flag & FLAG_STALE) {
            dep._update(time);
          } else if (flag & FLAG_PENDING) {
            /** Descend into deps[i] — push current node */
            CSTACK[CTOP] = node;
            CINDEX[CTOP] = i;
            CTOP++;
            node = dep;
            resumeFrom = -2;
            continue outer;
          }
          if (dep._ctime > lastRun) {
            node._update(time);
            break scan;
          }
        }
      }

      /** No dep changed — clear flags without re-executing */
      node._time = time;
      node._flag &= ~(FLAG_STALE | FLAG_PENDING);
    }

    /**
     * Unified ascend: tight loop that either cascades updates up the
     * stack (when child _ctime changed) or fast-clears parent flags
     * (when child didn't change and parent has no more deps to check).
     * Falls back to the main scan loop only when a parent has
     * remaining unchecked deps.
     */
    while (CTOP > base) {
      CTOP--;
      let parent = CSTACK[CTOP];
      /** Release the slot so the popped compute isn't rooted in
       *  CSTACK until the slot is overwritten by a future call.
       *  CINDEX holds numbers, so no cleanup needed there. */
      CSTACK[CTOP] = null;
      /**
       * `node` is always the child that the parent was scanning
       * when it pushed — no need to look it up from parent._dep1
       * or parent._deps[idx]. The common deep-propagation case
       * falls into the cascade branch below, which doesn't need
       * the pushed index — defer the `CINDEX[CTOP]` read until
       * we actually enter the "had no change" branch.
       */
      if (node._ctime > parent._time) {
        /** Child changed — update parent and keep cascading */
        parent._update(time);
        node = parent;
        continue;
      }
      /** Child unchanged — check if parent has more deps to scan */
      let idx = CINDEX[CTOP];
      if (idx === -1) {
        if (parent._deps !== null) {
          /** Has deps array — resume scanning in main loop */
          node = parent;
          resumeFrom = -1;
          continue outer;
        }
      } else if (idx + 1 < parent._deps.length) {
        /** More entries in deps array — resume scanning */
        node = parent;
        resumeFrom = idx;
        continue outer;
      }
      /** No more deps — clear parent and keep ascending */
      parent._time = time;
      parent._flag &= ~(FLAG_STALE | FLAG_PENDING);
      node = parent;
    }
    return;
  }
}

/**
 * Classifies a value returned from a compute/effect fn:
 *   1 (ASYNC_PROMISE)  — thenable: resolve as a promise.
 *   2 (ASYNC_ITERATOR) — async iterable/iterator: consume incrementally.
 *   3 (ASYNC_SYNC)     — plain value: settle immediately, no loading.
 * @param {*} value
 * @returns {number}
 */
function asyncKind(value) {
  if (value === null || typeof value !== "object") {
    return ASYNC_SYNC;
  }
  if (typeof value.then === "function") {
    return ASYNC_PROMISE;
  }
  if (typeof value[Symbol.asyncIterator] === "function") {
    return ASYNC_ITERATOR;
  }
  return ASYNC_SYNC;
}

/**
 * @template T
 * @param {Compute<T>} node
 * @param {IThenable<T>} promise
 * @param {number} time
 * @returns {void}
 */
function resolvePromise(node, promise, time) {
  promise.then(
    (val) => {
      if (node._time !== time || (node._flag & FLAG_DISPOSED && !(node._flag & FLAG_LOCK))) {
        return;
      }
      if (!(node._flag & FLAG_LOCK)) {
        if (node._flag & FLAG_STALE) {
          return;
        }
        if (node._flag & FLAG_PENDING && needsUpdate(node, TIME)) {
          node._flag |= FLAG_STALE;
          return;
        }
      }
      node._settle(val);
    },
    (err) => {
      if (node._time !== time || (node._flag & FLAG_DISPOSED && !(node._flag & FLAG_LOCK))) {
        return;
      }
      if (!(node._flag & FLAG_LOCK)) {
        if (node._flag & FLAG_STALE) {
          return;
        }
        if (node._flag & FLAG_PENDING && needsUpdate(node, TIME)) {
          node._flag |= FLAG_STALE;
          return;
        }
      }
      node._error(err);
    }
  );
}

/**
 * @template T
 * @param {Compute<T>} node
 * @param {AsyncIterator<T> | AsyncIterable<T>} iterable
 * @param {number} time
 * @returns {void}
 */
function resolveIterator(node, iterable, time) {
  /** @type {AsyncIterator<T>} */
  let iterator =
    typeof iterable[Symbol.asyncIterator] === "function"
      ? iterable[Symbol.asyncIterator]()
      : iterable;

  /** @param {IteratorResult<T>} result */
  let onNext = (result) => {
    if (node._time !== time || (node._flag & FLAG_DISPOSED && !(node._flag & FLAG_LOCK))) {
      if (typeof iterator.return === "function") {
        iterator.return();
      }
      return;
    }
    if (!(node._flag & FLAG_LOCK)) {
      if (node._flag & FLAG_STALE) {
        if (typeof iterator.return === "function") {
          iterator.return();
        }
        return;
      }
      if (node._flag & FLAG_PENDING && needsUpdate(node, TIME)) {
        node._flag |= FLAG_STALE;
        if (typeof iterator.return === "function") {
          iterator.return();
        }
        return;
      }
    }

    if (result.done) {
      return;
    }

    iterator.next().then(onNext, onError);

    node._settle(result.value);
  };

  /** @param {*} err */
  let onError = (err) => {
    if (node._time !== time || (node._flag & FLAG_DISPOSED && !(node._flag & FLAG_LOCK))) {
      return;
    }
    if (!(node._flag & FLAG_LOCK)) {
      if (node._flag & FLAG_STALE) {
        return;
      }
      if (node._flag & FLAG_PENDING && needsUpdate(node, TIME)) {
        node._flag |= FLAG_STALE;
        return;
      }
    }
    node._error(err);
  };

  iterator.next().then(onNext, onError);
}

/**
 * Three-pass settle notification. Resolves waiters without triggering
 * redundant stale notifications on nodes that appear in both the sync
 * subscriber list and the async waiter list.
 *
 * Pass 1: Stamp all sync subs with `version - 1` ("belongs to us").
 * Pass 2: Walk waiters — resolve callback, skip subscribe if already
 *         a sync sub (version - 1), stamp with `version` ("notified").
 * Pass 3: Inline notify — OR FLAG_STALE on all subs, but only call
 *         _receive() on subs not stamped `version` (not a waiter).
 *
 * @param {Sender} node
 * @param {*} value
 * @param {boolean} isError
 * @param {Array} waiters
 * @param {number} waiterCount
 */
function settleNotify(node, value, isError, waiters, waiterCount) {
  let version = (SEED += 2);

  /** Pass 1: stamp all sync subs with version - 1. */
  let sub = node._sub1;
  if (sub !== null) {
    sub._version = version - 1;
  }
  let subs = node._subs;
  if (subs !== null) {
    let count = subs.length;
    for (let i = 0; i < count; i++) {
      subs[i]._version = version - 1;
    }
  }

  /** Pass 2: resolve waiters, skip subscribe if already a sync sub. */
  for (let i = 0; i < waiterCount; i += 3) {
    let awaiter = waiters[i];
    if (isError) {
      waiters[i + 2](value);
    } else {
      waiters[i + 1](value);
    }
    if (!(awaiter._flag & FLAG_BLOCKED)) {
      if (awaiter._version !== version - 1) {
        subscribe(awaiter, node);
      }
    }
    awaiter._version = version;
    clearRespond(awaiter, node);
  }

  /** Pass 3: inline notify — skip subs that were resolved as waiters. */
  if (sub !== null && sub._version !== version) {
    let flags = sub._flag;
    sub._flag |= FLAG_STALE;
    if (!(flags & (FLAG_PENDING | FLAG_STALE))) {
      sub._receive();
    }
  }
  if (subs !== null) {
    let count = subs.length;
    for (let i = 0; i < count; i++) {
      sub = subs[i];
      if (sub._version !== version) {
        let flags = sub._flag;
        sub._flag |= FLAG_STALE;
        if (!(flags & (FLAG_PENDING | FLAG_STALE))) {
          sub._receive();
        }
      }
    }
  }
}

/**
 * Unified dep sweep for async nodes at settle time.
 * 1. Deduplicates _deps (val() across awaits can insert duplicates).
 * 2. If deferred deps exist, subscribes unique deferred senders and
 *    checks if any changed. Returns true if node needs to re-run.
 * @param {Receiver} node
 * @returns {boolean}
 */
function settleDeps(node) {
  let stamp = (SEED += 2);
  let dep1 = node._dep1;
  let deps = node._deps;

  /** Grab defers before clearing. */
  let defer1 = null;
  let defer1val;
  let defers = null;
  let deferLen = 0;
  if (node._flag & FLAG_CHANNEL) {
    defer1 = node._chan._defer1;
    if (defer1 !== null) {
      defer1val = node._chan._defer1val;
      node._chan._defer1 = null;
    }
    defers = node._chan._defers;
    if (defers !== null) {
      deferLen = defers.length;
      node._chan._defers = null;
    }
  }

  /** Stamp dep1. */
  if (dep1 !== null) {
    dep1._version = stamp;
  }

  /** Dedup scan of _deps — remove duplicates via swap-with-last. */
  let hasDefers = defer1 !== null || deferLen > 0;
  if (deps !== null) {
    let i = deps.length - 1;
    let write = deps.length;
    while (i >= 0) {
      let dep = deps[i];
      if (dep._version === stamp) {
        clearReceiver(dep, node);
        write--;
        if (i !== write) {
          let lastDep;
          if (hasDefers) {
            lastDep = deps[write];
          } else {
            lastDep = deps.pop();
          }
          deps[i] = lastDep;
        } else if (!hasDefers) {
          deps.pop();
        }
      } else {
        dep._version = stamp;
      }
      i--;
    }
    if (hasDefers && write < deps.length) {
      deps.length = write;
    }
  }

  /** Phase 2: subscribe deferred deps and detect changes. */
  if (!hasDefers) {
    return false;
  }

  let changed = false;

  /** Check defer1 first. */
  if (defer1 !== null) {
    if (defer1._version === stamp) {
      if (defer1._changed(defer1val)) {
        changed = true;
      }
    } else {
      defer1._version = stamp;
      subscribe(node, defer1);
      if (defer1._changed(defer1val)) {
        changed = true;
      }
    }
  }

  /** Check overflow defers. */
  for (let i = 0; i < deferLen; i += 2) {
    let sender = defers[i];
    let snapshot = defers[i + 1];
    if (sender._version === stamp) {
      if (sender._changed(snapshot)) {
        changed = true;
      }
      continue;
    }
    sender._version = stamp;
    subscribe(node, sender);
    if (sender._changed(snapshot)) {
      changed = true;
    }
  }
  return changed;
}

/**
 * Resets async fiber state before re-execution. Aborts the previous
 * controller, clears stale defers, and removes channel bindings.
 * Shared between Compute and Effect _update paths.
 * @param {Receiver} node
 * @returns {void}
 */
function resetChannel(node) {
  let chan = node._chan;
  if (chan._controller !== null) {
    chan._controller.abort();
    chan._controller = null;
  }
  chan._defer1 = null;
  chan._defers = null;
  if (chan._res1 !== null || chan._responds !== null) {
    clearChannel(chan, node);
  }
}

/**
 * Adds a waiter entry to a responder's _waiters array (3-stride).
 * @param {Channel} responderCh
 * @param {Receiver} awaiter
 * @param {function} resolve
 * @param {function} reject
 * @returns {void}
 */
function addWaiter(responderCh, awaiter, resolve, reject) {
  let waiters = responderCh._waiters;
  if (waiters === null) {
    responderCh._waiters = [awaiter, resolve, reject];
  } else {
    waiters.push(awaiter, resolve, reject);
  }
}

/**
 * Creates a two-way channel binding between an awaiter and a task.
 * Stores the task in the awaiter's responds list and the awaiter
 * in the task's waiters list.
 * @param {Compute | !Effect} awaiter
 * @param {Compute} task
 * @param {function(*)} resolve
 * @param {function(*)} reject
 * @returns {void}
 */
function send(awaiter, task, resolve, reject) {
  resolve = resolve || NOOP;
  reject = reject || NOOP;
  let awaiterCh = awaiter._channel();
  let responderCh = task._channel();

  addWaiter(responderCh, awaiter, resolve, reject);
  task._flag |= FLAG_WAITER;

  if (awaiterCh._res1 === null) {
    awaiterCh._res1 = task;
  } else if (awaiterCh._responds === null) {
    awaiterCh._responds = [task];
  } else {
    awaiterCh._responds.push(task);
  }
}

/**
 * Removes a single awaiter from a responder's _waiters array.
 * Linear scan for identity match, then 3-stride swap-with-last.
 * Clears FLAG_WAITER on the responder when the last waiter is removed.
 * @param {Compute} responder
 * @param {Channel} responderCh
 * @param {Receiver} awaiter
 * @returns {void}
 */
function removeWaiter(responder, responderCh, awaiter) {
  let waiters = responderCh._waiters;
  let count = waiters.length;
  for (let i = 0; i < count; i += 3) {
    if (waiters[i] !== awaiter) {
      continue;
    }
    let lastReject = waiters.pop();
    let lastResolve = waiters.pop();
    let lastAwaiter = waiters.pop();
    if (i < waiters.length) {
      waiters[i] = lastAwaiter;
      waiters[i + 1] = lastResolve;
      waiters[i + 2] = lastReject;
    }
    break;
  }
  if (waiters.length === 0) {
    responderCh._waiters = null;
    responder._flag &= ~FLAG_WAITER;
  }
}

/**
 * Removes this awaiter from all responders it's waiting on.
 * @param {Channel} channel
 * @param {Receiver} awaiter
 * @returns {void}
 */
function clearChannel(channel, awaiter) {
  let res = channel._res1;
  if (res !== null) {
    removeWaiter(res, res._chan, awaiter);
    channel._res1 = null;
  }
  let responds = channel._responds;
  if (responds !== null) {
    for (let i = 0; i < responds.length; i++) {
      let responder = responds[i];
      if (responder === null) {
        continue;
      }
      removeWaiter(responder, responder._chan, awaiter);
    }
    channel._responds = null;
  }
}

/**
 * Clears an awaiter's back-reference to a responder.
 * Scans _res1 and _responds for identity match.
 * @param {Receiver} awaiter
 * @param {Compute} responder
 */
function clearRespond(awaiter, responder) {
  let awaiterCh = awaiter._chan;
  if (awaiterCh._res1 === responder) {
    awaiterCh._res1 = null;
    return;
  }
  let responds = awaiterCh._responds;
  if (responds !== null) {
    for (let i = 0; i < responds.length; i++) {
      if (responds[i] === responder) {
        responds[i] = null;
        return;
      }
    }
  }
}

/**
 * Resolves (or rejects) all waiters of a responder and clears their
 * channel references. When panic is false, subscribes each awaiter as
 * a dep of the responder. When panic is true (responder is disposing),
 * skips subscription since the responder is dead.
 * @param {Compute} responder
 * @param {Channel} responderCh
 * @param {*} value
 * @param {boolean} isError
 * @param {boolean} panic
 * @returns {void}
 */
function resolveWaiters(responder, responderCh, value, isError, panic) {
  let waiters = responderCh._waiters;
  let count = waiters.length;
  for (let i = 0; i < count; i += 3) {
    let awaiter = waiters[i];
    if (isError) {
      waiters[i + 2](value);
    } else {
      waiters[i + 1](value);
    }
    if (!panic && !(awaiter._flag & FLAG_BLOCKED)) {
      subscribe(awaiter, responder);
    }
    clearRespond(awaiter, responder);
  }
  responderCh._waiters = null;
  responder._flag &= ~FLAG_WAITER;
}


/**
 * Runs `fn` with the root node itself as the argument. Prototype methods
 * on Root (compute/effect/derive/etc.) use `this` (the root) as the owner.
 * @param {Root} root
 * @param {function(!Root): ((function(): void) | void)} fn
 * @returns {void}
 */
function startRoot(root, fn) {
  let idle = IDLE;
  IDLE = true;
  try {
    fn(root);
  } finally {
    IDLE = idle;
  }
}

/**
 * @param {Compute} node
 * @returns {void}
 */
function startCompute(node) {
  if (IDLE) {
    IDLE = false;
    try {
      TRANSACTION = SEED;
      node._update(TIME);
      if (SENDER_COUNT > 0 || DISPOSER_COUNT > 0) {
        flush();
      }
    } finally {
      IDLE = true;
    }
  } else {
    node._update(TIME);
  }
}

/**
 * @param {Effect} node
 * @returns {void}
 */
function startEffect(node) {
  if (IDLE) {
    IDLE = false;
    try {
      TRANSACTION = SEED;
      node._update(TIME);
      if (SENDER_COUNT > 0 || DISPOSER_COUNT > 0) {
        flush();
      }
    } catch (err) {
      if (node._finalize !== null) {
        clearFinalize(node);
      }
      let error = node._flag & FLAG_PANIC ? err : { error: err, type: FATAL };
      node._flag &= ~FLAG_PANIC;
      let result = tryRecover(node, error);
      if (result !== RECOVER_SELF) {
        node._dispose();
      }
      if (result === RECOVER_NONE) {
        throw error;
      }
    } finally {
      IDLE = true;
    }
  } else {
    try {
      node._update(TIME);
    } catch (err) {
      if (node._finalize !== null) {
        clearFinalize(node);
      }
      let error = node._flag & FLAG_PANIC ? err : { error: err, type: FATAL };
      node._flag &= ~FLAG_PANIC;
      let result = tryRecover(node, error);
      if (result !== RECOVER_SELF) {
        node._dispose();
      }
      if (result === RECOVER_NONE) {
        throw error;
      }
    }
  }
}

/**
 * @returns {void}
 */
function flush() {
  /** @type {number} */
  let time = 0;
  /** @type {number} */
  let cycle = 0;
  /** @type {*} */
  let error = null;
  /** @type {boolean} */
  let thrown = false;
  IDLE = false;
  try {
    do {
      time = ++TIME;
      if (DISPOSER_COUNT > 0) {
        let count = DISPOSER_COUNT;
        for (let i = 0; i < count; i++) {
          DISPOSES[i]._dispose();
          DISPOSES[i] = null;
        }
        DISPOSER_COUNT = 0;
      }
      if (SENDER_COUNT > 0) {
        let count = SENDER_COUNT;
        for (let i = 0; i < count; i++) {
          UPDATES[i](SENDERS[i], PAYLOADS[i], time);
          SENDERS[i] = PAYLOADS[i] = UPDATES[i] = null;
        }
        SENDER_COUNT = 0;
      }
      if (COMPUTE_COUNT > 0) {
        let count = COMPUTE_COUNT;
        for (let i = 0; i < count; i++) {
          let node = COMPUTES[i];
          COMPUTES[i] = null;
          if (
            node._flag & FLAG_STALE ||
            (node._flag & FLAG_PENDING && needsUpdate(node, time))
          ) {
            node._update(time);
          } else {
            node._flag &= ~(FLAG_STALE | FLAG_PENDING);
          }
        }
        COMPUTE_COUNT = 0;
      }
      if (SCOPE_COUNT > 0) {
        let levels = LEVELS.length;
        for (let i = 0; i < levels; i++) {
          let count = LEVELS[i];
          let effects = SCOPES[i];
          for (let j = 0; j < count; j++) {
            let node = effects[j];
            if (
              node._flag & FLAG_STALE ||
              (node._flag & FLAG_PENDING && needsUpdate(node, time))
            ) {
              try {
                TRANSACTION = SEED;
                node._update(time);
              } catch (err) {
                if (node._finalize !== null) {
                  clearFinalize(node);
                }
                let e = node._flag & FLAG_PANIC ? err : { error: err, type: FATAL };
                node._flag &= ~FLAG_PANIC;
                let result = tryRecover(node, e);
                if (result !== RECOVER_SELF) {
                  node._dispose();
                }
                if (!thrown && result === RECOVER_NONE) {
                  error = e;
                  thrown = true;
                }
              }
            } else {
              node._flag &= ~(FLAG_STALE | FLAG_PENDING);
            }
            effects[j] = null;
          }
          LEVELS[i] = 0;
        }
        SCOPE_COUNT = 0;
      }
      if (RECEIVER_COUNT > 0) {
        let count = RECEIVER_COUNT;
        for (let i = 0; i < count; i++) {
          let node = RECEIVERS[i];
          RECEIVERS[i] = null;
          if (
            node._flag & FLAG_STALE ||
            (node._flag & FLAG_PENDING && needsUpdate(node, time))
          ) {
            TRANSACTION = SEED;
            try {
              node._update(time);
            } catch (err) {
              if (node._finalize !== null) {
                clearFinalize(node);
              }
              let e = node._flag & FLAG_PANIC ? err : { error: err, type: FATAL };
              node._flag &= ~FLAG_PANIC;
              let result = tryRecover(node, e);
              if (result !== RECOVER_SELF) {
                node._dispose();
              }
              if (!thrown && result === RECOVER_NONE) {
                error = e;
                thrown = true;
              }
            }
          } else {
            node._flag &= ~(FLAG_STALE | FLAG_PENDING);
          }
        }
        RECEIVER_COUNT = 0;
      }
      if (PURGE_COUNT > 0) {
        let count = PURGE_COUNT;
        for (let i = 0; i < count; i++) {
          PURGES[i]._purge();
          PURGES[i] = null;
        }
        PURGE_COUNT = 0;
      }
      if (cycle++ === 1e5) {
        error = new Error("Runaway cycle");
        thrown = true;
        break;
      }
    } while (!thrown && (SENDER_COUNT > 0 || DISPOSER_COUNT > 0));
  } finally {
    IDLE = true;
    DISPOSER_COUNT = SENDER_COUNT = SCOPE_COUNT = RECEIVER_COUNT = PURGE_COUNT = 0;
    if (thrown) {
      throw error;
    }
  }
}

/**
 * Microtask flush callback. Drains the queue if idle,
 * otherwise the active transaction will handle it.
 */
function microflush() {
  POSTING = false;
  flush();
}

/**
 * Creates a sync compute node.
 * Unbound: compute(fn, seed?, opts?, args?)
 * Bound:   compute(dep, fn, seed?, opts?, args?)
 * @param {Sender | Function} depOrFn
 * @param {Function | *} fnOrSeed
 * @param {number | *} optsOrSeed
 * @param {number | *} argsOrOpts
 * @param {*} [args]
 * @returns {Compute}
 */
function compute(depOrFn, fnOrSeed, optsOrSeed, argsOrOpts, args) {
  let flag, node;
  if (typeof depOrFn === "function") {
    flag = FLAG_SETUP | ((0 | optsOrSeed) & OPTIONS);
    node = new Compute(flag, depOrFn, null, fnOrSeed, argsOrOpts);
  } else {
    flag = FLAG_STABLE | FLAG_BOUND | FLAG_SINGLE | ((0 | argsOrOpts) & OPTIONS);
    node = new Compute(flag, fnOrSeed, depOrFn, optsOrSeed, args);
    connect(depOrFn, node);
  }
  if (!(flag & FLAG_DEFER)) {
    startCompute(node);
  }
  return node;
}

/**
 * Creates an async compute node (task).
 * Unbound: task(fn, seed?, opts?, args?)
 * Bound:   task(dep, fn, seed?, opts?, args?)
 * @param {Sender | Function} depOrFn
 * @param {Function | *} fnOrSeed
 * @param {number | *} optsOrSeed
 * @param {number | *} argsOrOpts
 * @param {*} [args]
 * @returns {Compute}
 */
function task(depOrFn, fnOrSeed, optsOrSeed, argsOrOpts, args) {
  let flag, node;
  if (typeof depOrFn === "function") {
    flag = FLAG_ASYNC | FLAG_SETUP | ((0 | optsOrSeed) & OPTIONS);
    node = new Compute(flag, depOrFn, null, fnOrSeed, argsOrOpts);
  } else {
    flag =
      FLAG_ASYNC | FLAG_STABLE | FLAG_BOUND | FLAG_SINGLE | ((0 | argsOrOpts) & OPTIONS);
    node = new Compute(flag, fnOrSeed, depOrFn, optsOrSeed, args);
    connect(depOrFn, node);
  }
  if (!(flag & FLAG_DEFER)) {
    startCompute(node);
  }
  return node;
}

/**
 * Creates a sync effect node.
 * Unbound: effect(fn, opts?, args?)
 * Bound:   effect(dep, fn, opts?, args?)
 * @param {Sender | Function} depOrFn
 * @param {Function | number} fnOrOpts
 * @param {number | *} optsOrArgs
 * @param {*} [args]
 * @returns {Effect}
 */
function effect(depOrFn, fnOrOpts, optsOrArgs, args) {
  let flag, node;
  if (typeof depOrFn === "function") {
    flag = FLAG_SETUP | ((0 | fnOrOpts) & OPTIONS);
    node = new Effect(flag, depOrFn, null, null, optsOrArgs);
  } else {
    flag = FLAG_STABLE | FLAG_BOUND | FLAG_SINGLE | ((0 | optsOrArgs) & OPTIONS);
    node = new Effect(flag, fnOrOpts, depOrFn, null, args);
    connect(depOrFn, node);
  }
  startEffect(node);
  return node;
}

/**
 * Creates an async effect node (spawn).
 * Unbound: spawn(fn, opts?, args?)
 * Bound:   spawn(dep, fn, opts?, args?)
 * @param {Sender | Function} depOrFn
 * @param {Function | number} fnOrOpts
 * @param {number | *} optsOrArgs
 * @param {*} [args]
 * @returns {Effect}
 */
function spawn(depOrFn, fnOrOpts, optsOrArgs, args) {
  let flag, node;
  if (typeof depOrFn === "function") {
    flag = FLAG_ASYNC | FLAG_SETUP | ((0 | fnOrOpts) & OPTIONS);
    node = new Effect(flag, depOrFn, null, null, optsOrArgs);
  } else {
    flag =
      FLAG_ASYNC | FLAG_STABLE | FLAG_BOUND | FLAG_SINGLE | ((0 | optsOrArgs) & OPTIONS);
    node = new Effect(flag, fnOrOpts, depOrFn, null, args);
    connect(depOrFn, node);
  }
  startEffect(node);
  return node;
}

/**
 * @param {function(): void} fn
 * @returns {void}
 */
function batch(fn) {
  if (IDLE) {
    IDLE = false;
    try {
      fn();
      flush();
    } finally {
      IDLE = true;
    }
  } else {
    fn();
  }
}

export {
  Root, Signal, Compute, Effect,
  FLAG_STALE,
  FLAG_PENDING,
  FLAG_SCHEDULED,
  FLAG_DISPOSED,
  FLAG_INIT,
  FLAG_SETUP,
  FLAG_LOADING,
  FLAG_ERROR,
  FLAG_RELAY,
  FLAG_DEFER,
  FLAG_STABLE,
  FLAG_SINGLE,
  FLAG_WEAK,
  FLAG_EQUAL,
  FLAG_NOTEQUAL,
  FLAG_ASYNC,
  FLAG_BOUND,
  FLAG_CHANNEL,

  FLAG_EAGER,
  FLAG_BLOCKED,
  FLAG_LOCK,
  FLAG_SUSPEND,
  REFUSE,
  PANIC,
  FATAL,
  OPT_DEFER,
  OPT_STABLE,
  OPT_SETUP,
  OPT_WEAK,
  OPTIONS,
  IDLE,
  connect,
  subscribe,
  schedule,
  assign,
  notify,
  flush,
  batch,
  startEffect,
  startCompute,
  signal,
  relay,
  compute,
  task,
  effect,
  spawn,
  root
};
