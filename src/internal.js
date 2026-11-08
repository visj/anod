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
 * The write paths also read FLAG_LOADING and FLAG_ASYNC on a signal,
 * since a resource is a signal. */
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
/** Waiting on a task through c.suspend(task, onResolve, onReject): the
 *  callback that resumes it also settles it. */
const FLAG_RELAY = 1 << 21;
const FLAG_SINGLE = 1 << 22;
const FLAG_EAGER = 1 << 23;
const FLAG_PURGE = 1 << 24;
const FLAG_PAUSED = 1 << 25;
const FLAG_OWNER = 1 << 26;
const FLAG_CALLBACK = 1 << 27;
/** c.refuse() was called in an async activation. It becomes FLAG_ERROR
 *  when the activation settles, so readers never see the error flag next
 *  to the previous value. */
const FLAG_REFUSE = 1 << 28;
/** Set on the nodes of a checkRun stack only while checkCycle scans it.
 *  It is the last bit: 1 << 30 is outside V8's 31-bit Smi range under
 *  pointer compression. */
const FLAG_VISIT = 1 << 29;

/** Error type constants for { error, type } POJOs. */
const REFUSE = 1;
const PANIC = 2;
const FATAL = 3;

/* Creation options, passed in a factory's opts. A node's options are
 * fixed once it is created. */
const DEFER = FLAG_DEFER;
const STABLE = FLAG_STABLE;
const SETUP = FLAG_SETUP;
const WEAK = FLAG_WEAK;
const EAGER = FLAG_EAGER;

const OPTIONS = DEFER | STABLE | SETUP | WEAK | EAGER;

/* States, read with is(). */
const DISPOSED = FLAG_DISPOSED;
const LOADING = FLAG_LOADING;
const ERROR = FLAG_ERROR;

/** The bits is() answers for. Every other bit reads as unset. */
const PUBLIC = OPTIONS | DISPOSED | LOADING | ERROR;

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
 * Thrown when a node reads a disposed node, or itself.
 * @const
 */
var ILLEGAL_READ = "Cannot read a disposed node or yourself";

var CYCLE = "Cycle detected";

/**
 * Thrown when the callback form of suspend() follows another suspend()
 * in the same activation.
 * @const
 */
var SUSPEND_TWICE = "Cannot call suspend() with callbacks after a previous suspend()";

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
 * Rejections of the waiters of disposed tasks and resources, held
 * until the teardown that disposed them has finished, as triples
 * [awaiter, reject, error, ...]. A waiter that the same teardown
 * disposed is skipped then, whatever order the nodes went in.
 * @const @type {Array<AsyncReceiver | Function | null | Error>}
 */
var REJECTS = [];

var REJECT_COUNT = 0;

/**
 * What a callback suspend delivered while the node's fn was still
 * running, held until the fn returns, as triples [node, fn, value, ...].
 * fn is undefined to settle with value, null to fail with it, or a
 * task callback to call with it. Only nodes whose fn is on the stack
 * have an entry: _update takes it when the fn returns, and a throw or
 * a disposal drops it, so the stack holds one entry per nested run at
 * most.
 * @const @type {Array<Receiver | AsyncSender | Function | null | undefined | *>}
 */
var HELD = [];

var HELD_COUNT = 0;

/**
 * The shields that hold each node, while any are active (D10). A node's
 * count is four times the number of shielded effects below it, plus two
 * if its disposal waits for them (HELD_DISPOSE), plus one if it is
 * shielded itself (HELD_SELF). A node with a count is FLAG_LOCKED. Kept
 * off the nodes, since only a few are ever held at once.
 * @const @type {Map<Owner, number>}
 */
var HOLDS = new Map();

const HELD_SELF = 1;
const HELD_DISPOSE = 2;
const HELD_BELOW = 4;

/**
 * True while teardown() disposes a node outside a flush, or delivers
 * the rejections it collected: a disposal nested inside defers to it.
 * @type {boolean}
 */
var TEARING = false;

/**
 * Writable senders (signals and resources) pending an assignment
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
 * in the node's dedicated _chan field.
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
	/** @type {AbortController | null} */
	this._controller = null;
	/** @type {Array<Sender | *> | null} Paired [sender, value at defer() time] entries. */
	this._defers = null;
}

/**
 * Shared across Root/Signal/Compute/Effect. Queues onto DISPOSES, and
 * when idle runs the drain for it at once: writes and disposes made by
 * cleanups join the same transaction and flush once the whole subtree is
 * disposed, so nothing being torn down re-runs. An effect's live owner
 * then drops it from `_owned`. A cleanup that throws is reported once the
 * disposal has finished, as an error of its node. A locked node waits for
 * the shields under it (D10); `force` ends them and disposes it now, also
 * after a plain dispose() it is waiting on.
 * @this {Disposer}
 * @param {boolean=} force
 * @returns {void}
 */
