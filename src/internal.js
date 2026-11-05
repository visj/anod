import {
	IChannel,
	Disposer,
	Factory,
	Owner,
	Sender,
	Receiver,
	Resolver,
	ICompute,
	IEffect,
	AsyncSender,
	AsyncReceiver,
	AsyncDisposer
} from "./types.js";

/* Sender flags (bits 0-6) — readable on any Sender (Signal or Compute).
 * Bits 7+ on a plain Signal are free for extension (e.g. mod encoding
 * in anod-list). */
const FLAG_STALE = 1 << 0;
const FLAG_PENDING = 1 << 1;
const FLAG_SCHEDULED = 1 << 2;
const FLAG_DISPOSED = 1 << 3;
const FLAG_ERROR = 1 << 4;
const FLAG_MUTABLE = 1 << 5;
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
const FLAG_LOCKED = 1 << 19;
const FLAG_SUSPEND = 1 << 20;
const FLAG_PANIC = 1 << 21;
const FLAG_SINGLE = 1 << 22;
const FLAG_EAGER = 1 << 23;
const FLAG_PURGE = 1 << 24;
const FLAG_PAUSED = 1 << 25;
const FLAG_OWNER = 1 << 26;
const FLAG_CALLBACK = 1 << 27;
/** stable() was called during a run: its reads stay tracked until it ends. */
const FLAG_FREEZE = 1 << 28;
/** Set on the nodes of a checkRun stack only while checkCycle scans it. */
const FLAG_VISIT = 1 << 29;

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
var REGRET = { then: function () { } };

/**
 * @const
 */
var NOOP = function() {};

/**
 * Thrown (synchronously) when an async node's fn returns a non-sync
 * value (promise/iterator) without having called `c.suspend()`. This
 * catches the common mistake of forgetting `c.suspend()`, which would
 * let code continue executing after the node is disposed.
 * @const
 */
var ILLEGAL_READ = "Cannot read a disposed node or yourself";

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
 * Stack depth at which checkRun next makes sure it is not walking a
 * cycle. Raised past every acyclic depth reached, so only a walk deeper
 * than any before it, or a cycle, ever reaches it.
 * @see {checkCycle}
 * @type {number}
 */
var CMARK = 1024;

/**
 * Pre-allocated stack for batching deps during setup execution.
 * During FLAG_SETUP _update, deps are written here as [sender, subslot]
 * pairs. Senders point at the pair's absolute index while the run is
 * in progress. After the fn returns, _deps is created via slice() with
 * exact capacity — avoiding V8's push-based over-allocation.
 * This allows the growth factor problem that arises when going from
 * dep2 -> dep3.
 * @see {connect}
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

/** Whether flush() is draining the queues. A nested flush() leaves the work to it. */
var FLUSHING = false;

/** Whether a microtask flush is already scheduled. */
var POSTING = false;

/** Global unowned context for top-level node creation. */
var c = new Clock();

/**
 * We use a 2-phase version system to handle dependency reuse.
 * On every update, we bump STAMP = SEED + 2. Then, we sweep
 * all existing deps and mark them with version - 1. When we run
 * the fn again, we mark any reused dep with version. If they have
 * some other version than version - 1, it means a new node.
 * Then finally, we run patchDeps if anything changed to clean it up.
 * @type {number}
 */
var SEED = 1;

/**
 * @type {number}
 */
var STAMP = 0;

/**
 * The fence is needed, because an outer Effect might have tagged
 * a Compute node with its own running version marker. When an inner
 * compute Compute is marked stale, it will refresh itself before returning
 * its value. If the outer Effect first reads SignalA, tags a version, and then
 * the inner Compute depends on the same SignalA, it will overwrite the version,
 * which would corrupt the Effect reconciliation. To handle this, we create the fence.
 * It works like a transaction boundary which is set on all top level executions.
 * The fence is the outermost possible version of this toplevel call. If any sender
 * has a version above this, they have been tagged, and we need to store them in the VSTACK
 * and reset them before returning back to the owner scope.
 * @type {number}
 */
var FENCE = 0;

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
/** @const @type {Array<(function(Sender, *, number): void) | null>} */
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

/**
 * @const
 * @type {Array<Owner>}
 */
var PURGES = [];
var PURGE_COUNT = 0;

/**
 * An error in the signal graph: a value that failed a compute, effect
 * or task, tagged REFUSE, PANIC or FATAL. A Defect keeps its
 * identity as it travels through reads, awaits and owner chains, so a
 * caught Defect passes on unchanged. Anything else was thrown by user
 * code and is wrapped as FATAL, exactly once.
 * @constructor
 * @param {*} error
 * @param {number} type
 */
function Defect(error, type) {
	this.error = error;
	this.type = type;
}

/**
 * The error startEffect last rethrew to a creator after the new
 * effect's owner chain declined it, and that effect. An owner whose
 * run it escapes into has already declined it, so tryRecover does not
 * ask the same handlers again.
 * @type {*}
 */
var UNHANDLED = null;
/** @type {Effect | null} */
var UNHANDLED_NODE = null;

/**
 * Seeds of weak computes created with one. A released weak compute
 * goes back to its seed, so its next run receives it as prev, as on
 * the very first run. Kept off the node so other computes pay nothing.
 * @const
 * @type {WeakMap<Compute, *>}
 */
var SEEDS = new WeakMap();

/**
 * Minimal factory-only context with no ownership. Nodes created
 * through Clock are unowned — they live until GC or manual dispose.
 * Extensible via Clock.prototype for user-defined context methods.
 * @constructor
 * @implements {Factory}
 */
function Clock() { }
Clock.prototype._flag = 0;
Clock.prototype._level = -1;
/** @type {Owner | null} */
Clock.prototype._owner = null;
/**
 * No recover handlers: owner-chain walks (tryRecover) treat the Clock
 * as the end of the chain, like a root with nothing registered.
 * @type {null}
 */
Clock.prototype._recover = null;

/**
 * @constructor
 * @implements {Owner}
 */
