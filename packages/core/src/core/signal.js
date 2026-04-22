import {
  Disposer,
  Owner,
  Sender,
  Receiver,
  ISignal,
  ICompute,
  IEffect
} from "./types.js";

// ─── Flags ─────────────────────────────────────────────────────────────────

/* Sender flags (bits 0-5) — readable on any Sender (Signal or Compute).
 * Bits 6+ on a plain Signal are free for extension (e.g. mod encoding
 * in @fyren/list). FLAG_RECEIVER distinguishes Compute/Effect from Signal. */
const FLAG_STALE = 1 << 0;
const FLAG_PENDING = 1 << 1;
const FLAG_SCHEDULED = 1 << 2;
const FLAG_DISPOSED = 1 << 3;
const FLAG_ERROR = 1 << 4;
const FLAG_RECEIVER = 1 << 5;

/* Receiver flags (bits 6+) — only valid when FLAG_RECEIVER is set. */
const FLAG_INIT = 1 << 6;
const FLAG_SETUP = 1 << 7;
const FLAG_LOADING = 1 << 8;
const FLAG_DEFER = 1 << 9;
const FLAG_STABLE = 1 << 10;
const FLAG_EQUAL = 1 << 11;
const FLAG_NOTEQUAL = 1 << 12;
const FLAG_ASYNC = 1 << 13;
const FLAG_BOUND = 1 << 14;
const FLAG_WAITER = 1 << 15;
const FLAG_FIBER = 1 << 16;
const FLAG_BLOCKED = 1 << 17;

/* Shared Sender | Receiver flags — read on generic Sender-typed variables.
 * Code that reads them MUST also check FLAG_RECEIVER to avoid false positives
 * from Signal mod bits occupying the same bit positions. */
const FLAG_SINGLE = 1 << 28;
const FLAG_WEAK = 1 << 29;
const FLAG_EAGER = 1 << 30;

/* Option flags */
const OPT_DEFER = FLAG_DEFER;
const OPT_STABLE = FLAG_STABLE;
const OPT_SETUP = FLAG_SETUP;
const OPT_WEAK = FLAG_WEAK;

const OPTIONS = OPT_DEFER | OPT_STABLE | OPT_SETUP | OPT_WEAK;


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

/**
 * Thrown (synchronously) when an async node's fn returns a non-sync
 * value (promise/iterator) without having called `c.suspend()`. This
 * catches the common mistake of forgetting `c.suspend()`, which would
 * let code continue executing after the node is disposed.
 * @const
 */
const ASSERT_DISPOSED = "Cannot access a disposed node";

// ─── Global state ──────────────────────────────────────────────────────────

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
 * During FLAG_SETUP _update, deps are written here as [sender, subslot]
 * pairs. After the fn returns, _deps is created via slice() with
 * exact capacity — avoiding V8's push-based over-allocation.
 * @type {Array<Sender | number>}
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

// ─── Constructors ──────────────────────────────────────────────────────────
// All five node types declared together. Fields only — methods are installed
// on the prototypes further down, after the prototype-method implementations
// they reference are in scope.

/**
 * @constructor
 * @implements {Owner}
 */