function dispose(force) {
	if (force === true && this._flag & FLAG_LOCKED) {
		forceDispose(this);
	} else if (!(this._flag & FLAG_DISPOSED)) {
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
	if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
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
 * Shared set implementation for Signal and Cell. When IDLE,
 * resolves updater functions, writes the value, notifies and
 * flushes. When not IDLE, schedules for drain. Updater functions
 * are resolved at drain time by assign() to see the latest value.
 *
 * An immediate write supersedes the writes posted before it: their
 * queue entries are cancelled once the updater has returned and the
 * value is compared, so a throwing updater or equality function
 * leaves them in place. Inside a batch or a flush, set() queues
 * behind them instead, and the last write wins.
 *
 * A resource writes through CellProto.set instead.
 * @template T
 * @this {Sender<T>}
 * @param {T | (function(T): T)} value
 * @returns {boolean}
 */
function set(value) {
	if (IDLE) {
		/** @type {T} */
		let _value;
		let write = true;
		if (typeof value === "function") {
			_value = value(this._value);
			/** Mutable updater returning void — keep current value, still notify. */
			if (_value === undefined && this._flag & FLAG_MUTABLE) {
				write = false;
			}
		} else {
			_value = value;
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
			flush();
			return true;
		}
		return false;
	}
	if (
		typeof value === "function" ||
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
 * Plain write to a resource, immediate or drained. Every plain write
 * supersedes the activation in flight, even one that is no longer
 * loading, such as a generator past its first yield: the new token
 * discards whatever the activation produces later. A write that ends
 * a load or an error is a change by itself, whatever the value, so the
 * waiters resume and the equality function never sees the Defect.
 * When IDLE, it cancels the writes posted before it, as set() does;
 * in the drain it runs in queue order. The caller flushes. An updater
 * only comes from a contextual write, since r.set(fn) is async.
 * @template T
 * @param {AsyncSender<T>} node
 * @param {T | (function(T): T)} value
 * @returns {boolean} whether subscribers were notified
 */
function writeResource(node, value) {
	if (typeof value === "function") {
		value = value(node._value);
		/** Mutable updater returning void — keep current value, still notify. */
		if (value === undefined && node._flag & FLAG_MUTABLE) {
			value = node._value;
		}
	}
	let flag = node._flag;
	/** Compared first, so a throwing equality function cancels no posts. */
	let changed =
		flag & (FLAG_MUTABLE | FLAG_LOADING | FLAG_ERROR) ||
		(node._equal !== null
			? !node._equal(node._value, value)
			: node._value !== value);
	if (IDLE && flag & FLAG_SCHEDULED) {
		supersede(node);
	}
	node._time++;
	if (changed) {
		node._flag &= ~(FLAG_LOADING | FLAG_ERROR);
		node._value = value;
		if (node._flag & FLAG_WAITER) {
			settleNotify(node, false);
		} else {
			notify(node, FLAG_STALE);
		}
	}
	return !!changed;
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
		if (node._flag & FLAG_CALLBACK) {
			node._flag &= ~FLAG_CALLBACK;
			unhold(node);
		}
		node._error(err);
		return;
	}
	if (node._flag & FLAG_SUSPEND) {
		/** Callback suspend path — settlement handled by the callback.
		 *  What it delivered during asyncFn settles now. A plain write
		 *  made during asyncFn superseded the activation. */
		if (node._flag & FLAG_CALLBACK) {
			node._flag &= ~FLAG_CALLBACK;
			let i = HELD_COUNT > 0 ? findHeld(node) : -1;
			let fn;
			let held;
			if (i >= 0) {
				fn = HELD[i + 1];
				held = HELD[i + 2];
				dropHeld(i);
			}
			if (node._time === time) {
				node._flag |= FLAG_LOADING;
				if (i >= 0) {
					if (fn === null) {
						node._error(held);
					} else {
						node._settle(held);
					}
				}
			}
		}
		return;
	}
	if (startAsync(node, result, time)) {
		return;
	}
	if (
		result !== undefined &&
		(node._flag & FLAG_MUTABLE ||
			(node._equal !== null
				? !node._equal(node._value, result)
				: node._value !== result))
	) {
		/** A sync result settles at once, if it changed. */
		node._settle(result);
	} else if (flag & FLAG_LOADING) {
		node._settle(node._value);
	}
}

/**
 * Batch-drain handler for signals, and for the optimistic value of a
 * resource's async write. Resolves updater functions against the
 * current value at drain time, compares, and only writes + notifies
 * if the value actually changed.
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
	/** An errored resource (asyncAssign) counts as changed, so the
	 *  equality function never sees the Defect. */
	if (
		node._flag & (FLAG_MUTABLE | FLAG_ERROR) ||
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
 * Drain handler for a weak compute that lost its last reader in a
 * transaction (see ComputeProto._drop): runs its cleanups, unless it was
 * read again in the meantime, which ran them already. A throw is the
 * weak compute's error, not its reader's: the flush rethrows it once it
 * has drained.
 * @param {Compute} node
 * @returns {void}
 */
function releaseWeak(node) {
	if (
		node._flag & FLAG_STALE &&
		node._cleanup !== null &&
		node._sub1 === null &&
		(node._subs === null || node._subs.length === 0)
	) {
		try {
			clearCleanup(node);
		} catch (error) {
			throw defect(error);
		}
	}
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
 * Enqueues a deferred update to run during the next drain cycle. The
 * drain calls `fn(node, payload, time)`, so each kind of write brings
 * its own handler instead of branching in the drain loop.
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
 * The common reuse case (stamp === STAMP - 1) is handled inline in val().
 *
 * @this {Receiver}
 * @param {Sender} sender
 * @param {number} stamp - sender's previous _stamp before tagging
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
	 * Read on disposal to find the owner to compact. An owned compute
	 * keeps no reference back to its owner.
	 */
	ComputeProto._owner = null;

	/**
	 * Never called on a signal: every call site tests a flag a signal
	 * never has. They stay because removing them measurably slows the
	 * compute-heavy benchmarks (Kairo diamond and triangle, about 10%).
	 */
	SignalProto._drop =
		SignalProto._refresh =
		SignalProto._update = NOOP;

	/**
	 * Compute._drop: releases cached value and marks STALE. Called
	 * from clearReceiver when FLAG_WEAK is set and no subscribers
	 * remain. The value is released to undefined, so the next run gets
	 * undefined as prev: the seed applies to the first run only.
	 * Loading nodes keep their value — active channel
	 * waiters re-subscribe on settle.
	 * The drop comes from inside a reader's dep reconciliation
	 * (patchDeps, clearDeps), where no user code may run. In a
	 * transaction, the cleanups are queued, and run once it is done.
	 * @this {Compute}
	 */
	ComputeProto._drop = function () {
		if (this._flag & FLAG_LOADING) {
			return;
		}
		this._flag |= FLAG_STALE;
		this._value = undefined;
		if (this._cleanup !== null) {
			if (IDLE) {
				clearCleanup(this);
			} else {
				schedule(this, null, releaseWeak);
			}
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

	// Disposer#dispose — shared by the owned node types. Signals and
	// resources are not owned, and are never disposed.
	RootProto.dispose =
		ComputeProto.dispose =
		EffectProto.dispose =
		dispose;

	// Receiver#_read — internal dep tracking, called from val() when listening
	ComputeProto._read = EffectProto._read = _read;

	ComputeProto._readAsync = EffectProto._readAsync = _readAsync;

	/**
	 * Whether the node has any of the bits in `flag` set: a creation option
	 * (STABLE, EAGER, WEAK, DEFER, SETUP) or a state (DISPOSED, LOADING,
	 * ERROR). Any other bit reads as unset.
	 * @this {Disposer}
	 * @param {number} flag
	 * @returns {boolean}
	 */
	function is(flag) {
		return (this._flag & flag & PUBLIC) !== 0;
	}

	SignalProto.is = RootProto.is = ComputeProto.is = EffectProto.is = is;

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
		this._flag =
			(this._flag & ~(FLAG_EQUAL | FLAG_NOTEQUAL)) |
			(eq === false ? FLAG_NOTEQUAL : FLAG_EQUAL);
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

	ComputeProto.equal = equal;

	/**
	 * Signals an expected error from a compute. Returns a REFUSE Defect
	 * for the fn to return, and flags the node, so that _update stores
	 * it as the compute's error without hitting the catch path. A task
	 * is flagged FLAG_REFUSE instead, which becomes FLAG_ERROR when the
	 * activation settles: until then the task still holds its previous
	 * value.
	 * @template T
	 * @this {Compute<T>}
	 * @param {T} val
	 * @returns {{ error: *, type: number }}
	 */
	ComputeProto.refuse = function (val) {
		this._flag |= this._flag & FLAG_ASYNC ? FLAG_REFUSE : FLAG_ERROR;
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

	/** @this {Owner} */
	RootProto.pause = EffectProto.pause = function () {
		pauseNode(this);
	};

	/**
	 * Resumes a paused owner. One that missed a change while paused is
	 * queued, and its re-run rebuilds its owned subtree. Otherwise its
	 * paused child effects are resumed in turn.
	 * @param {Owner} node
	 */
	function resumeNode(node) {
		let flag = node._flag;
		node._flag = flag & ~FLAG_PAUSED;
		if (flag & (FLAG_STALE | FLAG_PENDING)) {
			if (flag & FLAG_STALE || needsUpdate(/** @type {Effect} */(node), TIME)) {
				/** @type {Effect} */(node)._receive();
				return;
			}
			node._flag &= ~(FLAG_STALE | FLAG_PENDING);
		}
		let owned = node._owned;
		if (owned !== null) {
			let count = owned.length;
			for (let i = 0; i < count; i++) {
				let child = owned[i];
				if (
					(child._flag & (FLAG_OWNER | FLAG_PAUSED | FLAG_DISPOSED)) ===
					(FLAG_OWNER | FLAG_PAUSED)
				) {
					resumeNode(/** @type {Owner} */(child));
				}
			}
		}
	}

	/**
	 * Resumes a paused effect or root. At idle, the resume runs in a
	 * transaction: checking whether an effect missed a change pulls its
	 * computes, and a fn must never run while idle.
	 * @this {Owner}
	 */
	RootProto.resume = EffectProto.resume = function () {
		/** A subtree waiting to be disposed stays frozen (D10). */
		if (!(this._flag & FLAG_PAUSED) || (HOLDS.size > 0 && isFrozen(this))) {
			return;
		}
		if (IDLE) {
			IDLE = false;
			try {
				FENCE = SEED;
				resumeNode(this);
				flush();
			} finally {
				IDLE = true;
			}
		} else {
			resumeNode(this);
		}
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
	 *
	 * With onResolve, a task or an array of tasks is waited on through
	 * callbacks instead (see suspendTo).
	 * @template T
	 * @this {AsyncReceiver}
	 * @param {IThenable<T> | AsyncSender<T> | Array<AsyncSender> | (function(Function, Function))} promiseOrTask
	 * @param {function(*): *=} onResolve
	 * @param {function(*): *=} onReject
	 * @returns {T | Array<T> | Promise<T | Array<T>> | void}
	 */
	function suspend(promiseOrTask, onResolve, onReject) {
		if (onResolve !== undefined) {
			suspendTo(this, promiseOrTask, onResolve, onReject === undefined ? null : onReject);
			return;
		}
		/** Branch: setup function → callback constructor path.
		 *  Sets FLAG_SUSPEND so _update knows the node is waiting
		 *  for a callback-driven settlement, not a returned promise.
		 *  A resolve or reject from inside the setup fn is held until
		 *  the node's fn returns (callbackFlags). */
		if (typeof promiseOrTask === "function") {
			if (this._flag & FLAG_SUSPEND) {
				throw new Error(SUSPEND_TWICE);
			}
			this._flag |= callbackFlags(this);
			resolvePromise(this, promiseOrTask, this._time);
			return;
		}
		this._flag |= FLAG_SUSPEND;
		if (typeof promiseOrTask.then === "function") {
			/** Promise path — wrap with staleness guard. A thenable is
			 *  adopted first, since its then() need not return a promise.
			 *  Kept inline rather than shared with guardAwait: through the
			 *  shared function, suspend.test.js's "discarded promise does not
			 *  retain spawn after re-run" keeps the first promise alive in the
			 *  full dist run (collected in isolation, so most likely JSC's
			 *  conservative stack scanning, but unproven). */
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
	 * this node and the task (see send()). Returns a Promise
	 * that resolves when the task settles. At settle time, the task also
	 * subscribes the awaiter as a dep for future reactive updates.
	 * @template T
	 * @param {AsyncReceiver} node
	 * @param {AsyncSender<T>} taskNode
	 * @returns {T | Promise<T>}
	 */
	function _suspendTask(node, taskNode, resolve, reject) {
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
		 *  the old waiter is removed and this Promise never resolves.
		 *  With callbacks, they are the waiter, and no Promise is made.
		 *  A task that waits on this node would wait forever. */
		if (awaits(taskNode, node)) {
			throw new Error(CYCLE);
		}
		if (resolve !== undefined) {
			node._flag |= callbackFlags(node) | FLAG_RELAY;
			send(node, taskNode, resolve, reject);
			return REGRET;
		}
		return guardAwait(node, new Promise(function (resolve, reject) {
			send(node, taskNode, resolve, reject);
		}));
	}

	/**
	 * Guards the Promise a task await returns, as suspend() guards a
	 * promise. A waiter that is disposed or re-run is not resolved, but a
	 * node can be disposed or re-run after it was resolved and before the
	 * await resumes, one microtask later. The guard runs at that point,
	 * and resolves to REGRET instead, so the await never resumes.
	 * @template T
	 * @param {AsyncReceiver} node
	 * @param {Promise<T>} promise
	 * @returns {Promise<T>}
	 */
	function guardAwait(node, promise) {
		let time = node._time;
		return promise.then(
			/** @param {T} val */
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

	/**
	 * Awaits an array of task nodes using a single-cursor walk.
	 * Allocates exactly ONE Promise. The walk is callback-driven
	 * via the global `_stepArray` helper: settled tasks are collected
	 * synchronously; when a loading task is hit, send() binds a
	 * callback that re-enters `_stepArray` from the next index.
	 *
	 * FLAG_BLOCKED prevents settleNotify from subscribing the
	 * awaiter during the walk. After all slots are filled, or a
	 * member fails, we subscribe to every task in one pass and
	 * resolve or reject the Promise.
	 *
	 * With callbacks, they receive the snapshot and no Promise is made.
	 *
	 * @param {AsyncReceiver} node
	 * @param {Array<Compute>} tasks
	 * @param {function(Array): *=} resolve
	 * @param {(function(*): *)|null=} reject
	 * @returns {Array | Promise<Array>}
	 */
	function _suspendArray(node, tasks, resolve, reject) {
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
		if (resolve !== undefined) {
			node._flag |= callbackFlags(node) | FLAG_RELAY;
			_stepArray(node, tasks, results, resolve, reject);
			return REGRET;
		}

		/** At least one is loading — allocate one Promise.
		 *  _stepArray re-scans from scratch on each wake-up,
		 *  guaranteeing a consistent snapshot when it resolves. */
		return guardAwait(node, new Promise(function (resolve, reject) {
			_stepArray(node, tasks, results, resolve, reject);
		}));
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
				if (awaits(task, node)) {
					error = new Error(CYCLE);
					failed = true;
				} else {
					blocked = i;
				}
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
				deliver(node, reject, error, true);
			} else {
				deliver(node, resolve, results, false);
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

	/**
	 * c.suspend(task, onResolve, onReject) and the array form. Works like
	 * `.then(onResolve, onReject)` without the Promise:
	 *
	 * - Settled: the callback is held until the fn returns, and runs
	 *   then, before the run ends: the code after c.suspend() runs first,
	 *   as it does for a loading task. Its reads link like reads after an
	 *   await. A task settles with what it returns.
	 * - Loading: the callbacks are stored as the task's waiter, and the
	 *   node is loading until one runs. It runs synchronously when the
	 *   task settles, after the task's subscribers are marked stale, and
	 *   the node settles with what it returns (see relay). A task that
	 *   settles while the fn still runs is held like a settled one.
	 *
	 * An error with no onReject fails the node, as a throwing await
	 * would. A re-run or dispose before the task settles drops the
	 * waiter, so a stale callback never runs.
	 * @param {AsyncReceiver} node
	 * @param {AsyncSender | Array<AsyncSender>} input
	 * @param {function(*): *} onResolve
	 * @param {(function(*): *) | null} onReject
	 * @returns {void}
	 */
	function suspendTo(node, input, onResolve, onReject) {
		/** After an await, or after another callback suspend in this run
		 *  (FLAG_CALLBACK, which a promise suspend does not set). */
		let flag = node._flag;
		if (flag & FLAG_SUSPEND && flag & (FLAG_LOADING | FLAG_CALLBACK)) {
			throw new Error(SUSPEND_TWICE);
		}
		let value;
		let failed = false;
		try {
			value = Array.isArray(input)
				? _suspendArray(node, input, onResolve, onReject)
				: _suspendTask(node, /** @type {AsyncSender} */(input), onResolve, onReject);
		} catch (err) {
			if (onReject === null) {
				throw err;
			}
			value = defect(err);
			failed = true;
		}
		if (value === REGRET) {
			return;
		}
		/** Settled: the callback still waits for the fn to return, as it
		 *  would for a loading task, so the code after c.suspend() runs
		 *  first either way. */
		if (!(node._flag & FLAG_LOADING)) {
			node._flag |= FLAG_SUSPEND | FLAG_CALLBACK;
			hold(node, failed ? onReject : onResolve, value);
			return;
		}
		/** In a continuation the run is over, so the callback runs now,
		 *  and a task settles with its result. */
		let result = failed ? onReject(value) : onResolve(value);
		if (node._flag & FLAG_ASYNC && node instanceof Compute) {
			node._settle(result);
		}
	}

	ComputeProto.suspend = EffectProto.suspend = suspend;

	/**
	 * Shields the current activation: it runs to completion (D10). Its
	 * re-run or disposal, and those of every owner above it, wait until
	 * it ends; only dispose(true) ends it early. Each owner on the path
	 * is locked and counted in HOLDS. The walk stops at a root, which
	 * has no owner, or at the global `c`, which has no FLAG_OWNER.
	 * @this {Effect}
	 */
	EffectProto.shield = function () {
		let flag = this._flag;
		if ((flag & (FLAG_DISPOSED | FLAG_LOCKED)) === FLAG_DISPOSED) {
			return;
		}
		let count = HOLDS.get(this);
		if (count === undefined) {
			count = 0;
		} else if (count & HELD_SELF) {
			return;
		}
		HOLDS.set(this, count + HELD_SELF);
		this._flag = flag | FLAG_LOCKED;
		let owner = this._owner;
		while (owner !== null && owner._flag & FLAG_OWNER) {
			count = HOLDS.get(owner);
			HOLDS.set(owner, count === undefined ? HELD_BELOW : count + HELD_BELOW);
			owner._flag |= FLAG_LOCKED;
			owner = owner._owner;
		}
	};

	/**
	 * Returns this node's Channel, allocating it into _chan and setting
	 * FLAG_CHANNEL on first use. Nodes that never use an async utility
	 * keep _chan null.
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

	/** A cell only uses the channel's _waiters: it is awaited, and never awaits. */
	CellProto._channel = ComputeProto._channel = EffectProto._channel = _channel;

	/**
	 * Returns the AbortController of this async activation, which is
	 * aborted on re-run or dispose. Every call in one activation gets
	 * the same controller, since they would all be aborted together.
	 * A controller the user aborted is replaced with a fresh one.
	 * @this {AsyncReceiver}
	 * @returns {AbortController}
	 */
	function controller() {
		let channel = this._channel();
		let ctrl = channel._controller;
		if (ctrl === null || ctrl.signal.aborted) {
			ctrl = channel._controller = new AbortController();
		}
		return ctrl;
	}

	ComputeProto.controller = EffectProto.controller = controller;

	/**
	 * Reads a sender's current value without subscribing immediately.
	 * The subscription is deferred until settle time. For sync nodes
	 * (FLAG_ASYNC not set), falls back to val(), as it does for the reads
	 * val() rejects.
	 * @template T
	 * @this {AsyncReceiver}
	 * @param {Sender<T>} sender
	 * @returns {T}
	 */
	function defer(sender) {
		if (
			!(this._flag & FLAG_ASYNC) ||
			sender._flag & FLAG_DISPOSED ||
			sender === /** @type {Sender} */(this)
		) {
			return this.val(sender);
		}
		if (sender._flag & (FLAG_STALE | FLAG_PENDING)) {
			sender._refresh();
		}
		let value = sender._value;
		let channel = this._channel();
		if (channel._defers === null) {
			channel._defers = [sender, value];
		} else {
			channel._defers.push(sender, value);
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
			if ((flag & (FLAG_STABLE | FLAG_SETUP)) !== FLAG_STABLE) {
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
	 * Returns the current activation's sequence number. It grows with
	 * each re-run (it is the time of the flush that started the run), or
	 * with each write to a resource. Useful for attaching to requests for
	 * server-side ordering, or for manual staleness detection across
	 * async boundaries.
	 * @this {Receiver | Cell}
	 * @returns {number}
	 */
	CellProto.version = ComputeProto.version = EffectProto.version = function () {
		return this._time;
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
				throw new Error(SUSPEND_TWICE);
			}
			this._flag |= callbackFlags(this);
			resolvePromise(this, promiseOrFn, this._time);
			return;
		}
		/** Promise path — wrap with staleness guard, inline as in
		 *  suspend(). A thenable is adopted first, since its then() need
		 *  not return a promise. */
		let node = this;
		let time = this._time;
		return Promise.resolve(promiseOrFn).then(
			function (val) {
				return node._time === time ? val : REGRET;
			},
			function (error) {
				if (node._time === time) {
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
		if (isHolding(this)) {
			hold(this, undefined, value);
			return;
		}
		this._flag &= ~FLAG_LOADING;
		this._value = value;

		if (this._flag & FLAG_WAITER) {
			/** Notifies every subscriber that is not a resolved waiter. */
			settleNotify(this, false);
		} else {
			notify(this, FLAG_STALE);
		}
		flush();
	};

	/**
	 * Settles an async resource or compute with an error. Wraps as FATAL
	 * unless anod created it, sets FLAG_ERROR, and delegates to _settle.
	 * @this {Cell | Compute}
	 * @param {*} err
	 */
	CellProto._error = ComputeProto._error = function (err) {
		if (isHolding(this)) {
			hold(this, null, err);
			return;
		}
		this._flag |= FLAG_ERROR;
		this._settle(defect(err));
	};

	/**
	 * @this {Root}
	 * @returns {void}
	 */
	RootProto._dispose = function () {
		if (this._flag & FLAG_LOCKED) {
			deferDispose(this);
			return;
		}
		this._flag = FLAG_DISPOSED;
		/** Children first, then cleanups (D2). */
		try {
			if (this._owned !== null) {
				clearOwned(this);
			}
		} finally {
			try {
				if (this._cleanup !== null) {
					clearCleanup(this);
				}
			} finally {
				this._owned = this._recover = null;
			}
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
	 * @returns {boolean}
	 */
	function post(value) {
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
		if (!POSTING) {
			POSTING = true;
			queueMicrotask(microflush);
		}
		return true;
	}

	SignalProto.post = post;

	/**
	 * set for Cell. A signal with an equality function writes like any
	 * signal. A resource also takes the async forms: r.set(fn) runs fn
	 * as (c, current) with no value of its own, and r.set(value, fn)
	 * writes value optimistically, then runs fn with the resource as
	 * context and the optimistic value as prev, before the flush. A
	 * plain write goes through writeResource(), which supersedes the
	 * activation in flight, so it is queued even when unchanged.
	 * @template T
	 * @this {Cell<T>}
	 * @param {T | (function(T): T)} value
	 * @param {(function(AsyncSender<T>, T): (T | Promise<T>))=} asyncFn
	 * @returns {boolean}
	 */
	CellProto.set = function (value, asyncFn) {
		if (!(this._flag & FLAG_ASYNC)) {
			return set.call(this, value);
		}
		if (asyncFn === undefined) {
			if (typeof value === "function") {
				if (IDLE) {
					if (this._flag & FLAG_SCHEDULED) {
						supersede(this);
					}
					_runAsync(this, value, this._value);
				} else {
					schedule(this, value, asyncRun);
				}
				return true;
			}
			if (IDLE) {
				if (writeResource(this, value)) {
					flush();
					return true;
				}
				return false;
			}
			schedule(this, value, writeResource);
			return true;
		}
		if (IDLE) {
			let _value = value;
			if (typeof value === "function") {
				_value = value(this._value);
				/** Mutable updater returning void — keep current value, still notify. */
				if (_value === undefined && this._flag & FLAG_MUTABLE) {
					_value = this._value;
				}
			}
			/** The equality function never sees an error's Defect. */
			let changed =
				this._flag & (FLAG_MUTABLE | FLAG_ERROR) ||
				(this._equal !== null
					? !this._equal(this._value, _value)
					: this._value !== _value);
			if (this._flag & FLAG_SCHEDULED) {
				supersede(this);
			}
			if (changed) {
				this._value = _value;
				notify(this, FLAG_STALE);
			}
			/** Starts the activation before flushing, so that subscribers
			 *  see the optimistic value as loading. */
			_runAsync(this, asyncFn, _value);
			if (changed) {
				flush();
			}
		} else {
			schedule(this, { _value: value, _fn: asyncFn }, asyncAssign);
		}
		return true;
	};

	/**
	 * post for Cell. A resource takes the same forms as CellProto.set,
	 * and a plain write is queued even when unchanged, since it
	 * supersedes the activation in flight.
	 * @template T
	 * @this {Cell<T>}
	 * @param {T | (function(T): T)} value
	 * @param {(function(AsyncSender<T>, T): (T | Promise<T>))=} asyncFn
	 * @returns {boolean}
	 */
	CellProto.post = function (value, asyncFn) {
		if (!(this._flag & FLAG_ASYNC)) {
			return post.call(this, value);
		}
		if (asyncFn !== undefined) {
			schedule(this, { _value: value, _fn: asyncFn }, asyncAssign);
		} else {
			schedule(this, value, typeof value === "function" ? asyncRun : writeResource);
		}
		if (!POSTING) {
			POSTING = true;
			queueMicrotask(microflush);
		}
		return true;
	};

	/**
	 * Pulls and returns the compute's current value. Triggers lazy
	 * re-evaluation if stale or pending. A disposed compute has no value,
	 * so reading it throws ILLEGAL_READ, as c.val() does.
	 * @template T
	 * @this {Compute<T>}
	 * @returns {T}
	 */
	ComputeProto.get = function () {
		let flag = this._flag;
		if (flag & (FLAG_STALE | FLAG_PENDING | FLAG_DISPOSED)) {
			if (flag & FLAG_DISPOSED) {
				throw new Error(ILLEGAL_READ);
			}
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
	 * unguard() for an immediate contextual write. unguard() can pull
	 * computes, and a fn must never run while idle.
	 * @param {Receiver} receiver
	 * @param {number} flag - the receiver's flags before the write
	 * @returns {void}
	 */
	function release(receiver, flag) {
		IDLE = false;
		try {
			unguard(receiver, flag);
		} finally {
			IDLE = true;
		}
	}

	/**
	 * Drain handler for contextual set and post. Wraps assign() (for a
	 * resource, asyncAssign() or writeResource()) with FLAG_PAUSED on the
	 * receiver so that notifications propagating from this write are
	 * ignored by the receiver that initiated the write. The write skips
	 * the receiver, so FLAG_SCHEDULED stays armed for the sender: a later
	 * write to it in the same drain still notifies the receiver.
	 * @template T
	 * @param {Sender<T>} node
	 * @param {{ _value: T, _fn: (function(AsyncSender<T>, T): (T | Promise<T>)) | undefined, _recv: Receiver }} payload
	 * @param {number} time
	 */
	function guardedAssign(node, payload, time) {
		let receiver = payload._recv;
		let flag = receiver._flag;
		let scheduled = node._flag & FLAG_SCHEDULED;
		receiver._flag = flag | FLAG_PAUSED;
		try {
			if (payload._fn !== undefined) {
				asyncAssign(/** @type {AsyncSender<T>} */(node), payload, time);
			} else if (node._flag & FLAG_ASYNC) {
				writeResource(/** @type {AsyncSender<T>} */(node), payload._value);
			} else {
				assign(node, payload._value, time);
			}
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
		if (IDLE) {
			if (asyncFn === undefined && sender._flag & FLAG_ASYNC) {
				let flag = this._flag;
				let changed = false;
				this._flag = flag | FLAG_PAUSED;
				try {
					changed = writeResource(/** @type {AsyncSender<T>} */(sender), value);
				} finally {
					release(this, flag);
				}
				if (changed) {
					flush();
				}
				return;
			}
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
				release(this, flag);
				flush();
			}
			if (asyncFn !== undefined && sender._flag & FLAG_ASYNC) {
				_runAsync(/** @type {AsyncSender} */(sender), asyncFn, _value);
			}
		} else {
			schedule(
				sender,
				{ _recv: this, _value: value, _fn: sender._flag & FLAG_ASYNC ? asyncFn : undefined },
				guardedAssign
			);
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
		schedule(
			sender,
			{ _recv: this, _value: value, _fn: sender._flag & FLAG_ASYNC ? asyncFn : undefined },
			guardedAssign
		);
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
	 * Settles an async compute. Clears loading/init, settles deferred
	 * deps, resolves waiters, notifies subscribers, and re-runs if a
	 * deferred dep changed. Settling always
	 * completes the activation; only the subscriber notification depends on
	 * the value having changed, which c.equal() decides as in the sync
	 * tail of _update. Handles both value and error: when FLAG_ERROR is
	 * set before calling, or the activation called c.refuse(), the value
	 * is treated as an error.
	 * @template T
	 * @this {Compute}
	 * @param {T} value
	 */
	ComputeProto._settle = function (value) {
		if (isHolding(this)) {
			hold(this, undefined, value);
			return;
		}
		let flag = this._flag;
		if (flag & FLAG_REFUSE) {
			flag = (flag | FLAG_ERROR) & ~FLAG_REFUSE;
		}
		this._flag = flag & ~(FLAG_LOADING | FLAG_INIT);

		/** A disposed task never settles. */
		if (flag & FLAG_DISPOSED) {
			return;
		}

		/** A new value is stored even when c.equal(true) says it is no
		 *  change, as in the sync tail. */
		let changed =
			flag & (FLAG_INIT | FLAG_ERROR)
				? true
				: value !== this._value
					? !(flag & FLAG_EQUAL)
					: !!(flag & FLAG_NOTEQUAL);
		this._value = value;

		/** Called by _update with what the callback delivered while the
		 *  fn ran (FLAG_CALLBACK without FLAG_SUSPEND). Only write the
		 *  value, as part of that run (its _time); _update finishes the
		 *  settle. */
		if (flag & FLAG_CALLBACK) {
			if (changed) {
				this._ctime = this._time;
			}
			return;
		}
		if (changed) {
			this._ctime = TIME + 1;
		}

		let stale = false;
		if (this._flag & FLAG_ASYNC) {
			let hasDefers =
				this._flag & FLAG_CHANNEL &&
				this._chan._defers !== null;
			if (this._deps !== null || hasDefers) {
				stale = settleDeps(this);
			}
		}

		if (this._flag & FLAG_WAITER) {
			settleNotify(this, !changed);
		} else if (changed) {
			notify(this, FLAG_STALE);
		}
		if (changed) {
			flush();
		}

		/** A changed deferred dep re-runs the node. It is queued and
		 *  flushed, as a fn must never run while idle. */
		if (stale) {
			this._flag |= FLAG_STALE;
			COMPUTES[COMPUTE_COUNT++] = this;
			flush();
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

	/** @this {Compute} */
	ComputeProto._dispose = function () {
		let flag = this._flag;
		this._flag = FLAG_DISPOSED;
		clearSubs(this);
		clearDeps(this);
		if (flag & FLAG_CHANNEL) {
			let chan = this._chan;
			if (chan._controller !== null) {
				chan._controller.abort();
			}
			/** Reject any nodes awaiting this task. */
			if (chan._waiters !== null) {
				rejectWaiters(this, chan, new Defect(new Error("Awaited task was disposed"), PANIC));
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
				FLAG_REFUSE
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
				this._value = defect(error);
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
					if (dep._flag & (FLAG_ERROR | FLAG_DISPOSED)) {
						value = boundError(dep);
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
				if (this._flag & FLAG_CALLBACK) {
					unhold(this);
				}
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
					if (dep._flag & (FLAG_ERROR | FLAG_DISPOSED)) {
						value = boundError(dep);
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
				if (this._flag & FLAG_CALLBACK) {
					unhold(this);
				}
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

		this._flag &= ~(FLAG_STALE | FLAG_PENDING | FLAG_SETUP);
		flag = this._flag;

		/** Async, a callback suspend made in the fn, or disposed by it.
		 *  The masks fold to one constant, so a sync compute pays no more
		 *  than before. */
		if (flag & (FLAG_ASYNC | FLAG_CALLBACK | FLAG_DISPOSED)) {
			if (flag & FLAG_DISPOSED) {
				if (flag & FLAG_CALLBACK) {
					unhold(this);
				}
				return;
			}
			if (flag & FLAG_CALLBACK) {
				let i = HELD_COUNT > 0 ? findHeld(this) : -1;
				/** Nothing delivered yet: loading from here on. Like the
				 *  promise path, FLAG_INIT is kept for _settle, so the first
				 *  settle notifies even if it resolves to the seed. */
				if (i < 0) {
					this._flag = (flag | FLAG_LOADING) & ~FLAG_CALLBACK;
					return;
				}
				/** Delivered while the fn ran: the run ends with it, and the
				 *  fn's return value is ignored, as on any callback suspend.
				 *  A task callback runs now, loading, so that its reads link
				 *  like reads after an await. FLAG_CALLBACK stays set while
				 *  it settles, so _settle writes as part of this run. */
				let fn = HELD[i + 1];
				let held = HELD[i + 2];
				dropHeld(i);
				this._flag &= ~(FLAG_SUSPEND | FLAG_RELAY);
				if (fn !== undefined && fn !== null) {
					this._flag |= FLAG_LOADING;
					try {
						held = fn(held);
						fn = undefined;
					} catch (err) {
						held = err;
						fn = null;
					}
				}
				if (fn === null) {
					this._error(held);
				} else {
					this._settle(held);
				}
				this._flag &= ~FLAG_CALLBACK;
				if (this._flag & FLAG_CHANNEL) {
					if (this._chan._defers !== null) {
						settleDefers(this);
					}
					if (this._flag & FLAG_WAITER) {
						settleNotify(this, true);
					}
				}
				return;
			}
			if (startAsync(this, value, time)) {
				return;
			}
			if (this._flag & FLAG_REFUSE) {
				this._flag = (this._flag | FLAG_ERROR) & ~FLAG_REFUSE;
			}
			/** Sync result: the activation settles here, deferred deps too. */
			if (
				this._flag & FLAG_CHANNEL &&
				this._chan._defers !== null
			) {
				settleDefers(this);
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
					FLAG_PAUSED |
					FLAG_DISPOSED)
			)
		) {
			notify(this, FLAG_PENDING);
		} else if (flag & (FLAG_PAUSED | FLAG_DISPOSED)) {
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
		/** Tear down the previous activation's channel: its controller is
		 *  aborted whether the activation is in flight or has completed,
		 *  as a compute's is. Done here rather than in _receive, so a
		 *  pending notice that resolves to no change leaves its waiters
		 *  and controller alone. */
		if (flag & (FLAG_LOCKED | FLAG_CHANNEL)) {
			if (flag & FLAG_LOCKED) {
				return;
			}
			resetChannel(this);
		}

		this._time = time;
		if (flag & FLAG_LOADING) {
			this._flag &= ~(FLAG_LOADING | FLAG_SUSPEND);
		}
		if (!(flag & FLAG_INIT)) {
			if (this._owned !== null) {
				if (this._cleanup !== null) {
					clearRun(this);
				} else {
					clearOwned(this);
				}
			} else if (this._cleanup !== null) {
				clearCleanup(this);
			}
			this._recover = null;
			if (this._finalize !== null) {
				clearFinalize(this);
			}
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
					if (dep._flag & (FLAG_ERROR | FLAG_DISPOSED)) {
						throw boundError(dep);
					}
					value = this._fn(dep._value, this, args);
				} else {
					value = this._fn(this, args);
				}
			} finally {
				/** Kept in flag for the tail, which needs the bits the fn set. */
				flag = this._flag &= ~(FLAG_STALE | FLAG_PENDING);
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
					/** Stamped, as in ComputeProto._update, so that a
					 *  c.val() of the bound dep in the fn finds it read. */
					let dep = this._dep1;
					if (dep._flag & (FLAG_STALE | FLAG_PENDING)) {
						dep._refresh();
					}
					if (dep._flag & (FLAG_ERROR | FLAG_DISPOSED)) {
						throw boundError(dep);
					}
					dep._stamp = version;
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
				flag = this._flag &= ~(FLAG_SETUP | FLAG_STALE | FLAG_PENDING);
			}
		}

		/** Async, a callback suspend made in the fn, disposed by it, or
		 *  shielded. The masks fold to one constant, so a sync effect pays
		 *  no more than before. */
		if (flag & (FLAG_ASYNC | FLAG_CALLBACK | FLAG_DISPOSED | FLAG_LOCKED)) {
			if ((flag & (FLAG_DISPOSED | FLAG_LOCKED)) === FLAG_DISPOSED) {
				if (flag & FLAG_CALLBACK) {
					unhold(this);
				}
				return;
			}
			if (flag & FLAG_CALLBACK) {
				/** Loading from here on, until the callback delivers. */
				this._flag = (flag | FLAG_LOADING) & ~(FLAG_INIT | FLAG_CALLBACK);
				let i = HELD_COUNT > 0 ? findHeld(this) : -1;
				if (i < 0) {
					return;
				}
				/** Delivered while the fn ran: the activation settles now,
				 *  and the fn's return value is ignored, as on any callback
				 *  suspend. A task callback runs first, loading, so that its
				 *  reads link like reads after an await. A rejection, or a
				 *  throw from the callback, fails the run as a throw in the
				 *  body does: the creator or c.recover() gets it. */
				let fn = HELD[i + 1];
				let held = HELD[i + 2];
				dropHeld(i);
				this._flag &= ~FLAG_RELAY;
				if (fn !== undefined && fn !== null) {
					try {
						fn(held);
						fn = undefined;
					} catch (err) {
						held = err;
						fn = null;
					}
				}
				if (fn === null) {
					this._flag &= ~(FLAG_LOADING | FLAG_SUSPEND);
					throw held;
				}
				this._settle();
				return;
			}
			if (flag & FLAG_ASYNC && startAsync(this, value, time)) {
				return;
			}
			/** Sync result: the activation settles here, deferred deps too. */
			if (
				this._flag & FLAG_CHANNEL &&
				this._chan._defers !== null
			) {
				settleDefers(this);
			}
			/** It ends here, and so does its shield. A node locked only
			 *  by a shield below it keeps the lock. */
			if (flag & FLAG_LOCKED) {
				this._flag &= ~FLAG_INIT;
				if (this._finalize !== null) {
					clearFinalize(this);
				}
				unshield(this);
				return;
			}
		}

		this._flag &= ~FLAG_INIT;
		if (this._finalize !== null) {
			clearFinalize(this);
		}
	};

	/**
	 * Settles an async effect. Clears loading, checks deferred deps,
	 * re-runs if stale, and ends the activation's shield, which replays
	 * what it deferred. When FLAG_ERROR is set before calling, treats
	 * the value as an error: attempts recovery, disposes if
	 * unrecoverable.
	 * @this {Effect}
	 * @param {*=} err
	 */
	EffectProto._settle = function (err) {
		/** Settled by its callback while the fn still runs: _update
		 *  finishes the activation once the fn has returned. */
		if (isHolding(this)) {
			hold(this, undefined, undefined);
			return;
		}
		let flag = this._flag;
		this._flag &= ~(FLAG_LOADING | FLAG_SUSPEND);

		/** A disposed node never settles. One whose disposal waits for
		 *  its shields is not marked yet, and settles as usual. */
		if (flag & FLAG_DISPOSED) {
			return;
		}

		if (flag & FLAG_ERROR) {
			this._flag &= ~FLAG_ERROR;
			if (this._finalize !== null) {
				clearFinalize(this);
			}
			let result = tryRecover(this, err);
			if (result !== RECOVER_SELF) {
				teardown(this);
			}
			if (flag & FLAG_LOCKED) {
				unshield(this);
			}
			return;
		}

		if (this._finalize !== null) {
			clearFinalize(this);
		}

		let stale = false;
		if (
			this._flag & FLAG_CHANNEL &&
			this._chan._defers !== null
		) {
			stale = settleDeps(this);
		}
		if (stale) {
			this._flag |= FLAG_STALE;
		}
		/** A change that arrived while shielded is replayed when the
		 *  shield releases. */
		if (flag & FLAG_LOCKED) {
			unshield(this);
		} else if (stale) {
			this._receive();
			flush();
		}
	};

	/**
	 * Settles an async effect with an error. Wraps as FATAL unless
	 * anod created it, sets FLAG_ERROR, and delegates to _settle. A
	 * callback that rejects while the fn still runs is held, and _update
	 * throws it once the fn has returned, as a throw in the body would.
	 * @this {Effect}
	 * @param {*} err
	 */
	EffectProto._error = function (err) {
		if (isHolding(this)) {
			hold(this, null, err);
			return;
		}
		this._flag |= FLAG_ERROR;
		this._settle(defect(err));
	};

	/**
	 * @this {Effect}
	 * @returns {void}
	 */
	EffectProto._dispose = function () {
		if (this._flag & FLAG_LOCKED) {
			deferDispose(this);
			return;
		}
		let flag = this._flag;
		this._flag = FLAG_DISPOSED;
		if (this._finalize !== null) {
			clearFinalize(this);
		}
		clearDeps(this);
		/** Children first, then cleanups (D2). A throwing cleanup, here or
		 *  in a child, still finishes the disposal. */
		try {
			if (this._owned !== null) {
				clearOwned(this);
			}
		} finally {
			try {
				if (this._cleanup !== null) {
					clearCleanup(this);
				}
			} finally {
				if (flag & FLAG_CHANNEL) {
					let chan = this._chan;
					if (chan._controller !== null) {
						chan._controller.abort();
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
 * patchDeps on next re-run, and a disposed sender never notifies its
 * stable receivers again. clearReceiver skips disposed senders, so
 * their pairs need no unlinking.
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
 * Appends `child` to `owner._owned`, lazily allocating the array. The
 * factories call it before the node's first run, so a child that throws
 * on its first run is already owned.
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
 * The owner's recover handler is left to the caller, so that an error
 * in the teardown of a run reaches that run's handler.
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
		/** Positive only after a throw: the children still left to dispose. */
		if (count > 0) {
			clearOwned(owner);
		}
	}
}

/**
 * Tears down the previous run of an owner that has both children and
 * cleanups: the children first, then the cleanups (D2). A throw in one
 * still runs the other; if both throw, the cleanup's error wins, as
 * with nested `finally` blocks.
 * @param {Owner} owner
 * @returns {void}
 */
function clearRun(owner) {
	try {
		clearOwned(owner);
	} finally {
		clearCleanup(owner);
	}
}

/**
 * The error a bound node fails with, without calling its fn, when its
 * dep is errored or disposed. An errored dep passes its own Defect on.
 * A disposed dep fails it as c.val() of it would, so the fn never runs
 * with the dep's null. A disposed node's subscriber lists only hold
 * links made after its disposal, such as the bound factory's own, so
 * they are dropped. Kept out of _update, where it would only add bytecode.
 * @param {Sender} dep
 * @returns {Defect}
 */
function boundError(dep) {
	if (dep._flag & FLAG_DISPOSED) {
		clearSubs(dep);
		return defect(new Error(ILLEGAL_READ));
	}
	return dep._value;
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
 * A dep read in this run carries the run's stamp (`version`); one that
 * does not was dropped, and is unlinked. The first `depCount` deps are
 * the previous run's; the deps from `existingLen` to `newLen` were first
 * read in this run, and are connected as they move into the slots of
 * the dropped ones, so the kept deps are compacted in place.
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
		throw new Error(CYCLE);
	}
	/** A nested checkRun may already have raised it past this depth. */
	if (CTOP >= CMARK) {
		CMARK = CTOP << 1;
	}
	return CMARK;
}

/**
 * Starts settling `node` from what its fn returned, if that is async: a
 * thenable resolves as a promise, an async iterable is consumed value by
 * value. Returns false for any other value, which the caller settles
 * synchronously.
 * @template T
 * @param {AsyncDisposer<T>} node
 * @param {*} value
 * @param {number} time
 * @returns {boolean}
 */
function startAsync(node, value, time) {
	if (value !== null && typeof value === "object") {
		if (typeof value.then === "function") {
			node._flag |= FLAG_LOADING;
			resolvePromise(node, value, time);
			return true;
		}
		if (typeof value[Symbol.asyncIterator] === "function") {
			node._flag |= FLAG_LOADING;
			resolveIterator(node, value[Symbol.asyncIterator](), time);
			return true;
		}
	}
	return false;
}

/**
 * needsUpdate() for a check made outside any run: from a microtask, or
 * from an API call at idle. Pulling the deps can run compute fns, and a
 * fn must run inside a transaction, so at idle the check opens one, as
 * the idle get() does.
 * @param {Receiver} node
 * @returns {boolean}
 */
function checkStale(node) {
	if (!IDLE) {
		return needsUpdate(node, TIME);
	}
	IDLE = false;
	try {
		FENCE = SEED;
		let stale = needsUpdate(node, TIME);
		if (SENDER_COUNT > 0 || DISPOSER_COUNT > 0) {
			flush();
		}
		return stale;
	} finally {
		IDLE = true;
	}
}

/**
 * Whether the activation started at `time` may still settle `node`. A
 * locked node always may. A disposed or stale one may not, and neither
 * may one whose pending deps have changed: that one is marked stale, so
 * that its re-run takes over. A callback that settles while the fn
 * still runs settles the run in progress: an effect only clears the
 * flags that queued that run once its fn returns.
 * @param {AsyncDisposer} node
 * @param {number} time
 * @returns {boolean}
 */
function isCurrent(node, time) {
	if (node._time !== time) {
		return false;
	}
	let flag = node._flag;
	if (flag & FLAG_LOCKED) {
		return true;
	}
	if (flag & FLAG_DISPOSED) {
		return false;
	}
	if (flag & FLAG_CALLBACK) {
		return true;
	}
	if (flag & FLAG_STALE) {
		return false;
	}
	if (flag & FLAG_PENDING && checkStale(/** @type {Receiver} */(node))) {
		node._flag |= FLAG_STALE;
		return false;
	}
	return true;
}

/**
 * Settles `node` with the outcome of a promise, or of the callback form
 * `source(resolve, reject)`, if the activation started at `time` is still
 * current then. Like a promise, it settles once: after the first call,
 * later calls to resolve or reject are ignored.
 * @template T
 * @param {AsyncDisposer<T>} node
 * @param {IThenable<T> | function(function(T): void, function(*): void)} source
 * @param {number} time
 * @returns {void}
 */
function resolvePromise(node, source, time) {
	let done = false;
	/** @param {T} val */
	let resolve = function (val) {
		if (!done) {
			done = true;
			if (isCurrent(node, time)) {
				node._settle(val);
			}
		}
	};
	/** @param {*} err */
	let reject = function (err) {
		if (!done) {
			done = true;
			if (isCurrent(node, time)) {
				node._error(err);
			}
		}
	};
	if (typeof source === "function") {
		source(resolve, reject);
	} else {
		source.then(resolve, reject);
	}
}

/**
 * Settles `node` with each value of an async iterator, while the
 * activation started at `time` is current. Once it is not, the iterator
 * is closed.
 * @template T
 * @param {AsyncDisposer<T>} node
 * @param {AsyncIterator<T>} iterator
 * @param {number} time
 * @returns {void}
 */
function resolveIterator(node, iterator, time) {

	/** @param {IteratorResult<T>} result */
	let onNext = (result) => {
		if (!isCurrent(node, time)) {
			if (typeof iterator.return === "function") {
				iterator.return();
			}
			return;
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
		if (isCurrent(node, time)) {
			node._error(err);
		}
	};

	iterator.next().then(onNext, onError);
}

/**
 * Four-pass settle notification. Detaches the node's waiters and resolves
 * them with its value or error, without triggering redundant stale
 * notifications on nodes that appear in both the sync subscriber list and
 * the async waiter list.
 *
 * Pass 1: Stamp all sync subs with `version - 1` ("belongs to us").
 * Pass 2: Walk waiters — skip subscribe if already a sync sub
 *         (version - 1), stamp with `version` ("notified").
 * Pass 3: Inline notify — OR FLAG_STALE on all subs, but only call
 *         _receive() on subs not stamped `version` (not a waiter).
 *         Skipped when quiet.
 * Pass 4: Call the waiters' callbacks. They run last, so a callback
 *         that reads the graph sees every subscriber marked stale,
 *         and the waiters are already detached, so a waiter added by
 *         a callback goes into a fresh list.
 * @param {AsyncSender} node
 * @param {boolean} quiet - Only resolve the waiters, without marking
 *     subscribers stale (the value did not change).
 */
function settleNotify(node, quiet) {
	let chan = node._chan;
	let waiters = /** @type {Array<AsyncReceiver | Function>} */(chan._waiters);
	let waiterCount = waiters.length;
	let value = node._value;
	let isError = (node._flag & FLAG_ERROR) !== 0;
	chan._waiters = null;
	node._flag &= ~FLAG_WAITER;
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

	/** Pass 2: subscribe waiters, skip if already a sync sub. */
	for (let i = 0; i < waiterCount; i += 3) {
		let awaiter = /** @type {AsyncReceiver} */(waiters[i]);
		if (!(awaiter._flag & FLAG_BLOCKED)) {
			if (awaiter._stamp !== version - 1) {
				subscribe(awaiter, node);
			}
		}
		awaiter._stamp = version;
		clearRespond(awaiter, node);
	}

	/** Pass 3: inline notify — skip subs that were resolved as waiters. */
	if (!quiet) {
		if (sub !== null && sub._stamp !== version) {
			let flags = sub._flag;
			sub._flag |= FLAG_STALE;
			if (!(flags & (FLAG_PENDING | FLAG_STALE | FLAG_BLOCKED | FLAG_DISPOSED | FLAG_PAUSED))) {
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
						!(flags & (FLAG_PENDING | FLAG_STALE | FLAG_BLOCKED | FLAG_DISPOSED | FLAG_PAUSED))
					) {
						sub._receive();
					}
				}
			}
		}
	}

	/** Pass 4: resume the waiters. */
	for (let i = 0; i < waiterCount; i += 3) {
		deliver(
			/** @type {AsyncReceiver} */(waiters[i]),
			/** @type {Function} */(waiters[isError ? i + 2 : i + 1]),
			value,
			isError
		);
	}
}

/**
 * Flags for a callback suspend. Made while the fn runs, it sets
 * FLAG_CALLBACK, under which a delivery is held until the fn returns,
 * and the node becomes loading only then, so the rest of the fn reads
 * and tracks as any run does. Made after the run, in a continuation,
 * the node is already loading.
 * @param {Receiver | AsyncSender} node
 * @returns {number}
 */
function callbackFlags(node) {
	return node._flag & FLAG_LOADING ? FLAG_SUSPEND : FLAG_SUSPEND | FLAG_CALLBACK;
}

/**
 * True while a delivery to the node must be held: a callback suspend
 * was made in its fn, which has not returned yet.
 * @param {Receiver | AsyncSender} node
 * @returns {boolean}
 */
function isHolding(node) {
	return (node._flag & (FLAG_CALLBACK | FLAG_SUSPEND)) === (FLAG_CALLBACK | FLAG_SUSPEND);
}

/**
 * Holds a delivery until the node's fn returns. Like a promise, the
 * first one wins.
 * @param {Receiver | AsyncSender} node
 * @param {Function | null | undefined} fn
 * @param {*} value
 * @returns {void}
 */
function hold(node, fn, value) {
	for (let i = 0; i < HELD_COUNT; i += 3) {
		if (HELD[i] === node) {
			return;
		}
	}
	HELD[HELD_COUNT++] = node;
	HELD[HELD_COUNT++] = fn;
	HELD[HELD_COUNT++] = value;
}

/**
 * Finds the node's held delivery. Nested runs push above it, and they
 * have all returned by the time the node's fn does, but an outer node
 * resolved from inside this run can sit above it.
 * @param {Receiver | AsyncSender} node
 * @returns {number} the index of the entry, or -1
 */
function findHeld(node) {
	for (let i = HELD_COUNT - 3; i >= 0; i -= 3) {
		if (HELD[i] === node) {
			return i;
		}
	}
	return -1;
}

/**
 * Removes the entry at index i, keeping the order of the others.
 * @param {number} i
 * @returns {void}
 */
function dropHeld(i) {
	let count = (HELD_COUNT -= 3);
	for (; i < count; i++) {
		HELD[i] = HELD[i + 3];
	}
	HELD[count] = HELD[count + 1] = HELD[count + 2] = null;
}

/**
 * Drops the node's held delivery, if any: its fn threw, or it was
 * disposed while the fn ran.
 * @param {Receiver | AsyncSender} node
 * @returns {void}
 */
function unhold(node) {
	let i = HELD_COUNT > 0 ? findHeld(node) : -1;
	if (i >= 0) {
		dropHeld(i);
	}
}

/**
 * Hands a settled value to one waiter's callback, unless the waiter
 * has been disposed. A node waiting
 * through c.suspend(task, onResolve, onReject) is relayed: its own
 * callback runs, and the node settles with what it returns, or, while
 * the node's fn still runs, the callback is held until it returns.
 * During an array await (FLAG_BLOCKED) the callback is the internal
 * re-scan.
 * @param {AsyncReceiver} awaiter
 * @param {Function | null} fn
 * @param {*} value
 * @param {boolean} isError
 * @returns {void}
 */
function deliver(awaiter, fn, value, isError) {
	/** A disposed node never resumes. A locked one runs to the end. */
	if ((awaiter._flag & (FLAG_DISPOSED | FLAG_LOCKED)) === FLAG_DISPOSED) {
		return;
	}
	if ((awaiter._flag & (FLAG_RELAY | FLAG_BLOCKED)) === FLAG_RELAY) {
		/** Settled while the awaiter's fn still runs: the callback waits
		 *  for it to return. onReject gets a Defect, as from relay(). */
		if (isHolding(awaiter)) {
			hold(awaiter, fn, fn !== null && isError ? defect(value) : value);
		} else {
			relay(awaiter, fn, value, isError);
		}
	} else {
		/** @type {Function} */(fn)(value);
	}
}

/**
 * Resumes a node waiting through c.suspend(task, onResolve, onReject),
 * like a `.then(onResolve, onReject)`: the node settles with what the
 * callback returns, or fails with what it throws. onReject always
 * gets a Defect. An error with no onReject fails the node.
 * @param {AsyncReceiver} node
 * @param {Function | null} fn
 * @param {*} value
 * @param {boolean} isError
 * @returns {void}
 */
function relay(node, fn, value, isError) {
	node._flag &= ~FLAG_RELAY;
	if (fn === null) {
		node._error(value);
		return;
	}
	let result;
	try {
		result = fn(isError ? defect(value) : value);
	} catch (err) {
		node._error(err);
		return;
	}
	node._settle(result);
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
	let defers = null;
	if (node._flag & FLAG_CHANNEL) {
		defers = node._chan._defers;
		node._chan._defers = null;
	}

	/** Stamp dep1. */
	if (dep1 !== null) {
		dep1._stamp = stamp;
	}

	/** Dedup scan of _deps — remove duplicates via swap-with-last.
	 *  Walks back to front, so the pair swapped in is already seen. */
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

	/** Phase 2: subscribe deferred deps and detect changes. A sender
	 *  disposed during the await is dropped: it never changes again. */
	if (defers === null) {
		return false;
	}
	let changed = false;
	let count = defers.length;
	for (let i = 0; i < count; i += 2) {
		let sender = /** @type {Sender} */(defers[i]);
		if (sender._flag & FLAG_DISPOSED) {
			continue;
		}
		if (sender._stamp !== stamp) {
			sender._stamp = stamp;
			subscribe(node, sender);
		}
		if (sender._value !== defers[i + 1]) {
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
	let defers = chan._defers;
	chan._defers = null;
	let count = defers.length;
	for (let i = 0; i < count; i += 2) {
		let sender = /** @type {Sender} */(defers[i]);
		if (!(sender._flag & FLAG_DISPOSED) && !hasDep(node, sender)) {
			subscribe(node, sender);
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
 * Resets async fiber state before re-execution. Aborts the previous
 * controller, clears stale defers, and removes channel bindings,
 * abandoning an array await (FLAG_BLOCKED) along with them.
 * Shared between Compute and Effect _update paths.
 * @param {AsyncReceiver} node
 * @returns {void}
 */
function resetChannel(node) {
	let chan = node._chan;
	if (chan._controller !== null) {
		chan._controller.abort();
		chan._controller = null;
	}
	chan._defers = null;
	if (chan._res1 !== null || chan._responds !== null) {
		clearChannel(chan, node);
	}
	node._flag &= ~(FLAG_BLOCKED | FLAG_RELAY);
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
	let awaiterCh = awaiter._channel();
	let responderCh = task._channel();
	if (responderCh._waiters === null) {
		responderCh._waiters = [awaiter, resolve, reject];
	} else {
		responderCh._waiters.push(awaiter, resolve, reject);
	}
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
 * Whether `task` waits on `node`, directly or through the tasks it
 * waits on. Awaiting `task` from `node` would then close a cycle that
 * never settles. Every wait is checked here before it is bound, so the
 * waits form no cycle of their own and the walk ends; FLAG_VISIT skips
 * a task reached twice. A task that waits on nothing costs one check.
 * @param {AsyncSender} task
 * @param {AsyncReceiver} node
 * @returns {boolean}
 */
function awaits(task, node) {
	if (!(task._flag & FLAG_CHANNEL)) {
		return false;
	}
	let chan = task._chan;
	if (chan._res1 === null && chan._responds === null) {
		return false;
	}
	let found = false;
	/** @type {Array<AsyncSender>} */
	let stack = [task];
	/** @type {Array<AsyncSender>} */
	let seen = [];
	while (stack.length > 0) {
		let next = stack.pop();
		if (next === node) {
			found = true;
			break;
		}
		if (next._flag & FLAG_VISIT || !(next._flag & FLAG_CHANNEL)) {
			continue;
		}
		next._flag |= FLAG_VISIT;
		seen.push(next);
		let res = next._chan._res1;
		if (res !== null) {
			stack.push(res);
		}
		let responds = next._chan._responds;
		if (responds !== null) {
			for (let i = 0; i < responds.length; i++) {
				if (responds[i] !== null) {
					stack.push(responds[i]);
				}
			}
		}
	}
	for (let i = 0; i < seen.length; i++) {
		seen[i]._flag &= ~FLAG_VISIT;
	}
	return found;
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
		channel._res1 = null;
		removeWaiter(res, res._chan, awaiter);
	}
	let responds = channel._responds;
	if (responds !== null) {
		channel._responds = null;
		for (let i = 0; i < responds.length; i++) {
			let responder = responds[i];
			if (responder !== null) {
				removeWaiter(responder, responder._chan, awaiter);
			}
		}
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
 * Rejects every waiter of a responder that is being disposed. The list
 * is detached and every waiter's link back to the responder cleared
 * first, so nothing a reject does can reach the list. Inside a flush or
 * a teardown, the rejections are held until it has finished (see
 * REJECTS); otherwise they are delivered now.
 * @param {AsyncSender} responder
 * @param {Resolver} responderCh
 * @param {Error} error
 * @returns {void}
 */
function rejectWaiters(responder, responderCh, error) {
	let waiters = responderCh._waiters;
	let count = waiters.length;
	responderCh._waiters = null;
	responder._flag &= ~FLAG_WAITER;
	/** Every dispose runs inside a flush or a teardown(), which
	 *  delivers the queued rejections once the disposal has finished. */
	for (let i = 0; i < count; i += 3) {
		clearRespond(/** @type {AsyncReceiver} */(waiters[i]), responder);
		REJECTS[REJECT_COUNT++] = waiters[i];
		REJECTS[REJECT_COUNT++] = waiters[i + 2];
		REJECTS[REJECT_COUNT++] = error;
	}
}

/**
 * Delivers the rejections held in REJECTS. A rejection that causes a
 * further disposal appends to the queue, and is delivered in the same
 * walk once that disposal has finished.
 * @returns {void}
 */
function deliverRejects() {
	/** @type {*} */
	let error = null;
	let thrown = false;
	for (let i = 0; i < REJECT_COUNT; i += 3) {
		let awaiter = /** @type {AsyncReceiver} */(REJECTS[i]);
		let reject = /** @type {Function} */(REJECTS[i + 1]);
		let value = REJECTS[i + 2];
		REJECTS[i] = REJECTS[i + 1] = REJECTS[i + 2] = null;
		try {
			deliver(awaiter, reject, value, true);
		} catch (err) {
			if (!thrown) {
				error = err;
				thrown = true;
			}
		}
	}
	REJECT_COUNT = 0;
	if (thrown) {
		throw error;
	}
}

/**
 * Pauses an owner node (Effect or Root) and recursively pauses
 * all owned child effects. While paused, notifications are
 * suppressed — the node accumulates stale/pending bits but
 * _receive() returns early. Computes are not paused because
 * they are pull-based and inherently lazy.
 * @param {Owner} node
 */
function pauseNode(node) {
	node._flag |= FLAG_PAUSED;
	let owned = node._owned;
	if (owned !== null) {
		let count = owned.length;
		for (let i = 0; i < count; i++) {
			if (owned[i]._flag & FLAG_OWNER) {
				pauseNode(/** @type {Owner} */(owned[i]));
			}
		}
	}
}

/**
 * Records the disposal of a locked owner, which waits until the shields
 * under it release (D10). It is not marked disposed until then, so it
 * still reads and creates children. Its subtree is frozen meanwhile:
 * paused, so nothing in it starts a new run, while activations in flight
 * go on.
 * @param {Owner} node
 * @returns {void}
 */
function deferDispose(node) {
	let count = /** @type {number} */(HOLDS.get(node));
	if (!(count & HELD_DISPOSE)) {
		HOLDS.set(node, count + HELD_DISPOSE);
		pauseNode(node);
	}
}

/**
 * Whether `node` or an owner above it waits to be disposed, so that its
 * subtree is frozen.
 * @param {Owner} node
 * @returns {boolean}
 */
function isFrozen(node) {
	for (let next = node; next !== null && next._flag & FLAG_OWNER; next = next._owner) {
		let count = HOLDS.get(next);
		if (count !== undefined && count & HELD_DISPOSE) {
			return true;
		}
	}
	return false;
}

/**
 * Ends the shield of `node`'s activation, which has completed (D10),
 * and replays what it deferred. Does nothing if the node is not
 * shielded itself.
 * @param {Effect} node
 * @returns {void}
 */
function unshield(node) {
	let count = HOLDS.get(node);
	if (count !== undefined && count & HELD_SELF) {
		countOff(node);
		replay(node);
	}
}

/**
 * Counts the shield of `node` off it and off every owner above it. A
 * node that no shield holds any more is unlocked; one whose disposal
 * waited is marked disposed, for replay() to tear down.
 * @param {Effect} node
 * @returns {void}
 */
function countOff(node) {
	let by = HELD_SELF;
	let next = /** @type {Owner | null} */(node);
	while (next !== null && next._flag & FLAG_OWNER) {
		let count = /** @type {number} */(HOLDS.get(next)) - by;
		if (count & ~HELD_DISPOSE) {
			HOLDS.set(next, count);
		} else {
			HOLDS.delete(next);
			next._flag &= ~FLAG_LOCKED;
			if (count & HELD_DISPOSE) {
				next._flag |= FLAG_DISPOSED;
			}
		}
		by = HELD_BELOW;
		next = next._owner;
	}
}

/**
 * Replays what the released shields deferred, on the path from `node`
 * up. The nodes they freed are the bottom of the path, as an owner
 * counts every shield below it. The topmost freed node whose disposal
 * waited is torn down, children first. The topmost freed node with a
 * deferred re-run above that is queued, unless an owner further up
 * still waits to be disposed: then its subtree stays frozen, the re-run
 * is dropped, and children created meanwhile are paused too.
 * @param {Owner | null} node
 * @returns {void}
 */
function replay(node) {
	/** @type {Owner | null} */
	let top = null;
	/** @type {Owner | null} */
	let disposed = null;
	/** @type {Owner | null} */
	let rerun = null;
	let frozen = false;
	for (let next = node; next !== null && next._flag & FLAG_OWNER; next = next._owner) {
		let flag = next._flag;
		if (flag & FLAG_LOCKED) {
			if (/** @type {number} */(HOLDS.get(next)) & HELD_DISPOSE) {
				frozen = true;
				break;
			}
		} else {
			top = next;
			if (flag & FLAG_DISPOSED) {
				disposed = next;
				rerun = null;
			} else if (flag & (FLAG_STALE | FLAG_PENDING)) {
				rerun = next;
			}
		}
	}
	if (disposed !== null) {
		disposeHeld(disposed);
		if (disposed === top) {
			return;
		}
	}
	if (frozen) {
		if (top !== null) {
			pauseNode(top);
		}
	} else if (rerun !== null) {
		/** @type {Effect} */(rerun)._receive();
		flush();
	}
}

/**
 * Tears down a node whose disposal waited for its shields. Its owner
 * may live on, so the node leaves the owner's children: the owner's own
 * teardown must not dispose it a second time.
 * @param {Owner} node
 * @returns {void}
 */
function disposeHeld(node) {
	let owner = node._owner;
	try {
		teardown(node);
	} finally {
		if (owner !== null && owner._flag & FLAG_OWNER && owner._owned !== null) {
			let i = owner._owned.lastIndexOf(node);
			if (i !== -1) {
				owner._owned.splice(i, 1);
			}
		}
	}
}

/**
 * dispose(true) of a locked node: ends every shield under it, its own
 * included, and disposes it now. The shielded activations are dropped
 * at their next suspend, and what they deferred is not replayed, since
 * the disposal takes it. An owner above that this frees replays its own
 * deferred request.
 * @param {Owner} node
 * @returns {void}
 */
function forceDispose(node) {
	let owner = node._owner;
	/** @type {Array<Effect>} */
	let shields = [];
	HOLDS.forEach(function (count, held) {
		if (count & HELD_SELF) {
			for (let next = held; next !== null; next = next._owner) {
				if (next === node) {
					shields.push(held);
					break;
				}
			}
		}
	});
	for (let i = 0; i < shields.length; i++) {
		countOff(shields[i]);
	}
	disposeHeld(node);
	if (owner !== null) {
		replay(owner);
	}
}

/**
 * Disposes a node from outside the dispose queue: a deferred dispose
 * replayed when a shield releases, or a node its error disposes. Outside
 * a flush, the rejections the teardown collects are delivered once it
 * has finished; inside one, the flush delivers them.
 * @param {Disposer} node
 * @returns {void}
 */
function teardown(node) {
	if (FLUSHING || TEARING) {
		node._dispose();
		return;
	}
	TEARING = true;
	try {
		node._dispose();
	} finally {
		try {
			if (REJECT_COUNT > 0) {
				deliverRejects();
			}
		} finally {
			TEARING = false;
		}
	}
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
	if (node._flag & FLAG_CALLBACK) {
		unhold(node);
	}
	node._flag &= ~(FLAG_SUSPEND | FLAG_CALLBACK);
	if (node._finalize !== null) {
		clearFinalize(node);
	}
	let err = defect(error);
	let result = tryRecover(node, err);
	if (result !== RECOVER_SELF) {
		teardown(node);
	}
	if (node._flag & FLAG_LOCKED) {
		unshield(node);
	}
	if (result === RECOVER_NONE) {
		UNHANDLED = err;
		UNHANDLED_NODE = node;
		throw err;
	}
}

/**
 * Starts a bound effect created with DEFER without running it.
 * A stale or pending compute does not pass notifications on, so the
 * dep is brought up to date first: its next change then reaches the
 * effect. The effect counts as having run now, so a dep that does not
 * change after this does not run it either.
 * @param {Effect} node
 * @returns {void}
 */
function deferEffect(node) {
	let dep = node._dep1;
	/** A disposed dep fails the effect as its first run would. */
	if (dep._flag & FLAG_DISPOSED) {
		startEffect(node);
		return;
	}
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
 * first unrecoverable error as a Defect, or null if all succeeded.
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
		/** The pre-run check is inside the try: a throw from it, such as
		 *  a cycle, is the node's error too, and the queue drains on. */
		try {
			/** A node paused after it was queued keeps its flags for resume(). */
			if (
				(node._flag & (FLAG_STALE | FLAG_PAUSED)) === FLAG_STALE ||
				((node._flag & (FLAG_PENDING | FLAG_PAUSED)) === FLAG_PENDING &&
					needsUpdate(node, time))
			) {
				FENCE = SEED;
				node._update(time);
			} else if (!(node._flag & FLAG_PAUSED)) {
				node._flag &= ~(FLAG_STALE | FLAG_PENDING);
			}
		} catch (error) {
			/** A throw before the run, or a cleanup that throws, aborts it
			 *  before it clears these, and a throw ends a callback
			 *  suspend's activation. */
			if (node._flag & FLAG_CALLBACK) {
				unhold(node);
			}
			node._flag &= ~(FLAG_STALE | FLAG_PENDING | FLAG_SUSPEND | FLAG_CALLBACK);
			if (node._finalize !== null) {
				clearFinalize(node);
			}
			let err = defect(error);
			let result = tryRecover(node, err);
			if (thrown === null && result === RECOVER_NONE) {
				thrown = err;
			}
			/** The throw ends the activation, and its shield: a locked
			 *  node is disposed once that releases. */
			if (result !== RECOVER_SELF || node._flag & FLAG_LOCKED) {
				try {
					if (result !== RECOVER_SELF) {
						node._dispose();
					}
					if (node._flag & FLAG_LOCKED) {
						unshield(node);
					}
				} catch (cleanupError) {
					if (thrown === null) {
						thrown = defect(cleanupError);
					}
				}
			}
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
								error = defect(err);
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
			/** The rejections a disposal collected, now that it has finished:
			 *  the waiters it disposed too are skipped. Rejections collected
			 *  later in the pass come back here on the next one. */
			if (REJECT_COUNT > 0) {
				try {
					deliverRejects();
				} catch (err) {
					if (!thrown) {
						error = defect(err);
						thrown = true;
					}
				}
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
					try {
						if (
							node._flag & FLAG_STALE ||
							(node._flag & FLAG_PENDING && needsUpdate(node, time))
						) {
							node._update(time);
						} else {
							node._flag &= ~(FLAG_STALE | FLAG_PENDING);
						}
					} catch (err) {
						/** A compute catches its fn's errors, so this is a throw
						 *  from the pre-run check, such as a cycle. It is
						 *  rethrown when the drain ends, as a pull rethrows it,
						 *  and the node stays queueable. */
						node._flag &= ~(FLAG_STALE | FLAG_PENDING);
						if (!thrown) {
							error = defect(err);
							thrown = true;
						}
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
			REJECT_COUNT > 0 ||
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
	FLAG_RELAY,
	FLAG_SINGLE,
	FLAG_EAGER,
	FLAG_PURGE,
	FLAG_PAUSED,
	FLAG_OWNER,
	FLAG_CALLBACK,
	FLAG_VISIT,
	FLAG_REFUSE,
	REFUSE,
	PANIC,
	FATAL,
	Defect,
	refuse,
	panic,
	fatal,
	DEFER,
	STABLE,
	SETUP,
	WEAK,
	EAGER,
	OPTIONS,
	DISPOSED,
	LOADING,
	ERROR,
	PUBLIC,
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