function Root() {
	/** @type {number} */
	this._flag = FLAG_OWNER;
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
 * @implements {Sender<T>}
 * @param {T} value
 */
function Signal(value) {
	/** @type {number} */
	this._flag = 0;
	/** @type {T} */
	this._value = value;
	/** @type {number} */
	this._stamp = -1;
	/** @type {Receiver | null} */
	this._sub1 = null;
	/** @type {Array<Receiver | number> | null} */
	this._subs = null;
}

/**
 * Full-featured signal with equality function and async support.
 * Used by resource() and signal(value, equal). Extends Signal
 * with _time (for LWW stale activation tracking) and _equal
 * (custom equality to skip notifications).
 * @template T
 * @constructor
 * @extends {Signal<T>}
 * @implements {AsyncSender<T>}
 * @param {T} value
 * @param {number} flag
 * @param {(function(T,T): boolean) | null} equal
 */
function Cell(value, flag, equal) {
	/** @type {number} */
	this._flag = flag;
	/** @type {T} */
	this._value = value;
	/** @type {number} */
	this._stamp = -1;
	/** @type {Receiver | null} */
	this._sub1 = null;
	/** @type {Array<Receiver | number> | null} */
	this._subs = null;
	/** @type {number} */
	this._time = 0;
	/** @type {(function(T,T): boolean) | null} */
	this._equal = equal;
	/** @type {Resolver | null} */
	this._chan = null;
}
Cell.prototype = Object.create(Signal.prototype);

/**
 * @constructor
 * @template T, U, W
 * @param {(function(U, T, W): T) | (function(T, W): T)} fn
 * @param {number} opts
 * @param {Sender<U> | null} dep1
 * @param {T=} seed
 * @param {W=} args
 * @implements {ICompute<T>}
 */
function Compute(fn, opts, dep1, seed, args) {
	/** @type {number} */
	this._flag = FLAG_INIT | FLAG_STALE | opts;
	/** @type {T} */
	this._value = seed;
	/** @type {number} */
	this._stamp = -1;
	/** @type {Receiver | null} */
	this._sub1 = null;
	/** @type {Array<Receiver | number> | null} */
	this._subs = null;
	/** @type {(function(U, T, W): T) | (function(T, W): T) | null} */
	this._fn = fn;
	/** @type {Sender<U> | null} */
	this._dep1 = dep1;
	/** @type {number} */
	this._dep1slot = -1;
	/** @type {Array<Sender | number> | null} */
	this._deps = null;
	/** @type {number} */
	this._time = 0;
	/** @type {number} */
	this._ctime = 0;
	/** @type {Function | Array<Function> | null} */
	this._cleanup = null;
	/** @type {IChannel | null} */
	this._chan = null;
	/** @type {W | undefined} */
	this._args = args;
}

/**
 * @constructor
 * @template U, W
 * @param {number} opts
 * @param {(function(U,W): void) | (function(W): void)} fn
 * @param {Sender<U> | null} dep1
 * @param {Owner | null} owner
 * @param {W=} args
 * @implements {IEffect}
 */
function Effect(opts, fn, dep1, owner, args) {
	/** @type {number} */
	this._flag = FLAG_INIT | FLAG_OWNER | (0 | opts);
	/** @type {(function(U,W): void) | (function(W): void) | null} */
	this._fn = fn;
	/** @type {Sender<U> | null} */
	this._dep1 = dep1;
	/** @type {number} */
	this._dep1slot = -1;
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
	/** @type {(function(): void) | Array<(function(): void)> | null} */
	this._finalize = null;
	/** @type {IChannel | null} */
	this._chan = null;
	/** @type {number} */
	this._stamp = 0;
	/** @type {W | undefined} */
	this._args = args;
}

/**
 * Unified async context for task/spawn nodes. Created lazily on first
 * async utility call (controller(), defer(), suspend(task)). Stored
 * in the node's dedicated _channel field.
 * @constructor
 * @implements {IChannel}
 */
function Channel() {
	/** @type {AsyncSender | null} First responder we're waiting on. */
	this._res1 = null;
	/** @type {Array<AsyncSender | null> | null} Additional responders. */
	this._responds = null;
	/** @type {Array<AsyncReceiver | (function(*): void)> | null} 3-stride: [awaiter, resolve, reject]. */
	this._waiters = null;
	/** @type {AbortController | Array<AbortController> | null} */
	this._controller = null;
	/** @type {Sender | null} First deferred dep (inline fast path). */
	this._defer1 = null;
	/** @type {*} Snapshot of _defer1's value at defer() time. */
	this._defer1val = null;
	/** @type {Array<Sender | *> | null} Paired [sender, value] entries for 2+ defers. */
	this._defers = null;
}

/**
 * Shared across Root/Signal/Compute/Effect. Queues onto DISPOSES, and
 * when idle runs the drain for it at once: writes and disposes made by
 * cleanups join the same transaction and flush once the whole subtree is
 * disposed, so nothing being torn down re-runs. An effect's live owner
 * then drops it from `_owned`. A cleanup that throws is reported once the
 * disposal has finished, as an error of its node.
 * @this {Disposer}
 * @returns {void}
 */
function dispose() {
	if (!(this._flag & FLAG_DISPOSED)) {
		DISPOSES[DISPOSER_COUNT++] = this;
		if (IDLE) {
			flush();
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
	if (sender._flag & FLAG_DISPOSED || sender === /** @type {Sender} */(this)) {
		throw new Error(ILLEGAL_READ);
	}
	if (flag & FLAG_LOADING) {
		return this._readAsync(sender, false);
	}
	/** Sync path: version-tagged dep tracking with VSTACK restore. */
	let version = STAMP;
	if (sender._stamp === version) {
		/** Already read this run: an errored sender throws on every read. */
		if (sender._flag & FLAG_ERROR) {
			throw sender._value;
		}
		return sender._value;
	}
	if (sender._flag & (FLAG_STALE | FLAG_PENDING)) {
		sender._refresh();
	}
	if ((flag & (FLAG_STABLE | FLAG_SETUP | FLAG_FREEZE)) === FLAG_STABLE) {
		if (sender._flag & FLAG_ERROR) {
			throw sender._value;
		}
		return sender._value;
	}
	let stamp = sender._stamp;
	sender._stamp = version;
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
 * Shared set implementation for Signal, Resource, and Compute. When IDLE,
 * resolves updater functions, writes via _assign, notifies and
 * flushes. When not IDLE, schedules for drain. Updater functions
 * are resolved at drain time by assign() to see the latest value.
 *
 * An immediate write supersedes the writes posted before it: their
 * queue entries are cancelled once the updater has returned and the
 * value is compared, so a throwing updater or equality function
 * leaves them in place. Inside a batch or a flush, set() queues
 * behind them instead, and the last write wins.
 *
 * For Resource nodes (FLAG_ASYNC), accepts an optional asyncFn as
 * second argument. The optimistic value is written immediately,
 * then asyncFn runs with the resource as context and the optimistic
 * value as prev, before the flush. On resolve, _settle writes the
 * final value. An immediate plain write settles the resource, so the
 * activation in flight is discarded.
 * @template T
 * @this {Sender<T> | AsyncSender<T>}
 * @param {T | (function(T): T)} value
 * @param {(function(AsyncSender<T>, T): (T | Promise<T>))=} asyncFn
 * @returns {boolean}
 */
function set(value, asyncFn) {
	if (this._flag & FLAG_DISPOSED) {
		throw new Error(ILLEGAL_READ);
	}
	let callback = typeof value === "function";
	/** Resource: single function arg → run as (c, current), dispatch on result. */
	if (callback && asyncFn === undefined && this._flag & FLAG_ASYNC) {
		if (IDLE) {
			if (this._flag & FLAG_SCHEDULED) {
				supersede(this);
			}
			_runAsync(/** @type {AsyncSender<T>} */(this), value, this._value);
		} else {
			schedule(this, value, asyncRun);
		}
		return true;
	}
	if (IDLE) {
		/** @type {T} */
		let _value;
		let write = true;
		if (callback) {
			_value = value(this._value);
			/** Mutable updater returning void — keep current value, still notify. */
			if (_value === undefined && this._flag & FLAG_MUTABLE) {
				write = false;
			}
		} else {
			_value = value;
		}
		/** Resource: a plain write also supersedes the activation in
		 *  flight. The new token orphans it, and the write settles. */
		if (this._flag & FLAG_LOADING && asyncFn === undefined) {
			if (this._flag & FLAG_SCHEDULED) {
				supersede(this);
			}
			this._time++;
			/** @type {AsyncSender<T>} */(this)._settle(_value);
			return true;
		}
		let changed =
			this._flag & FLAG_MUTABLE ||
			(this._equal !== null
				? !this._equal(this._value, _value)
				: this._value !== _value);
		if (this._flag & FLAG_SCHEDULED) {
			supersede(this);
		}
		if (changed) {
			if (write) {
				this._value = _value;
			}
			notify(this, FLAG_STALE);
			/** Resource: start the activation before flushing, so that
			 *  subscribers see the optimistic value as loading. */
			if (asyncFn !== undefined && this._flag & FLAG_ASYNC) {
				_runAsync(/** @type {AsyncSender<T>} */(this), asyncFn, _value);
			}
			flush();
			return true;
		}
		if (asyncFn === undefined) {
			return false;
		}
		if (this._flag & FLAG_ASYNC) {
			_runAsync(/** @type {AsyncSender<T>} */(this), asyncFn, _value);
		}
		return true;
	}
	if (asyncFn !== undefined && this._flag & FLAG_ASYNC) {
		schedule(this, { _value: value, _fn: asyncFn }, asyncAssign);
		return true;
	}
	if (
		callback ||
		this._flag & (FLAG_MUTABLE | FLAG_SCHEDULED) ||
		(this._equal !== null
			? !this._equal(this._value, value)
			: this._value !== value)
	) {
		schedule(this, value, assign);
		return true;
	}
	return false;
}

/**
 * Starts async work for a resource signal. Increments _time for
 * LWW, runs asyncFn, dispatches based on return type. A sync result
 * that supersedes an activation in flight settles even if unchanged,
 * so loading ends and the waiters resume.
 * @template T
 * @param {AsyncSender<T>} node
 * @param {function(AsyncSender<T>, T): (T | Promise<T>)} asyncFn
 * @param {T} prev
 */
function _runAsync(node, asyncFn, prev) {
	let flag = node._flag;
	node._flag = flag & ~(FLAG_ERROR | FLAG_SUSPEND | FLAG_LOADING);
	let time = ++node._time;
	let result;
	try {
		result = asyncFn(node, prev);
	} catch (err) {
		node._error(err);
		return;
	}
	if (node._flag & FLAG_SUSPEND) {
		/** Callback suspend path — settlement handled by the callback,
		 *  which may already have settled synchronously. */
		return;
	}
	let kind = asyncKind(result);
	if (kind === ASYNC_PROMISE) {
		node._flag |= FLAG_LOADING;
		resolvePromise(node, result, time);
	} else if (kind === ASYNC_ITERATOR) {
		node._flag |= FLAG_LOADING;
		resolveIterator(node, result, time);
	} else if (
		result !== undefined &&
		(node._flag & FLAG_MUTABLE ||
			(node._equal !== null
				? !node._equal(node._value, result)
				: node._value !== result))
	) {
		/** ASYNC_SYNC: settle with the value immediately if changed. */
		node._settle(result);
	} else if (flag & FLAG_LOADING) {
		node._settle(node._value);
	}
}

/**
 * Batch-drain handler for both Signal and Compute. Resolves updater
 * functions against the current value at drain time, compares, and
 * only writes + notifies if the value actually changed. Delegates
 * the actual write to node._value which stores the resolved value
 * fields (_ctime, FLAG_INIT for Compute; plain _value for Signal).
 * @template T
 * @param {Sender<T>} node
 * @param {T | (function(T): T)} value
 * @param {number} time
 * @returns {void}
 */
function assign(node, value, time) {
	let _value;
	let write = true;
	if (typeof value === "function") {
		_value = value(node._value);
		/** Mutable updater returning void — keep current value, still notify. */
		if (_value === undefined && node._flag & FLAG_MUTABLE) {
			write = false;
		}
	} else {
		_value = value;
	}
	if (
		node._flag & FLAG_MUTABLE ||
		(node._equal !== null
			? !node._equal(node._value, _value)
			: node._value !== _value)
	) {
		if (write) {
			node._value = _value;
		}
		if (node._flag & FLAG_SCHEDULED) {
			node._flag &= ~FLAG_SCHEDULED;
			notify(node, FLAG_STALE);
		}
	}
}

/**
 * Batch-drain handler for resource async writes. Resolves the
 * optimistic value like assign(), then kicks off the async work
 * with the resolved value as prev.
 * @template T
 * @param {AsyncSender<T>} node
 * @param {{ _value: T, _fn: (function(AsyncSender<T>, T): (T | Promise<T>)) }} payload
 * @param {number} time
 */
function asyncAssign(node, payload, time) {
	assign(node, payload._value, time);
	_runAsync(node, payload._fn, node._value);
}

/**
 * Batch-drain handler for the single-argument resource form,
 * set(asyncFn) / post(asyncFn). Writes no value of its own: runs
 * the callback against the value at drain time, so it sees every
 * write queued before it.
 * @template T
 * @param {AsyncSender<T>} node
 * @param {function(AsyncSender<T>, T): (T | Promise<T>)} fn
 * @param {number} time
 */
function asyncRun(node, fn, time) {
	_runAsync(node, fn, node._value);
}

/**
 * Batch-drain handler for notify(). No value write — just clears
 * FLAG_SCHEDULED and notifies subscribers.
 * @template T
 * @param {Sender<T>} node
 * @param {T} _
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
 * FLAG_SCHEDULED marks the sender as having queued writes. The first
 * write that changes the value clears it and notifies; the drain clears
 * what is left once every write has run.
 * @template T
 * @param {Sender<T>} node
 * @param {T} payload
 * @param {Function} fn
 * @returns {void}
 */
function schedule(node, payload, fn) {
	node._flag |= FLAG_SCHEDULED;
	let index = SENDER_COUNT++;
	SENDERS[index] = node;
	PAYLOADS[index] = payload;
	UPDATES[index] = fn;
}

/**
 * Cancels the queued writes to a sender, so that an immediate write
 * takes precedence over the writes posted before it. The entries keep
 * their place and drain as no-ops, leaving other senders untouched.
 * Only reached when a sender with queued writes is written directly,
 * so the scan costs no field on the sender.
 * @param {Sender} node
 * @returns {void}
 */
function supersede(node) {
	node._flag &= ~FLAG_SCHEDULED;
	for (let i = 0; i < SENDER_COUNT; i++) {
		if (SENDERS[i] === node) {
			UPDATES[i] = NOOP;
		}
	}
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
	if (stamp > FENCE) {
		VSTACK[VCOUNT++] = sender;
		VSTACK[VCOUNT++] = stamp;
	}

	if (this._flag & FLAG_SETUP) {
		/** Setup path: first run, push deps to DSTACK. */
		if (this._dep1 === null) {
			this._dep1 = sender;
			this._dep1slot = connect(sender, this, -1);
		} else {
			let subslot = connect(sender, this, DCOUNT);
			DSTACK[DCOUNT++] = sender;
			DSTACK[DCOUNT++] = subslot;
		}
	} else if (this._deps === null) {
		/** New deps are connected by patchDeps after the run. */
		this._deps = [sender, 0];
		this._flag &= ~FLAG_SINGLE;
	} else {
		this._deps.push(sender, 0);
	}
}

/**
 * @template T
 * @this {Receiver}
 * @param {Sender<T>} sender
 * @param {boolean} safe - if true, return error value instead of throwing
 * @returns {T}
 */
function _readAsync(sender, safe) {
	if (sender._flag & (FLAG_STALE | FLAG_PENDING)) {
		sender._refresh();
	}
	if ((this._flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
		if (!safe && sender._flag & FLAG_ERROR) {
			throw sender._value;
		}
		return sender._value;
	}
	subscribe(this, sender);
	if (!safe && sender._flag & FLAG_ERROR) {
		throw sender._value;
	}
	return sender._value;
}

/**
 * Creates a signal. When equal is provided, uses Cell (extended
 * signal with custom equality function). Passing `false` instead
 * skips the equality check, so every write notifies — for objects
 * mutated in place, where an updater may return void to keep the
 * current value.
 * @template T
 * @param {T} value
 * @param {(function(T,T): boolean) | boolean=} equal
 * @returns {Signal<T> | Cell<T>}
 */
function signal(value, equal) {
	if (equal === false) {
		let node = new Signal(value);
		node._flag = FLAG_MUTABLE;
		return node;
	}
	if (typeof equal === "function") {
		return new Cell(value, 0, equal);
	}
	return new Signal(value);
}

/**
 * Creates an async-capable signal. Supports optimistic writes
 * with background async work via `set(value, asyncFn)`.
 * @template T
 * @param {T} value
 * @param {(function(T,T): boolean) | boolean=} equal
 * @returns {Cell<T>}
 */
function resource(value, equal) {
	if (equal === false) {
		return new Cell(value, FLAG_ASYNC | FLAG_MUTABLE, null);
	}
	return new Cell(value, FLAG_ASYNC, typeof equal === "function" ? equal : null);
}

/**
 * @param {function(Root): void} fn
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
	let CellProto = Cell.prototype;
	/** @const */
	let ComputeProto = Compute.prototype;
	/** @const */
	let EffectProto = Effect.prototype;

	RootProto._owner = null;
	RootProto._level = -1;

	SignalProto._ctime = 0;
	SignalProto._time = 0;
	SignalProto._equal = null;

	/**
	 * Read on disposal to find the owner to compact. Signals are unowned,
	 * and an owned compute keeps no reference back to its owner.
	 */
	SignalProto._owner =
		ComputeProto._owner = null;

	/**
	 * No op functions on signals
	 */
	SignalProto._drop = 
		SignalProto._refresh =
		SignalProto._update = NOOP;

	/**
	 * Compute._drop: releases cached value and marks STALE. Called
	 * from clearReceiver when FLAG_WEAK is set and no subscribers
	 * remain. The value goes back to the seed, or null without one.
	 * Loading nodes keep their value — active channel
	 * waiters re-subscribe on settle.
	 * @this {Compute}
	 */
	ComputeProto._drop = function () {
		if (this._flag & FLAG_LOADING) {
			return;
		}
		this._flag |= FLAG_STALE;
		let seed = SEEDS.get(this);
		this._value = seed !== undefined ? seed : null;
		if (this._cleanup !== null) {
			clearCleanup(this);
		}
	};

	/**
	 * Compacts _owned by removing FLAG_DISPOSED children. Keeps creation
	 * order, so clearOwned still disposes them in reverse.
	 * @this {Owner}
	 */
	RootProto._purge = EffectProto._purge = function () {
		let owned = this._owned;
		this._flag &= ~FLAG_PURGE;
		if (owned === null) {
			return;
		}
		let write = 0;
		let count = owned.length;
		for (let read = 0; read < count; read++) {
			let child = owned[read];
			if (!(child._flag & FLAG_DISPOSED)) {
				owned[write++] = child;
			}
		}
		owned.length = write;
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

	let disposed = {
		/**
		 * @this {Disposer}
		 * @returns {boolean}
		 */
		get: function () {
			return (this._flag & FLAG_DISPOSED) !== 0;
		}
	};

	let _readonlyLoading = {
		/**
		 * @this {Disposer}
		 * @returns {boolean}
		 */
		get: function () {
			return (this._flag & FLAG_LOADING) !== 0;
		}
	};
	let _readonlyError = {
		/**
		 * @this {Disposer}
		 * @returns {boolean}
		 */
		get: function () {
			return (this._flag & FLAG_ERROR) !== 0;
		}
	};

	Object.defineProperties(RootProto, { disposed });
	Object.defineProperties(SignalProto, { disposed });
	Object.defineProperties(CellProto, {
		loading: _readonlyLoading,
		error: _readonlyError
	});
	Object.defineProperties(ComputeProto, {
		disposed,
		loading: _readonlyLoading,
		error: _readonlyError
	});
	Object.defineProperties(EffectProto, { disposed, loading: _readonlyLoading });

	/**
	 * Registers a cleanup fn on this owner. Stored compactly: _cleanup holds
	 * a single fn for count=1, graduating to an array on the second.
	 * @this {Owner}
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
	 * @this {Owner}
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
	 * @this {Receiver}
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
	 * The deps are frozen as they are at the end of the run stable() is
	 * called in: FLAG_FREEZE keeps val() tracking until that run ends, so
	 * patchDeps does not drop the deps read after the call. Between runs,
	 * the deps are frozen as they are. A compute clears FLAG_FREEZE at the
	 * start and the end of every run, so it is always safe to set.
	 * @this {Compute}
	 * @returns {void}
	 */
	function stable() {
		if (!(this._flag & FLAG_STABLE)) {
			this._flag |= FLAG_STABLE | FLAG_FREEZE;
		}
	}

	/**
	 * Effect version of stable(). An effect clears FLAG_FREEZE only when
	 * a run ends, so it is set only while the effect is stale or pending:
	 * running, or queued or paused with a run to come, which then still
	 * tracks its reads. Otherwise the deps are frozen as they are.
	 * @this {Effect}
	 * @returns {void}
	 */
	function stableEffect() {
		let flag = this._flag;
		if (!(flag & FLAG_STABLE)) {
			this._flag =
				flag | FLAG_STABLE | (flag & (FLAG_STALE | FLAG_PENDING) ? FLAG_FREEZE : 0);
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
	ComputeProto.stable = stable;
	EffectProto.stable = stableEffect;

	/**
	 * Signals an expected error from a compute. Sets FLAG_ERROR and
	 * returns a REFUSE Defect. The caller returns this
	 * from their fn — _update sees FLAG_ERROR and stores it as the
	 * compute's error value without hitting the catch path.
	 * Named `fail` to avoid collision with the `.error` getter.
	 * @template T
	 * @this {Compute<T>}
	 * @param {T} val
	 * @returns {{ error: *, type: number }}
	 */
	ComputeProto.refuse = function (val) {
		this._flag |= FLAG_ERROR;
		return new Defect(val, REFUSE);
	};

	/**
	 * Signals an expected panic from a compute or effect. Throws a
	 * PANIC Defect, which every catch passes on unchanged, in this run
	 * or after an await.
	 * @this {Receiver}
	 * @param {*} val
	 * @returns {void}
	 */
	ComputeProto.panic = EffectProto.panic = function (val) {
		throw new Defect(val, PANIC);
	};

	/**
	 * Marks this compute as eager (push-based). Once set, the node
	 * eagerly re-runs on notification instead of waiting for a pull.
	 * @this {Compute}
	 */
	ComputeProto.eager = function () {
		this._flag |= FLAG_EAGER;
	};

	/**
	 * Marks this compute as weak, like OPT_WEAK: once it loses its last
	 * subscriber, it releases its value and runs its cleanups. Called
	 * before the first run, it keeps the seed for the recompute, as
	 * OPT_WEAK does. After the first run the seed is gone, so the
	 * recompute gets null as prev.
	 * @this {Compute}
	 */
	ComputeProto.weak = function () {
		if (this._flag & FLAG_INIT && this._value !== undefined) {
			SEEDS.set(this, this._value);
		}
		this._flag |= FLAG_WEAK;
	};

	/**
	 * Enqueues a scoped effect into the level-indexed SCOPES queue.
	 * Only used for effects with owned children, flat effects go
	 * directly to RECEIVERS in the hot path.
	 * @param {Effect} node
	 */
	function enqueueScope(node) {
		let level = node._level;
		let count = LEVELS[level];
		SCOPES[level][count] = node;
		LEVELS[level] = count + 1;
		SCOPE_COUNT++;
	}

	/**
	 * Pauses an owner node (Effect or Root) and recursively pauses
	 * all owned child effects. While paused, notifications are
	 * suppressed — the node accumulates stale/pending bits but
	 * _receive() returns early. Computes are not paused because
	 * they are pull-based and inherently lazy.
	 * @this {Owner}
	 */
	function pause() {
		this._flag |= FLAG_PAUSED;
		let owned = this._owned;
		if (owned !== null) {
			pauseOwned(owned);
		}
	}

	/**
	 * Recursively walks an owned array and flags each child effect
	 * as paused. Only traverses into children with FLAG_OWNER
	 * (Effects), since Computes have no owned subtree.
	 * @param {Array<Receiver>} owned
	 */
	function pauseOwned(owned) {
		let count = owned.length;
		for (let i = 0; i < count; i++) {
			let child = owned[i];
			if (child._flag & FLAG_OWNER) {
				child._flag |= FLAG_PAUSED;
				let childOwned = /** @type {Owner} */(child)._owned;
				if (childOwned !== null) {
					pauseOwned(childOwned);
				}
			}
		}
	}

	RootProto.pause = EffectProto.pause = pause;

	/**
	 * Resumes a paused effect. If the effect itself needs an update,
	 * it enqueues and lets the re-run rebuild its owned subtree.
	 * Otherwise, it walks owned children to resume them individually.
	 * @this {Effect}
	 */
	function resumeEffect() {
		let flag = this._flag;
		if (!(flag & FLAG_PAUSED)) {
			return;
		}
		this._flag = flag & ~FLAG_PAUSED;
		if (flag & (FLAG_STALE | FLAG_PENDING)) {
			if (flag & FLAG_STALE || needsUpdate(this, TIME)) {
				/** Effect needs update — enqueue it. The re-run will
				 *  clearOwned and rebuild the subtree, so no need to
				 *  individually resume children. */
				if (this._owned === null) {
					RECEIVERS[RECEIVER_COUNT++] = this;
				} else {
					enqueueScope(this);
				}
				if (IDLE) {
					flush();
				}
				return;
			}
			this._flag &= ~(FLAG_STALE | FLAG_PENDING);
		}
		let owned = this._owned;
		if (owned !== null) {
			resumeOwned(owned);
			if (IDLE) {
				flush();
			}
		}
	}

	/**
	 * Resumes a paused root. Root has no dependencies, so it just
	 * walks owned children and resumes any that need updating.
	 * @this {Root}
	 */
	function resumeRoot() {
		let flag = this._flag;
		if (!(flag & FLAG_PAUSED)) {
			return;
		}
		this._flag = flag & ~FLAG_PAUSED;
		let owned = this._owned;
		if (owned !== null) {
			resumeOwned(owned);
			if (IDLE) {
				flush();
			}
		}
	}

	/**
	 * Recursively resumes owned child effects. Only processes
	 * children with FLAG_OWNER (Effects). If a child effect needs
	 * to update, it is enqueued and its subtree will be rebuilt
	 * by the re-run. Otherwise, it walks further down.
	 * @param {Array<Owner | Receiver>} owned
	 */
	function resumeOwned(owned) {
		let count = owned.length;
		for (let i = 0; i < count; i++) {
			let child = owned[i];
			let flag = child._flag;
			if (!(flag & FLAG_OWNER) || !(flag & FLAG_PAUSED) || flag & FLAG_DISPOSED) {
				continue;
			}
			child._flag = flag & ~FLAG_PAUSED;
			if (flag & (FLAG_STALE | FLAG_PENDING)) {
				if (flag & FLAG_STALE || needsUpdate(/** @type {Effect} */(child), TIME)) {
					if (child._owned === null) {
						RECEIVERS[RECEIVER_COUNT++] = /** @type {Effect} */(child);
					} else {
						enqueueScope(/** @type {Effect} */(child));
					}
					continue;
				}
				child._flag &= ~(FLAG_STALE | FLAG_PENDING);
			}
			let childOwned = child._owned;
			if (childOwned !== null) {
				resumeOwned(childOwned);
			}
		}
	}

	EffectProto.resume = resumeEffect;
	RootProto.resume = resumeRoot;

	/**
	 * Intercepts a promise so the async continuation is silently dropped
	 * when the owning node has been disposed or re-run since this call.
	 * Uses an activation timestamp to detect staleness.
	 *
	 * If the node is still current, resolves/rejects normally.
	 * If stale or disposed, resolves to REGRET — a thenable whose
	 * `.then()` is a no-op, so `await` never resumes and the closure
	 * becomes eligible for GC.
	 * @template T
	 * @this {AsyncReceiver}
	 * @param {IThenable<T> | AsyncSender<T> | Array<AsyncSender> | (function(Function, Function))} promiseOrTask
	 * @returns {T | Array<T> | Promise<T | Array<T>> | void}
	 */
	function suspend(promiseOrTask) {
		/** Branch: setup function → callback constructor path.
		 *  Sets FLAG_SUSPEND so _update knows the node is waiting
		 *  for a callback-driven settlement, not a returned promise.
		 *  FLAG_CALLBACK stays set until the node's fn returns, so a
		 *  callback that settles before then (synchronously, inside
		 *  the setup fn) is finished by _update, not mid-run. */
		if (typeof promiseOrTask === "function") {
			if (this._flag & FLAG_SUSPEND) {
				throw new Error(
					"Cannot call suspend() with callbacks after a previous suspend()"
				);
			}
			this._flag |= FLAG_SUSPEND | FLAG_LOADING | FLAG_CALLBACK;
			let node = this;
			let time = this._time;
			promiseOrTask(
				/** @param {*} val */
				function (val) {
					if (
						node._time !== time ||
						(node._flag & FLAG_DISPOSED && !(node._flag & FLAG_LOCKED))
					) {
						return;
					}
					if (!(node._flag & FLAG_LOCKED)) {
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
				/** @param {*} err */
				function (err) {
					if (
						node._time !== time ||
						(node._flag & FLAG_DISPOSED && !(node._flag & FLAG_LOCKED))
					) {
						return;
					}
					if (!(node._flag & FLAG_LOCKED)) {
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
		if (typeof promiseOrTask.then === "function") {
			/** Promise path — wrap with staleness guard. A thenable is
			 *  adopted first, since its then() need not return a promise. */
			let node = this;
			let time = this._time;
			return Promise.resolve(promiseOrTask).then(
				/** @param {*} val */
				function (val) {
					if (
						node._time === time &&
						(!(node._flag & FLAG_DISPOSED) || node._flag & FLAG_LOCKED)
					) {
						return val;
					}
					return REGRET;
				},
				/** @param {*} error */
				function (error) {
					if (
						node._time === time &&
						(!(node._flag & FLAG_DISPOSED) || node._flag & FLAG_LOCKED)
					) {
						throw error;
					}
					return REGRET;
				}
			);
		}
		/** Branch: array of tasks → concurrent await. */
		if (Array.isArray(promiseOrTask)) {
			return _suspendArray(this, promiseOrTask);
		}
		/** Branch: Compute node with FLAG_ASYNC → task-await path. */
		return _suspendTask(this, /** @type {AsyncSender<T>} */(promiseOrTask));
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
	 * @template T
	 * @param {AsyncReceiver} node
	 * @param {AsyncSender<T>} taskNode
	 * @returns {T | Promise<T>}
	 */
	function _suspendTask(node, taskNode) {
		if (taskNode._flag & FLAG_DISPOSED || taskNode === node) {
			throw new Error(ILLEGAL_READ);
		}
		if (taskNode._flag & (FLAG_STALE | FLAG_PENDING)) {
			taskNode._refresh();
		}

		/** Fast-path: task is settled — track as dep and return value.
		 *  Mirrors val(): in the sync scope use version stamping so
		 *  patchDeps handles lifecycle; in async scope use subscribe()
		 *  and let settleDeps deduplicate. */
		if (!(taskNode._flag & FLAG_LOADING)) {
			if (node._flag & FLAG_LOADING) {
				subscribe(node, taskNode);
			} else {
				track(node, taskNode);
			}
			if (taskNode._flag & FLAG_ERROR) {
				throw taskNode._value;
			}
			return taskNode._value;
		}

		/** Task is loading — create channel binding and return a Promise.
		 *  Staleness is handled by resetChannel: if the node re-runs,
		 *  the old waiter is removed and this Promise never resolves. */
		return new Promise(function (resolve, reject) {
			send(node, taskNode, resolve, reject);
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
	 * awaiter during the walk. After all slots are filled, or a
	 * member fails, we subscribe to every task in one pass and
	 * resolve or reject the Promise.
	 *
	 * @param {AsyncReceiver} node
	 * @param {Array<Compute>} tasks
	 * @returns {Array | Promise<Array>}
	 */
	function _suspendArray(node, tasks) {
		let count = tasks.length;
		if (count === 0) {
			return [];
		}
		let results = new Array(count);

		/** Fast-path: try to collect everything synchronously. A
		 *  failing member throws, after subscribing like a single task. */
		let allSettled = true;
		for (let i = 0; i < count; i++) {
			let task = tasks[i];
			if (task._flag & FLAG_DISPOSED || task === node) {
				subscribeArray(node, tasks, !(node._flag & FLAG_LOADING));
				throw new Error(ILLEGAL_READ);
			}
			if (task._flag & (FLAG_STALE | FLAG_PENDING)) {
				task._refresh();
			}
			if (task._flag & FLAG_LOADING) {
				allSettled = false;
				break;
			}
			if (task._flag & FLAG_ERROR) {
				subscribeArray(node, tasks, !(node._flag & FLAG_LOADING));
				throw task._value;
			}
			results[i] = task._value;
		}

		if (allSettled) {
			subscribeArray(node, tasks, !(node._flag & FLAG_LOADING));
			return results;
		}
		node._flag |= FLAG_BLOCKED;

		/** At least one is loading — allocate one Promise.
		 *  _stepArray re-scans from scratch on each wake-up,
		 *  guaranteeing a consistent snapshot when it resolves. */
		return new Promise(function (resolve, reject) {
			_stepArray(node, tasks, results, resolve, reject);
		});
	}

	/**
	 * Scan all tasks for a consistent settled snapshot. Walks every
	 * task — if any is loading, binds a waiter that re-scans from
	 * scratch when it settles. Only resolves when a full scan finds
	 * zero loading tasks, guaranteeing a consistent snapshot (all
	 * values from the same moment). Mirrors c.pending() semantics.
	 * A member that rejected, or was disposed, fails the await when
	 * the scan reaches it.
	 * @param {AsyncReceiver} node
	 * @param {Array<Compute>} tasks
	 * @param {Array} results
	 * @param {function(Array	): void} resolve
	 * @param {function(*): void} reject
	 */
	function _stepArray(node, tasks, results, resolve, reject) {
		let count = tasks.length;
		let blocked = -1;
		/** @type {*} */
		let error = null;
		let failed = false;
		for (let i = 0; i < count; i++) {
			let task = tasks[i];
			if (task._flag & FLAG_DISPOSED || task === node) {
				error = new Error(ILLEGAL_READ);
				failed = true;
				break;
			}
			if (task._flag & (FLAG_STALE | FLAG_PENDING)) {
				task._refresh();
			}
			if (task._flag & FLAG_LOADING) {
				blocked = i;
				break;
			}
			if (task._flag & FLAG_ERROR) {
				error = task._value;
				failed = true;
				break;
			}
			results[i] = task._value;
		}

		/** All settled, or a member failed — subscribe and settle
		 *  the await with a consistent snapshot. */
		if (blocked === -1) {
			node._flag &= ~FLAG_BLOCKED;
			subscribeArray(node, tasks, false);
			if (failed) {
				reject(error);
			} else {
				resolve(results);
			}
			return;
		}

		/** Peek remaining tasks so they're current. */
		for (let j = blocked + 1; j < count; j++) {
			let task = tasks[j];
			if (task._flag & (FLAG_STALE | FLAG_PENDING)) {
				task._refresh();
			}
		}

		/** Bind waiter to the blocked task. On settle, re-scan
		 *  ALL tasks from scratch — a previously settled task may
		 *  have gone back to loading. A rejection or dispose wakes
		 *  the scan too, which then fails the await. */
		let step = function () {
			_stepArray(node, tasks, results, resolve, reject);
		};
		send(node, tasks[blocked], step, step);
	}

	/**
	 * Subscribes an array awaiter to every live member, so that it
	 * re-runs when any of them changes, whether the await resolved
	 * or failed.
	 * @param {AsyncReceiver} node
	 * @param {Array<Compute>} tasks
	 * @param {boolean} sync - inside node's sync run: track like val()
	 */
	function subscribeArray(node, tasks, sync) {
		let count = tasks.length;
		for (let i = 0; i < count; i++) {
			let task = tasks[i];
			if (!(task._flag & FLAG_DISPOSED) && task !== node) {
				if (sync) {
					track(node, task);
				} else {
					subscribe(node, task);
				}
			}
		}
	}

	ComputeProto.suspend = EffectProto.suspend = suspend;

	/** @this {Receiver} */
	ComputeProto.lock = EffectProto.lock = function () {
		this._flag |= FLAG_LOCKED;
	};

	/**
	 * Releases the lock. A change or dispose that arrived while locked
	 * was deferred, and is replayed: when the activation settles if it
	 * is still in flight (the lock holds until then, and _settle replays
	 * it), or right away if it has already finished.
	 * @this {Receiver}
	 */
	ComputeProto.unlock = EffectProto.unlock = function () {
		let flag = this._flag;
		if (!(flag & (FLAG_STALE | FLAG_PENDING | FLAG_DISPOSED))) {
			this._flag = flag & ~FLAG_LOCKED;
		} else if (flag & FLAG_LOCKED && !(flag & FLAG_LOADING)) {
			this._flag = flag & ~FLAG_LOCKED;
			if (flag & FLAG_DISPOSED) {
				this._dispose();
			} else {
				this._receive();
				if (IDLE) {
					flush();
				}
			}
		}
	};

	/**
	 * Lazily allocates the Channel for this node. Lifts _args into
	 * the Channel so the original args are preserved but the node's
	 * _args slot points directly to the Channel.
	 * @this {AsyncReceiver}
	 * @returns {IChannel}
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
	 * Stored compactly: _controller holds a single controller for
	 * count=1, graduating to an array on the second.
	 * @this {AsyncReceiver}
	 * @returns {AbortController}
	 */
	function controller() {
		let channel = this._channel();
		let ctrl = new AbortController();
		let current = channel._controller;
		if (current === null) {
			channel._controller = ctrl;
		} else if (Array.isArray(current)) {
			current.push(ctrl);
		} else {
			channel._controller = [current, ctrl];
		}
		return ctrl;
	}

	ComputeProto.controller = EffectProto.controller = controller;

	/**
	 * Reads a sender's current value without subscribing immediately.
	 * The subscription is deferred until settle time. For sync nodes
	 * (FLAG_ASYNC not set), falls back to val().
	 * @template T
	 * @this {AsyncReceiver}
	 * @param {Sender<T>} sender
	 * @returns {T}
	 */
	function defer(sender) {
		if (!(this._flag & FLAG_ASYNC) || sender === /** @type {Sender} */(this)) {
			return this.val(sender);
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
	 * Accepts a single task or an array of tasks. Subscribes through
	 * rejected(), which tracks like val() but never throws for an
	 * errored task: checking errors is rejected()'s job.
	 *
	 * Usage: `if (c.pending([taskA, taskB])) return;`
	 *
	 * @this {Receiver}
	 * @param {Sender | Array<Sender>} tasks
	 * @returns {boolean} true if any task has FLAG_LOADING set
	 */
	function pending(tasks) {
		let loading = false;
		if (Array.isArray(tasks)) {
			/** Array of tasks. */
			let count = tasks.length;
			for (let i = 0; i < count; i++) {
				let task = tasks[i];
				this.rejected(task);
				if (task._flag & FLAG_LOADING) {
					loading = true;
				}
			}
		} else {
			/** Single task. */
			this.rejected(tasks);
			if (tasks._flag & FLAG_LOADING) {
				loading = true;
			}
		}
		return loading;
	}

	/**
	 * Subscribes to a sender and returns its error value if FLAG_ERROR
	 * is set, or null otherwise. Unlike val(), does not throw on error —
	 * this is the safe way to check and consume errors reactively.
	 *
	 * Usage: `let err = c.rejected(task); if (err) handleError(err);`
	 * @this {Receiver}
	 * @param {Sender} sender
	 * @returns {{ error: *, type: number } | null}
	 */
	function rejected(sender) {
		if ((sender._flag & FLAG_DISPOSED) || sender === /** @type {Sender} */(this)) {
			throw new Error(ILLEGAL_READ);
		}
		let flag = this._flag;
		if (flag & FLAG_LOADING) {
			this._readAsync(sender, true);
		} else {
			let version = STAMP;
			if (sender._flag & (FLAG_STALE | FLAG_PENDING)) {
				sender._refresh();
			}
			if ((flag & (FLAG_STABLE | FLAG_SETUP | FLAG_FREEZE)) !== FLAG_STABLE) {
				if (sender._stamp !== version) {
					let stamp = sender._stamp;
					sender._stamp = version;
					if (stamp === version - 1) {
						REUSED++;
					} else {
						this._read(sender, stamp);
					}
				}
			}
		}
		if (sender._flag & FLAG_ERROR) {
			return sender._value;
		}
		return null;
	}

	ComputeProto.pending = EffectProto.pending = pending;
	ComputeProto.rejected = EffectProto.rejected = rejected;

	/**
	 * Returns the current activation's sequence number. Increments
	 * on each re-run. Useful for attaching to requests for server-side
	 * ordering, or for manual staleness detection across async boundaries.
	 * @this {Receiver}
	 * @returns {number}
	 */
	ComputeProto.version = 
		EffectProto.version = function () { return this._time; };

	/**
	 * Lazily allocates a mini-channel on Cell nodes for waiter support.
	 * Only contains _waiters — no controller, defers, or responds.
	 * @this {Cell}
	 * @returns {Resolver}
	 */
	CellProto._channel = function () {
		if (this._flag & FLAG_CHANNEL) {
			return this._chan;
		}
		let channel = /** @type {Resolver} */({ _waiters: null });
		this._chan = channel;
		this._flag |= FLAG_CHANNEL;
		return channel;
	};

	/**
	 * Resource-specific suspend. Only supports raw promises and the
	 * callback pattern. Resources are senders, not receivers — they
	 * cannot await tasks or other resources.
	 * @template T
	 * @this {Cell<T>}
	 * @param {Promise<T> | (function(Function, Function): ?)} promiseOrFn
	 * @returns {Promise<T> | void}
	 */
	CellProto.suspend = function (promiseOrFn) {
		if (typeof promiseOrFn === "function") {
			if (this._flag & FLAG_SUSPEND) {
				throw new Error(
					"Cannot call suspend() with callbacks after a previous suspend()"
				);
			}
			this._flag |= FLAG_SUSPEND | FLAG_LOADING;
			let node = this;
			let time = this._time;
			promiseOrFn(
				/** @param {*} val */
				function (val) {
					if (node._time !== time || node._flag & FLAG_DISPOSED) {
						return;
					}
					node._settle(val);
				},
				/** @param {*} err */
				function (err) {
					if (node._time !== time || node._flag & FLAG_DISPOSED) {
						return;
					}
					node._error(err);
				}
			);
			return;
		}
		/** Promise path — wrap with staleness guard. A thenable is
		 *  adopted first, since its then() need not return a promise. */
		let node = this;
		let time = this._time;
		return Promise.resolve(promiseOrFn).then(
			function (val) {
				if (node._time === time && !(node._flag & FLAG_DISPOSED)) {
					return val;
				}
				return REGRET;
			},
			function (error) {
				if (node._time === time && !(node._flag & FLAG_DISPOSED)) {
					throw error;
				}
				return REGRET;
			}
		);
	};

	/**
	 * Settles an async resource. Clears FLAG_LOADING, writes value,
	 * resolves waiters, notifies the other subscribers, flushes.
	 * @template T
	 * @this {Cell<T>}
	 * @param {T} value
	 */
	CellProto._settle = function (value) {
		this._flag &= ~FLAG_LOADING;
		if (this._flag & FLAG_DISPOSED) {
			return;
		}
		this._value = value;

		if (this._flag & FLAG_WAITER) {
			let ch = this._chan;
			let waiters = ch._waiters;
			let waiterCount = waiters.length;
			/** Notifies every subscriber that is not a resolved waiter. */
			settleNotify(this, value, !!(this._flag & FLAG_ERROR), waiters, waiterCount);
			ch._waiters = null;
			this._flag &= ~FLAG_WAITER;
		} else {
			notify(this, FLAG_STALE);
		}
		flush();
	};

	/**
	 * Settles an async resource with an error. Wraps as FATAL unless
	 * anod created it, sets FLAG_ERROR, and delegates to _settle.
	 * @this {Cell}
	 * @param {*} err
	 */
	CellProto._error = function (err) {
		this._flag |= FLAG_ERROR;
		this._settle(defect(err));
	};

	/**
	 * @this {Root}
	 * @returns {void}
	 */
	RootProto._dispose = function () {
		this._flag = FLAG_DISPOSED;
		try {
			if (this._cleanup !== null) {
				clearCleanup(this);
			}
		} finally {
			if (this._owned !== null) {
				clearOwned(this);
			}
			this._owned = this._recover = null;
		}
	};

	/**
	 * Returns the signal's current value. No dependency tracking —
	 * tracking happens via `c.val(sender)` on the context.
	 * @template T
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
	 * @this {Sender}
	 */
	function _notify() {
		if (this._flag & FLAG_DISPOSED) {
			throw new Error(ILLEGAL_READ);
		}
		if (IDLE) {
			notify(this, FLAG_STALE);
			flush();
		} else {
			schedule(this, null, poke);
		}
	}

	SignalProto.notify =
		ComputeProto.notify = _notify;

	/**
	 * Microtask-deferred set. Never writes the value immediately —
	 * always schedules the update to the drain queue. The flush is
	 * deferred to the next microtask so multiple post() calls
	 * coalesce into a single flush. If called from inside a flush
	 * cycle (not IDLE), the current flush picks up the scheduled
	 * value without needing a microtask.
	 *
	 * Fast exit: when nothing is queued for this signal and the value
	 * is unchanged (non-function), nothing to do.
	 * @template T
	 * @this {Signal<T>}
	 * @param {(function(T): T) | T} value
	 * @param {function(AsyncSender<T>, T): T=} asyncFn
	 * @returns {boolean}
	 */
	SignalProto.post = function (value, asyncFn) {
		if (this._flag & FLAG_DISPOSED) {
			throw new Error(ILLEGAL_READ);
		}
		/** Resource: single function arg = asyncFn with no optimistic update. */
		if (
			typeof value === "function" &&
			asyncFn === undefined &&
			this._flag & FLAG_ASYNC
		) {
			schedule(this, value, asyncRun);
			if (!POSTING) {
				POSTING = true;
				queueMicrotask(microflush);
			}
			return true;
		}
		if (asyncFn !== undefined && this._flag & FLAG_ASYNC) {
			schedule(this, { _value: value, _fn: asyncFn }, asyncAssign);
		} else {
			if (
				!(this._flag & (FLAG_MUTABLE | FLAG_SCHEDULED)) &&
				typeof value !== "function" &&
				(this._equal !== null
					? this._equal(this._value, value)
					: this._value === value)
			) {
				return false;
			}
			schedule(this, value, assign);
		}
		if (!POSTING) {
			POSTING = true;
			queueMicrotask(microflush);
		}
		return true;
	};

	/**
	 * Returns true if the sender's current value differs from `value`.
	 * Used by deferred dep settlement to detect changes. 
	 * @template T 
	 * @this {Sender<T>}
	 * @param {T} value
	 * @returns {boolean}
	 */
	function _changed(value) {
		return this._value !== value;
	}

	/**
	 * Returns true if the sender's current value differs from `value`.
	 * Used by deferred dep settlement to detect changes.
	 * @template T
	 * @this {Signal}
	 * @param {T} value
	 * @returns {boolean}
	 */
	SignalProto._changed = ComputeProto._changed = _changed;

	/**
	 * @this {Signal}
	 * @returns {void}
	 */
	SignalProto._dispose = function () {
		this._flag = FLAG_DISPOSED;
		clearSubs(this);
		this._value = null;
	};

	/**
	 * @override
	 * @this {Cell}
	 * @returns {void}
	 */
	CellProto._dispose = function() {
		let flag = this._flag;
		/** Disposed before the waiters run, so that they see it. */
		this._flag = FLAG_DISPOSED;
		if (flag & FLAG_WAITER) {
			let ch = this._chan;
			if (ch._waiters !== null) {
				resolveWaiters(this, ch, new Error("Awaited resource was disposed"), true, true);
			}
		}
		clearSubs(this);
		this._value = null;
	};

	/**
	 * Pulls and returns the compute's current value. Triggers lazy
	 * re-evaluation if stale or pending. Rethrows if in error state.
	 * @template T
	 * @this {Compute<T>}
	 * @returns {T}
	 */
	ComputeProto.get = function () {
		let flag = this._flag;
		if (flag & (FLAG_STALE | FLAG_PENDING)) {
			if (IDLE) {
				IDLE = false;
				try {
					if (flag & FLAG_STALE || needsUpdate(this, TIME)) {
						FENCE = SEED;
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
		if (
			this._flag & FLAG_BOUND &&
			(this._dep1 === null || this._dep1._flag & FLAG_DISPOSED)
		) {
			this._flag |= FLAG_ERROR;
			this._value = new Defect(ILLEGAL_READ, FATAL);
		}
		return this._value;
	};

	/**
	 * IReader: dependency-tracking read. Pulls the sender up to date,
	 * registers it as a dependency, and returns its value.
	 * @this {Compute}
	 * @param {Sender<T>} sender
	 * @returns {T}
	 */
	ComputeProto.val = val;

	/**
	 * Lifts the guard of a contextual write. Clears the pause and the
	 * stale/pending bits that the write's own notification left on the
	 * receiver, but keeps the ones it held before the write, so a user
	 * pause() or a change from another dep survives. When the write
	 * reached a clean receiver through a compute, that compute is left
	 * stale with the receiver unmarked, and later changes would stop at
	 * it. Its deps are brought up to date so they reach it again.
	 * @param {Receiver} receiver
	 * @param {number} flag - the receiver's flags before the write
	 * @returns {void}
	 */
	function unguard(receiver, flag) {
		let added = receiver._flag & ~flag;
		receiver._flag &= flag | ~(FLAG_PAUSED | FLAG_STALE | FLAG_PENDING);
		if (added & FLAG_PENDING && !(flag & (FLAG_STALE | FLAG_PENDING))) {
			let dep = receiver._dep1;
			if (dep !== null && dep._flag & (FLAG_STALE | FLAG_PENDING)) {
				FENCE = SEED;
				dep._refresh();
			}
			let deps = receiver._deps;
			if (deps !== null) {
				let count = deps.length;
				for (let i = 0; i < count; i += 2) {
					dep = deps[i];
					if (dep._flag & (FLAG_STALE | FLAG_PENDING)) {
						FENCE = SEED;
						dep._refresh();
					}
				}
			}
		}
	}

	/**
	 * Drain handler for contextual set. Wraps assign() with FLAG_PAUSED
	 * on the receiver so that notifications propagating from this write
	 * are ignored by the receiver that initiated the write. The write
	 * skips the receiver, so FLAG_SCHEDULED stays armed for the sender:
	 * a later write to it in the same drain still notifies the receiver.
	 * @template T
	 * @param {Sender<T>} node
	 * @param {{ _value: T, _recv: Receiver }} payload
	 * @param {number} time
	 */
	function guardedAssign(node, payload, time) {
		let receiver = payload._recv;
		let flag = receiver._flag;
		let scheduled = node._flag & FLAG_SCHEDULED;
		receiver._flag = flag | FLAG_PAUSED;
		try {
			assign(node, payload._value, time);
		} finally {
			unguard(receiver, flag);
			node._flag |= scheduled;
		}
	}

	/**
	 * Drain handler for guarded async writes. Pauses the receiver
	 * around asyncAssign so it ignores its own notification, and
	 * keeps FLAG_SCHEDULED armed like guardedAssign.
	 * @template T
	 * @param {AsyncSender<T>} node
	 * @param {{ _value: T, _fn: (function(AsyncSender<T>, T): (T | Promise<T>)), _recv: Receiver }} payload
	 * @param {number} time
	 */
	function guardedAsyncAssign(node, payload, time) {
		let receiver = payload._recv;
		let flag = receiver._flag;
		let scheduled = node._flag & FLAG_SCHEDULED;
		receiver._flag = flag | FLAG_PAUSED;
		try {
			asyncAssign(node, payload, time);
		} finally {
			unguard(receiver, flag);
			node._flag |= scheduled;
		}
	}

	/**
	 * Contextual set — writes to a sender while pausing this receiver
	 * so it ignores any notifications that propagate from the write.
	 * When IDLE (e.g. inside an async continuation after await), mirrors
	 * the immediate set() path. Supports asyncFn for resource senders.
	 * @throws
	 * @template T
	 * @this {Receiver}
	 * @param {Sender<T> | AsyncSender<T>} sender
	 * @param {(function(T): T) | T} value
	 * @param {function(AsyncSender<T>, T): (T | Promise<T>)=} asyncFn
	 * @returns {void}
	 */
	function contextSet(sender, value, asyncFn) {
		if (sender._flag & FLAG_DISPOSED) {
			throw new Error(ILLEGAL_READ);
		}
		if (IDLE) {
			let _value;
			let write = true;
			if (typeof value === "function") {
				_value = value(sender._value);
				/** Mutable updater returning void — keep current value, still notify. */
				if (_value === undefined && sender._flag & FLAG_MUTABLE) {
					write = false;
				}
			} else {
				_value = value;
			}
			/** Compared first, so a throwing equality function cancels no posts. */
			let changed =
				sender._flag & FLAG_MUTABLE ||
				(sender._equal !== null
					? !sender._equal(sender._value, _value)
					: sender._value !== _value);
			if (sender._flag & FLAG_SCHEDULED) {
				supersede(sender);
			}
			if (changed) {
				if (write) {
					sender._value = _value;
				}
				let flag = this._flag;
				this._flag = flag | FLAG_PAUSED;
				notify(sender, FLAG_STALE);
				unguard(this, flag);
				flush();
			}
			if (asyncFn !== undefined && sender._flag & FLAG_ASYNC) {
				_runAsync(/** @type {AsyncSender} */(sender), asyncFn, _value);
			}
		} else {
			if (asyncFn !== undefined && sender._flag & FLAG_ASYNC) {
				schedule(
					sender,
					{ _recv: this, _value: value, _fn: asyncFn },
					guardedAsyncAssign
				);
			} else {
				schedule(sender, { _recv: this, _value: value }, guardedAssign);
			}
		}
	}

	/**
	 * Contextual post — deferred version of contextSet. Schedules a
	 * guarded write that will pause this receiver at drain time. Triggers
	 * a microtask flush if not already posting. Supports asyncFn for
	 * resource senders.
	 * @throws
	 * @template T
	 * @this {Receiver}
	 * @param {Sender<T>} sender
	 * @param {(function(T): T) | T} value
	 * @param {(function(AsyncSender<T>, T) :T)=} asyncFn
	 * @returns {void}
	 */
	function contextPost(sender, value, asyncFn) {
		if (sender._flag & FLAG_DISPOSED) {
			throw new Error(ILLEGAL_READ);
		}
		if (asyncFn !== undefined && sender._flag & FLAG_ASYNC) {
			schedule(
				sender,
				{ _recv: this, _value: value, _fn: asyncFn },
				guardedAsyncAssign
			);
		} else {
			schedule(sender, { _recv: this, _value: value }, guardedAssign);
		}
		if (!POSTING) {
			POSTING = true;
			queueMicrotask(microflush);
		}
	}

	ComputeProto.set = contextSet;
	ComputeProto.post = contextPost;

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
	 * dispose, settles deferred deps, resolves waiters, notifies subscribers,
	 * and re-runs if the node was marked stale while locked. Settling always
	 * completes the activation; only the subscriber notification depends on
	 * the value having changed. Handles both value and error:
	 * when FLAG_ERROR is set before calling, the value is treated as an
	 * error. Uses err || { error: err } guard on errors to guarantee a
	 * non-falsy value (prevents skipping the comparison branch when user
	 * throws null/undefined/0).
	 * @template T
	 * @this {Compute}
	 * @param {T} value
	 */
	ComputeProto._settle = function (value) {
		let flag = this._flag;
		let isError = flag & FLAG_ERROR;
		this._flag &= ~(FLAG_LOADING | FLAG_INIT | FLAG_LOCKED);

		/** Deferred dispose: owner disposed while we were locked.
		 *  FLAG_LOCKED was cleared above, so _dispose runs full cleanup. */
		if (flag & FLAG_DISPOSED) {
			this._dispose();
			return;
		}

		let changed =
			value !== this._value || !!(flag & (FLAG_INIT | FLAG_ERROR));

		/** Settled from inside the fn that called c.suspend(fn), which is
		 *  still running. Only write the value, as part of that run (its
		 *  _time); _update finishes the settle once the fn has returned
		 *  and its deps are tracked. */
		if (flag & FLAG_CALLBACK) {
			if (changed) {
				this._value = value;
				this._ctime = this._time;
			}
			return;
		}

		if (changed) {
			this._value = value;
			this._ctime = TIME + 1;
		}

		let stale = false;
		if (this._flag & FLAG_ASYNC) {
			let hasDefers =
				this._flag & FLAG_CHANNEL &&
				(this._chan._defer1 !== null || this._chan._defers !== null);
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
				settleNotify(this, value, !!isError, waiters, waiterCount, !changed);
				ch._waiters = null;
				this._flag &= ~FLAG_WAITER;
			}
		}
		if (changed) {
			if (waiters === null) {
				notify(this, FLAG_STALE);
			}
			flush();
		}

		if (
			stale ||
			(flag & FLAG_LOCKED &&
				(this._flag & FLAG_STALE ||
					(this._flag & FLAG_PENDING && needsUpdate(this, TIME))))
		) {
			this._flag |= FLAG_STALE;
			this._update(TIME);
		}

		/** Weak node with no subscribers after settle — release value. */
		if (
			this._flag & FLAG_WEAK &&
			this._sub1 === null &&
			(this._subs === null || this._subs.length === 0)
		) {
			this._drop();
		}
	};

	/**
	 * Settles an async compute with an error. Wraps as FATAL unless
	 * anod created it, sets FLAG_ERROR, and delegates to _settle.
	 * @this {Compute}
	 * @param {?} err
	 */
	ComputeProto._error = function (err) {
		this._flag |= FLAG_ERROR;
		this._settle(defect(err));
	};

	/** @this {Compute} */
	ComputeProto._dispose = function () {
		if (this._flag & FLAG_LOCKED) {
			this._flag |= FLAG_DISPOSED;
			return;
		}
		let flag = this._flag;
		this._flag = FLAG_DISPOSED;
		clearSubs(this);
		clearDeps(this);
		if (flag & FLAG_CHANNEL) {
			let chan = this._chan;
			if (chan._controller !== null) {
				abortControllers(chan._controller);
			}
			/** Panic any nodes awaiting this task. */
			if (chan._waiters !== null) {
				resolveWaiters(
					this,
					chan,
					new Error("Awaited task was disposed"),
					true,
					true
				);
			}
			/** Remove ourselves from any responders we were awaiting. */
			if (chan._res1 !== null || chan._responds !== null) {
				clearChannel(chan, this);
			}
		}
		try {
			if (this._cleanup !== null) {
				clearCleanup(this);
			}
		} finally {
			this._fn = this._value = this._args = this._chan = null;
		}
	};

	/**
	 * @template T
	 * @this {Compute<T>}
	 * @param {number} time
	 */
	ComputeProto._update = function (time) {
		let flag = this._flag;
		if (flag & FLAG_LOCKED) {
			return;
		}
		this._time = time;
		this._flag =
			flag &
			~(
				FLAG_STALE |
				FLAG_LOADING |
				FLAG_ERROR |
				FLAG_EQUAL |
				FLAG_NOTEQUAL |
				FLAG_SUSPEND |
				FLAG_FREEZE
			);

		if (!(flag & FLAG_INIT) && this._cleanup !== null) {
			try {
				clearCleanup(this);
			} catch (error) {
				/** A throwing cleanup fails this run. The deps are kept,
				 *  so the next change runs the compute again. */
				if (flag & FLAG_CHANNEL) {
					resetChannel(this);
				}
				this._flag = (this._flag | FLAG_ERROR) & ~FLAG_PENDING;
				this._value = new Defect(error, FATAL);
				this._ctime = time;
				return;
			}
		}

		/** Reset channel state from previous activation. Handles both
		 *  async nodes and sync nodes using controller/callback suspend. */
		if (flag & FLAG_CHANNEL) {
			resetChannel(this);
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
			} catch (error) {
				value = defect(error);
				/** A throw wins over a callback that already settled. */
				this._flag = (this._flag | FLAG_ERROR) & ~FLAG_CALLBACK;
			}
		} else {
			/** Setup or dynamic: bump STAMP for dep tracking */
			let prevRVer = STAMP;
			let version = (SEED += 2);
			STAMP = version;
			let saveStart = VCOUNT;
			let depsLen = 0;
			let depCount = 0;
			/** @type {number} */
			let prevDBase;
			/** @type {number} */
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
					dep._stamp = version;
					value = this._fn(dep._value, this, this._value, args);
				} else {
					value = this._fn(this, this._value, args);
				}
			} catch (error) {
				value = defect(error);
				/** A throw wins over a callback that already settled. */
				this._flag = (this._flag | FLAG_ERROR) & ~FLAG_CALLBACK;
			}

			if (flag & FLAG_SETUP) {
				if (DCOUNT > DBASE) {
					let stack = DSTACK;
					let deps = (this._deps = stack.slice(DBASE, DCOUNT));
					for (let i = DBASE; i < DCOUNT; i++) {
						stack[i] = null;
					}
					if (DBASE !== 0) {
						rebaseDeps(deps);
					}
					DCOUNT = DBASE;
					/** A bound node starts single. */
					this._flag &= ~FLAG_SINGLE;
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
					stack[i]._stamp = stack[i + 1];
					stack[i] = null;
				}
				VCOUNT = saveStart;
			}
			STAMP = prevRVer;
		}

		this._flag &= ~(FLAG_STALE | FLAG_PENDING | FLAG_SETUP | FLAG_FREEZE);
		flag = this._flag;

		/** Async: if fn used callback suspend, the node is already
		 *  FLAG_LOADING via the setup function. Skip async dispatch.
		 *  Check both FLAG_SUSPEND and FLAG_LOADING: the callback path
		 *  sets both, while promise/task paths only set FLAG_SUSPEND
		 *  (FLAG_LOADING is set later by this dispatch code). Like the
		 *  promise path, FLAG_INIT is kept for _settle, so the first
		 *  settle notifies even if it resolves to the seed. */
		if (flag & FLAG_ASYNC) {
			if (this._flag & FLAG_SUSPEND && this._flag & FLAG_LOADING) {
				this._flag &= ~FLAG_CALLBACK;
				return;
			}
			/** The callback settled before the fn returned, and _settle
			 *  only wrote the value. As with any callback suspend, the
			 *  fn's return value is ignored; finish the settle here. */
			if (this._flag & FLAG_CALLBACK) {
				this._flag &= ~FLAG_CALLBACK;
				if (this._flag & FLAG_CHANNEL) {
					let chan = this._chan;
					if (chan._defer1 !== null || chan._defers !== null) {
						settleDefers(this);
					}
					let waiters = chan._waiters;
					if (waiters !== null) {
						let isError = !!(this._flag & FLAG_ERROR);
						settleNotify(this, this._value, isError, waiters, waiters.length, true);
						chan._waiters = null;
						this._flag &= ~FLAG_WAITER;
					}
				}
				return;
			}
			let kind = asyncKind(value);
			if (kind !== ASYNC_SYNC) {
				this._flag |= FLAG_LOADING;
				if (kind === ASYNC_PROMISE) {
					resolvePromise(this, /** @type {IThenable<T>} */(value), time);
				} else {
					resolveIterator(
						this,
						/** @type {AsyncIterator<T> | AsyncIterable<T>} */(value),
						time
					);
				}
				return;
			}
			/** Sync result: the activation settles here, deferred deps too. */
			if (
				this._flag & FLAG_CHANNEL &&
				(this._chan._defer1 !== null || this._chan._defers !== null)
			) {
				settleDefers(this);
			}
		}

		flag = this._flag &= ~(FLAG_INIT | FLAG_CALLBACK);
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
	 * Compute notification handler. In-flight async work is left alone:
	 * the notice may resolve to no change, so it is only torn down when
	 * the node actually re-runs (_update) or is disposed.
	 * 1. Default: propagate PENDING downstream (pure pull).
	 * 2. FLAG_WAITER: enqueue to COMPUTES + notify PENDING.
	 * 3. FLAG_EAGER + FLAG_ASYNC: enqueue to COMPUTES for eager re-run.
	 * 4. FLAG_EAGER + sync: enqueue to COMPUTES + notify PENDING, so
	 *    subscribers only re-run if the eager re-run changes the value.
	 * @this {Compute}
	 * @returns {void}
	 */
	ComputeProto._receive = function () {
		let flag = this._flag;
		if (
			!(
				flag &
				(FLAG_EAGER |
					FLAG_WAITER |
					FLAG_LOCKED |
					FLAG_PAUSED |
					FLAG_DISPOSED)
			)
		) {
			notify(this, FLAG_PENDING);
		} else if (flag & (FLAG_LOCKED | FLAG_PAUSED | FLAG_DISPOSED)) {
			return;
		} else {
			COMPUTES[COMPUTE_COUNT++] = this;
			/** An eager task notifies its subscribers when it settles. */
			if (!(flag & FLAG_EAGER && flag & FLAG_ASYNC)) {
				notify(this, FLAG_PENDING);
			}
		}
	};

	/**
	 * @throws
	 * @this {Effect}
	 * @template T
	 * @param {Sender<T>} sender
	 * @returns {T}
	 */
	EffectProto.val = val;
	EffectProto.set = contextSet;
	EffectProto.post = contextPost;

	/**
	 * @this {Effect}
	 * @param {number} time
	 */
	EffectProto._update = function (time) {
		let flag = this._flag;
		if (flag & (FLAG_LOCKED | FLAG_CHANNEL)) {
			if (flag & FLAG_LOCKED) {
				return;
			}
			/** A completed activation's controllers are released, not
			 *  aborted: only an activation in flight is aborted on re-run,
			 *  below. This keeps them from piling up. */
			if (!(flag & FLAG_LOADING)) {
				this._chan._controller = null;
			}
		}

		this._time = time;
		/** Tear down the in-flight activation. Done here rather than in
		 *  _receive, so a pending notice that resolves to no change
		 *  leaves its waiters and controller alone. */
		if (flag & FLAG_LOADING) {
			this._flag &= ~(FLAG_LOADING | FLAG_SUSPEND);
			if (flag & FLAG_CHANNEL) {
				resetChannel(this);
			}
		}
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

		/** @type {(function(): void) | null | undefined} */
		let value;
		let args = this._args;

		/** FLAG_FREEZE: stable() was called while queued, so this run still tracks. */
		if ((flag & (FLAG_STABLE | FLAG_SETUP | FLAG_FREEZE)) === FLAG_STABLE) {
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
			/** Setup or dynamic: bump STAMP for dep tracking */
			let current = STAMP;
			let version = (SEED += 2);
			STAMP = version;
			let saveStart = VCOUNT;
			let depCount = 0;
			let depsLen = 0;
			/** @type {number} */
			let dbase;
			/** @type {number} */
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
						let deps = (this._deps = stack.slice(DBASE, DCOUNT));
						for (let i = DBASE; i < DCOUNT; i++) {
							stack[i] = null;
						}
						if (DBASE !== 0) {
							rebaseDeps(deps);
						}
						DCOUNT = DBASE;
						/** A bound node starts single. */
						this._flag &= ~FLAG_SINGLE;
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
						stack[i]._stamp = stack[i + 1];
						stack[i] = null;
					}
					VCOUNT = saveStart;
				}
				STAMP = current;
				this._flag &= ~(FLAG_SETUP | FLAG_STALE | FLAG_PENDING | FLAG_FREEZE);
			}
		}

		if (flag & FLAG_ASYNC) {
			if (this._flag & FLAG_SUSPEND && this._flag & FLAG_LOADING) {
				this._flag &= ~(FLAG_INIT | FLAG_CALLBACK);
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
			/** Sync result: the activation settles here, deferred deps too. */
			if (
				this._flag & FLAG_CHANNEL &&
				(this._chan._defer1 !== null || this._chan._defers !== null)
			) {
				settleDefers(this);
			}
		}

		/** An effect has no value for its fn's return to overwrite, so
		 *  its callbacks settle as they fire; FLAG_CALLBACK is unused. */
		this._flag &= ~(FLAG_INIT | FLAG_CALLBACK);
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
		this._flag &= ~(FLAG_LOADING | FLAG_SUSPEND | FLAG_LOCKED);

		/** Deferred dispose: owner disposed while we were locked.
		 *  FLAG_LOCKED was cleared above, so _dispose runs full cleanup. */
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
		if (
			this._flag & FLAG_CHANNEL &&
			(this._chan._defer1 !== null || this._chan._defers !== null)
		) {
			stale = settleDeps(this);
		}
		if (
			stale ||
			(flag & FLAG_LOCKED &&
				(this._flag & FLAG_STALE ||
					(this._flag & FLAG_PENDING && needsUpdate(this, TIME))))
		) {
			this._flag |= FLAG_STALE;
			this._receive();
			flush();
		}
	};

	/**
	 * Settles an async effect with an error. Wraps as FATAL unless
	 * anod created it, sets FLAG_ERROR, and delegates to _settle.
	 * @this {Effect}
	 * @param {*} err
	 */
	EffectProto._error = function (err) {
		this._flag |= FLAG_ERROR;
		this._settle(defect(err));
	};

	/**
	 * @this {Effect}
	 * @returns {void}
	 */
	EffectProto._dispose = function () {
		if (this._flag & FLAG_LOCKED) {
			this._flag |= FLAG_DISPOSED;
			return;
		}
		let flag = this._flag;
		this._flag = FLAG_DISPOSED;
		if (this._finalize !== null) {
			clearFinalize(this);
		}
		clearDeps(this);
		/** A throwing cleanup, here or in a child, still finishes the disposal. */
		try {
			if (this._cleanup !== null) {
				clearCleanup(this);
			}
		} finally {
			try {
				if (this._owned !== null) {
					clearOwned(this);
				}
			} finally {
				if (flag & FLAG_CHANNEL) {
					let chan = this._chan;
					if (chan._controller !== null) {
						abortControllers(chan._controller);
					}
					if (chan._res1 !== null || chan._responds !== null) {
						clearChannel(chan, this);
					}
				}
				this._fn =
					this._args =
					this._chan =
					this._owned =
					this._owner =
					this._recover =
					this._finalize =
					null;
			}
		}
	};

	/**
	 * @this {Effect}
	 * @returns {void}
	 */
	EffectProto._receive = function () {
		let flag = this._flag;
		if (flag & (FLAG_LOCKED | FLAG_PAUSED | FLAG_DISPOSED)) {
			return;
		}
		if (this._owned === null) {
			RECEIVERS[RECEIVER_COUNT++] = this;
		} else {
			enqueueScope(this);
		}
	};

	/**
	 * Creates a sync compute node.
	 * Unbound: compute(fn, seed?, opts?, args?)
	 * Bound:   compute(dep, fn, seed?, opts?, args?)
	 * @this {Owner}
	 * @template T, U, W
	 * @param {Sender<U> | (function(T, W): T)} depOrFn
	 * @param {(function(U, T, W): T) | T=} fnOrSeed
	 * @param {number | T=} optsOrSeed
	 * @param {number | W=} argsOrOpts
	 * @param {W=} args
	 * @returns {Compute<T, U, W>}
	 */
	function compute(depOrFn, fnOrSeed, optsOrSeed, argsOrOpts, args) {
		if (this._flag & FLAG_DISPOSED) {
			throw new Error(ILLEGAL_READ);
		}
		let flag, node;
		if (typeof depOrFn === "function") {
			flag = FLAG_SETUP | ((0 | optsOrSeed) & OPTIONS);
			node = new Compute(depOrFn, flag, null, fnOrSeed, argsOrOpts);
		} else {
			flag =
				FLAG_STABLE | FLAG_BOUND | FLAG_SINGLE | ((0 | argsOrOpts) & OPTIONS);
			node = new Compute(/** @type {!Function} */(fnOrSeed), flag, depOrFn, optsOrSeed, args);
			node._dep1slot = connect(depOrFn, node, -1);
		}
		if (flag & FLAG_WEAK && node._value !== undefined) {
			SEEDS.set(node, node._value);
		}
		if (this._flag & FLAG_OWNER) {
			addOwned(this, node);
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
	 * @this {Owner}
	 * @template T, U, W
	 * @param {Sender<U> | (function(T, W): T)} depOrFn
	 * @param {(function(U, T, W): T) | T=} fnOrSeed
	 * @param {number | T=} optsOrSeed
	 * @param {number | W=} argsOrOpts
	 * @param {W=} args
	 * @returns {Compute<T, U, W>}
	 */
	function task(depOrFn, fnOrSeed, optsOrSeed, argsOrOpts, args) {
		if (this._flag & FLAG_DISPOSED) {
			throw new Error(ILLEGAL_READ);
		}
		let flag, node;
		if (typeof depOrFn === "function") {
			flag = FLAG_ASYNC | FLAG_SETUP | ((0 | optsOrSeed) & OPTIONS);
			node = new Compute(depOrFn, flag, null, fnOrSeed, argsOrOpts);
		} else {
			flag =
				FLAG_ASYNC |
				FLAG_STABLE |
				FLAG_BOUND |
				FLAG_SINGLE |
				((0 | argsOrOpts) & OPTIONS);
			node = new Compute(fnOrSeed, flag, depOrFn, optsOrSeed, args);
			node._dep1slot = connect(depOrFn, node, -1);
		}
		if (flag & FLAG_WEAK && node._value !== undefined) {
			SEEDS.set(node, node._value);
		}
		if (this._flag & FLAG_OWNER) {
			addOwned(this, node);
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
	 * @this {Owner}
	 * @template U, W
	 * @param {Sender<U> | (function(W): void)} depOrFn
	 * @param {(function(U, W): void) | number=} fnOrOpts
	 * @param {number | W=} optsOrArgs
	 * @param {W=} args
	 * @returns {Effect<U, W>}
	 */
	function effect(depOrFn, fnOrOpts, optsOrArgs, args) {
		if (this._flag & FLAG_DISPOSED) {
			throw new Error(ILLEGAL_READ);
		}
		let flag, node;
		if (typeof depOrFn === "function") {
			flag = FLAG_SETUP | ((0 | fnOrOpts) & OPTIONS);
			node = new Effect(flag, depOrFn, null, this, optsOrArgs);
		} else {
			flag =
				FLAG_STABLE | FLAG_BOUND | FLAG_SINGLE | ((0 | optsOrArgs) & OPTIONS);
			node = new Effect(flag, /** @type {!Function} */(fnOrOpts), depOrFn, this, args);
			node._dep1slot = connect(depOrFn, node, -1);
		}
		let level = this._level + 1;
		if (this._level > 2 && level >= LEVELS.length) {
			LEVELS.push(0);
			SCOPES.push([]);
		}
		node._level = level;
		if (this._flag & FLAG_OWNER) {
			addOwned(this, node);
		}
		if ((flag & (FLAG_DEFER | FLAG_BOUND)) === (FLAG_DEFER | FLAG_BOUND)) {
			deferEffect(node);
		} else {
			startEffect(node);
		}
		return node;
	}

	/**
	 * Creates an async effect node (spawn).
	 * Unbound: spawn(fn, opts?, args?)
	 * Bound:   spawn(dep, fn, opts?, args?)
	 * @template U, W
	 * @this {Owner}
	 * @param {Sender<U> | (function(W): void)} depOrFn
	 * @param {(function(U, W): void) | number=} fnOrOpts
	 * @param {number | W=} optsOrArgs
	 * @param {W=} args
	 * @returns {Effect<U, W>}
	 */
	function spawn(depOrFn, fnOrOpts, optsOrArgs, args) {
		if (this._flag & FLAG_DISPOSED) {
			throw new Error(ILLEGAL_READ);
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
			node = new Effect(flag, /** @type {!Function} */(fnOrOpts), depOrFn, this, args);
			node._dep1slot = connect(depOrFn, node, -1);
		}
		let level = this._level + 1;
		if (this._level > 2 && level >= LEVELS.length) {
			LEVELS.push(0);
			SCOPES.push([]);
		}
		node._level = level;
		if (this._flag & FLAG_OWNER) {
			addOwned(this, node);
		}
		if ((flag & (FLAG_DEFER | FLAG_BOUND)) === (FLAG_DEFER | FLAG_BOUND)) {
			deferEffect(node);
		} else {
			startEffect(node);
		}
		return node;
	}

	/** Install factory methods on Root, Effect, and Clock prototypes */
	var ClockProto = Clock.prototype;
	RootProto.compute = EffectProto.compute = ClockProto.compute = compute;
	RootProto.task = EffectProto.task = ClockProto.task = task;
	RootProto.effect = EffectProto.effect = ClockProto.effect = effect;
	RootProto.spawn = EffectProto.spawn = ClockProto.spawn = spawn;
}

/**
 * Tracks sender as a dep of node from inside node's sync run, the
 * same way val() does: patchDeps or the setup slice links it after
 * the run. Stable nodes past setup track nothing.
 * @param {Receiver} node
 * @param {Sender} sender
 */
function track(node, sender) {
	if ((node._flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
		return;
	}
	let version = STAMP;
	let stamp = sender._stamp;
	if (stamp === version) {
		return;
	}
	sender._stamp = version;
	if (stamp === version - 1) {
		REUSED++;
	} else {
		node._read(sender, stamp);
	}
}

/**
 * Links sender to receiver outside receiver's sync run (reads after
 * an await, settled waiters, deferred deps). Like _read, a second
 * dependency clears FLAG_SINGLE.
 * @param {Receiver} receiver
 * @param {Sender} sender
 */
function subscribe(receiver, sender) {
	if (receiver._dep1 === null) {
		receiver._dep1 = sender;
		receiver._dep1slot = connect(sender, receiver, -1);
	} else {
		let deps = receiver._deps;
		if (deps === null) {
			receiver._deps = [sender, connect(sender, receiver, 0)];
			receiver._flag &= ~FLAG_SINGLE;
		} else {
			let depslot = deps.length;
			deps.push(sender, connect(sender, receiver, depslot));
		}
	}
}

/**
 * This is a highly problematic function.
 * It's the same issue as with deps, but for subs.
 * We cannot pre-allocate a packed array, because anyone
 * can subscribe at any time. So, one alternative would be to re-allocate
 * the array, through slice, and compact it.
 * I am not 100% sure, but it seems the formula is something like this:
 * ```
 * new_capacity = old_capacity + ((old_capacity - 1) >> 1) + 18
 * ```
 * It means that the bucket boundaries will be:
 * 1 -> 19 -> 46 -> 86 -> 146 -> 235
 * Out of these, obviously it's just the first bucket transition that is
 * truly problematic. Once you have allocated 19 subs, the jump to 46 is
 * not so much more expensive. But right now, going from 2 to 3 subs
 * will cause a sudden big spike in memory. Since most senders have a few subs,
 * this is a real concern.
 *
 * Links are two-way. _subs holds [receiver, depslot] pairs and _deps
 * holds [sender, subslot] pairs, each slot being the index of the
 * matching pair on the other side, or -1 for _sub1/_dep1. Either side
 * can then unlink in O(1) by swapping its last pair into the hole.
 * _sub1 needs no slot: it never moves, and unlinking it only clears it.
 * @param {Sender} send
 * @param {Receiver} receiver
 * @param {number} depslot - index of the pair in receiver's _deps, -1 for _dep1
 * @returns {number} subslot - index of the pair in send's _subs, -1 for _sub1
 */
function connect(send, receiver, depslot) {
	if (send._sub1 === null) {
		send._sub1 = receiver;
		return -1;
	}
	let subs = send._subs;
	if (subs === null) {
		send._subs = [receiver, depslot];
		return 0;
	}
	let subslot = subs.length;
	subs.push(receiver, depslot);
	return subslot;
}

/**
 * Removes the receiver at subslot from send's subscriber list.
 * Swap-with-last O(1), then points the moved receiver's dep pair at
 * its new index. A receiver in its setup run keeps its pairs in DSTACK.
 * Disposed senders have already dropped their subscribers.
 * @param {Sender} send
 * @param {number} subslot
 * @returns {void}
 */
function clearReceiver(send, subslot) {
	if (send._flag & FLAG_DISPOSED) {
		return;
	}
	if (subslot === -1) {
		send._sub1 = null;
	} else {
		let subs = send._subs;
		let lastSlot = /** @type {number} */ (subs.pop());
		let lastNode = /** @type {Receiver} */ (subs.pop());
		if (subslot !== subs.length) {
			subs[subslot] = lastNode;
			subs[subslot + 1] = lastSlot;
			if (lastSlot === -1) {
				lastNode._dep1slot = subslot;
			} else if (lastNode._deps !== null) {
				lastNode._deps[lastSlot + 1] = subslot;
			} else {
				DSTACK[lastSlot + 1] = subslot;
			}
		}
	}
	if (
		send._flag & FLAG_WEAK &&
		send._sub1 === null &&
		(send._subs === null || send._subs.length === 0)
	) {
		send._drop();
	}
}

/**
 * Points sender's pair for a dep that moved to depslot in its
 * receiver's _deps (or to _dep1, for -1). A receiver in _sub1 has no
 * pair to update.
 * @param {Sender} send
 * @param {number} subslot
 * @param {number} depslot
 * @returns {void}
 */
function moveDep(send, subslot, depslot) {
	if (subslot !== -1 && send._subs !== null) {
		send._subs[subslot + 1] = depslot;
	}
}

/**
 * After a nested setup run, the senders point at absolute DSTACK
 * indices. Points them at the pairs' indices in the sliced _deps.
 * @param {Array<Sender | number>} deps
 * @returns {void}
 */
function rebaseDeps(deps) {
	let count = deps.length;
	for (let i = 0; i < count; i += 2) {
		moveDep(
			/** @type {Sender} */ (deps[i]),
			/** @type {number} */ (deps[i + 1]),
			i
		);
	}
}

/**
 * Removes the dep pair at i from node's _deps. Swap-with-last O(1).
 * @param {Array<Sender | number>} deps
 * @param {number} i
 * @returns {void}
 */
function removeDep(deps, i) {
	clearReceiver(
		/** @type {Sender} */ (deps[i]),
		/** @type {number} */ (deps[i + 1])
	);
	let lastSlot = /** @type {number} */ (deps.pop());
	let lastDep = /** @type {Sender} */ (deps.pop());
	if (i !== deps.length) {
		deps[i] = lastDep;
		deps[i + 1] = lastSlot;
		moveDep(lastDep, lastSlot, i);
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
				/** @type {Sender} */ (deps[i]),
				/** @type {number} */ (deps[i + 1])
			);
		}
		receive._deps = null;
	}
}

/**
 * Nulls out sender's subscriber list on disposal.
 * Receivers self-heal: dynamic nodes remove stale deps via
 * patchDeps on next re-run; stable bound nodes detect disposed
 * dep1 in _update via refreshDep1. clearReceiver skips disposed
 * senders, so their pairs need no unlinking.
 * @param {Sender} send
 * @returns {void}
 */
function clearSubs(send) {
	send._sub1 = null;
	send._subs = null;
}

/**
 * Runs the node's cleanups, last registered first. Each one is removed
 * before it runs, so it runs exactly once. A cleanup that throws does
 * not stop the rest; its error is rethrown once they have all run (the
 * last one if several throw, as with nested `finally` blocks).
 * @param {Owner | Receiver} node
 */
function clearCleanup(node) {
	let cleanup = node._cleanup;
	if (typeof cleanup === "function") {
		node._cleanup = null;
		cleanup();
	} else {
		/** array form */
		let count = cleanup.length;
		try {
			while (count-- > 0) {
				cleanup.pop()();
			}
		} finally {
			/** Positive only after a throw: the cleanups still left to run. */
			if (count > 0) {
				clearCleanup(node);
			}
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
		try {
			finalize();
		} catch (error) {
			/* swallow — finally semantics */
		}
	} else {
		let count = finalize.length;
		for (let i = 0; i < count; i++) {
			try {
				finalize[i]();
			} catch (error) {
				/* swallow */
			}
		}
	}
}

/**
 * Appends `child` to `owner._owned`, lazily allocating the array. Used by
 * the proto ownership methods after the top-level factory returns a new
 * node, so `_owned` is populated even when the factory runs the node's fn
 * inside its startup path.
 * @param {Owner} owner
 * @param {Receiver} child
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
 * only allocated when an effect or root actually adopts children. A
 * child whose cleanup throws is still disposed, and so are its siblings.
 * @param {Owner} owner
 * @returns {void}
 */
function clearOwned(owner) {
	let owned = owner._owned;
	let count = owned.length;
	try {
		while (count-- > 0) {
			owned.pop()._dispose();
		}
	} finally {
		owner._recover = null;
		/** Positive only after a throw: the children still left to dispose. */
		if (count > 0) {
			clearOwned(owner);
		}
	}
}

/**
 * Classifies a caught value. A Defect travels on unchanged; a value
 * thrown by user code is wrapped as FATAL.
 * @param {*} error
 * @returns {Defect}
 */
function defect(error) {
	return error instanceof Defect ? error : new Defect(error, FATAL);
}

/**
 * Creates an expected error. Throw it from any compute or task, or
 * from code it calls, and it settles the node as REFUSE.
 * @param {*} error
 * @returns {Defect}
 */
function refuse(error) {
	return new Defect(error, REFUSE);
}

/**
 * Creates a panic. Throw it to abort the node; owners see it as PANIC.
 * @param {*} error
 * @returns {Defect}
 */
function panic(error) {
	return new Defect(error, PANIC);
}

/**
 * Creates a fatal error. Throwing a value wraps it as FATAL anyway;
 * fatal() is for passing one on without a throw.
 * @param {*} error
 * @returns {Defect}
 */
function fatal(error) {
	return new Defect(error, FATAL);
}

/**
 * Drops disposed children from a live owner's `_owned`, so an owner that
 * outlives its children does not keep a slot for every child it ever had.
 * Called by the dispose drain once it has taken a child down on its own.
 * The owner is queued onto PURGES, which runs after the disposes of the
 * same pass. Owners already disposed or queued are skipped, as is the
 * global `c`, which owns nothing.
 * @param {Owner} owner
 * @returns {void}
 */
function purgeOwned(owner) {
	if ((owner._flag & (FLAG_OWNER | FLAG_DISPOSED | FLAG_PURGE)) === FLAG_OWNER) {
		owner._flag |= FLAG_PURGE;
		PURGES[PURGE_COUNT++] = owner;
	}
}

/**
 * Checks a single owner's _recover handlers.
 * @param {Owner} owner
 * @param {?} error
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
 * - RECOVER_SELF:  the node's own _recover handled it - node survives.
 * - RECOVER_OWNER: an ancestor handled it - node still disposes, error swallowed.
 * - RECOVER_NONE:  unhandled - node disposes, error propagates.
 *
 * An error that startEffect rethrew from one of node's own children
 * has already been declined by node and its owners, so it is
 * unhandled without asking them again. A handler that throws leaves
 * the error unhandled.
 * @param {Effect} node
 * @param {?} error
 * @returns {number}
 */
function tryRecover(node, error) {
	if (
		error === UNHANDLED &&
		node._owned !== null &&
		node._owned.lastIndexOf(UNHANDLED_NODE) !== -1
	) {
		UNHANDLED = UNHANDLED_NODE = null;
		return RECOVER_NONE;
	}
	try {
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
	} catch (err) {
		/* the handler's own error is dropped, the node's error propagates */
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
 * @param {number} newLen
 * @returns {void}
 */
function patchDeps(node, version, depCount, newLen) {
	let deps = node._deps;
	let existingLen = depCount > 1 ? (depCount - 1) * 2 : 0;
	let newidx = existingLen;

	/** Check dep1 - always exists when depCount >= 1, and _read never
	 *  writes new deps into dep1 (only setup does), so the only
	 *  question is whether dep1 was reused or dropped. */
	let dep1 = node._dep1;
	if (dep1 !== null) {
		if (dep1._stamp !== version) {
			clearReceiver(dep1, node._dep1slot);
			if (newidx < newLen) {
				let newDep = /** @type {Sender} */ (deps[newidx]);
				node._dep1 = newDep;
				node._dep1slot = connect(newDep, node, -1);
				newidx += 2;
			} else {
				node._dep1 = null;
			}
		}
	}

	if (deps === null) {
		if (node._dep1 !== null) {
			node._flag |= FLAG_SINGLE;
		} else {
			node._flag &= ~FLAG_SINGLE;
		}
		return;
	}

	/**
	 * Three-pointer scan over [sender, subslot] pairs:
	 *   i 			-	forward through existing region
	 *   newidx -	next new dep to consume (unsubscribed, in new region)
	 *   tail 	-	end of live region, shrinks when we pop reused deps from the back
	 */
	let i = 0;
	let tail = existingLen;
	while (i < tail) {
		let dep = /** @type {Sender} */ (deps[i]);
		if (dep._stamp === version) {
			i += 2;
			continue;
		}
		/** Dropped — unbind */
		clearReceiver(dep, /** @type {number} */ (deps[i + 1]));
		if (newidx < newLen) {
			let newDep = /** @type {Sender} */ (deps[newidx]);
			deps[i] = newDep;
			deps[i + 1] = connect(newDep, node, i);
			newidx += 2;
			i += 2;
		} else {
			let found = 0;
			while (tail > i + 2) {
				tail -= 2;
				let tDep = /** @type {Sender} */ (deps[tail]);
				let tSlot = /** @type {number} */ (deps[tail + 1]);
				if (tDep._stamp === version) {
					deps[i] = tDep;
					deps[i + 1] = tSlot;
					moveDep(tDep, tSlot, i);
					found = 1;
					break;
				} else {
					clearReceiver(tDep, tSlot);
				}
			}
			if (found) {
				i += 2;
			} else {
				tail = i;
			}
		}
	}
	if (newidx < newLen) {
		if (node._dep1 === null) {
			/** No deps before this run: the first new dep becomes dep1. */
			let newDep = /** @type {Sender} */ (deps[newidx]);
			node._dep1 = newDep;
			node._dep1slot = connect(newDep, node, -1);
			newidx += 2;
		}
		while (newidx < newLen) {
			let dep = /** @type {Sender} */ (deps[newidx]);
			deps[tail] = dep;
			deps[tail + 1] = connect(dep, node, tail);
			tail += 2;
			newidx += 2;
		}
	}

	/** Promote last array entry to dep1 when dep1 is empty. */
	if (node._dep1 === null && tail > 0) {
		tail -= 2;
		let dep = /** @type {Sender} */ (deps[tail]);
		let slot = /** @type {number} */ (deps[tail + 1]);
		node._dep1 = dep;
		node._dep1slot = slot;
		moveDep(dep, slot, -1);
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
			/**
			 * pop() is vastly faster than setting .length
			 * likely even beyond 20, but it's a reasonable limit
			 */
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
 * @param {Sender | null} dep1
 * @param {Array<Sender> | null} deps
 * @returns {number}
 */
function sweepDeps(stamp, dep1, deps) {
	let depCount = 0;
	let vstack = VSTACK;
	let vcount = VCOUNT;
	let transaction = FENCE;
	if (dep1 !== null) {
		let depver = dep1._stamp;
		if (depver > transaction) {
			vstack[vcount++] = dep1;
			vstack[vcount++] = depver;
		}
		dep1._stamp = stamp;
		depCount = 1;
	}
	if (deps !== null) {
		let count = deps.length;
		for (let i = 0; i < count; i += 2) {
			let dep = deps[i];
			let depver = dep._stamp;
			if (depver > transaction) {
				vstack[vcount++] = dep;
				vstack[vcount++] = depver;
			}
			dep._stamp = stamp;
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
	let sub = node._sub1;
	if (sub !== null) {
		let flags = sub._flag;
		sub._flag |= flag;
		if (!(flags & (FLAG_PENDING | FLAG_STALE | FLAG_DISPOSED | FLAG_LOCKED | FLAG_PAUSED))) {
			sub._receive();
		}
	}
	let subs = node._subs;
	if (subs !== null) {
		let count = subs.length;
		for (let i = 0; i < count; i += 2) {
			sub = subs[i];
			let flags = sub._flag;
			sub._flag |= flag;
			if (
				!(flags & (FLAG_PENDING | FLAG_STALE | FLAG_DISPOSED | FLAG_LOCKED | FLAG_PAUSED))
			) {
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
			FENCE = SEED;
			dep._update(time);
		} else if (flag & FLAG_PENDING) {
			FENCE = SEED;
			if (flag & FLAG_SINGLE) {
				checkSingle(/** @type {Receiver} */(dep), time);
			} else {
				checkRun(/** @type {Receiver} */(dep), time);
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
			dep = deps[i];
			let flag = dep._flag;
			if (flag & FLAG_STALE) {
				FENCE = SEED;
				dep._update(time);
			} else if (flag & FLAG_PENDING) {
				FENCE = SEED;
				if (flag & FLAG_SINGLE) {
					checkSingle(/** @type {Receiver} */(dep), time);
				} else {
					checkRun(/** @type {Receiver} */(dep), time);
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
			checkSingle(/** @type {Receiver} */(dep), time);
		} else {
			checkRun(/** @type {Receiver} */(dep), time);
		}
	}
	if (dep._ctime > node._time) {
		node._update(time);
	} else {
		node._flag &= ~(FLAG_STALE | FLAG_PENDING);
	}
}

/**
 * @param {Receiver} node
 * @param {number} time
 * @returns {void}
 */
function checkRun(node, time) {
	let base = CTOP;
	let dep = node._dep1;
	let mark = CMARK;

	/**
	 * Fast descent: walk single-dep PENDING chains without the overhead
	 * of the full scan loop (no resumeFrom branching, no updated flag).
	 * Stops when dep1 is STALE, clean, null, or both STALE+PENDING.
	 */
	if ((dep._flag & (FLAG_STALE | FLAG_PENDING)) === FLAG_PENDING) {
		do {
			CSTACK[CTOP] = node;
			CINDEX[CTOP] = -1;
			if (++CTOP === mark) {
				mark = checkCycle(base);
			}
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
						if (++CTOP === mark) {
							mark = checkCycle(base);
						}
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
					dep = deps[i];
					let flag = dep._flag;
					if (flag & FLAG_STALE) {
						dep._update(time);
					} else if (flag & FLAG_PENDING) {
						/** Descend into deps[i] — push current node */
						CSTACK[CTOP] = node;
						CINDEX[CTOP] = i;
						if (++CTOP === mark) {
							mark = checkCycle(base);
						}
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

			/** No dep changed - clear flags without re-executing. _time
			 *  stays: it is also the in-flight activation's token. */
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
			 * node is always the child that the parent was scanning
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
			parent._flag &= ~(FLAG_STALE | FLAG_PENDING);
			node = parent;
		}
		return;
	}
}

/**
 * Called by checkRun when its stack reaches CMARK, which only happens
 * on a walk deeper than any before it or on a cycle. An acyclic walk
 * never has a node on the stack twice, so a repeat means the descent
 * has looped: it unwinds the stack and throws instead of descending
 * forever. Repeats are found by marking each node with FLAG_VISIT and
 * clearing the marks again, so the scan allocates nothing. Otherwise
 * doubles CMARK and returns it, so deep graphs pay
 * this scan once per doubling of the deepest walk, not per pull.
 * @param {number} base
 * @returns {number}
 */
function checkCycle(base) {
	let top = CTOP;
	let i = base;
	for (; i < top; i++) {
		let node = CSTACK[i];
		if (node._flag & FLAG_VISIT) {
			break;
		}
		node._flag |= FLAG_VISIT;
	}
	/** Clear the marks set so far; a repeat stopped the walk at i. */
	for (let j = base; j < i; j++) {
		CSTACK[j]._flag &= ~FLAG_VISIT;
	}
	if (i < top) {
		for (let j = base; j < top; j++) {
			CSTACK[j] = null;
		}
		CTOP = base;
		throw new Error("Cycle detected");
	}
	/** A nested checkRun may already have raised it past this depth. */
	if (CTOP >= CMARK) {
		CMARK = CTOP << 1;
	}
	return CMARK;
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
 * @param {AsyncDisposer<T>} node
 * @param {IThenable<T>} promise
 * @param {number} time
 * @returns {void}
 */
function resolvePromise(node, promise, time) {
	promise.then(
		(val) => {
			if (
				node._time !== time ||
				(node._flag & FLAG_DISPOSED && !(node._flag & FLAG_LOCKED))
			) {
				return;
			}
			if (!(node._flag & FLAG_LOCKED)) {
				if (node._flag & FLAG_STALE) {
					return;
				}
				if (node._flag & FLAG_PENDING && needsUpdate(/** @type {Receiver} */(node), TIME)) {
					node._flag |= FLAG_STALE;
					return;
				}
			}
			node._settle(val);
		},
		(err) => {
			if (
				node._time !== time ||
				(node._flag & FLAG_DISPOSED && !(node._flag & FLAG_LOCKED))
			) {
				return;
			}
			if (!(node._flag & FLAG_LOCKED)) {
				if (node._flag & FLAG_STALE) {
					return;
				}
				if (node._flag & FLAG_PENDING && needsUpdate(/** @type {Receiver} */(node), TIME)) {
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
 * @param {AsyncDisposer<T>} node
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
		if (
			node._time !== time ||
			(node._flag & FLAG_DISPOSED && !(node._flag & FLAG_LOCKED))
		) {
			if (typeof iterator.return === "function") {
				iterator.return();
			}
			return;
		}
		if (!(node._flag & FLAG_LOCKED)) {
			if (node._flag & FLAG_STALE) {
				if (typeof iterator.return === "function") {
					iterator.return();
				}
				return;
			}
			if (node._flag & FLAG_PENDING && needsUpdate(/** @type {Receiver} */(node), TIME)) {
				node._flag |= FLAG_STALE;
				if (typeof iterator.return === "function") {
					iterator.return();
				}
				return;
			}
		}

		/** A finished iterator settles with its return value. If it returned
		 *  nothing, the last yield already settled the node; if it never
		 *  yielded, it settles to its current value (the seed or previous). */
		if (result.done) {
			if (result.value !== undefined) {
				node._settle(result.value);
			} else if (node._flag & FLAG_LOADING) {
				node._settle(node._value);
			}
			return;
		}

		iterator.next().then(onNext, onError);

		node._settle(result.value);
	};

	/** @param {*} err */
	let onError = (err) => {
		if (
			node._time !== time ||
			(node._flag & FLAG_DISPOSED && !(node._flag & FLAG_LOCKED))
		) {
			return;
		}
		if (!(node._flag & FLAG_LOCKED)) {
			if (node._flag & FLAG_STALE) {
				return;
			}
			if (node._flag & FLAG_PENDING && needsUpdate(/** @type {Receiver} */(node), TIME)) {
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
 *         Skipped when quiet.
 * @template T
 * @param {AsyncSender<T>} node
 * @param {T} value
 * @param {boolean} isError
 * @param {Array<AsyncReceiver | Function>} waiters
 * @param {number} waiterCount
 * @param {boolean=} quiet - Only resolve the waiters, without marking
 *     subscribers stale (the value did not change).
 */
function settleNotify(node, value, isError, waiters, waiterCount, quiet) {
	let version = (SEED += 2);

	/** Pass 1: stamp all sync subs with version - 1. */
	let sub = node._sub1;
	if (sub !== null) {
		sub._stamp = version - 1;
	}
	let subs = node._subs;
	if (subs !== null) {
		let count = subs.length;
		for (let i = 0; i < count; i += 2) {
			subs[i]._stamp = version - 1;
		}
	}

	/** Pass 2: resolve waiters, skip subscribe if already a sync sub. */
	for (let i = 0; i < waiterCount; i += 3) {
		let awaiter = /** @type {AsyncReceiver} */(waiters[i]);
		if (isError) {
			/** @type {Function} */(waiters[i + 2])(value);
		} else {
			/** @type {Function} */(waiters[i + 1])(value);
		}
		if (!(awaiter._flag & FLAG_BLOCKED)) {
			if (awaiter._stamp !== version - 1) {
				subscribe(awaiter, node);
			}
		}
		awaiter._stamp = version;
		clearRespond(awaiter, node);
	}

	if (quiet) {
		return;
	}

	/** Pass 3: inline notify — skip subs that were resolved as waiters. */
	if (sub !== null && sub._stamp !== version) {
		let flags = sub._flag;
		sub._flag |= FLAG_STALE;
		if (!(flags & (FLAG_PENDING | FLAG_STALE | FLAG_BLOCKED | FLAG_DISPOSED))) {
			sub._receive();
		}
	}
	if (subs !== null) {
		let count = subs.length;
		for (let i = 0; i < count; i += 2) {
			sub = subs[i];
			if (sub._stamp !== version) {
				let flags = sub._flag;
				sub._flag |= FLAG_STALE;
				if (
					!(flags & (FLAG_PENDING | FLAG_STALE | FLAG_BLOCKED | FLAG_DISPOSED))
				) {
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
 * @param {AsyncReceiver} node
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
		dep1._stamp = stamp;
	}

	/** Dedup scan of _deps — remove duplicates via swap-with-last.
	 *  Walks back to front, so the pair swapped in is already seen. */
	let hasDefers = defer1 !== null || deferLen > 0;
	if (deps !== null) {
		for (let i = deps.length - 2; i >= 0; i -= 2) {
			let dep = /** @type {Sender} */ (deps[i]);
			if (dep._stamp === stamp) {
				removeDep(deps, i);
			} else {
				dep._stamp = stamp;
			}
		}
	}

	/** Phase 2: subscribe deferred deps and detect changes. */
	if (!hasDefers) {
		return false;
	}

	let changed = false;

	/** Check defer1 first. */
	if (defer1 !== null) {
		if (defer1._stamp === stamp) {
			if (defer1._changed(defer1val)) {
				changed = true;
			}
		} else {
			defer1._stamp = stamp;
			subscribe(node, defer1);
			if (defer1._changed(defer1val)) {
				changed = true;
			}
		}
	}

	/** Check overflow defers. */
	for (let i = 0; i < deferLen; i += 2) {
		let sender = /** @type {Sender} */(defers[i]);
		let snapshot = /** @type {*} */(defers[i + 1]);
		if (sender._stamp === stamp) {
			if (sender._changed(snapshot)) {
				changed = true;
			}
			continue;
		}
		sender._stamp = stamp;
		subscribe(node, sender);
		if (sender._changed(snapshot)) {
			changed = true;
		}
	}
	return changed;
}

/**
 * Subscribes the deferred deps of an async node whose fn returned a
 * sync value, so the activation settles without ever loading. The run
 * has just tracked the node's other deps, so a sender it already has
 * is found by scan instead of by stamp: settleDeps' stamps would
 * overwrite those of an outer node that is still running. A deferred
 * value was read in this same run, so there is nothing to re-run for.
 * @param {AsyncReceiver} node
 * @returns {void}
 */
function settleDefers(node) {
	let chan = node._chan;
	let defer1 = chan._defer1;
	let defers = chan._defers;
	chan._defer1 = null;
	chan._defers = null;
	if (defer1 !== null && !hasDep(node, defer1)) {
		subscribe(node, defer1);
	}
	if (defers !== null) {
		let count = defers.length;
		for (let i = 0; i < count; i += 2) {
			let sender = /** @type {Sender} */(defers[i]);
			if (!hasDep(node, sender)) {
				subscribe(node, sender);
			}
		}
	}
}

/**
 * @param {Receiver} node
 * @param {Sender} sender
 * @returns {boolean} true if sender is already a dep of node
 */
function hasDep(node, sender) {
	if (node._dep1 === sender) {
		return true;
	}
	let deps = node._deps;
	return deps !== null && deps.indexOf(sender) !== -1;
}

/**
 * Aborts the controllers handed out by c.controller() in one activation.
 * @param {AbortController | Array<AbortController>} controller
 * @returns {void}
 */
function abortControllers(controller) {
	if (Array.isArray(controller)) {
		for (let i = 0; i < controller.length; i++) {
			controller[i].abort();
		}
	} else {
		controller.abort();
	}
}

/**
 * Resets async fiber state before re-execution. Aborts the previous
 * controllers, clears stale defers, and removes channel bindings,
 * abandoning an array await (FLAG_BLOCKED) along with them.
 * Shared between Compute and Effect _update paths.
 * @param {AsyncReceiver} node
 * @returns {void}
 */
function resetChannel(node) {
	let chan = node._chan;
	if (chan._controller !== null) {
		abortControllers(chan._controller);
		chan._controller = null;
	}
	chan._defer1 = null;
	chan._defers = null;
	if (chan._res1 !== null || chan._responds !== null) {
		clearChannel(chan, node);
	}
	node._flag &= ~FLAG_BLOCKED;
}

/**
 * Adds a waiter entry to a responder's _waiters array (3-stride).
 * @param {Resolver} responderCh
 * @param {AsyncReceiver} awaiter
 * @param {Function} resolve
 * @param {Function} reject
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
 * @param {AsyncReceiver} awaiter
 * @param {AsyncSender} task
 * @param {function(*): *} resolve
 * @param {function(*): *} reject
 * @returns {void}
 */
function send(awaiter, task, resolve, reject) {
	resolve = resolve;
	reject = reject;
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
 * @param {AsyncSender} responder
 * @param {Resolver} responderCh
 * @param {AsyncReceiver} awaiter
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
 * @param {IChannel} channel
 * @param {AsyncReceiver} awaiter
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
 * @param {AsyncReceiver} awaiter
 * @param {AsyncSender} responder
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
 * @template T
 * @param {AsyncSender<T>} responder
 * @param {Resolver} responderCh
 * @param {T} value
 * @param {boolean} isError
 * @param {boolean} panic
 * @returns {void}
 */
function resolveWaiters(responder, responderCh, value, isError, panic) {
	let waiters = responderCh._waiters;
	let count = waiters.length;
	for (let i = 0; i < count; i += 3) {
		let awaiter = /** @type {AsyncReceiver} */(waiters[i]);
		if (isError) {
			/** @type {Function} */(waiters[i + 2])(value);
		} else {
			/** @type {Function} */(waiters[i + 1])(value);
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
 * A root created inside a running node stays in its transaction: writes
 * are queued for the running flush, and the dependency fence is kept.
 * If `fn` throws, the caller never gets the root back, so it is disposed
 * before the error is rethrown.
 * @param {Root} root
 * @param {function(Root): void} fn
 * @returns {void}
 */
function startRoot(root, fn) {
	try {
		fn(root);
	} catch (error) {
		try {
			root.dispose();
		} catch (err) {
			/* swallow — the setup error wins */
		}
		throw error;
	}
}

/**
 * @param {ICompute} node
 * @returns {void}
 */
function startCompute(node) {
	if (IDLE) {
		IDLE = false;
		try {
			FENCE = SEED;
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
 * Runs a new effect's first activation. When idle, it also flushes
 * what the run queued. The flush sits outside the run's try: an error
 * from an effect it triggers belongs to that effect's owners, and
 * passes straight to the caller.
 * @param {Effect} node
 * @returns {void}
 */
function startEffect(node) {
	if (IDLE) {
		IDLE = false;
		try {
			FENCE = SEED;
			try {
				node._update(TIME);
			} catch (error) {
				failStart(node, error);
			}
			if (SENDER_COUNT > 0 || DISPOSER_COUNT > 0) {
				flush();
			}
		} finally {
			IDLE = true;
		}
	} else {
		try {
			node._update(TIME);
		} catch (error) {
			failStart(node, error);
		}
	}
}

/**
 * Moves the nodes queued while a queue was draining to its front, so the
 * next cycle runs them. Only reached when a node settles or resumes
 * synchronously mid-drain; returns how many are left.
 * @template T
 * @param {Array<T>} queue
 * @param {number} count - the entries already drained
 * @param {number} total - the entries queued now
 * @returns {number}
 */
function requeue(queue, count, total) {
	let left = 0;
	for (let i = count; i < total; i++) {
		let node = queue[i];
		queue[i] = null;
		queue[left++] = node;
	}
	return left;
}

/**
 * Handles an error thrown by a new effect's first run. The effect's
 * handlers and owner chain see it once. If none handles it, the effect
 * is disposed and the error is rethrown to the creator, recorded in
 * UNHANDLED so the creator's own tryRecover does not ask them again.
 * @param {Effect} node
 * @param {*} error
 * @returns {void}
 */
function failStart(node, error) {
	if (node._finalize !== null) {
		clearFinalize(node);
	}
	let err = defect(error);
	let result = tryRecover(node, err);
	if (result !== RECOVER_SELF) {
		node._dispose();
	}
	if (result === RECOVER_NONE) {
		UNHANDLED = err;
		UNHANDLED_NODE = node;
		throw err;
	}
}

/**
 * Starts a bound effect created with OPT_DEFER without running it.
 * A stale or pending compute does not pass notifications on, so the
 * dep is brought up to date first: its next change then reaches the
 * effect. The effect counts as having run now, so a dep that does not
 * change after this does not run it either.
 * @param {Effect} node
 * @returns {void}
 */
function deferEffect(node) {
	let dep = node._dep1;
	node._time = TIME;
	if (dep._flag & (FLAG_STALE | FLAG_PENDING)) {
		if (IDLE) {
			IDLE = false;
			try {
				FENCE = SEED;
				dep._refresh();
				if (SENDER_COUNT > 0 || DISPOSER_COUNT > 0) {
					flush();
				}
			} finally {
				IDLE = true;
			}
		} else {
			dep._refresh();
		}
	}
}

/**
 * Drains a queue of effect nodes: checks staleness, updates,
 * handles errors with finalize/recover/dispose. Returns the
 * first unrecoverable error POJO, or null if all succeeded.
 * @param {Array<Effect>} queue
 * @param {number} count
 * @param {number} time
 * @returns {?}
 */
function flushEffects(queue, count, time) {
	let thrown = null;
	for (let i = 0; i < count; i++) {
		let node = queue[i];
		queue[i] = null;
		/** A node paused after it was queued keeps its flags for resume(). */
		if (
			(node._flag & (FLAG_STALE | FLAG_PAUSED)) === FLAG_STALE ||
			((node._flag & (FLAG_PENDING | FLAG_PAUSED)) === FLAG_PENDING &&
				needsUpdate(node, time))
		) {
			FENCE = SEED;
			try {
				node._update(time);
			} catch (error) {
				/** A cleanup that throws aborts the run before it clears these. */
				node._flag &= ~(FLAG_STALE | FLAG_PENDING);
				if (node._finalize !== null) {
					clearFinalize(node);
				}
				let err = defect(error);
				let result = tryRecover(node, err);
				if (thrown === null && result === RECOVER_NONE) {
					thrown = err;
				}
				if (result !== RECOVER_SELF) {
					try {
						node._dispose();
					} catch (cleanupError) {
						if (thrown === null) {
							thrown = new Defect(cleanupError, FATAL);
						}
					}
				}
			}
		} else if (!(node._flag & FLAG_PAUSED)) {
			node._flag &= ~(FLAG_STALE | FLAG_PENDING);
		}
	}
	return thrown;
}

/**
 * Drains the queues until they are empty. Called during a drain, it
 * returns at once and the running drain picks up the new work. Called
 * inside a batch, it drains now and leaves the batch open.
 * @returns {void}
 */
function flush() {
	if (FLUSHING) {
		return;
	}
	/** @type {number} */
	let time = 0;
	/** @type {number} */
	let cycle = 0;
	/** @type {*} */
	let error = null;
	/** @type {boolean} */
	let thrown = false;
	/** @type {boolean} */
	let idle = IDLE;
	FLUSHING = true;
	IDLE = false;
	try {
		do {
			time = ++TIME;
			if (DISPOSER_COUNT > 0) {
				let count = 0;
				let i = 0;
				/** Disposes queued by a cleanup during the drain run in the same pass. */
				do {
					count = DISPOSER_COUNT;
					for (; i < count; i++) {
						let node = DISPOSES[i];
						let owner = node._owner;
						DISPOSES[i] = null;
						try {
							node._dispose();
						} catch (err) {
							/** The node is disposed, but one of its cleanups threw. */
							if (!thrown) {
								error = new Defect(err, FATAL);
								thrown = true;
							}
						}
						if (owner !== null) {
							purgeOwned(owner);
						}
					}
				} while (DISPOSER_COUNT > count && ++cycle < 1e5);
				DISPOSER_COUNT = 0;
			}
			if (SENDER_COUNT > 0) {
				let count = 0;
				let i = 0;
				/** Writes queued while the queue drains, by an updater or an
				 *  equality function, drain in the same pass, in order. */
				do {
					count = SENDER_COUNT;
					for (; i < count; i++) {
						let node = SENDERS[i];
						/** A sender disposed after its write was queued takes no writes. */
						if (!(node._flag & FLAG_DISPOSED)) {
							try {
								UPDATES[i](node, PAYLOADS[i], time);
							} catch (err) {
								/** A failing updater only loses its own write. */
								if (!thrown) {
									error = err;
									thrown = true;
								}
							}
						}
					}
				} while (SENDER_COUNT > count && ++cycle < 1e5);
				/** Cleared once every write has run, so an unchanged write can't hide a later change.
				 *  A runaway stop leaves writes behind; they are dropped here with their marker. */
				count = SENDER_COUNT;
				for (let i = 0; i < count; i++) {
					SENDERS[i]._flag &= ~FLAG_SCHEDULED;
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
				COMPUTE_COUNT = COMPUTE_COUNT > count ? requeue(COMPUTES, count, COMPUTE_COUNT) : 0;
			}
			if (SCOPE_COUNT > 0) {
				/** Counts the effects scoped again while the levels drain. */
				SCOPE_COUNT = 0;
				let levels = LEVELS.length;
				for (let i = 0; i < levels; i++) {
					let count = LEVELS[i];
					let err = flushEffects(SCOPES[i], count, time);
					if (err !== null && !thrown) {
						error = err;
						thrown = true;
					}
					LEVELS[i] = LEVELS[i] > count ? requeue(SCOPES[i], count, LEVELS[i]) : 0;
				}
			}
			if (RECEIVER_COUNT > 0) {
				let count = RECEIVER_COUNT;
				let err = flushEffects(RECEIVERS, count, time);
				if (err !== null && !thrown) {
					error = err;
					thrown = true;
				}
				RECEIVER_COUNT = RECEIVER_COUNT > count ? requeue(RECEIVERS, count, RECEIVER_COUNT) : 0;
			}
			if (PURGE_COUNT > 0) {
				let count = PURGE_COUNT;
				for (let i = 0; i < count; i++) {
					PURGES[i]._purge();
					PURGES[i] = null;
				}
				PURGE_COUNT = 0;
			}
			if (cycle++ >= 1e5) {
				error = new Error("Runaway cycle");
				thrown = true;
				break;
			}
		} while (
			SENDER_COUNT > 0 ||
			DISPOSER_COUNT > 0 ||
			COMPUTE_COUNT > 0 ||
			SCOPE_COUNT > 0 ||
			RECEIVER_COUNT > 0
		);
	} finally {
		/** Only the outermost transaction goes back to idle. */
		FLUSHING = false;
		IDLE = idle;
		/** Writes an aborted drain leaves behind are dropped with their marker. */
		for (let i = 0; i < SENDER_COUNT; i++) {
			SENDERS[i]._flag &= ~FLAG_SCHEDULED;
			SENDERS[i] = PAYLOADS[i] = UPDATES[i] = null;
		}
		DISPOSER_COUNT =
			SENDER_COUNT =
			SCOPE_COUNT =
			RECEIVER_COUNT =
			PURGE_COUNT =
			0;
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
 * @param {function(): void} fn
 * @returns {void}
 */
function batch(fn) {
	if (IDLE) {
		IDLE = false;
		try {
			fn();
		} finally {
			/** Commits the writes made before a throw, so no later flush picks them up. */
			IDLE = true;
			flush();
		}
	} else {
		fn();
	}
}

export {
	FLAG_STALE,
	FLAG_PENDING,
	FLAG_SCHEDULED,
	FLAG_DISPOSED,
	FLAG_ERROR,
	FLAG_MUTABLE,
	FLAG_WEAK,
	FLAG_INIT,
	FLAG_SETUP,
	FLAG_LOADING,
	FLAG_DEFER,
	FLAG_STABLE,
	FLAG_EQUAL,
	FLAG_NOTEQUAL,
	FLAG_ASYNC,
	FLAG_BOUND,
	FLAG_WAITER,
	FLAG_CHANNEL,
	FLAG_BLOCKED,
	FLAG_LOCKED,
	FLAG_SUSPEND,
	FLAG_PANIC,
	FLAG_SINGLE,
	FLAG_EAGER,
	FLAG_PURGE,
	FLAG_PAUSED,
	FLAG_OWNER,
	FLAG_CALLBACK,
	FLAG_FREEZE,
	FLAG_VISIT,
	REFUSE,
	PANIC,
	FATAL,
	Defect,
	refuse,
	panic,
	fatal,
	OPT_DEFER,
	OPT_STABLE,
	OPT_SETUP,
	OPT_WEAK,
	OPT_EAGER,
	OPTIONS,
	ASYNC_PROMISE,
	ASYNC_ITERATOR,
	ASYNC_SYNC,
	RECOVER_NONE,
	RECOVER_SELF,
	RECOVER_OWNER,
	REGRET,
	NOOP,
	ILLEGAL_READ,

	VSTACK,
	VCOUNT,
	REUSED,
	CSTACK,
	CINDEX,
	CTOP,
	DSTACK,
	DCOUNT,
	DBASE,
	TIME,
	IDLE,
	FLUSHING,
	POSTING,
	c,
	SEED,
	STAMP,
	FENCE,
	DISPOSES,
	DISPOSER_COUNT,
	SENDERS,
	PAYLOADS,
	UPDATES,
	SENDER_COUNT,
	COMPUTES,
	COMPUTE_COUNT,
	LEVELS,
	SCOPES,
	SCOPE_COUNT,
	RECEIVERS,
	RECEIVER_COUNT,
	PURGES,
	PURGE_COUNT,

	Clock,
	Root,
	Signal,
	Cell,
	Compute,
	Effect,
	Channel,

	connect,
	addOwned,
	startRoot,
	startCompute,
	startEffect,

	signal,
	resource,
	root,
	batch,
	flush
};