function Root() {
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
function Signal(value, guard) {
  /** @type {number} */
  this._flag = 0;
  /** @type {T} */
  this._value = value;
  /** @type {number} */
  this._version = -1;
  /** @type {Receiver} */
  this._sub1 = null;
  /** @type {number} */
  this._sub1slot = 0;
  /** @type {Array<Receiver | number> | null} */
  this._subs = null;
  /** @type {(function(T,T): boolean) | null} */
  this._guard = guard || null;
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
  this._flag = FLAG_RECEIVER | FLAG_INIT | FLAG_STALE | opts;
  /** @type {T} */
  this._value = seed;
  /** @type {number} */
  this._version = -1;
  /** @type {Receiver} */
  this._sub1 = null;
  /** @type {number} */
  this._sub1slot = 0;
  /** @type {Array<Receiver | number> | null} */
  this._subs = null;
  /** @type {(function(T): T) | (function(T, U): T) | (function(T,U,V): T) | null} */
  this._fn = fn;
  /** @type {Sender<U>} */
  this._dep1 = dep1;
  /** @type {number} */
  this._dep1slot = 0;
  /** @type {Array<Sender | number> | null} */
  this._deps = null;
  /** @type {number} */
  this._time = 0;
  /** @type {number} */
  this._ctime = 0;
  /** @type {Function | Array<Function> | null} */
  this._cleanup = null;
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
  this._flag = FLAG_RECEIVER | FLAG_INIT | (0 | opts);
  /** @type {(function(W): (function(): void | void)) | (function(U,W): (function(): void | void)) | (function(U,V,W): (function(): void | void)) | null} */
  this._fn = fn;
  /** @type {Sender<U> | null} */
  this._dep1 = dep1;
  /** @type {number} */
  this._dep1slot = 0;
  /** @type {Array<Sender | number> | null} */
  this._deps = null;
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
  /** @type {W | undefined} */
  this._args = args;
}

/**
 * Guarded signal. Subclass of Signal with type guards (validated
 * on set) and custom equality checks (skip set when equal).
 * Copies all Signal fields inline to avoid prototype chain overhead.
 * @constructor
 * @template T
 * @param {T} value
 */
/**
 * Async execution context for task/spawn nodes. Created lazily on first
 * call to a context utility (e.g. controller(), defer()). Stored in the
 * _args wrapper as { _args, _fiber: Fiber }.
 * @constructor
 */
function Fiber() {
  /** @type {AbortController | null} */
  this._controller = null;
  /** @type {Array<Sender | *> | null} Paired [sender, value] entries. */
  this._defers = null;
  /** @type {Channel | null} Async channel for awaiter/responder bindings. */
  this._channel = null;
}

/**
 * Unified async channel. Implements both IAwaiter (can await other tasks)
 * and IResponder (can be awaited by others).
 * @constructor
 */
function Channel() {
  /** @type {Compute | null} First responder we're waiting on. */
  this._res1 = null;
  /** @type {number} Our slot in _res1's _waiters (index into 4-stride). */
  this._res1slot = 0;
  /** @type {Array<Compute | number> | null} Additional [responder, slot] pairs. */
  this._responds = null;
  /** @type {Array | null} 4-stride: [awaiter, awaiterResSlot, resolve, reject]. */
  this._waiters = null;
}

// ─── Prototype method implementations ──────────────────────────────────────
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
 * @this {!Compute | !Effect}
 * @param {!Sender} sender
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
 * @template T
 * @this {Sender<T>}
 * @param {T} value
 * @returns {void}
 */
function set(value) {
  if (this._value !== value) {
    if (IDLE) {
      this._value = value;
      this._ctime = TIME + 1;
      /** The manual value is now canonical: clear any pending
       *  re-run so `val()` returns it directly instead of
       *  invoking fn and clobbering. The next upstream change
       *  will re-mark STALE via notify and fn runs again. */
      this._flag &= ~(FLAG_STALE | FLAG_PENDING | FLAG_INIT);
      notify(this, FLAG_STALE);
      flush();
    } else {
      schedule(this, value, assignCompute);
    }
  }
}

/**
 * Batch-drain handler for signals. Sets value and notifies.
 * @param {!Signal} node
 * @param {*} value
 */
function assignSignal(node, value) {
  node._value = value;
  if (node._flag & FLAG_SCHEDULED) {
    node._flag &= ~FLAG_SCHEDULED;
    notify(node, FLAG_STALE);
  }
}

/**
 * Batch-drain handler for writable computes. Sets value, clears
 * FLAG_INIT, stamps _ctime, and notifies.
 * @param {!Compute} node
 * @param {*} value
 */
function assignCompute(node, value) {
  node._value = value;
  if (node._flag & FLAG_SCHEDULED) {
    node._flag &= ~(FLAG_SCHEDULED | FLAG_INIT);
    node._ctime = TIME;
    notify(node, FLAG_STALE);
  }
}

/**
 * Enqueues a deferred update to run during the next drain cycle.
 * Used by extension packages (e.g. @fyren/list) to schedule custom
 * mutations like push, pop, splice without branching in the drain loop.
 * @param {!Sender} node
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
      let subslot = connect(sender, this, -1);
      this._dep1 = sender;
      this._dep1slot = subslot;
    } else {
      let depslot = DCOUNT - DBASE;
      let subslot = connect(sender, this, depslot);
      DSTACK[DCOUNT++] = sender;
      DSTACK[DCOUNT++] = subslot;
    }
  } else if (this._deps === null) {
    this._deps = [sender, 0];
    this._flag &= ~FLAG_SINGLE;
  } else {
    this._deps.push(sender, 0);
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
 *
 * @param {*} err
 * @returns {{ message: string }}
 */
function normalize(err) {
  if (
    err instanceof Error ||
    (err != null && typeof err.message === "string")
  ) {
    return err;
  }
  return { message: "Compute threw error: " + String(err) };
}

/**
 * Absorbs an error or disposed state into a compute node.
 * Sets FLAG_ERROR, stores the normalized error, and stamps _ctime.
 * @param {!Compute} node
 * @param {*} value
 * @param {number} time
 */
function absorb(node, value, time) {
  node._value = normalize(value);
  node._flag =
    (node._flag & ~(FLAG_STALE | FLAG_PENDING | FLAG_INIT)) | FLAG_ERROR;
  node._ctime = time;
}

/**
 * Refreshes a bound dep1 if stale/pending and returns its flag.
 * Returns FLAG_DISPOSED when dep1 is null (already disposed).
 * @param {Sender | null} dep
 * @returns {number}
 */
function refreshDep1(dep) {
  let dflag = dep !== null ? dep._flag : FLAG_DISPOSED;
  if (dflag & (FLAG_STALE | FLAG_PENDING)) {
    dep._refresh();
    return dep._flag;
  }
  return dflag;
}

// ─── Shared factories (used by both `c` and prototypes) ───────────────────

/**
 * @param {*} value
 * @returns {!Signal}
 */
/**
 * @template T
 * @param {T} value
 * @param {(function(T,T): boolean)=} guard - Equality function: (prev, next) => true if equal (skip update).
 *   To validate/assert, throw inside the guard when the value is invalid.
 * @returns {!Signal<T>}
 */
function signal(value, guard) {
  return new Signal(value, guard);
}

/**
 * @param {function(!Root): ((function(): void) | void)} fn
 * @returns {!Root}
 */
function root(fn) {
  let node = new Root();
  startRoot(node, fn);
  return node;
}

// ─── Prototype assignments ─────────────────────────────────────────────────

{
  /** @const */
  let RootProto = Root.prototype;
  /** @const */
  let SignalProto = Signal.prototype;
  /** @const */
  let ComputeProto = Compute.prototype;
  /** @const */
  let EffectProto = Effect.prototype;

  // ─── Prototype-level default fields ────────────────────────────────────

  RootProto._flag = 0;
  RootProto._owner = null;
  RootProto._level = -1;

  SignalProto._ctime = 0;

  // ─── Shared methods ────────────────────────────────────────────────────

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

  // IAwaitable — Compute + Effect (getters)
  let states = {
    error: { get() { return (this._flag & FLAG_ERROR) ? this._value : null; } },
    loading: { get() { return (this._flag & FLAG_LOADING) !== 0; } }
  };
  Object.defineProperties(ComputeProto, states);
  Object.defineProperties(EffectProto, states);

  let _disposed = { disposed: { get() { return (this._flag & FLAG_DISPOSED) !== 0; } } };
  Object.defineProperties(SignalProto, _disposed);
  Object.defineProperties(ComputeProto, _disposed);
  Object.defineProperties(EffectProto, _disposed);
  Object.defineProperties(RootProto, _disposed);

  // ─── Shared owner methods — Root + Effect ──────────────────────────────

  /**
   * Registers a cleanup fn on this owner. Stored compactly: _cleanup holds
   * a single fn for count=1, graduating to an array on the second.
   * @this {!Root | !Effect}
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
   * @this {!Root | !Effect}
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
   * @this {!Compute | !Effect}
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
   * @this {!Compute | !Effect}
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
  ComputeProto.equal = EffectProto.equal = equal;
  ComputeProto.stable = EffectProto.stable = stable;

  /**
   * Marks this compute as eager (push-based). Once set, the node
   * eagerly re-runs on notification instead of waiting for a pull.
   * @this {!Compute}
   */
  ComputeProto.eager = function () {
    this._flag |= FLAG_EAGER;
  };

  /**
   * Intercepts a promise so the async continuation is silently dropped
   * when the owning node has been disposed or re-run since this call.
   * Uses a WeakRef + activation timestamp to detect staleness.
   *
   * If the node is still current, resolves/rejects normally.
   * If stale or disposed, resolves to REGRET — a thenable whose
   * `.then()` is a no-op, so `await` never resumes and the closure
   * becomes eligible for GC.
   *
   * @template T
   * @this {!Compute | !Effect}
   * @param {!Promise<T>} promise
   * @returns {!Promise<T>}
   */
  /**
   * @this {!Compute | !Effect}
   * @param {!Promise | !Compute} promiseOrTask
   * @returns {*}
   */
  function suspend(promiseOrTask, onResolve, onReject) {
    /** Branch: array of tasks → concurrent await with single cursor.
     *  If onResolve/onReject are provided, uses pure callbacks (zero
     *  Promise allocation). Otherwise returns a Promise. */
    if (Array.isArray(promiseOrTask)) {
      return _suspendArray.call(this, promiseOrTask, onResolve, onReject);
    }
    /** Branch: Compute node with FLAG_ASYNC → task-await path. */
    if (promiseOrTask._flag !== undefined && promiseOrTask._flag & FLAG_ASYNC) {
      return _suspendTask.call(this, promiseOrTask, onResolve, onReject);
    }
    /** Existing promise path. */
    let ref = new WeakRef(this);
    let time = this._time;
    return promiseOrTask.then(
      function (val) {
        let node = ref.deref();
        if (
          node !== void 0 &&
          !(node._flag & FLAG_DISPOSED) &&
          node._time === time
        ) {
          return val;
        }
        return REGRET;
      },
      function (err) {
        let node = ref.deref();
        if (
          node !== void 0 &&
          !(node._flag & FLAG_DISPOSED) &&
          node._time === time
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
   * @this {!Compute | !Effect}
   * @param {!Compute} taskNode
   * @returns {*}
   */
  function _suspendTask(taskNode, onResolve, onReject) {
    if (taskNode._flag & FLAG_DISPOSED) {
      throw new Error(ASSERT_DISPOSED);
    }
    if (taskNode._flag & (FLAG_STALE | FLAG_PENDING)) {
      taskNode._refresh();
    }

    /** Fast-path: task is settled — subscribe and return value. */
    if (!(taskNode._flag & FLAG_LOADING)) {
      subscribe(this, taskNode);
      if (taskNode._flag & FLAG_ERROR) {
        if (onReject) {
          onReject(taskNode._value);
          return;
        }
        throw taskNode._value;
      }
      if (onResolve) {
        onResolve(taskNode._value);
        return;
      }
      return taskNode._value;
    }

    if (onResolve) {
      send(this, taskNode, onResolve, onReject);
      return;
    }

    /** Promise mode. */
    let self = this;
    let promise = new Promise(function (resolve, reject) {
      send(self, taskNode, resolve, reject);
    });

    return promise;
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
   * @this {!Compute | !Effect}
   * @param {!Array<!Compute>} tasks
   * @returns {!Array | !Promise<!Array>}
   */
  function _suspendArray(tasks, onResolve, onReject) {
    this._flag |= FLAG_BLOCKED;
    let count = tasks.length;
    if (count === 0) {
      this._flag &= ~FLAG_BLOCKED;
      if (onResolve) {
        onResolve([]);
        return;
      }
      return [];
    }
    let results = new Array(count);
    let visited = new Array(count);

    /** Fast-path: try to collect everything synchronously. */
    let filled = 0;
    for (let i = 0; i < count; i++) {
      let task = tasks[i];
      if (task._flag & (FLAG_STALE | FLAG_PENDING)) {
        task._refresh();
      }
      if (task._flag & FLAG_LOADING) {
        break;
      }
      if (task._flag & FLAG_ERROR) {
        if (onReject) {
          onReject(task._value);
          return;
        }
        throw task._value;
      }
      results[i] = task._value;
      visited[i] = 1;
      filled++;
    }

    if (filled === count) {
      this._flag &= ~FLAG_BLOCKED;
      for (let i = 0; i < count; i++) {
        subscribe(this, tasks[i]);
      }
      if (onResolve) {
        onResolve(results);
        return;
      }
      return results;
    }

    /** At least one is loading — start the callback-driven walk. */
    if (onResolve) {
      _stepArray(this, tasks, results, visited, filled, onResolve, onReject);
      return;
    }

    /** No callbacks — allocate one Promise. */
    let self = this;
    return new Promise(function (resolve, reject) {
      _stepArray(self, tasks, results, visited, filled, resolve, reject);
    });
  }

  /**
   * Walk the task array from `start`, wrapping around. Collects
   * settled values into `results`. On the first loading task,
   * peeks all remaining, binds one waiter that resumes the walk.
   * When all slots are filled, subscribes and resolves.
   * @param {!Compute | !Effect} node
   * @param {!Array<!Compute>} tasks
   * @param {!Array} results
   * @param {!Array} visited
   * @param {number} start
   * @param {function(!Array)} resolve
   * @param {function(*)} reject
   */
  function _stepArray(node, tasks, results, visited, start, resolve, reject) {
    let count = tasks.length;
    let blocked = -1;
    let steps = 0;
    while (steps < count) {
      let idx = (start + steps) % count;
      if (!visited[idx]) {
        let task = tasks[idx];
        if (task._flag & (FLAG_STALE | FLAG_PENDING)) {
          task._refresh();
        }
        if (task._flag & FLAG_LOADING) {
          blocked = idx;
          break;
        }
        if (task._flag & FLAG_ERROR) {
          reject(task._value);
          return;
        }
        results[idx] = task._value;
        visited[idx] = 1;
      }
      steps++;
    }

    /** All filled — subscribe and resolve. */
    if (blocked === -1) {
      node._flag &= ~FLAG_BLOCKED;
      for (let i = 0; i < count; i++) {
        subscribe(node, tasks[i]);
      }
      resolve(results);
      return;
    }

    /** Peek remaining unfilled tasks so they're current. */
    for (let j = 1; j < count; j++) {
      let k = (blocked + j) % count;
      if (!visited[k]) {
        let t = tasks[k];
        if (t._flag & (FLAG_STALE | FLAG_PENDING)) {
          t._refresh();
        }
      }
    }

    /** Bind waiter to the blocked task. */
    let task = tasks[blocked];
    send(node, task,
      function (value) {
        if (task._flag & FLAG_ERROR) {
          reject(task._value);
          return;
        }
        results[blocked] = value;
        visited[blocked] = 1;
        _stepArray(node, tasks, results, visited, (blocked + 1) % count, resolve, reject);
      },
      reject
    );
  }

  ComputeProto.suspend = EffectProto.suspend = suspend;

  /**
   * Lazily allocates the Fiber for this node. If no fiber exists yet,
   * creates one and lifts _args into { _args, _fiber }.
   * @this {!Compute | !Effect}
   * @returns {!Fiber}
   */
  function _fiber() {
    if (this._flag & FLAG_FIBER) {
      return this._args._fiber;
    }
    let fiber = new Fiber();
    this._args = { _args: this._args, _fiber: fiber };
    this._flag |= FLAG_FIBER;
    return fiber;
  }

  ComputeProto._fiber = EffectProto._fiber = _fiber;

  /**
   * Lazily allocates the Fiber and its Channel. Returns the channel.
   * @this {!Compute | !Effect}
   * @returns {!Channel}
   */
  function _channel() {
    let fiber = this._fiber();
    if (fiber._channel === null) {
      fiber._channel = new Channel();
    }
    return fiber._channel;
  }

  ComputeProto._channel = EffectProto._channel = _channel;

  /**
   * Creates a fresh AbortController for this async activation.
   * The controller is automatically aborted on re-run or dispose.
   * @this {!Compute | !Effect}
   * @returns {!AbortController}
   */
  function controller() {
    let fiber = this._fiber();
    let controller = new AbortController();
    fiber._controller = controller;
    return controller;
  }

  ComputeProto.controller = EffectProto.controller = controller;

  /**
   * Reads a sender's current value without subscribing immediately.
   * The subscription is deferred until settle time. For sync nodes
   * (FLAG_ASYNC not set), falls back to val().
   * @this {!Compute | !Effect}
   * @param {!Sender} sender
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
    let fiber = this._fiber();
    let defers = fiber._defers;
    if (defers === null) {
      fiber._defers = [sender, value];
    } else {
      defers.push(sender, value);
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
   * @this {!Compute | !Effect}
   * @param {!Compute | !Array<!Compute>} tasks
   * @returns {boolean} true if any task has FLAG_LOADING set
   */
  function pending(tasks) {
    let loading = false;
    if (tasks._flag !== undefined) {
      /** Single task. */
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

  // ─── Root — single-use methods ─────────────────────────────────────────

  /**
   * @this {!Root}
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

  // ─── Signal — single-use methods ───────────────────────────────────────

  /**
   * Returns the signal's current value. No dependency tracking —
   * tracking happens via `c.val(sender)` on the context.
   * @this {!Signal<T>}
   * @returns {T}
   */
  SignalProto.get = function () {
    return this._value;
  };

  /**
   * @this {!Signal<T>}
   * @param {T} value
   * @returns {void}
   */
  SignalProto.set = function (value) {
    if (this._flag & FLAG_DISPOSED) {
      throw new Error(ASSERT_DISPOSED);
    }
    let changed = this._guard === null ? (this._value !== value) : !this._guard(this._value, value);
    if (changed) {
      if (IDLE) {
        this._value = value;
        notify(this, FLAG_STALE);
        flush();
      } else {
        schedule(this, value, assignSignal);
      }
    }
  };


  /**
   * @this {!Signal<T>}
   * @returns {void}
   */
  /**
   * Returns true if the sender's current value differs from `value`.
   * Used by deferred dep settlement to detect changes.
   * @this {!Signal<T> | !Compute<T>}
   * @param {T} value
   * @returns {boolean}
   */
  SignalProto._changed = ComputeProto._changed = function (value) {
    return this._value !== value;
  };

  SignalProto._dispose = function () {
    this._flag = FLAG_DISPOSED;
    clearSubs(this);
    this._value = null;
  };

  // ─── Compute — single-use methods ──────────────────────────────────────

  /**
   * Pulls and returns the compute's current value. Triggers lazy
   * re-evaluation if stale or pending. Rethrows if in error state.
   * @this {!Compute<T,U,V,W>}
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
    if (this._flag & FLAG_BOUND && this._dep1 === null) {
      this._flag |= FLAG_ERROR;
      this._value = { message: ASSERT_DISPOSED };
    }
    if (this._flag & FLAG_ERROR) {
      throw this._value;
    }
    return this._value;
  };

  /**
   * IReader: dependency-tracking read. Pulls the sender up to date,
   * registers it as a dependency, and returns its value.
   * @this {!Compute<T,U,V,W>}
   * @param {!Sender} sender
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
   * @this {!Compute<T,U,V,W>}
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
   * @this {!Compute<T,U,V,W>}
   * @returns {void}
   */
  ComputeProto._dispose = function () {
    let flag = this._flag;
    this._flag = FLAG_DISPOSED;
    clearSubs(this);
    clearDeps(this);
    if (flag & FLAG_FIBER) {
      let fiber = this._args._fiber;
      if (fiber._controller !== null) {
        fiber._controller.abort();
      }
      if (fiber._channel !== null) {
        /** Panic any nodes awaiting this task. */
        if (fiber._channel._waiters !== null) {
          resolveWaiters(this, fiber._channel, new Error("Awaited task was disposed"), true, true);
        }
        /** Remove ourselves from any responders we were awaiting. */
        if (fiber._channel._res1 !== null) {
          clearChannel(fiber._channel);
        }
      }
    }
    if (this._cleanup !== null) {
      clearCleanup(this);
    }
    this._fn = this._value = this._args = null;
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
   * @this {!Compute<T,U,V,W>}
   * @param {number} time
   */
  ComputeProto._update = function (time) {
    let flag = this._flag;
    this._time = time;
    this._flag =
      flag & ~(FLAG_STALE | FLAG_LOADING | FLAG_EQUAL | FLAG_NOTEQUAL);

    if (!(flag & FLAG_INIT) && this._cleanup !== null) {
      clearCleanup(this);
    }

    /** Async prep: reset fiber state. */
    if (flag & FLAG_ASYNC) {
      if (flag & FLAG_FIBER) {
        clearFiber(this);
      }
    }

    let value;
    let args = flag & FLAG_FIBER ? this._args._args : this._args;

    if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
      try {
        if (flag & FLAG_BOUND) {
          let dep = this._dep1;
          let dflag = dep !== null ? dep._flag : FLAG_DISPOSED;
          if (dflag & (FLAG_STALE | FLAG_PENDING)) {
            dep._refresh();
            dflag = dep._flag;
          }
          if (dflag & (FLAG_ERROR | FLAG_DISPOSED)) {
            absorb(this, (dflag & FLAG_DISPOSED) ? ASSERT_DISPOSED : dep._value, time);
            return;
          }
          value = this._fn(dep._value, this, this._value, args);
        } else {
          value = this._fn(this, this._value, args);
        }
      } catch (err) {
        absorb(this, err, time);
        return;
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
          let dep = this._dep1;
          let dflag = refreshDep1(dep);
          if (dflag & (FLAG_ERROR | FLAG_DISPOSED)) {
            value = (dflag & FLAG_DISPOSED) ? { message: ASSERT_DISPOSED } : normalize(dep._value);
            this._flag |= FLAG_ERROR;
            break call;
          }
          dep._version = version;
          value = this._fn(dep._value, this, this._value, args);
        } else {
          value = this._fn(this, this._value, args);
        }
        this._flag &= ~FLAG_ERROR;
      } catch (err) {
        value = normalize(err);
        this._flag |= FLAG_ERROR;
      }

      if (flag & FLAG_SETUP) {
        if (DCOUNT > DBASE) {
          let stack = DSTACK;
          this._deps = stack.slice(DBASE, DCOUNT);
          for (let i = DBASE; i < DCOUNT; i += 2) {
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
    flag = this._flag;

    
    /** Async: if fn returned a promise/iterator, dispatch and return. */
    if (
      (flag & (FLAG_ASYNC | FLAG_ERROR)) === FLAG_ASYNC &&
      waitFor(this, value, time)
    ) {
      return;
    }
    this._flag &= ~(FLAG_INIT | FLAG_SETUP | FLAG_STALE | FLAG_PENDING);
    
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
   * Compute notification handler. Three cases:
   * 1. Default: notify PENDING downstream (pure pull).
   * 2. Eager notify STALE downstream (pure push).
   * @this {Compute}
   * @returns {void}
   */
  ComputeProto._receive = function () {
    if (this._flag & (FLAG_EAGER | FLAG_WAITER)) {
      COMPUTES[COMPUTE_COUNT++] = this;
      notify(this, this._flag & FLAG_EAGER ? FLAG_STALE : FLAG_PENDING);
    } else {
      notify(this, FLAG_PENDING);
    }
  };

  // ─── Effect — single-use methods ───────────────────────────────────────

  /**
   * IScope: dependency-tracking read for effects.
   * @this {!Effect}
   * @param {!Sender} sender
   * @returns {*}
   */
  EffectProto.val = val;

  /**
   * Sync update for effect nodes. Two branches:
   * 1. Stable (no SETUP) — no dep tracking, fn receives (this, args)
   * 2. Setup/dynamic — version bump, dep tracking, fn receives (this, args)
   * Pre-execution cleanup and scope save happen before branching.
   * Async nodes delegate to _updateAsync.
   * @this {!Effect<U,V,W>}
   * @param {number} time
   */
  /**
   * Unified update for effect nodes. Handles both sync and async.
   * @this {!Effect<U,V,W>}
   * @param {number} time
   */
  EffectProto._update = function (time) {
    let flag = this._flag;

    this._time = time;
    if (!(flag & FLAG_INIT)) {
      if (this._cleanup !== null) {
        clearCleanup(this);
      }
      if (this._owned !== null) {
        clearOwned(this);
      }
      this._recover = null;
    }

    /** Async prep: reset fiber state, clear loading from previous activation. */
    if (flag & FLAG_ASYNC) {
      if (flag & FLAG_FIBER) {
        clearFiber(this);
      }
      this._flag &= ~FLAG_LOADING;
    }

    /** @type {(function(): void) | null | undefined} */
    let value;
    let args = flag & FLAG_FIBER ? this._args._args : this._args;

    if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
      try {
        if (flag & FLAG_BOUND) {
          let dep = this._dep1;
          if (dep._flag & FLAG_RECEIVER) {
            if (dep._flag & (FLAG_STALE | FLAG_PENDING)) {
              dep._refresh();
            }
            if (dep._flag & FLAG_ERROR) {
              throw dep._value;
            }
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
          if (dep._flag & FLAG_RECEIVER) {
            if (dep._flag & (FLAG_STALE | FLAG_PENDING)) {
              dep._refresh();
            }
            if (dep._flag & FLAG_ERROR) {
              throw dep._value;
            }
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
            for (let i = DBASE; i < DCOUNT; i += 2) {
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
      /** Async result handling. */
      let kind = asyncKind(value);
      if (kind !== ASYNC_SYNC) {
        this._flag |= FLAG_LOADING;
        if (kind === ASYNC_PROMISE) {
          resolveEffectPromise(new WeakRef(this), value);
        } else {
          resolveEffectIterator(new WeakRef(this), value);
        }
        return;
      }
    }

    this._flag &= ~FLAG_INIT;
  };

  /**
   * @this {!Effect<U,V,W>}
   * @returns {void}
   */
  EffectProto._dispose = function () {
    let flag = this._flag;
    this._flag = FLAG_DISPOSED;
    clearDeps(this);
    if (this._cleanup !== null) {
      clearCleanup(this);
    }
    if (this._owned !== null) {
      clearOwned(this);
    }
    if (flag & FLAG_FIBER) {
      let fiber = this._args._fiber;
      if (fiber._controller !== null) {
        fiber._controller.abort();
      }
      if (fiber._channel !== null && fiber._channel._res1 !== null) {
        clearChannel(fiber._channel);
      }
    }
    this._fn = this._args = this._owned = this._owner = this._recover = null;
  };

  /**
   * @this {!Effect}
   * @returns {void}
   */
  EffectProto._receive = function () {
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

  // ─── Owned factory methods (Root + Effect prototypes) ───────────────

  /** @this {!Root | !Effect} */
  function _compute(a, b, c, d, e) {
    if (this._flag & FLAG_DISPOSED) {
      throw new Error(ASSERT_DISPOSED);
    }
    let flag, node;
    if (typeof a === "function") {
      flag = FLAG_SETUP | ((0 | c) & OPTIONS);
      node = new Compute(flag, a, null, b, d);
    } else {
      flag = FLAG_STABLE | FLAG_BOUND | FLAG_SINGLE | ((0 | d) & OPTIONS);
      node = new Compute(flag, b, a, c, e);
      node._dep1slot = connect(a, node, -1);
    }
    addOwned(this, node);
    if (!(flag & FLAG_DEFER)) {
      startCompute(node);
    }
    return node;
  }

  /** @this {!Root | !Effect} */
  function _task(a, b, c, d, e) {
    if (this._flag & FLAG_DISPOSED) {
      throw new Error(ASSERT_DISPOSED);
    }
    let flag, node;
    if (typeof a === "function") {
      flag = FLAG_ASYNC | FLAG_SETUP | ((0 | c) & OPTIONS);
      node = new Compute(flag, a, null, b, d);
    } else {
      flag =
        FLAG_ASYNC |
        FLAG_STABLE |
        FLAG_BOUND |
        FLAG_SINGLE |
        ((0 | d) & OPTIONS);
      node = new Compute(flag, b, a, c, e);
      node._dep1slot = connect(a, node, -1);
    }
    addOwned(this, node);
    if (!(flag & FLAG_DEFER)) {
      startCompute(node);
    }
    return node;
  }

  /** @this {!Root | !Effect} */
  function _effect(a, b, c, d) {
    if (this._flag & FLAG_DISPOSED) {
      throw new Error(ASSERT_DISPOSED);
    }
    let flag, node;
    if (typeof a === "function") {
      flag = FLAG_SETUP | ((0 | b) & OPTIONS);
      node = new Effect(flag, a, null, this, c);
    } else {
      flag = FLAG_STABLE | FLAG_BOUND | FLAG_SINGLE | ((0 | c) & OPTIONS);
      node = new Effect(flag, b, a, this, d);
      node._dep1slot = connect(a, node, -1);
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

  /** @this {!Root | !Effect} */
  function _spawn(a, b, c, d) {
    if (this._flag & FLAG_DISPOSED) {
      throw new Error(ASSERT_DISPOSED);
    }
    let flag, node;
    if (typeof a === "function") {
      flag = FLAG_ASYNC | FLAG_SETUP | ((0 | b) & OPTIONS);
      node = new Effect(flag, a, null, this, c);
    } else {
      flag =
        FLAG_ASYNC |
        FLAG_STABLE |
        FLAG_BOUND |
        FLAG_SINGLE |
        ((0 | c) & OPTIONS);
      node = new Effect(flag, b, a, this, d);
      node._dep1slot = connect(a, node, -1);
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

// ─── Global helpers (non-prototype) ────────────────────────────────────────

/**
 *
 * @param {Receiver} receiver
 * @param {Sender} sender
 */
function subscribe(receiver, sender) {
  if (receiver._dep1 === null) {
    receiver._dep1 = sender;
    receiver._dep1slot = connect(sender, receiver, -1);
  } else {
    let deps = receiver._deps;
    let depslot = deps === null ? 0 : deps.length;
    let slot = connect(sender, receiver, depslot);
    if (deps === null) {
      receiver._deps = [sender, slot];
    } else {
      deps.push(sender, slot);
    }
  }
}

/**
 * @param {Sender} send
 * @param {Receiver} receiver
 * @param {number} depslot
 * @returns {number}
 */
function connect(send, receiver, depslot) {
  /** @type {number} */
  let subslot = -1;
  if (send._sub1 === null) {
    send._sub1 = receiver;
    send._sub1slot = depslot;
    /* subslot = -1 */
  } else if (send._subs === null) {
    subslot = 0;
    send._subs = [receiver, depslot];
  } else {
    subslot = send._subs.length;
    send._subs.push(receiver, depslot);
  }
  return subslot;
}

/**
 * @param {Sender} send
 * @param {number} slot
 * @returns {void}
 */
function clearReceiver(send, slot) {
  if (slot === -1) {
    send._sub1 = null;
  } else {
    let subs = send._subs;
    let lastSlot = /** @type {number} */ (subs.pop());
    let lastNode = /** @type {Receiver} */ (subs.pop());
    if (slot !== subs.length) {
      subs[slot] = lastNode;
      subs[slot + 1] = lastSlot;
      if (lastSlot === -1) {
        lastNode._dep1slot = slot;
      } else {
        lastNode._deps[lastSlot + 1] = slot;
      }
    }
  }
  /**
   * When the last subscriber is removed:
   * - FLAG_EAGER: task reverts to pull-based (no eager re-run).
   * - FLAG_WEAK: release cached value and mark STALE so next
   *   .val() recomputes fresh.
   */
  let flag = send._flag;
  if (
    flag & FLAG_RECEIVER &&
    flag & (FLAG_WEAK | FLAG_EAGER) &&
    send._sub1 === null &&
    (send._subs === null || send._subs.length === 0)
  ) {
    send._flag &= ~FLAG_EAGER;
    if (send._flag & FLAG_WEAK) {
      send._flag |= FLAG_STALE;
      /** @type {Compute} */ (send)._value = null;
    }
  }
}

/**
 * Removes dep at depslot from receive's list. Swap-with-last O(1).
 * Arrays are always kept packed -- no null gaps ever exist inside them.
 * @param {Receiver} receive
 * @param {number} slot
 * @returns {void}
 */
function clearSender(receive, slot) {
  if (slot === -1) {
    receive._dep1 = null;
  } else {
    let deps = receive._deps;
    let lastSlot = /** @type {number} */ (deps.pop());
    let lastNode = /** @type {Sender} */ (deps.pop());
    if (slot !== deps.length) {
      deps[slot] = lastNode;
      deps[slot + 1] = lastSlot;
      if (lastSlot === -1) {
        lastNode._sub1slot = slot;
      } else {
        lastNode._subs[lastSlot + 1] = slot;
      }
    }
  }
}

/**
 * Removes receive from all its deps' subscriber lists.
 * @param {Receiver} receive
 * @returns {void}
 */
function clearDeps(receive) {
  if (receive._dep1 !== null) {
    clearReceiver(receive._dep1, receive._dep1slot);
    receive._dep1 = null;
  }
  let deps = receive._deps;
  if (deps !== null) {
    let count = deps.length;
    for (let i = 0; i < count; i += 2) {
      clearReceiver(
        /** @type {Sender} */(deps[i]),
        /** @type {number} */(deps[i + 1])
      );
    }
    receive._deps = null;
  }
}

/**
 * @param {Sender} send
 * @returns {void}
 */
function clearSubs(send) {
  if (send._sub1 !== null) {
    clearSender(send._sub1, send._sub1slot);
    send._sub1 = null;
  }
  let subs = send._subs;
  if (subs !== null) {
    let count = subs.length;
    for (let i = 0; i < count; i += 2) {
      clearSender(
        /** @type {Receiver} */(subs[i]),
        /** @type {number} */(subs[i + 1])
      );
    }
    send._subs = null;
  }
}

function clearCleanup(owner) {
  let cleanup = owner._cleanup;
  if (typeof cleanup === "function") {
    cleanup();
    owner._cleanup = null;
  } else {
    /** array form */
    let count = /** @type {!Array} */ (cleanup).length;
    while (count-- > 0) {
      /** @type {!Array} */ (cleanup).pop()();
    }
  }
}

/**
 * Appends `child` to `owner._owned`, lazily allocating the array. Used by
 * the proto ownership methods after the top-level factory returns a new
 * node, so `_owned` is populated even when the factory runs the node's fn
 * inside its startup path.
 * @param {!Owner} owner
 * @param {!Receiver | !Root} child
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
  let count = /** @type {!Array} */ (owned).length;
  while (count-- > 0) {
    /** @type {!Array} */ (owned).pop()._dispose();
  }
  owner._recover = null;
}

/**
 * Walks the ownership chain looking for recover handlers.
 * @param {Effect} node
 * @param {*} error
 * @returns {boolean} true if error was handled
 */
/**
 * Checks a single owner's _recover handlers.
 * @param {Root | Effect} owner
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

// ─── patchDeps ─────────────────────────────────────────────────────────────

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
  let existingLen = depCount > 1 ? (depCount - 1) * 2 : 0;
  /** ni = index of next new dep to consume (unsubscribed, slot 0) */
  let newidx = existingLen;

  /** Check dep1 — always exists when depCount >= 1, and _read never
   *  writes new deps into dep1 (only setup does), so the only
   *  question is whether dep1 was reused or dropped. */
  let dep1 = node._dep1;
  if (dep1 !== null) {
    if (dep1._version !== version) {
      clearReceiver(dep1, node._dep1slot);
      if (newidx < newLen) {
        /** Fill dep1 with a new dep */
        let newDep = /** @type {Sender} */ (deps[newidx]);
        node._dep1 = newDep;
        node._dep1slot = connect(newDep, node, -1);
        newidx += 2;
      } else {
        node._dep1 = null;
        node._dep1slot = 0;
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
   *   i    — forward through existing region
   *   ni   — next new dep to consume (unsubscribed, in new region)
   *   tail — end of live region, shrinks when we pop reused deps from the back
   *
   * When we hit a dropped dep at position i:
   *   1. If new deps available (ni < newLen): subscribe new dep at position i
   *   2. Else: scan backward from tail to find last reused dep, move it to i
   *      Any dropped deps found during backward scan are also cleared.
   *      When forward and backward pointers meet, we're done.
   */
  let i = 0;
  let tail = existingLen;
  while (i < tail) {
    let dep = /** @type {Sender} */ (deps[i]);
    if (dep._version === version) {
      /** Reused — stays in place */
      i += 2;
      continue;
    }
    /** Dropped — unbind (read slot only on the drop path) */
    clearReceiver(dep, /** @type {number} */(deps[i + 1]));
    if (newidx < newLen) {
      /** Fill hole with next new dep */
      let newDep = /** @type {Sender} */ (deps[newidx]);
      let subslot = connect(newDep, node, i);
      deps[i] = newDep;
      deps[i + 1] = subslot;
      newidx += 2;
      i += 2;
    } else {
      /**
       * No new deps left. Scan backward from tail to find
       * the last reused dep and swap it into this hole.
       */
      let found = 0;
      while (tail > i + 2) {
        tail -= 2;
        let tDep = /** @type {Sender} */ (deps[tail]);
        if (tDep._version === version) {
          /** Move reused dep into the hole at i */
          let tSlot = /** @type {number} */ (deps[tail + 1]);
          deps[i] = tDep;
          deps[i + 1] = tSlot;
          if (tSlot === -1) {
            tDep._sub1slot = i;
          } else {
            tDep._subs[tSlot + 1] = i;
          }
          found = 1;
          break;
        } else {
          /** Also dropped — unbind */
          clearReceiver(tDep, /** @type {number} */(deps[tail + 1]));
        }
      }
      if (found) {
        i += 2;
      } else {
        /** Pointers met — i is the new tail */
        tail = i;
      }
    }
  }
  if (newidx < newLen) {
    if (node._dep1 === null) {
      /** Fill hole with next new dep */
      let newDep = /** @type {Sender} */ (deps[newidx]);
      let subslot = connect(newDep, node, i);
      deps[i] = newDep;
      deps[i + 1] = subslot;
      newidx += 2;
    }
    /** Remaining new deps — subscribe at the end of the live region */
    while (newidx < newLen) {
      let dep = /** @type {Sender} */ (deps[newidx]);
      let subslot = connect(dep, node, tail);
      deps[tail] = dep;
      deps[tail + 1] = subslot;
      tail += 2;
      newidx += 2;
    }
  }

  /** Invariant: if any deps remain, `_dep1` must be populated.
   *  `checkRun` dereferences `node._dep1` without a null check, and
   *  the `existingLen = (depCount - 1) * 2` formula above implicitly
   *  assumes one dep is in dep1. Promote the last remaining array
   *  entry (swap-with-last, O(1)) when dep1 is empty. tail=0 is then
   *  handled uniformly by the branch below. */
  if (node._dep1 === null && tail > 0) {
    tail -= 2;
    let dep = /** @type {Sender} */ (deps[tail]);
    let slot = /** @type {number} */ (deps[tail + 1]);
    node._dep1 = dep;
    node._dep1slot = slot;
    if (slot === -1) {
      dep._sub1slot = -1;
    } else {
      dep._subs[slot + 1] = -1;
    }
  }

  /** Trim or null out, update FLAG_SINGLE */
  if (tail === 0) {
    node._deps = null;
    if (node._dep1 !== null) {
      node._flag |= FLAG_SINGLE;
    }
  } else {
    node._flag &= ~FLAG_SINGLE;
    /** Shrink the array with explicit pops rather than assigning
     *  `.length = tail`. Setting `.length` to a smaller value is
     *  surprisingly expensive in V8 for the short-array case — a
     *  handful of `pop()` calls is faster. */
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
    for (let i = 0; i < count; i += 2) {
      let dep = /** @type {Sender} */ (deps[i]);
      let depver = dep._version;
      if (depver > transaction) {
        vstack[vcount++] = dep;
        vstack[vcount++] = depver;
      }
      dep._version = stamp;
    }
    depCount += count >> 1;
  }
  VCOUNT = vcount;
  return depCount;
}

/**
 * @param {Sender} node
 * @param {number} flag
 */
function notify(node, flag) {
  /** @type {Receiver} */
  let sub = node._sub1;
  if (sub !== null) {
    let flags = sub._flag;
    sub._flag |= flag;
    if (!(flags & (FLAG_PENDING | FLAG_STALE))) {
      sub._receive();
    }
  }
  /** @type {Array<Receiver | number> | null} */
  let subs = node._subs;
  if (subs !== null) {
    let count = subs.length;
    for (let i = 0; i < count; i += 2) {
      sub = /** @type {Receiver} */ (subs[i]);
      let flags = sub._flag;
      sub._flag |= flag;
      if (!(flags & (FLAG_PENDING | FLAG_STALE))) {
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
      /** @type {Compute} */ (dep)._update(time);
    } else if (flag & FLAG_PENDING) {
      TRANSACTION = SEED;
      if (flag & FLAG_SINGLE) {
        checkSingle(/** @type {Compute} */(dep), time);
      } else {
        checkRun(/** @type {Compute} */(dep), time);
      }
    }
    if (dep._ctime > lastRun) {
      return true;
    }
  }
  let deps = node._deps;
  if (deps !== null) {
    let len = deps.length;
    for (let i = 0; i < len; i += 2) {
      dep = /** @type {Sender} */ (deps[i]);
      let flag = dep._flag;
      if (flag & FLAG_STALE) {
        TRANSACTION = SEED;
        /** @type {Compute} */ (dep)._update(time);
      } else if (flag & FLAG_PENDING) {
        TRANSACTION = SEED;
        if (flag & FLAG_SINGLE) {
          checkSingle(/** @type {Compute} */(dep), time);
        } else {
          checkRun(/** @type {Compute} */(dep), time);
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
 * @param {Compute} node
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
      checkSingle(/** @type {Compute} */(dep), time);
    } else {
      checkRun(/** @type {Compute} */(dep), time);
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
        i = resumeFrom + 2;
      }

      let deps = node._deps;
      if (deps !== null) {
        let count = deps.length;
        for (; i < count; i += 2) {
          dep = /** @type {Sender} */ (deps[i]);
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
      } else if (idx + 2 < parent._deps.length) {
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
 * @template T
 * @param {Compute<T>} node 
 * @param {T} value 
 * @param {number} time 
 * @returns {boolean}
 */
function waitFor(node, value, time) {
  let kind = asyncKind(value);
  if (kind !== ASYNC_SYNC) {
    let flag = node._flag;
    node._flag = (flag & ~(FLAG_STALE | FLAG_PENDING | FLAG_SETUP)) | FLAG_LOADING;
    if (kind === ASYNC_PROMISE) {
      resolvePromise(
        new WeakRef(node),
            /** @type {IThenable} */(value),
        time
      );
    } else {
      resolveIterator(
        new WeakRef(node),
            /** @type {AsyncIterator | AsyncIterable} */(value),
        time
      );
    }
    return true;
  }
  return false;
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
 * @param {WeakRef<!Compute<T>>} ref
 * @param {IThenable<T>} promise
 * @param {number} time
 * @returns {void}
 */
function resolvePromise(ref, promise, time) {
  promise.then(
    (val) => {
      let node = ref.deref();
      if (
        node !== void 0 &&
        !(node._flag & FLAG_DISPOSED) &&
        node._time === time
      ) {
        node._flag &= ~FLAG_ERROR;
        settle(node, val);
      }
    },
    (err) => {
      let node = ref.deref();
      if (
        node !== void 0 &&
        !(node._flag & FLAG_DISPOSED) &&
        node._time === time
      ) {
        node._flag |= FLAG_ERROR;
        settle(node, err);
      }
    }
  );
}

/**
 * @template T
 * @param {WeakRef<!Compute<T>>} ref
 * @param {AsyncIterator<T> | AsyncIterable<T>} iterable
 * @param {number} time
 * @returns {void}
 */
function resolveIterator(ref, iterable, time) {
  /** @type {AsyncIterator<T>} */
  let iterator =
    typeof iterable[Symbol.asyncIterator] === "function"
      ? iterable[Symbol.asyncIterator]()
      : iterable;

  /** @param {IteratorResult<T>} result */
  let onNext = (result) => {
    let node = ref.deref();

    if (node === void 0 || node._flag & FLAG_DISPOSED || node._time !== time) {
      if (typeof iterator.return === "function") {
        iterator.return();
      }
      return;
    }

    if (result.done) {
      return;
    }

    iterator.next().then(onNext, onError);

    node._flag &= ~FLAG_ERROR;
    settle(node, result.value);
  };

  /** @param {*} err */
  let onError = (err) => {
    let node = ref.deref();
    if (
      node !== void 0 &&
      !(node._flag & FLAG_DISPOSED) &&
      node._time === time
    ) {
      node._flag |= FLAG_ERROR;
      settle(node, err);
    }
  };

  iterator.next().then(onNext, onError);
}

/**
 * @template T
 * @param {Compute<T>} node
 * @param {T | *} value
 * @returns {void}
 */
function settle(node, value) {
  let flag = node._flag;
  node._flag &= ~(FLAG_LOADING | FLAG_INIT);

  if (value !== node._value || flag & (FLAG_INIT | FLAG_ERROR)) {
    node._value = value;
    let time = TIME + 1;
    node._ctime = time;

    let stale = false;
    if (node._flag & FLAG_ASYNC) {
      let hasDefers =
        node._flag & FLAG_FIBER && node._args._fiber._defers !== null;
      if (node._deps !== null || hasDefers) {
        stale = settleDeps(node);
      }
    }

    /** Resolve any awaiters waiting on this task. */
    if (node._flag & FLAG_FIBER) {
      let ch = node._args._fiber._channel;
      if (ch !== null && ch._waiters !== null) {
        resolveWaiters(node, ch, value, !!(node._flag & FLAG_ERROR), false);
      }
    }

    notify(node, FLAG_STALE);
    flush();

    if (stale) {
      node._update(TIME);
    }
  }
}

/**
 * Unified dep sweep for async nodes at settle time.
 * 1. Deduplicates _deps (val() across awaits can insert duplicates).
 * 2. If deferred deps exist, subscribes unique deferred senders and
 *    checks if any changed. Returns true if node needs to re-run.
 * @param {!Receiver} node
 * @returns {boolean}
 */
function settleDeps(node) {
  let stamp = (SEED += 2);
  let dep1 = node._dep1;
  let deps = node._deps;

  /** Grab defers before clearing. */
  let defers = null;
  let deferLen = 0;
  if (node._flag & FLAG_FIBER) {
    let fiber = node._args._fiber;
    defers = fiber._defers;
    if (defers !== null) {
      deferLen = defers.length;
      fiber._defers = null;
    }
  }

  /** Stamp dep1. */
  if (dep1 !== null) {
    dep1._version = stamp;
  }

  /** Dedup scan of _deps — remove duplicates via swap-with-last. */
  let hasDefers = deferLen > 0;
  if (deps !== null) {
    let i = deps.length - 2;
    let write = deps.length;
    while (i >= 0) {
      let dep = /** @type {!Sender} */ (deps[i]);
      if (dep._version === stamp) {
        clearReceiver(dep, /** @type {number} */(deps[i + 1]));
        write -= 2;
        if (i !== write) {
          let lastDep, lastSlot;
          if (hasDefers) {
            lastDep = deps[write];
            lastSlot = deps[write + 1];
          } else {
            lastSlot = /** @type {number} */ (deps.pop());
            lastDep = /** @type {!Sender} */ (deps.pop());
          }
          deps[i] = lastDep;
          deps[i + 1] = lastSlot;
          if (lastSlot === -1) {
            /** @type {Sender} */ (lastDep)._sub1slot = i;
          } else {
            /** @type {Sender} */ (lastDep)._subs[lastSlot + 1] = i;
          }
        } else if (!hasDefers) {
          deps.pop();
          deps.pop();
        }
      } else {
        dep._version = stamp;
      }
      i -= 2;
    }
    if (hasDefers && write < deps.length) {
      deps.length = write;
    }
  }

  /** Phase 2: subscribe deferred deps and detect changes. */
  if (deferLen === 0) {
    return false;
  }

  let changed = false;
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
 * @param {!Receiver} node
 * @returns {void}
 */
function clearFiber(node) {
  let fiber = node._args._fiber;
  if (fiber._controller !== null) {
    fiber._controller.abort();
    fiber._controller = null;
  }
  fiber._defers = null;
  if (fiber._channel !== null && fiber._channel._res1 !== null) {
    clearChannel(fiber._channel);
  }
}

// ─── Awaiter/Responder two-way binding ────────────────────────────────────

/**
 * Adds a waiter entry to a responder's _waiters array (4-stride).
 * @param {!Channel} responderCh
 * @param {!Receiver} awaiter
 * @param {number} awaiterResSlot
 * @param {function} resolve
 * @param {function} reject
 * @returns {number} slot in _waiters
 */
function addWaiter(responderCh, awaiter, awaiterResSlot, resolve, reject) {
  let waiters = responderCh._waiters;
  let slot;
  if (waiters === null) {
    responderCh._waiters = [awaiter, awaiterResSlot, resolve, reject];
    slot = 0;
  } else {
    slot = waiters.length;
    waiters.push(awaiter, awaiterResSlot, resolve, reject);
  }
  return slot;
}

/**
 * Creates a two-way channel binding between an awaiter and a task.
 * Calculates the awaiter's respond slot, calls addWaiter, and stores
 * the back-reference from the awaiter's channel to the task.
 * @param {!Compute | !Effect} awaiter
 * @param {!Compute} task
 * @param {function(*)} resolve
 * @param {function(*)} reject
 * @returns {void}
 */
function send(awaiter, task, resolve, reject) {
  let awaiterCh = awaiter._channel();
  let responderCh = task._channel();

  let resSlot;
  if (awaiterCh._res1 === null) {
    resSlot = -1;
  } else if (awaiterCh._responds === null) {
    resSlot = 0;
  } else {
    resSlot = awaiterCh._responds.length;
  }

  let waiterSlot = addWaiter(responderCh, awaiter, resSlot, resolve, reject);
  task._flag |= FLAG_WAITER;

  if (resSlot === -1) {
    awaiterCh._res1 = task;
    awaiterCh._res1slot = waiterSlot;
  } else if (awaiterCh._responds === null) {
    awaiterCh._responds = [task, waiterSlot];
  } else {
    awaiterCh._responds.push(task, waiterSlot);
  }
}

/**
 * Removes a single waiter entry (4-stride swap-with-last).
 * Updates the swapped awaiter's back-reference.
 * Clears FLAG_WAITER on the responder when the last waiter is removed.
 * @param {!Compute} responder
 * @param {!Channel} responderCh
 * @param {number} slot
 * @returns {void}
 */
function removeWaiter(responder, responderCh, slot) {
  let waiters = responderCh._waiters;
  let lastReject = waiters.pop();
  let lastResolve = waiters.pop();
  let lastResSlot = waiters.pop();
  let lastAwaiter = waiters.pop();
  if (slot !== waiters.length) {
    waiters[slot] = lastAwaiter;
    waiters[slot + 1] = lastResSlot;
    waiters[slot + 2] = lastResolve;
    waiters[slot + 3] = lastReject;
    let ch = lastAwaiter._args._fiber._channel;
    if (lastResSlot === -1) {
      ch._res1slot = slot;
    } else {
      ch._responds[lastResSlot + 1] = slot;
    }
  }
  if (waiters.length === 0) {
    responderCh._waiters = null;
    responder._flag &= ~FLAG_WAITER;
  }
}

/**
 * Removes this awaiter from all responders it's waiting on.
 * @param {!Channel} channel
 * @returns {void}
 */
function clearChannel(channel) {
  let res = channel._res1;
  if (res !== null) {
    removeWaiter(res, res._args._fiber._channel, channel._res1slot);
    channel._res1 = null;
  }
  let responds = channel._responds;
  if (responds !== null) {
    for (let i = 0; i < responds.length; i += 2) {
      let responder = responds[i];
      if (responder === null) {
        continue;
      }
      let slot = responds[i + 1];
      removeWaiter(responder, responder._args._fiber._channel, slot);
    }
    channel._responds = null;
  }
}

/**
 * Resolves (or rejects) all waiters of a responder, subscribes each
 * awaiter as a dep of the responder, and clears their channel references.
 * @param {!Compute} responder
 * @param {!Channel} responderCh
 * @param {*} value
 * @param {boolean} isError
 * @returns {void}
 */
/**
 * Resolves (or rejects) all waiters of a responder and clears their
 * channel references. When panic is false, subscribes each awaiter as
 * a dep of the responder. When panic is true (responder is disposing),
 * skips subscription since the responder is dead.
 * @param {!Compute} responder
 * @param {!Channel} responderCh
 * @param {*} value
 * @param {boolean} isError
 * @param {boolean} panic
 * @returns {void}
 */
function resolveWaiters(responder, responderCh, value, isError, panic) {
  let waiters = responderCh._waiters;
  let count = waiters.length;
  for (let i = 0; i < count; i += 4) {
    let awaiter = waiters[i];
    let resSlot = waiters[i + 1];
    if (isError) {
      waiters[i + 3](value);
    } else {
      waiters[i + 2](value);
    }
    if (!panic && !(awaiter._flag & FLAG_BLOCKED)) {
      subscribe(awaiter, responder);
    }
    /** Clear the awaiter's back-reference to this responder. */
    let awaiterCh = awaiter._args._fiber._channel;
    if (resSlot === -1) {
      awaiterCh._res1 = null;
    } else {
      awaiterCh._responds[resSlot] = null;
    }
  }
  responderCh._waiters = null;
  responder._flag &= ~FLAG_WAITER;
}

/**
 * Resolves a promise returned by an async effect. If the
 * resolved value is a function, registers it as cleanup.
 * @param {WeakRef<!Effect>} ref
 * @param {!Promise} promise
 * @returns {void}
 */
function resolveEffectPromise(ref, promise) {
  promise.then(
    () => {
      let node = ref.deref();
      if (node !== void 0 && !(node._flag & FLAG_DISPOSED)) {
        node._flag &= ~FLAG_LOADING;
        if (node._flag & FLAG_FIBER && node._args._fiber._defers !== null) {
          let stale = settleDeps(node);
          if (stale) {
            notify(node, FLAG_STALE);
            flush();
            node._flag |= FLAG_STALE;
            node._update(TIME);
          }
        }
      }
    },
    (err) => {
      let node = ref.deref();
      if (node !== void 0 && !(node._flag & FLAG_DISPOSED)) {
        node._flag &= ~FLAG_LOADING;
        let result = tryRecover(node, err);
        if (result !== RECOVER_SELF) {
          node._dispose();
        }
      }
    }
  );
}

/**
 * Resolves an async iterable returned by a streaming effect.
 * Each yielded function is registered as cleanup.
 * @param {WeakRef<!Effect>} ref
 * @param {AsyncIterable | AsyncIterator} iterable
 * @returns {void}
 */
function resolveEffectIterator(ref, iterable) {
  let iterator =
    typeof iterable[Symbol.asyncIterator] === "function"
      ? iterable[Symbol.asyncIterator]()
      : iterable;
  let onNext = (result) => {
    let node = ref.deref();
    if (node === void 0 || node._flag & FLAG_DISPOSED) {
      if (typeof iterator.return === "function") {
        iterator.return();
      }
      return;
    }
    if (result.done) {
      node._flag &= ~FLAG_LOADING;
      if (node._flag & FLAG_FIBER && node._args._fiber._defers !== null) {
        let stale = settleDeps(node);
        if (stale) {
          notify(node, FLAG_STALE);
          flush();
          node._flag |= FLAG_STALE;
          node._update(TIME);
        }
      }
      return;
    }
    iterator.next().then(onNext, onError);
    node._flag &= ~FLAG_LOADING;
  };
  let onError = (err) => {
    let node = ref.deref();
    if (node !== void 0 && !(node._flag & FLAG_DISPOSED)) {
      node._flag &= ~FLAG_LOADING;
      let result = tryRecover(node, err);
      if (result !== RECOVER_SELF) {
        node._dispose();
      }
    }
  };
  iterator.next().then(onNext, onError);
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
 * @param {!Effect} node
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
      let result = tryRecover(node, err);
      if (result !== RECOVER_SELF) {
        node._dispose();
      }
      if (result === RECOVER_NONE) {
        throw err;
      }
    } finally {
      IDLE = true;
    }
  } else {
    try {
      node._update(TIME);
    } catch (err) {
      let result = tryRecover(node, err);
      if (result !== RECOVER_SELF) {
        node._dispose();
      }
      if (result === RECOVER_NONE) {
        throw err;
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
          UPDATES[i](SENDERS[i], PAYLOADS[i]);
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
                let result = tryRecover(node, err);
                if (result !== RECOVER_SELF) {
                  node._dispose();
                }
                if (!thrown && result === RECOVER_NONE) {
                  error = err;
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
              let result = tryRecover(node, err);
              if (result !== RECOVER_SELF) {
                node._dispose();
              }
              if (!thrown && result === RECOVER_NONE) {
                error = err;
                thrown = true;
              }
            }
          } else {
            node._flag &= ~(FLAG_STALE | FLAG_PENDING);
          }
        }
        RECEIVER_COUNT = 0;
      }
      if (cycle++ === 1e5) {
        error = new Error("Runaway cycle");
        thrown = true;
        break;
      }
    } while (!thrown && (SENDER_COUNT > 0 || DISPOSER_COUNT > 0));
  } finally {
    IDLE = true;
    DISPOSER_COUNT = SENDER_COUNT = SCOPE_COUNT = RECEIVER_COUNT = 0;
    if (thrown) {
      throw error;
    }
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Unowned compute. */
/**
 * Creates a sync compute node.
 * Unbound: compute(fn, seed?, opts?, args?)
 * Bound:   compute(dep, fn, seed?, opts?, args?)
 * @param {Sender | Function} depOrFn
 * @param {Function | *} fnOrSeed
 * @param {number | *} optsOrSeed
 * @param {number | *} argsOrOpts
 * @param {*} [args]
 * @returns {!Compute}
 */
function compute(depOrFn, fnOrSeed, optsOrSeed, argsOrOpts, args) {
  let flag, node;
  if (typeof depOrFn === "function") {
    flag = FLAG_SETUP | ((0 | optsOrSeed) & OPTIONS);
    node = new Compute(flag, depOrFn, null, fnOrSeed, argsOrOpts);
  } else {
    flag = FLAG_STABLE | FLAG_BOUND | FLAG_SINGLE | ((0 | argsOrOpts) & OPTIONS);
    node = new Compute(flag, fnOrSeed, depOrFn, optsOrSeed, args);
    node._dep1slot = connect(depOrFn, node, -1);
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
 * @returns {!Compute}
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
    node._dep1slot = connect(depOrFn, node, -1);
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
 * @returns {!Effect}
 */
function effect(depOrFn, fnOrOpts, optsOrArgs, args) {
  let flag, node;
  if (typeof depOrFn === "function") {
    flag = FLAG_SETUP | ((0 | fnOrOpts) & OPTIONS);
    node = new Effect(flag, depOrFn, null, null, optsOrArgs);
  } else {
    flag = FLAG_STABLE | FLAG_BOUND | FLAG_SINGLE | ((0 | optsOrArgs) & OPTIONS);
    node = new Effect(flag, fnOrOpts, depOrFn, null, args);
    node._dep1slot = connect(depOrFn, node, -1);
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
 * @returns {!Effect}
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
    node._dep1slot = connect(depOrFn, node, -1);
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

// ─── IClock singleton ──────────────────────────────────────────────────────

/**
 * Top-level clock object. The entry point to the library.
 * @const
 */
function Clock() { }
Clock.prototype.signal = signal;
Clock.prototype.compute = compute;
Clock.prototype.task = task;
Clock.prototype.effect = effect;
Clock.prototype.spawn = spawn;
Clock.prototype.root = root;
Clock.prototype.batch = batch;

const c = new Clock();

export {
  FLAG_STALE,
  FLAG_PENDING,
  FLAG_SCHEDULED,
  FLAG_DISPOSED,
  FLAG_INIT,
  FLAG_SETUP,
  FLAG_LOADING,
  FLAG_ERROR,
  FLAG_RECEIVER,
  FLAG_DEFER,
  FLAG_STABLE,
  FLAG_SINGLE,
  FLAG_WEAK,
  FLAG_EQUAL,
  FLAG_NOTEQUAL,
  FLAG_ASYNC,
  FLAG_BOUND,
  FLAG_FIBER,
  FLAG_EAGER,
  FLAG_BLOCKED,
  OPT_DEFER,
  OPT_STABLE,
  OPT_SETUP,
  OPT_WEAK,
  OPTIONS,
  IDLE,
  connect,
  subscribe,
  schedule,
  assignSignal,
  notify,
  flush,
  startEffect
};

/**
 * DEBUG: Returns all internal global arrays/stacks that could retain references.
 * Each entry is [name, array]. Only for leak testing.
 */
function _internals() {
  return [
    ["VSTACK", VSTACK],
    ["CSTACK", CSTACK],
    ["CINDEX", CINDEX],
    ["DSTACK", DSTACK],
    ["DISPOSES", DISPOSES],
    ["SENDERS", SENDERS],
    ["PAYLOADS", PAYLOADS],
    ["COMPUTES", COMPUTES],
    ["RECEIVERS", RECEIVERS],
    ["SCOPES[0]", SCOPES[0]],
    ["SCOPES[1]", SCOPES[1]],
    ["SCOPES[2]", SCOPES[2]],
    ["SCOPES[3]", SCOPES[3]],
  ];
}

/**
 * DEBUG: Scans all internal arrays and returns a list of retained non-primitive
 * values (objects/functions) with their location.
 * @returns {Array<{name: string, index: number, value: *}>}
 */
function _checkLeaks() {
  let leaks = [];
  let stacks = _internals();
  for (let s = 0; s < stacks.length; s++) {
    let name = stacks[s][0];
    let arr = stacks[s][1];
    for (let i = 0; i < arr.length; i++) {
      let v = arr[i];
      if (v !== null && v !== undefined && typeof v === "object" || typeof v === "function") {
        leaks.push({ name, index: i, value: v });
      }
    }
  }
  return leaks;
}

export { c, Clock, Root, Signal, Compute, Effect, _checkLeaks };
