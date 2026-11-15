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
/** A dep changed: the node must run again. */
const FLAG_STALE = 1 << 0;
/** A compute upstream may have changed: the deps must be checked. */
const FLAG_PENDING = 1 << 1;
/** The sender has writes in the queue (schedule). */
const FLAG_SCHEDULED = 1 << 2;
const FLAG_DISPOSED = 1 << 3;
/** The value is a Defect: reading it throws. */
const FLAG_ERROR = 1 << 4;
/** The new value counts as changed, whatever it is. On a signal it is
 *  the creation option equal = false, so every write notifies; on a
 *  compute, c.equal(false) sets it for one run. */
const FLAG_MUTABLE = 1 << 5;
/** Creation option: a compute drops its value and its cleanups when its
 *  last subscriber leaves. */
const FLAG_WEAK = 1 << 6;

/* Bits 7 and up. Most belong to receivers (Compute, Effect, Action).
 * A resource carries the async bits it shares with a task (LOADING,
 * ASYNC, WAITER, CHANNEL, SUSPEND, CALLBACK) and REJECTED, the owners
 * (Root, Effect) carry OWNER, PURGE, SHIELD and DISPOSING, and
 * FLAG_VISIT goes on any node. */
/** On a resource: its newest save failed, the value fell back to
 *  _svalue, and _fault holds the error. is(ERROR) and c.rejected()
 *  report it; reads don't throw. */
const FLAG_REJECTED = 1 << 7;
/** In the first run of an unbound node: reads go to DSTACK, and are
 *  sliced into _deps when the fn returns. A bound node is created with
 *  its dep, single and stable, and never sets up. */
const FLAG_SETUP = 1 << 8;
/** Waiting on async work: the value is the previous one until the node
 *  settles. */
const FLAG_LOADING = 1 << 9;
/** Creation option: a compute waits for its first read before it runs,
 *  and a bound effect or action for its dep's first change. */
const FLAG_DEFER = 1 << 10;
/** The deps are fixed after the first run: later runs track nothing.
 *  A bound node is always stable. */
const FLAG_STABLE = 1 << 11;
/** c.equal() in this run: the new value counts as unchanged. c.equal(false)
 *  sets FLAG_MUTABLE instead. */
const FLAG_EQUAL = 1 << 12;
/** A shielded owner's disposal waits for its shields (D10). */
const FLAG_DISPOSING = 1 << 13;
/** A task, spawn or resource: a promise or async iterable that its fn
 *  (or an async write) returns is awaited, and settles it. */
const FLAG_ASYNC = 1 << 14;
/** Created with a dep: _dep1 is that dep, and its value is the fn's
 *  first argument. */
const FLAG_BOUND = 1 << 15;
/** Others wait on it: its channel's _waiters resolve when it settles. */
const FLAG_WAITER = 1 << 16;
/** _chan holds a Channel (see _channel). */
const FLAG_CHANNEL = 1 << 17;
/** Walking an array await (stepArray): settleNotify neither subscribes
 *  nor wakes it, and deliver() calls the re-scan directly. */
const FLAG_BLOCKED = 1 << 18;
/** Held by a shield, its own or one below it (D10): its re-run and its
 *  disposal wait until the shield releases. */
const FLAG_SHIELD = 1 << 19;
/** c.suspend() was called in this activation. With the callback form,
 *  the callback settles it. */
const FLAG_SUSPEND = 1 << 20;
/** Waiting on a task through c.suspend(task, onResolve, onReject): the
 *  callback that resumes it also settles it. */
const FLAG_RELAY = 1 << 21;
/** Has _dep1 and no _deps, so a pull checks it with checkSingle. */
const FLAG_SINGLE = 1 << 22;
/** Creation option: a compute re-runs in the flush when notified,
 *  instead of waiting for a read. */
const FLAG_EAGER = 1 << 23;
/** An owner queued on PURGES to compact its _owned (purgeOwned). */
const FLAG_PURGE = 1 << 24;
/** Notifications mark the node but do not wake it: set by pause(), on a
 *  frozen subtree, and around a contextual write (guardedAssign). */
const FLAG_PAUSED = 1 << 25;
/** Keeps an _owned list: a Root or an Effect, not the global `c` or an
 *  Action. */
const FLAG_OWNER = 1 << 26;
/** A callback suspend was made while the fn, or a step's callback, still
 *  runs: a delivery is held in HELD until it returns. */
const FLAG_CALLBACK = 1 << 27;
/** c.refuse() was called in an async activation. It becomes FLAG_ERROR
 *  when the activation settles, so readers never see the error flag next
 *  to the previous value. */
const FLAG_REFUSE = 1 << 28;
/** A scratch mark, set and cleared within one call that runs no user
 *  code: checkCycle and awaits() mark the nodes they walk, and the
 *  settle passes (settleNotify, settleDeps) mark the nodes
 *  they dedupe. Any node can carry it, a plain signal too.
 *  It is the last bit: 1 << 30 is outside V8's 31-bit Smi range under
 *  pointer compression. */
const FLAG_VISIT = 1 << 29;

/** Error type constants for { error, type } POJOs. */
const REFUSE = 1;
const PANIC = 2;

/* Creation options, passed in a factory's opts. A node's options are
 * fixed once it is created. */
const DEFER = FLAG_DEFER;
const STABLE = FLAG_STABLE;
const WEAK = FLAG_WEAK;
const EAGER = FLAG_EAGER;

const OPTIONS = DEFER | STABLE | WEAK | EAGER;

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
 * Thrown when a node reads a disposed node, or itself, and when a node
 * is created under a disposed owner.
 * @const
 */
var ILLEGAL_READ = "Cannot read a disposed node or yourself";

/**
 * Thrown when a pull walks a dependency cycle (checkCycle), or when an
 * await would wait on itself through other tasks (awaits).
 * @const
 */
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
 * Pre-allocated stack for the deps of a setup run (FLAG_SETUP). Its
 * reads are written here as [sender, 0] pairs from DBASE. After the fn
 * returns, they are sliced into _deps at exact capacity, which avoids
 * the over-allocation of growing _deps with push(), and then connected,
 * which fills in each pair's subslot.
 * @see {connect}
 * @type {Array<Sender | number | null>}
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
 * The flush pass counter: each pass of flush() raises it by one.
 * Receivers record the pass they last ran in (_time) and, for a
 * compute, the pass its value last changed in (_ctime). A Resource's _time
 * is its own activation counter instead, raised by each write.
 * @type {number}
 */
var TIME = 1;

/**
 * False while a batch, a flush or a top-level run is active. A write
 * then queues, and the active transaction flushes it.
 * @type {boolean}
 */
var IDLE = true;

/** Whether flush() is draining the queues. A nested flush() leaves the work to it. */
var FLUSHING = false;

/** Global unowned context for top-level node creation. */
var c = new Clock();

/**
 * The stamp source for dependency tracking. Each setup or dynamic run
 * does SEED += 2 and STAMP = SEED. A dynamic run first stamps its
 * existing deps STAMP - 1 (sweepDeps). A read then tags its sender
 * with STAMP: a sender found at STAMP - 1 is a reused dep, counted in
 * REUSED, and any other is new. patchDeps reconciles the deps if the
 * counts differ. STAMP is restored when the run returns; SEED only
 * grows.
 * @type {number}
 */
var SEED = 1;

/**
 * The stamp of the run in progress (see SEED).
 * @type {number}
 */
var STAMP = 0;

/**
 * The stamp boundary of the current top-level run. Every top-level
 * entry sets FENCE = SEED, so a sender stamped above it was stamped by
 * a run still on the stack. An outer effect may read SignalA, and then
 * an inner compute it refreshes reads SignalA too, re-stamping it. The
 * inner run saves such a stamp to VSTACK and restores it when it
 * returns, so the outer run's reconciliation still finds its own.
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
 * have an entry: _update (for a resource, runLoad) takes it when the
 * fn returns, and a throw or a disposal drops it, so the stack holds
 * one entry per nested run at most.
 * @const @type {Array<Receiver | AsyncSender | Function | null | undefined | *>}
 */
var HELD = [];

var HELD_COUNT = 0;

/**
 * The node whose suspend callback is running, or null. A suspend made
 * inside the callback is the run's next step, and is held like one made
 * in the fn (see runStep).
 * @type {AsyncReceiver | null}
 */
var STEP = null;

/**
 * The effects whose activation is shielded (D10). An owner is
 * FLAG_SHIELD while a shield is on it or below it: shield() sets the
 * flag up the path, and countOff() clears the released path and sets it
 * again from the shields that remain. Only a few are ever active.
 * @const @type {Array<Effect>}
 */
var SHIELDS = [];

/**
 * True while teardown() disposes a node outside a flush, or delivers
 * the rejections it collected: a disposal nested inside defers to it.
 * @type {boolean}
 */
var TEARING = false;

/**
 * Set while anod runs user code at idle on its own: an async settle,
 * with its finalizers, recover handlers and callbacks, and dispose(true).
 * A c.fatal() there does not flush in the middle of it: the caller
 * flushes once it is done.
 * @type {boolean}
 */
var NESTED = false;

/**
 * The write queue: three parallel arrays that share SENDER_COUNT. The
 * drain calls UPDATES[i](SENDERS[i], PAYLOADS[i], time) for each entry,
 * then clears them back to null. Entries are signal and resource writes
 * (schedule), weak-compute releases (releaseWeak) and settles queued by
 * postSettle. Sized to the longest queued burst the session has seen.
 * @const @type {Array<Sender>}
 */
var SENDERS = [];
/** @const @type {Array} */
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
 * or task, tagged REFUSE or PANIC. A Defect keeps its
 * identity as it travels through reads, awaits and owner chains, so a
 * caught Defect passes on unchanged. Anything else was thrown by user
 * code and is wrapped as PANIC, exactly once. It holds any value: a
 * stack is only there if what it holds has one.
 * @constructor
 * @param {*} error
 * @param {number} type
 */
function Defect(error, type) {
	this.error = error;
	this.type = type;
}

/**
 * What a flush throws once it ends after one or more c.fatal() calls,
 * whose trees it has torn down: `errors` holds what each was given, in
 * order. One or several, it has the same shape.
 * @constructor
 * @param {Array<*>} errors
 */
function Fatal(errors) {
	this.errors = errors;
}

/**
 * What c.fatal() throws once it has marked its tree for disposal: it
 * only unwinds the code that runs, as the tree is dead already. Every
 * catch in anod that sees it stops: no handler is asked and nothing is
 * rethrown. Catching it in user code changes nothing.
 * @const
 */
const FATAL = {};

/**
 * What each c.fatal() was given since the last flush ended, for the
 * Fatal it throws.
 * @type {Array<*>}
 */
var FATALS = [];

/**
 * What the flush throws once it ends that no run returned to it: the
 * first error a disposal ended with that no handler took, or FATAL,
 * which replaces it, for a Fatal of FATALS. While it is FATAL, a
 * teardown's own errors are dropped.
 * @type {Defect | Object | null}
 */
var PENDING = null;

/**
 * The error failStart last rethrew to a creator after the new effect's
 * owner chain declined it, and that effect. An owner whose run it
 * escapes into has already declined it, so endRun does not ask the
 * same handlers again.
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
 * No recover handlers: owner-chain walks (bubble) treat the Clock
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
	/** @type {(function(Defect): void) | Array<(function(Defect): void)> | null} */
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
 * An async signal, made by resource(). Extends Signal with _time (for
 * LWW stale activation tracking) and _chan (the channel its waiters
 * wait in).
 *
 * It also keeps the server's value next to its own: _svalue is the
 * last value a load, a save or a plain write confirmed, and _stime the
 * activation that confirmed it. The value is the value, optimistic or
 * confirmed; when the newest save fails, it falls back to _svalue, and
 * _fault holds the error until the next write. _loader is the fn that
 * refresh() runs.
 * @template T
 * @constructor
 * @extends {Signal<T>}
 * @implements {AsyncSender<T>}
 * @param {T} value
 * @param {number} flag
 * @param {(function(AsyncSender<T>, T): *) | null} loader
 */
function Resource(value, flag, loader) {
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
	/** @type {Resolver | null} */
	this._chan = null;
	/** @type {T} */
	this._svalue = value;
	/** @type {number} */
	this._stime = 0;
	/** @type {(function(AsyncSender<T>, T): *) | null} */
	this._loader = loader;
	/** @type {Defect | null} */
	this._fault = null;
}
Resource.prototype = Object.create(Signal.prototype);

/**
 * @constructor
 * @template T, U, W
 * @param {(function(U, T, W): T) | (function(T, W): T)} fn
 * @param {number} flag - FLAG_ASYNC, the setup or bound flags, and the options
 * @param {Sender<U> | null} dep1
 * @param {T=} seed
 * @param {W=} args
 * @implements {ICompute<T>}
 */
function Compute(fn, flag, dep1, seed, args) {
	/** @type {number} */
	this._flag = FLAG_STALE | flag;
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
 * @param {number} flag - FLAG_ASYNC, the setup or bound flags, and the options
 * @param {(function(U,W): void) | (function(W): void)} fn
 * @param {Sender<U> | null} dep1
 * @param {Owner | null} owner
 * @param {W=} args
 * @implements {IEffect}
 */
function Effect(flag, fn, dep1, owner, args) {
	/** @type {number} */
	this._flag = FLAG_OWNER | flag;
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
	/** @type {(function(Defect): void) | Array<(function(Defect): void)> | null} */
	this._recover = null;
	/** @type {(function(): void) | Array<(function(): void)> | null} */
	this._finalize = null;
	/** @type {IChannel | null} */
	this._chan = null;
	/** @type {W | undefined} */
	this._args = args;
}

/**
 * A slim sync effect: it runs its fn when its deps change, and nothing
 * else. It owns nothing and has no cleanup, recover, finalize or
 * channel, so it is about half the size of an Effect. It keeps its
 * owner, which disposes it and recovers its errors.
 * @constructor
 * @template U, W
 * @param {number} flag - the setup or bound flags, and the options
 * @param {(function(U,W): void) | (function(W): void)} fn
 * @param {Sender<U> | null} dep1
 * @param {Owner | null} owner
 * @param {W=} args
 * @implements {IAction}
 */
function Action(flag, fn, dep1, owner, args) {
	/** @type {number} */
	this._flag = flag;
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
	/** @type {Owner | null} */
	this._owner = owner;
	/** @type {W | undefined} */
	this._args = args;
}

/**
 * The async state of a task, spawn or resource, held in its _chan
 * field. Created lazily by _channel() on first use: controller(),
 * defer(), an await of a task, or being awaited. A resource only uses
 * _waiters.
 * @constructor
 * @implements {IChannel}
 */
function Channel() {
	/** @type {AsyncSender | null} The first responder the node waits on. */
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
 * The context of one save (see runSave). A save runs to completion, so
 * its suspend() guards nothing: it returns a promise as it is. Each
 * save has its own context, so that version() and a callback after an
 * await still know which save they belong to.
 * @constructor
 * @param {AsyncSender} node
 * @param {number} time - the save's activation
 * @param {*} value - the value it wrote, which a save that returns nothing confirms
 */
function Save(node, time, value) {
	/** @type {AsyncSender} */
	this._node = node;
	/** @type {number} */
	this._time = time;
	/** @type {*} The value it wrote, until the save delivers its own. */
	this._value = value;
	/** @type {number} FLAG_CALLBACK while the fn runs, FLAG_SUSPEND once
	 *  suspend() took callbacks, FLAG_LOADING until the save delivers,
	 *  and FLAG_ERROR if it failed, with the error in _value. */
	this._flag = FLAG_CALLBACK;
}

/**
 * Shared across Root/Compute/Effect/Action. Queues onto DISPOSES, and
 * when idle runs the drain for it at once: writes and disposes made by
 * cleanups join the same transaction and flush once the whole subtree is
 * disposed, so nothing being torn down re-runs. An effect's live owner
 * then drops it from `_owned`. A locked node waits for the shields under
 * it (D10); `force` ends them and disposes it now, also after a plain
 * dispose() it is waiting on.
 * @this {Disposer}
 * @param {boolean=} force
 * @returns {void}
 */
function dispose(force) {
	if (force === true && this._flag & FLAG_SHIELD) {
		let nested = NESTED;
		NESTED = true;
		try {
			forceDispose(this);
		} finally {
			NESTED = nested;
		}
		if (PENDING !== null && IDLE && !nested) {
			flush();
		}
	} else if (!(this._flag & FLAG_DISPOSED)) {
		DISPOSES[DISPOSER_COUNT++] = this;
		if (IDLE) {
			flush();
		}
	}
}

/**
 * Dependency-tracking read. Pulls the sender up to date, registers it
 * as a dependency, and returns its value.
 * @throws
 * @template T
 * @this {Receiver}
 * @param {Sender<T>} sender
 * @returns {T}
 */
function val(sender) {
	let flag = this._flag;
	let state = sender._flag;
	if (state & FLAG_DISPOSED || sender === /** @type {Sender} */(this)) {
		throw new Error(ILLEGAL_READ);
	}
	if (flag & (FLAG_LOADING | FLAG_STABLE)) {
		if (flag & FLAG_LOADING) {
			return this._readAsync(sender, false);
		}
		/** Stable after setup: nothing to track, and a stable run never
		 *  stamps, so skip the stamp compare that would always miss. */
		if (!(flag & FLAG_SETUP)) {
			if (state & (FLAG_STALE | FLAG_PENDING)) {
				sender._refresh();
				state = sender._flag;
			}
			if (state & FLAG_ERROR) {
				throw sender._value;
			}
			return sender._value;
		}
	}
	/** Sync path: version-tagged dep tracking with VSTACK restore. */
	let version = STAMP;
	if (sender._stamp === version) {
		/** Already read this run: an errored sender throws on every read. */
		if (state & FLAG_ERROR) {
			throw sender._value;
		}
		return sender._value;
	}
	if (state & (FLAG_STALE | FLAG_PENDING)) {
		sender._refresh();
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
 * set() for Signal. When IDLE,
 * resolves updater functions, writes the value, notifies and
 * flushes. When not IDLE, schedules for drain. Updater functions
 * are resolved at drain time by assign() to see the latest value.
 * Inside a batch or a flush, set() queues behind the writes queued
 * before it, and the last write wins.
 *
 * A resource writes through ResourceProto.set instead.
 * @template T
 * @this {Sender<T>}
 * @param {T | (function(T): T)} value
 * @returns {boolean}
 */
function set(value) {
	if (IDLE) {
		/** @type {T} */
		let _value = resolveValue(this, value);
		let changed =
			this._flag & FLAG_MUTABLE ||
			this._value !== _value;
		if (changed) {
			this._value = _value;
			notify(this, FLAG_STALE);
			flush();
			return true;
		}
		return false;
	}
	if (
		typeof value === "function" ||
		this._flag & (FLAG_MUTABLE | FLAG_SCHEDULED) ||
		this._value !== value
	) {
		schedule(this, value, assign);
		return true;
	}
	return false;
}

/**
 * Resolves an updater against the sender's current value. A mutable
 * sender's updater may change the value in place and return nothing,
 * which keeps the current value, and still notifies.
 * @template T
 * @param {Sender<T>} node
 * @param {T | (function(T): T)} value
 * @returns {T}
 */
function resolveValue(node, value) {
	if (typeof value !== "function") {
		return value;
	}
	let next = value(node._value);
	return next === void 0 && node._flag & FLAG_MUTABLE ? node._value : next;
}

/**
 * Immediate write of a value: a contextual set() to a signal, or the
 * optimistic value of r.set(value, fn), made at idle. Writes and
 * notifies if the value changed. A failed resource counts as changed,
 * so a write always replaces the Defect. The caller flushes.
 * @template T
 * @param {Sender<T>} node
 * @param {T | (function(T): T)} value
 * @returns {boolean} whether subscribers were notified
 */
function writeValue(node, value) {
	value = resolveValue(node, value);
	let changed =
		node._flag & (FLAG_MUTABLE | FLAG_ERROR) ||
		node._value !== value;
	if (changed) {
		node._value = value;
		notify(node, FLAG_STALE);
	}
	return !!changed;
}

/**
 * Plain write to a resource, immediate or drained. Every plain write
 * supersedes the activation in flight, even one that is no longer
 * loading, such as a generator past its first yield: the new token
 * discards whatever the activation produces later, and a load's
 * controller is aborted. A write that ends a load, an error or a failed
 * save is a change by itself, whatever the value, so the waiters resume.
 * A plain write is not a guess: it is also the server's value from now.
 * In the drain it runs in queue order. The caller flushes. An updater
 * only comes from a contextual write, since r.set(fn) is async.
 * @template T
 * @param {AsyncSender<T>} node
 * @param {T | (function(T): T)} value
 * @returns {boolean} whether subscribers were notified
 */
function writeResource(node, value) {
	value = resolveValue(node, value);
	let flag = node._flag;
	let changed = flag & (FLAG_LOADING | FLAG_ERROR | FLAG_REJECTED) || node._value !== value;
	let time = ++node._time;
	abortLoad(node);
	node._svalue = value;
	node._stime = time;
	if (changed) {
		node._flag = flag & ~(FLAG_LOADING | FLAG_ERROR | FLAG_REJECTED);
		node._fault = null;
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
 * Aborts the controller of the load in flight, if it asked for one: a
 * newer activation or a plain write supersedes it. A save has no
 * controller, so a request it made is never aborted.
 * @param {AsyncSender} node
 * @returns {void}
 */
function abortLoad(node) {
	if (node._flag & FLAG_CHANNEL) {
		let chan = node._chan;
		if (chan._controller !== null) {
			chan._controller.abort();
			chan._controller = null;
		}
	}
}

/**
 * Starts a new activation of a resource, a load or a save: it clears
 * the state the last one left, aborts a load in flight and takes the
 * next activation number.
 * @param {AsyncSender} node
 * @returns {number} the state before
 */
function beginWrite(node) {
	let flag = node._flag;
	node._flag = flag & ~(FLAG_ERROR | FLAG_SUSPEND | FLAG_LOADING | FLAG_REJECTED);
	node._fault = null;
	abortLoad(node);
	node._time++;
	return flag;
}

/**
 * Runs a resource's loader now, or queues it while the engine is busy,
 * as an async write is queued.
 * @param {AsyncSender} node
 * @returns {void}
 */
function load(node) {
	if (IDLE) {
		runLoad(node);
	} else {
		schedule(node, null, runLoad);
	}
}

/**
 * Runs a resource's loader: a load, like a task's run. Increments
 * _time for LWW, so a newer activation drops it, and aborts the load
 * it replaces. Runs the loader, and dispatches on what it returns. A
 * sync result that supersedes an activation in flight settles even if
 * unchanged, so loading ends and the waiters resume, and one that is
 * void keeps the value the load started from (see startValue). What it
 * settles with is the server's value (see _settle).
 * @template T
 * @param {AsyncSender<T>} node
 */
function runLoad(node) {
	let prev = startValue(node);
	let flag = beginWrite(node);
	let time = node._time;
	let result;
	try {
		result = node._loader(node, prev);
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
		 *  What it delivered during the loader settles now. A plain write
		 *  made during the loader superseded the activation. */
		if (node._flag & FLAG_CALLBACK) {
			node._flag &= ~FLAG_CALLBACK;
			let i = findHeld(node);
			let fn;
			let held;
			if (i >= 0) {
				fn = HELD[i + 1];
				held = HELD[i + 2];
				dropHeld(i);
			}
			if (node._time === time) {
				if (i < 0) {
					startLoading(node, flag);
				} else if (fn === null) {
					node._error(held);
				} else {
					node._settle(held);
				}
			}
		}
		return;
	}
	if (startAsync(node, result, time)) {
		startLoading(node, flag);
		return;
	}
	settleWrite(node, result === void 0 ? prev : result, flag);
}

/**
 * Settles the current activation of a sync load or save with `value`,
 * which the server confirmed. It settles only if the value or the state
 * changes; otherwise it only confirms the server's value.
 * @param {AsyncSender} node
 * @param {*} value
 * @param {number} flag - the resource's state before the activation
 * @returns {void}
 */
function settleWrite(node, value, flag) {
	if (flag & (FLAG_LOADING | FLAG_ERROR | FLAG_REJECTED) || node._value !== value) {
		node._settle(value);
	} else {
		node._svalue = value;
		node._stime = node._time;
	}
}

/**
 * Runs a save: r.set(fn), r.set(value, fn) or c.set(r, value, fn). A
 * save runs to completion. A newer activation doesn't drop it, since
 * the server may have applied it already: it only stops it from
 * settling the value (see settleSave). It gets its own context (Save),
 * which has no controller. An async iterable is a stream rather than a
 * save, and settles value by value while current, as a load's does.
 * @template T
 * @param {AsyncSender<T>} node
 * @param {function(Save, T): *} fn
 * @param {T} prev - the value the save wrote, or the current one
 * @returns {void}
 */
function runSave(node, fn, prev) {
	let flag = beginWrite(node);
	let save = new Save(node, node._time, prev);
	let result;
	try {
		result = fn(save, prev);
	} catch (err) {
		/** What a callback delivers later is ignored: the save failed. */
		save._flag = FLAG_ERROR;
		save._value = err;
		settleSave(node, save, flag);
		return;
	}
	save._flag &= ~FLAG_CALLBACK;
	/** A plain write made during the fn superseded the save: it still
	 *  runs to completion, but the resource isn't loading for it. */
	let current = node._time === save._time;
	if (save._flag & FLAG_SUSPEND) {
		if (!(save._flag & FLAG_LOADING)) {
			settleSave(node, save, flag);
		} else if (current) {
			startLoading(node, flag);
		}
		return;
	}
	if (result !== null && typeof result === "object") {
		if (typeof result.then === "function") {
			if (current) {
				startLoading(node, flag);
			}
			save._flag |= FLAG_LOADING;
			result.then(
				function (val) {
					deliverSave(save, val, false);
				},
				function (err) {
					deliverSave(save, err, true);
				}
			);
			return;
		}
		if (typeof result[Symbol.asyncIterator] === "function") {
			if (current) {
				startLoading(node, flag);
			}
			resolveIterator(node, result[Symbol.asyncIterator](), save._time);
			return;
		}
	}
	if (result !== void 0) {
		save._value = result;
	}
	settleSave(node, save, flag);
}

/**
 * What a save's promise or callback delivered, once. Nothing keeps the
 * value it wrote. While the fn runs the delivery waits for it to return;
 * after, it settles now at idle, as settleIdle() does, or in the drain.
 * @param {Save} save
 * @param {*} value
 * @param {boolean} failed
 * @returns {void}
 */
function deliverSave(save, value, failed) {
	let flag = save._flag;
	if (!(flag & FLAG_LOADING)) {
		return;
	}
	save._flag = (flag & ~FLAG_LOADING) | (failed ? FLAG_ERROR : 0);
	if (failed || value !== void 0) {
		save._value = value;
	}
	if (flag & FLAG_CALLBACK) {
		return;
	}
	let node = save._node;
	if (IDLE) {
		NESTED = true;
		try {
			settleSave(node, save, 0);
		} finally {
			NESTED = false;
		}
		if (PENDING !== null) {
			flush();
		}
	} else {
		postSettle(node, save, saveLater);
	}
}

/**
 * Drain handler for a queued save delivery.
 * @param {AsyncSender} node
 * @param {Save} save
 * @returns {void}
 */
function saveLater(node, save) {
	settleSave(node, save, 0);
}

/**
 * Settles one save, the newest or not, with what it delivered. A save
 * that succeeds confirms that as the server's value, unless a later
 * activation confirmed one already. The newest save also settles the
 * value. An older one moves the value only when nothing newer is in
 * flight, which means the newer write failed. The newest save that
 * fails falls back to the server's value (revert); an older one that
 * fails changes nothing.
 * @param {AsyncSender} node
 * @param {Save} save
 * @param {number} flag - the resource's state before a sync save; 0
 *  once it went async, as the resource is loading for it then
 * @returns {void}
 */
function settleSave(node, save, flag) {
	let time = save._time;
	let value = save._value;
	if (save._flag & FLAG_ERROR) {
		if (node._time === time) {
			revert(node, value);
		}
	} else if (node._time === time) {
		settleWrite(node, value, node._flag | flag);
	} else if (time > node._stime) {
		node._svalue = value;
		node._stime = time;
		if (!(node._flag & FLAG_LOADING)) {
			adopt(node, value);
		}
	}
}

/**
 * The newest save failed: the value falls back to the server's value,
 * and the error is kept for c.rejected() and is(ERROR) until the next
 * write. Readers were told the save started, so they run again.
 * @param {AsyncSender} node
 * @param {*} err
 * @returns {void}
 */
function revert(node, err) {
	node._flag = (node._flag & ~(FLAG_LOADING | FLAG_ERROR)) | FLAG_REJECTED;
	node._fault = defect(err);
	node._value = node._svalue;
	if (node._flag & FLAG_WAITER) {
		settleNotify(node, false);
	} else {
		notify(node, FLAG_STALE);
	}
	flush();
}

/**
 * An older save confirmed a value after the newer write failed, and
 * nothing newer is in flight: the value follows the server's.
 * @param {AsyncSender} node
 * @param {*} value
 * @returns {void}
 */
function adopt(node, value) {
	node._flag &= ~(FLAG_ERROR | FLAG_REJECTED);
	node._fault = null;
	node._value = value;
	notify(node, FLAG_STALE);
	flush();
}

/**
 * A load or a save goes async: the resource is loading until the newest
 * activation settles. Its readers are told, so that a reader of
 * c.pending() or c.rejected() sees it. They can't be told apart from
 * the readers of its value, which run again too and read the value it
 * had. Already loading, its readers know.
 * @param {AsyncSender} node
 * @param {number} flag - the state before the activation
 * @returns {void}
 */
function startLoading(node, flag) {
	node._flag |= FLAG_LOADING;
	if (!(flag & FLAG_LOADING)) {
		notify(node, FLAG_STALE);
		flush();
	}
}

/**
 * What a resource holds as its value for a load or a save to start
 * from: after a failed load, the value is the Defect, and the server's
 * value stands in for it.
 * @template T
 * @param {AsyncSender<T>} node
 * @returns {T}
 */
function startValue(node) {
	return node._flag & FLAG_ERROR ? node._svalue : node._value;
}

/**
 * Batch-drain handler for signals, and for the optimistic value of a
 * resource's async write. Resolves updater functions against the
 * current value at drain time, compares, and only writes + notifies
 * if the value actually changed.
 * @template T
 * @param {Sender<T>} node
 * @param {T | (function(T): T)} value
 * @returns {void}
 */
function assign(node, value) {
	let _value = resolveValue(node, value);
	/** An errored resource (asyncAssign) counts as changed, so a write
	 *  always replaces the Defect. */
	if (node._flag & (FLAG_MUTABLE | FLAG_ERROR) || node._value !== _value) {
		node._value = _value;
		poke(node);
	}
}

/**
 * Batch-drain handler for resource async writes. Resolves the
 * optimistic value like assign(), then kicks off the async work
 * with the resolved value as prev.
 * @template T
 * @param {AsyncSender<T>} node
 * @param {{ _value: T, _fn: (function(AsyncSender<T>, T): (T | Promise<T>)) }} payload
 */
function asyncAssign(node, payload) {
	assign(node, payload._value);
	runSave(node, payload._fn, node._value);
}

/**
 * Batch-drain handler for the single-argument resource form,
 * set(asyncFn). Writes no value of its own: runs
 * the callback against the value at drain time, so it sees every
 * write queued before it.
 * @template T
 * @param {AsyncSender<T>} node
 * @param {function(AsyncSender<T>, T): (T | Promise<T>)} fn
 */
function asyncRun(node, fn) {
	runSave(node, fn, startValue(node));
}

/**
 * Drain handler for a weak compute that lost its last reader in a
 * transaction (see ComputeProto._drop): runs its cleanups, unless it was
 * read again in the meantime, which ran them already.
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
		unwrap(clearCleanup(node));
	}
}

/**
 * Marks a node stale, as notify() marks a subscriber, and wakes it if
 * nothing had yet. Disposed, paused and locked nodes are marked but
 * not woken, as there. The drain handler for a queued refresh().
 * @param {Compute | Effect} node
 * @returns {void}
 */
function markStale(node) {
	let flag = node._flag;
	node._flag = flag | FLAG_STALE;
	if (!(flag & (FLAG_PENDING | FLAG_STALE | FLAG_DISPOSED | FLAG_SHIELD | FLAG_PAUSED))) {
		node._receive();
	}
}

/**
 * Batch-drain handler for notify(). No value write — just clears
 * FLAG_SCHEDULED and notifies subscribers.
 * @template T
 * @param {Sender<T>} node
 */
function poke(node) {
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
	postSettle(node, payload, fn);
}

/**
 * Queues a write to a resource: an async write with an optimistic
 * value, an async fn alone, or a plain value.
 * @template T
 * @param {AsyncSender<T>} node
 * @param {T | (function(AsyncSender<T>, T): (T | Promise<T>))} value
 * @param {(function(AsyncSender<T>, T): (T | Promise<T>))=} asyncFn
 * @returns {void}
 */
function scheduleResource(node, value, asyncFn) {
	if (asyncFn !== void 0) {
		schedule(node, { _value: value, _fn: asyncFn }, asyncAssign);
	} else {
		schedule(node, value, typeof value === "function" ? asyncRun : writeResource);
	}
}

/**
 * Registers a dependency link from sender -> this (the tracking node).
 * Called from val(), rejected() and track() only for non-reuse cases
 * (new dep or conflict). The common reuse case (stamp === STAMP - 1)
 * is handled inline by the caller.
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
		/** Setup path: first run, push deps to DSTACK. They are connected
		 *  after the run, once each pair's index in _deps is known. */
		if (this._dep1 === null) {
			this._dep1 = sender;
			this._dep1slot = connect(sender, this, -1);
		} else {
			DSTACK[DCOUNT++] = sender;
			DSTACK[DCOUNT++] = 0;
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
	if ((this._flag & (FLAG_STABLE | FLAG_SETUP)) !== FLAG_STABLE) {
		subscribe(this, sender);
	}
	if (!safe && sender._flag & FLAG_ERROR) {
		throw sender._value;
	}
	return sender._value;
}

/**
 * Creates a signal. A write notifies when the value is not `===` the
 * current one. Passing `false` skips the check, so every write
 * notifies — for objects mutated in place, where an updater may return
 * void to keep the current value. Anything else is ignored.
 * @template T
 * @param {T} value
 * @param {boolean=} mutable
 * @returns {Signal<T>}
 */
function signal(value, mutable) {
	let node = new Signal(value);
	if (mutable === false) {
		node._flag = FLAG_MUTABLE;
	}
	return node;
}

/**
 * Creates an async-capable signal, seeded with `value`. A loader, if
 * given, loads it at once and again on each refresh(), as a task's fn
 * would. With DEFER, the seed is the server's value until the first
 * refresh(), as a deferred compute waits for its first read. Supports
 * optimistic writes with background async work via `set(value,
 * asyncFn)`. Anything but a function as loader is ignored, and so is
 * any option but DEFER.
 * @template T
 * @param {T} value
 * @param {(function(AsyncSender<T>, T): *)=} loader
 * @param {number=} opts
 * @returns {Resource<T>}
 */
function resource(value, loader, opts) {
	let node = new Resource(
		value,
		FLAG_ASYNC | ((0 | opts) & FLAG_DEFER),
		typeof loader === "function" ? loader : null
	);
	if (node._loader !== null && !(node._flag & FLAG_DEFER)) {
		load(node);
	}
	return node;
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
	let ResourceProto = Resource.prototype;
	/** @const */
	let ComputeProto = Compute.prototype;
	/** @const */
	let EffectProto = Effect.prototype;
	/** @const */
	let ActionProto = Action.prototype;

	RootProto._owner = null;
	RootProto._level = -1;
	/** A root has no run to finalize: read by clearRun(). */
	RootProto._finalize = null;

	SignalProto._ctime = 0;

	/**
	 * Read on disposal to find the owner to compact. An owned compute
	 * keeps no reference back to its owner.
	 */
	ComputeProto._owner = null;

	/**
	 * The Effect fields an Action does not have, for the shared paths
	 * that read them: a failed run and recovery.
	 */
	ActionProto._owned =
		ActionProto._recover =
		ActionProto._finalize =
		null;

	/**
	 * Classifies what an async run rejected with, for _error(): a value
	 * for a resource or a compute, a failed run for an effect.
	 */
	ResourceProto._wrap = ComputeProto._wrap = defect;
	EffectProto._wrap = failure;

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
		this._value = void 0;
		if (this._cleanup !== null) {
			if (IDLE) {
				unwrap(clearCleanup(this));
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
		ActionProto.dispose =
		dispose;

	// Receiver#_read — internal dep tracking, called from val(), rejected() and track()
	ComputeProto._read = EffectProto._read = ActionProto._read = _read;

	ComputeProto._readAsync = EffectProto._readAsync = _readAsync;

	/**
	 * Whether the node has any of the bits in `flag` set: a creation option
	 * (STABLE, EAGER, WEAK, DEFER) or a state (DISPOSED, LOADING,
	 * ERROR). Any other bit reads as unset.
	 * @this {Disposer}
	 * @param {number} flag
	 * @returns {boolean}
	 */
	function is(flag) {
		return (this._flag & flag & PUBLIC) !== 0;
	}

	SignalProto.is = RootProto.is = ComputeProto.is = EffectProto.is = ActionProto.is = is;

	/**
	 * is() for a resource: a failed save is ERROR too, though the value
	 * fell back to the server's and reading it doesn't throw.
	 * @this {Resource}
	 * @param {number} flag
	 * @returns {boolean}
	 */
	ResourceProto.is = function (flag) {
		let state = this._flag;
		if (state & FLAG_REJECTED) {
			state |= FLAG_ERROR;
		}
		return (state & flag & PUBLIC) !== 0;
	};

	/**
	 * Runs the resource's loader again, to get the server's value. A
	 * resource without a loader ignores it. While the engine is busy,
	 * it is queued, as a write is.
	 * @this {Resource}
	 * @returns {void}
	 */
	ResourceProto.refresh = function () {
		if (this._loader !== null) {
			load(this);
		}
	};

	/** @const */
	let SaveProto = Save.prototype;

	/**
	 * suspend() in a save. A promise is returned as it is: a save runs to
	 * completion, so there is nothing to guard. The callback form settles
	 * the save when resolve or reject is called, once; a call made while
	 * the fn runs is held until it returns.
	 * @this {Save}
	 * @param {Promise<*> | function(function(*): void, function(*): void): void} promiseOrFn
	 * @returns {Promise<*> | void}
	 */
	SaveProto.suspend = function (promiseOrFn) {
		if (typeof promiseOrFn !== "function") {
			return promiseOrFn;
		}
		if (this._flag & FLAG_SUSPEND) {
			throw new Error(SUSPEND_TWICE);
		}
		this._flag |= FLAG_SUSPEND | FLAG_LOADING;
		let save = this;
		promiseOrFn(
			function (val) {
				deliverSave(save, val, false);
			},
			function (err) {
				deliverSave(save, err, true);
			}
		);
	};

	/**
	 * The save's activation number, as version() gives a load's.
	 * @this {Save}
	 * @returns {number}
	 */
	SaveProto.version = function () {
		return this._time;
	};

	/**
	 * Registers a cleanup fn on this owner. Stored compactly: _cleanup holds
	 * a single fn for count=1, graduating to an array on the second.
	 * @this {Owner}
	 * @param {function(): void} fn
	 * @returns {void}
	 */
	function cleanup(fn) {
		this._cleanup = append(this._cleanup, fn);
	}

	/**
	 * Registers a recover handler on this owner. A handler that returns
	 * has handled the error; one that throws passes what it throws on.
	 * @this {Owner}
	 * @param {function(Defect): void} fn
	 * @returns {void}
	 */
	function recover(fn) {
		this._recover = append(this._recover, fn);
	}

	/**
	 * Marks the node's output semantically equal (or not) to its previous
	 * value. Only a compute has it.
	 * @this {Compute}
	 * @param {boolean=} eq
	 * @returns {void}
	 */
	function equal(eq) {
		this._flag =
			(this._flag & ~(FLAG_EQUAL | FLAG_MUTABLE)) |
			(eq === false ? FLAG_MUTABLE : FLAG_EQUAL);
	}

	/** cleanup on Root, Effect and Compute; recover on Root and Effect. */
	RootProto.cleanup = EffectProto.cleanup = ComputeProto.cleanup = cleanup;
	RootProto.recover = EffectProto.recover = recover;

	/**
	 * Registers a finalize callback that runs immediately when this
	 * activation completes, regardless of error. Effect-level `finally`.
	 * @this {Effect}
	 * @param {function(): void} fn
	 */
	EffectProto.finalize = function (fn) {
		this._finalize = append(this._finalize, fn);
	};

	ComputeProto.equal = equal;

	/**
	 * Signals an expected error from a compute. Returns a REFUSE Defect
	 * for the fn to return, and flags the node, so that _update stores
	 * it as the compute's error without hitting the catch path. A task
	 * is flagged FLAG_REFUSE instead, which becomes FLAG_ERROR when the
	 * activation settles: until then the task still holds its previous
	 * value. Given a Defect, it keeps it rather than wrapping it again.
	 * @template T
	 * @this {Compute<T>}
	 * @param {T} val
	 * @returns {Defect}
	 */
	ComputeProto.refuse = function (val) {
		this._flag |= this._flag & FLAG_ASYNC ? FLAG_REFUSE : FLAG_ERROR;
		return val instanceof Defect ? val : new Defect(val, REFUSE);
	};

	/**
	 * Fails the run with a PANIC, which every catch passes on unchanged,
	 * in this run or after an await. A REFUSE given to it becomes a
	 * PANIC with the same error.
	 * @this {Receiver | Owner}
	 * @param {*} val
	 * @returns {void}
	 */
	ComputeProto.panic = EffectProto.panic = RootProto.panic = ActionProto.panic = function (val) {
		throw failure(val);
	};

	/**
	 * Ends this owner's tree, at once: no handler is asked, and nothing
	 * in it runs again. The flush disposes it and throws a Fatal once it
	 * ends: at idle, outside anod, that is now, so the caller gets the
	 * Fatal. Otherwise FATAL is thrown, to stop the code that runs, and the
	 * running flush, or the caller that set NESTED, flushes once it is
	 * done. Given a Defect, it
	 * escalates its error.
	 * @this {Owner}
	 * @param {*} val
	 * @returns {void}
	 */
	EffectProto.fatal = RootProto.fatal = function (val) {
		killTree(this, val instanceof Defect ? val.error : val);
		if (IDLE && !NESTED) {
			flush();
		}
		throw FATAL;
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
					(child._flag & (FLAG_PAUSED | FLAG_DISPOSED)) === FLAG_PAUSED &&
					(child._flag & FLAG_OWNER || child instanceof Action)
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
		if (!(this._flag & FLAG_PAUSED) || (SHIELDS.length > 0 && isFrozen(this))) {
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
	 * Awaits a promise, a task, an array of them, or a callback source.
	 * Routes by input:
	 *
	 * - With onResolve: the callback form (suspendTo).
	 * - A function: the callback constructor, settled by its resolve or
	 *   reject.
	 * - A thenable: a promise guarded against staleness (below).
	 * - An array: a concurrent await (_suspendArray).
	 * - A node: a task await (_suspendTask).
	 * - Anything else: returned as it is, as `await value` would.
	 *
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
		if (onResolve !== void 0) {
			suspendTo(this, promiseOrTask, onResolve, onReject === void 0 ? null : onReject);
			return;
		}
		if (typeof promiseOrTask === "function") {
			suspendWith(this, promiseOrTask);
			return;
		}
		/** In a step's callback, an await is the callback's own: the
		 *  promise it returns is adopted, so it isn't the step's suspend. */
		if (STEP !== this) {
			this._flag |= FLAG_SUSPEND;
		}
		if (promiseOrTask === null || typeof promiseOrTask !== "object") {
			return promiseOrTask;
		}
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
					if (isLive(node, time)) {
						return val;
					}
					return REGRET;
				},
				/** @param {*} error */
				function (error) {
					if (isLive(node, time)) {
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
		/** A plain value is its own result, as `await value` is. */
		if (promiseOrTask._flag === void 0) {
			return promiseOrTask;
		}
		/** Any other node is awaited as a task. */
		return _suspendTask(this, /** @type {AsyncSender<T>} */(promiseOrTask));
	}

	/**
	 * Awaits a task, or any other node. Three paths:
	 *
	 * **Fast-path** (task already settled): subscribes as a dep and returns
	 * the raw value immediately. `await nonThenable` costs one microtask.
	 *
	 * **Slow-path** (task is loading): creates a two-way binding between
	 * this node and the task (see send()). Returns a Promise
	 * that resolves when the task settles. At settle time, the task also
	 * subscribes the awaiter as a dep for future reactive updates.
	 *
	 * **Callbacks** (task is loading, resolve given): send() binds the
	 * callbacks themselves as the waiter, and REGRET is returned.
	 * @template T
	 * @param {AsyncReceiver} node
	 * @param {AsyncSender<T>} taskNode
	 * @param {function(*): *=} resolve
	 * @param {(function(*): *) | null=} reject
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
		if (resolve !== void 0) {
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
				if (isLive(node, time)) {
					return val;
				}
				return REGRET;
			},
			/** @param {*} error */
			function (error) {
				if (isLive(node, time)) {
					throw error;
				}
				return REGRET;
			}
		);
	}

	/**
	 * Awaits an array of tasks, promises and plain values, allocating
	 * one Promise at most. Settled members are collected synchronously.
	 * At the first loading one, waitArray binds a waiter to it, and
	 * each wake-up rescans the whole array from the start.
	 *
	 * FLAG_BLOCKED keeps settleNotify from subscribing or waking the
	 * awaiter during the walk, and makes deliver() call the re-scan
	 * directly. Once every member has settled, or one fails, the
	 * awaiter subscribes to every member in one pass, and the await
	 * resolves or rejects.
	 *
	 * With callbacks, they receive the snapshot and no Promise is made.
	 *
	 * @param {AsyncReceiver} node
	 * @param {Array<AsyncSender | IThenable | *>} tasks
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
		/** Promises and plain values are waited on as resources. */
		tasks = toSenders(tasks);
		/** Fast path: collect everything synchronously. A failing member
		 *  throws, after subscribing like a single task. */
		let sync = !(node._flag & FLAG_LOADING);
		let blocked;
		try {
			blocked = scanArray(node, tasks, results);
		} catch (error) {
			subscribeArray(node, tasks, sync);
			throw error;
		}
		if (blocked === -1) {
			subscribeArray(node, tasks, sync);
			return results;
		}
		node._flag |= FLAG_BLOCKED;
		if (resolve !== void 0) {
			node._flag |= callbackFlags(node) | FLAG_RELAY;
			waitArray(node, tasks, results, blocked, resolve, reject);
			return REGRET;
		}
		/** At least one is loading: allocate one Promise. */
		return guardAwait(node, new Promise(function (resolve, reject) {
			waitArray(node, tasks, results, blocked, resolve, reject);
		}));
	}

	/**
	 * One scan of an array await: collects the settled members into
	 * results, in order, and stops at the first loading one. A member
	 * that rejected, was disposed, is the node itself, or would close an
	 * await cycle throws.
	 * @param {AsyncReceiver} node
	 * @param {Array<AsyncSender>} tasks
	 * @param {Array} results
	 * @returns {number} the index of the first loading member, or -1
	 */
	function scanArray(node, tasks, results) {
		let count = tasks.length;
		for (let i = 0; i < count; i++) {
			let task = tasks[i];
			if (task._flag & FLAG_DISPOSED || task === node) {
				throw new Error(ILLEGAL_READ);
			}
			if (task._flag & (FLAG_STALE | FLAG_PENDING)) {
				task._refresh();
			}
			if (task._flag & FLAG_LOADING) {
				if (awaits(task, node)) {
					throw new Error(CYCLE);
				}
				return i;
			}
			if (task._flag & FLAG_ERROR) {
				throw task._value;
			}
			results[i] = task._value;
		}
		return -1;
	}

	/**
	 * Rescans an array await when a member it waited on settles. Only a
	 * full scan that finds nothing loading resolves it, so the values
	 * are a consistent snapshot, as c.pending() would see them; a member
	 * that rejected, or was disposed, fails it. Either way the awaiter
	 * subscribes to every member first.
	 * @param {AsyncReceiver} node
	 * @param {Array<AsyncSender>} tasks
	 * @param {Array} results
	 * @param {function(Array): void} resolve
	 * @param {function(*): void} reject
	 * @returns {void}
	 */
	function stepArray(node, tasks, results, resolve, reject) {
		let blocked;
		try {
			blocked = scanArray(node, tasks, results);
		} catch (error) {
			node._flag &= ~FLAG_BLOCKED;
			subscribeArray(node, tasks, false);
			deliver(node, reject, error, true);
			return;
		}
		if (blocked === -1) {
			node._flag &= ~FLAG_BLOCKED;
			subscribeArray(node, tasks, false);
			deliver(node, resolve, results, false);
			return;
		}
		waitArray(node, tasks, results, blocked, resolve, reject);
	}

	/**
	 * Waits on the first loading member of an array await. The members
	 * after it are refreshed, so they are current, and the waiter
	 * rescans from the start when the member settles, rejects or is
	 * disposed: a member that had settled may be loading again.
	 * @param {AsyncReceiver} node
	 * @param {Array<AsyncSender>} tasks
	 * @param {Array} results
	 * @param {number} blocked
	 * @param {function(Array): void} resolve
	 * @param {function(*): void} reject
	 * @returns {void}
	 */
	function waitArray(node, tasks, results, blocked, resolve, reject) {
		let count = tasks.length;
		for (let i = blocked + 1; i < count; i++) {
			let task = tasks[i];
			if (task._flag & (FLAG_STALE | FLAG_PENDING)) {
				task._refresh();
			}
		}
		let step = function () {
			stepArray(node, tasks, results, resolve, reject);
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
	 *
	 * A callback continues the run (see runStep): a suspend made inside
	 * it is the next step, and a promise it returns is adopted. A promise
	 * or a plain value is waited on as a resource (see toSender).
	 * @param {AsyncReceiver} node
	 * @param {*} input
	 * @param {function(*): *} onResolve
	 * @param {(function(*): *) | null} onReject
	 * @returns {void}
	 */
	function suspendTo(node, input, onResolve, onReject) {
		/** Throws after another callback suspend in this run or step,
		 *  after an await, or once the run is over: only the fn and a
		 *  step's callback may suspend with callbacks. */
		let flag = node._flag;
		if (
			flag & FLAG_SUSPEND
				? flag & (FLAG_LOADING | FLAG_CALLBACK)
				: flag & FLAG_LOADING && STEP !== node
		) {
			throw new Error(SUSPEND_TWICE);
		}
		let value;
		let failed = false;
		try {
			if (Array.isArray(input)) {
				value = _suspendArray(node, input, onResolve, onReject);
			} else {
				if (input === null || typeof input !== "object" || input._flag === void 0) {
					input = toSender(input);
				}
				value = _suspendTask(node, /** @type {AsyncSender} */(input), onResolve, onReject);
			}
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
		/** Settled: the callback still waits for the fn or the step's
		 *  callback to return, as it would for a loading task, so the
		 *  code after c.suspend() runs first either way. */
		node._flag |= FLAG_SUSPEND | FLAG_CALLBACK;
		hold(node, failed ? onReject : onResolve, value);
	}

	ComputeProto.suspend = EffectProto.suspend = suspend;

	/**
	 * Shields the current activation: it runs to completion (D10). Its
	 * re-run or disposal, and those of every owner above it, wait until
	 * it ends; only dispose(true) ends it early.
	 * @this {Effect}
	 */
	EffectProto.shield = function () {
		let flag = this._flag;
		if ((flag & (FLAG_DISPOSED | FLAG_SHIELD)) === FLAG_DISPOSED) {
			return;
		}
		if (flag & FLAG_SHIELD && SHIELDS.indexOf(this) !== -1) {
			return;
		}
		SHIELDS.push(this);
		lockPath(this);
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

	/** A resource only uses the channel's _waiters: it is awaited, and never awaits. */
	ResourceProto._channel = ComputeProto._channel = EffectProto._channel = _channel;

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

	/** A resource's controller belongs to its load: a save has none. */
	ComputeProto.controller = EffectProto.controller = ResourceProto.controller = controller;

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
	 * errored task: checking errors is rejected()'s job. With no
	 * argument, checks what the node has read so far in its run.
	 *
	 * Usage: `if (c.pending([taskA, taskB])) return;`
	 *
	 * @this {Receiver}
	 * @param {(Sender | Array<Sender>)=} tasks
	 * @returns {boolean} true if any task has FLAG_LOADING set
	 */
	function pending(tasks) {
		if (tasks === void 0) {
			return depsLoading(this);
		}
		if (!Array.isArray(tasks)) {
			this.rejected(tasks);
			return (tasks._flag & FLAG_LOADING) !== 0;
		}
		let loading = false;
		let count = tasks.length;
		for (let i = 0; i < count; i++) {
			let task = tasks[i];
			this.rejected(task);
			if (task._flag & FLAG_LOADING) {
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
			if (sender._flag & (FLAG_STALE | FLAG_PENDING)) {
				sender._refresh();
			}
			track(this, sender);
		}
		let state = sender._flag;
		if (state & FLAG_ERROR) {
			return sender._value;
		}
		/** A resource whose newest save failed keeps a usable value. */
		if (state & FLAG_REJECTED) {
			return /** @type {Resource} */(sender)._fault;
		}
		return null;
	}

	ComputeProto.pending = EffectProto.pending = ActionProto.pending = pending;
	ComputeProto.rejected = EffectProto.rejected = ActionProto.rejected = rejected;

	/**
	 * Returns the current activation's sequence number. It grows with
	 * each re-run (it is the time of the flush that started the run), or
	 * with each write to a resource. Useful for attaching to requests for
	 * server-side ordering, or for manual staleness detection across
	 * async boundaries.
	 * @this {Receiver | Resource}
	 * @returns {number}
	 */
	ResourceProto.version = ComputeProto.version = EffectProto.version = function () {
		return this._time;
	};

	/**
	 * Resource-specific suspend. Only supports raw promises and the
	 * callback pattern. Resources are senders, not receivers — they
	 * cannot await tasks or other resources.
	 * @template T
	 * @this {Resource<T>}
	 * @param {Promise<T> | (function(Function, Function): ?)} promiseOrFn
	 * @returns {Promise<T> | void}
	 */
	ResourceProto.suspend = function (promiseOrFn) {
		if (typeof promiseOrFn === "function") {
			suspendWith(this, promiseOrFn);
			return;
		}
		/** A thenable is adopted first, since its then() need not
		 *  return a promise. A resource is never disposed, so isLive()
		 *  only compares the activation. */
		return guardAwait(this, Promise.resolve(promiseOrFn));
	};

	/**
	 * Settles an async resource. Clears FLAG_LOADING, writes value,
	 * resolves waiters, notifies the other subscribers, flushes.
	 * @template T
	 * @this {Resource<T>}
	 * @param {T} value
	 */
	ResourceProto._settle = function (value) {
		if (isHolding(this)) {
			hold(this, void 0, value);
			return;
		}
		let flag = this._flag;
		this._flag = flag & ~(FLAG_LOADING | FLAG_REJECTED);
		this._fault = null;
		this._value = value;
		/** A load, a stream or the newest save that succeeds confirms it. */
		if (!(flag & FLAG_ERROR)) {
			this._svalue = value;
			this._stime = this._time;
		}

		if (this._flag & FLAG_WAITER) {
			/** Notifies every subscriber that is not a resolved waiter. */
			settleNotify(this, false);
		} else {
			notify(this, FLAG_STALE);
		}
		flush();
	};

	/**
	 * Settles an async resource, compute or effect with an error. Wraps
	 * as PANIC unless anod created it, sets FLAG_ERROR, and delegates to
	 * _settle. A callback that rejects while the fn still runs is held,
	 * and _update throws it once the fn has returned, as a throw in the
	 * body would. An effect fails as its run would (see _wrap).
	 * @this {Resource | Compute | Effect}
	 * @param {*} err
	 */
	ResourceProto._error = ComputeProto._error = EffectProto._error = function (err) {
		if (isHolding(this)) {
			hold(this, null, err);
			return;
		}
		this._flag |= FLAG_ERROR;
		this._settle(this._wrap(err));
	};

	/**
	 * Disposes the root: its children first, then its cleanups. A locked
	 * root waits for the shields under it (D10).
	 * @this {Root}
	 * @returns {Defect | null} the teardown's error, if no handler took it
	 */
	RootProto._dispose = function () {
		if (this._flag & FLAG_SHIELD) {
			deferDispose(this);
			return null;
		}
		this._flag = FLAG_DISPOSED;
		let error = clearRun(this);
		this._owned = null;
		return error;
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
	 * Runs the node again, as if one of its dependencies had changed:
	 * for a value it derives from outside the graph, such as storage or
	 * a server, that the graph can't see change. notify() tells a node's
	 * readers that its value changed; refresh() asks the node itself to
	 * derive it again, and only its readers that see a new value run.
	 * A compute with no readers goes stale, and runs on its next read.
	 * While the engine is busy, the node's own run included, it is
	 * queued, as a write is.
	 * @this {Compute | Effect | Action}
	 * @returns {void}
	 */
	function refresh() {
		if (this._flag & FLAG_DISPOSED) {
			throw new Error(ILLEGAL_READ);
		}
		if (IDLE) {
			markStale(this);
			flush();
		} else {
			postSettle(this, null, markStale);
		}
	}

	ComputeProto.refresh = EffectProto.refresh = ActionProto.refresh = refresh;

	/**
	 * set for Resource. Besides a plain write, it takes the async
	 * forms: r.set(fn) runs fn
	 * as (c, current) with no value of its own, and r.set(value, fn)
	 * writes value optimistically, then runs fn with the resource as
	 * context and the optimistic value as prev, before the flush. A
	 * plain write goes through writeResource(), which supersedes the
	 * activation in flight, so it is queued even when unchanged.
	 * @template T
	 * @this {Resource<T>}
	 * @param {T | (function(T): T)} value
	 * @param {(function(AsyncSender<T>, T): (T | Promise<T>))=} asyncFn
	 * @returns {boolean}
	 */
	ResourceProto.set = function (value, asyncFn) {
		if (!IDLE) {
			scheduleResource(this, value, asyncFn);
			return true;
		}
		if (asyncFn !== void 0) {
			let changed = writeValue(this, value);
			/** Starts the activation before flushing, so that subscribers
			 *  see the optimistic value as loading. */
			runSave(this, asyncFn, this._value);
			if (changed) {
				flush();
			}
			return true;
		}
		if (typeof value === "function") {
			runSave(this, value, startValue(this));
			return true;
		}
		if (writeResource(this, value)) {
			flush();
			return true;
		}
		return false;
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
	 * Drain handler for a contextual set. Wraps assign() (for a
	 * resource, asyncAssign() or writeResource()) with FLAG_PAUSED on the
	 * receiver so that notifications propagating from this write are
	 * ignored by the receiver that initiated the write. The write skips
	 * the receiver, so FLAG_SCHEDULED stays armed for the sender: a later
	 * write to it in the same drain still notifies the receiver.
	 * @template T
	 * @param {Sender<T>} node
	 * @param {{ _value: T, _fn: (function(AsyncSender<T>, T): (T | Promise<T>)) | undefined, _recv: Receiver }} payload
	 */
	function guardedAssign(node, payload) {
		let receiver = payload._recv;
		let flag = receiver._flag;
		let scheduled = node._flag & FLAG_SCHEDULED;
		receiver._flag = flag | FLAG_PAUSED;
		try {
			if (payload._fn !== void 0) {
				asyncAssign(/** @type {AsyncSender<T>} */(node), payload);
			} else if (node._flag & FLAG_ASYNC) {
				writeResource(/** @type {AsyncSender<T>} */(node), payload._value);
			} else {
				assign(node, payload._value);
			}
		} finally {
			unguard(receiver, flag);
			node._flag |= scheduled;
		}
	}

	/**
	 * Queues a contextual write, for guardedAssign() to make at drain
	 * time. A signal ignores asyncFn.
	 * @template T
	 * @param {Receiver} receiver
	 * @param {Sender<T> | AsyncSender<T>} sender
	 * @param {(function(T): T) | T} value
	 * @param {function(AsyncSender<T>, T): (T | Promise<T>)=} asyncFn
	 * @returns {void}
	 */
	function scheduleGuarded(receiver, sender, value, asyncFn) {
		schedule(
			sender,
			{ _recv: receiver, _value: value, _fn: sender._flag & FLAG_ASYNC ? asyncFn : void 0 },
			guardedAssign
		);
	}

	/**
	 * Contextual set — writes to a sender while pausing this receiver
	 * so it ignores any notifications that propagate from the write.
	 * When IDLE (e.g. inside an async continuation after await), it
	 * writes at once as sender.set() would, and the receiver stays
	 * paused until the async write has started, as in guardedAssign().
	 * A signal ignores asyncFn.
	 * @throws
	 * @template T
	 * @this {Receiver}
	 * @param {Sender<T> | AsyncSender<T>} sender
	 * @param {(function(T): T) | T} value
	 * @param {function(AsyncSender<T>, T): (T | Promise<T>)=} asyncFn
	 * @returns {void}
	 */
	function contextSet(sender, value, asyncFn) {
		if (!IDLE) {
			scheduleGuarded(this, sender, value, asyncFn);
			return;
		}
		let flag = this._flag;
		let changed;
		this._flag = flag | FLAG_PAUSED;
		try {
			if (!(sender._flag & FLAG_ASYNC)) {
				changed = writeValue(sender, value);
			} else if (asyncFn === void 0) {
				changed = writeResource(/** @type {AsyncSender<T>} */(sender), value);
			} else {
				changed = writeValue(sender, value);
				runSave(/** @type {AsyncSender<T>} */(sender), asyncFn, sender._value);
			}
		} finally {
			release(this, flag);
		}
		if (changed) {
			flush();
		}
	}

	ComputeProto.set = contextSet;

	/**
	 * Brings the compute up to date before a read: re-runs it if stale,
	 * or checks its deps if pending.
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
	 * deferred dep changed. Settling always completes the activation;
	 * only the subscriber notification depends on the value having
	 * changed, which c.equal() decides as in the sync tail of _update.
	 * Handles both value and error: when FLAG_ERROR is set before
	 * calling, or the activation called c.refuse(), the value is
	 * treated as an error.
	 * @template T
	 * @this {Compute}
	 * @param {T} value
	 */
	ComputeProto._settle = function (value) {
		if (isHolding(this)) {
			hold(this, void 0, value);
			return;
		}
		let flag = this._flag;
		if (flag & FLAG_REFUSE) {
			flag = (flag | FLAG_ERROR) & ~FLAG_REFUSE;
		}
		this._flag = flag & ~FLAG_LOADING;

		/** A disposed task never settles. */
		if (flag & FLAG_DISPOSED) {
			return;
		}

		/** A new value is stored even when c.equal(true) says it is no
		 *  change, as in the sync tail. A settle that ends loading is a
		 *  change whatever the value: its readers were told it started
		 *  (startedLoading), and a reader of c.pending() must see it end. */
		let changed =
			flag & (FLAG_ERROR | FLAG_LOADING)
				? true
				: value !== this._value
					? !(flag & FLAG_EQUAL)
					: !!(flag & FLAG_MUTABLE);
		this._value = value;

		/** Called through settleHeld() with what the callback delivered
		 *  while the fn ran (FLAG_CALLBACK without FLAG_SUSPEND). Only
		 *  write the value, as part of that run (its _time); settleHeld()
		 *  finishes the settle. */
		if (flag & FLAG_CALLBACK) {
			if (changed) {
				this._ctime = this._time;
			}
			return;
		}
		/** Outside a drain, the flush() below starts the pass at TIME + 1.
		 *  Inside one (a queued settle), that flush() returns at once, and
		 *  the readers re-run in the current pass, at TIME. */
		if (changed) {
			this._ctime = FLUSHING ? TIME : TIME + 1;
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

	/**
	 * @this {Compute}
	 * @returns {Defect | null} a cleanup's error
	 */
	ComputeProto._dispose = function () {
		let flag = this._flag;
		this._flag = FLAG_DISPOSED;
		clearSubs(this);
		clearDeps(this);
		if (flag & FLAG_CHANNEL) {
			resetChannel(this);
			/** Reject any nodes awaiting this task. */
			let chan = this._chan;
			if (chan._waiters !== null) {
				rejectWaiters(this, chan, new Defect(new Error("Awaited task was disposed"), PANIC));
			}
		}
		let error = this._cleanup !== null ? clearCleanup(this) : null;
		this._fn = this._value = this._args = this._chan = null;
		return error;
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
				FLAG_MUTABLE |
				FLAG_SUSPEND |
				FLAG_REFUSE
			);

		/** Reset channel state from previous activation. Handles both
		 *  async nodes and sync nodes using controller/callback suspend.
		 *  The controller is aborted before the cleanups run. */
		if (flag & FLAG_CHANNEL) {
			resetChannel(this);
		}

		let value;
		let args = this._args;

		/** A new node has no cleanups, so its first run skips them too. A
		 *  cleanup that throws fails the run before the fn is called, and
		 *  the deps are kept, so the next change runs it again. */
		if (this._cleanup !== null && (value = clearCleanup(this)) !== null) {
			this._flag |= FLAG_ERROR;
		} else if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
			try {
				if (flag & FLAG_BOUND) {
					let dep = this._dep1;
					if (dep._flag & (FLAG_STALE | FLAG_PENDING)) {
						dep._refresh();
					}
					if (dep._flag & (FLAG_ERROR | FLAG_DISPOSED)) {
						throw boundError(dep);
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
			/** Setup or dynamic, so unbound: bump STAMP for dep tracking */
			let current = STAMP;
			let version = (SEED += 2);
			STAMP = version;
			let saveStart = VCOUNT;
			let depsLen = 0;
			let depCount = 0;
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
				depCount = sweepDeps(version - 1, this._dep1, this._deps);
				depsLen = this._deps !== null ? this._deps.length : 0;
			}

			try {
				value = this._fn(this, this._value, args);
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
					for (let i = 0; i < deps.length; i += 2) {
						deps[i + 1] = connect(/** @type {Sender} */ (deps[i]), this, i);
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
					stack[i]._stamp = stack[i + 1];
					stack[i] = null;
				}
				VCOUNT = saveStart;
			}
			STAMP = current;
		}

		/** flag keeps the state before the run, for the async branch. */
		let state = (this._flag &= ~(FLAG_STALE | FLAG_PENDING | FLAG_SETUP));

		/** Async, a callback suspend made in the fn, or disposed by it.
		 *  The masks fold to one constant: a sync compute pays a single
		 *  test. */
		if (state & (FLAG_ASYNC | FLAG_CALLBACK | FLAG_DISPOSED)) {
			if (state & FLAG_DISPOSED) {
				if (state & FLAG_CALLBACK) {
					unhold(this);
				}
				return;
			}
			if (state & FLAG_CALLBACK) {
				let i = findHeld(this);
				/** Nothing delivered yet: loading from here on. Like the
				 *  promise path, the settle that ends loading notifies even
				 *  if it resolves to the seed. */
				if (i < 0) {
					this._flag = (state | FLAG_LOADING) & ~FLAG_CALLBACK;
					startedLoading(this, flag, time);
					return;
				}
				settleHeld(this, i);
				return;
			}
			if (startAsync(this, value, time)) {
				startedLoading(this, flag, time);
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
				settleDeps(this);
			}
		}

		flag = this._flag;
		if (flag & FLAG_ERROR) {
			this._value = value;
			this._ctime = time;
		} else if (value !== this._value) {
			this._value = value;
			if (!(flag & FLAG_EQUAL)) {
				this._ctime = time;
			}
		} else if (flag & FLAG_MUTABLE) {
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

	/** Context methods an Action shares with an Effect. */
	EffectProto.val = ActionProto.val = val;
	EffectProto.set = ActionProto.set = contextSet;

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
		if (flag & (FLAG_SHIELD | FLAG_CHANNEL)) {
			/** A locked node does not re-run: its flags stay, and the
			 *  shield replays the change when it releases. */
			if (flag & FLAG_SHIELD) {
				return;
			}
			resetChannel(this);
		}

		this._time = time;
		if (flag & FLAG_LOADING) {
			this._flag &= ~(FLAG_LOADING | FLAG_SUSPEND);
		}
		/** The new run ends the previous one: its finalizers run if it was
		 *  still in flight, after the abort, then its children and
		 *  cleanups. Its recover handlers are dropped last, so they catch
		 *  what the teardown throws; what they don't fails this run before
		 *  the fn is called. A first run has nothing to tear down. */
		if (this._finalize !== null || this._owned !== null || this._cleanup !== null) {
			unwrap(clearRun(this));
		} else {
			this._recover = null;
		}

		/** @type {*} */
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
			/** Setup or dynamic, so unbound: bump STAMP for dep tracking */
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
				value = this._fn(this, args);
			} finally {
				if (flag & FLAG_SETUP) {
					if (DCOUNT > DBASE) {
						let stack = DSTACK;
						let deps = (this._deps = stack.slice(DBASE, DCOUNT));
						for (let i = DBASE; i < DCOUNT; i++) {
							stack[i] = null;
						}
						for (let i = 0; i < deps.length; i += 2) {
							deps[i + 1] = connect(/** @type {Sender} */ (deps[i]), this, i);
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
		 *  shielded. The masks fold to one constant: a sync effect pays a
		 *  single test. */
		if (flag & (FLAG_ASYNC | FLAG_CALLBACK | FLAG_DISPOSED | FLAG_SHIELD)) {
			if ((flag & (FLAG_DISPOSED | FLAG_SHIELD)) === FLAG_DISPOSED) {
				if (flag & FLAG_CALLBACK) {
					unhold(this);
				}
				return;
			}
			if (flag & FLAG_CALLBACK) {
				/** Loading from here on, until the callback delivers. */
				this._flag = (flag | FLAG_LOADING) & ~FLAG_CALLBACK;
				let i = findHeld(this);
				if (i < 0) {
					return;
				}
				settleHeldEffect(this, i);
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
				settleDeps(this);
			}
			/** It ends here, and so does its shield. A node locked only
			 *  by a shield below it keeps the lock. */
			if (flag & FLAG_SHIELD) {
				if (this._finalize !== null) {
					unwrap(clearFinalize(this));
				}
				unshield(this);
				return;
			}
		}

		if (this._finalize !== null) {
			unwrap(clearFinalize(this));
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
			hold(this, void 0, void 0);
			return;
		}
		let flag = this._flag;
		this._flag &= ~(FLAG_LOADING | FLAG_SUSPEND);

		/** A disposed node never settles. One whose disposal waits for
		 *  its shields is not marked yet, and settles as usual. */
		if (flag & FLAG_DISPOSED) {
			return;
		}

		/** A finalizer that throws fails a run that settled without an
		 *  error; a failed run keeps its own. */
		if (this._finalize !== null) {
			let error = clearFinalize(this);
			if (error !== null && !(flag & FLAG_ERROR)) {
				flag |= FLAG_ERROR;
				err = error;
			}
		}
		if (flag & FLAG_ERROR) {
			this._flag &= ~FLAG_ERROR;
			endRun(this, err);
			return;
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
		if (flag & FLAG_SHIELD) {
			unshield(this);
		} else if (stale) {
			this._receive();
			flush();
		}
	};

	/**
	 * @this {Effect}
	 * @returns {Defect | null} the teardown's error, if no handler took it
	 */
	EffectProto._dispose = function () {
		if (this._flag & FLAG_SHIELD) {
			deferDispose(this);
			return null;
		}
		let flag = this._flag;
		this._flag = FLAG_DISPOSED;
		clearDeps(this);
		/** As on a re-run: abort, then the finalizers of a run still in
		 *  flight, then the children, then the cleanups. */
		if (flag & FLAG_CHANNEL) {
			resetChannel(this);
		}
		let error = clearRun(this);
		this._fn =
			this._args =
			this._chan =
			this._owned =
			this._owner =
			null;
		return error;
	};

	/**
	 * @this {Effect}
	 * @returns {void}
	 */
	EffectProto._receive = function () {
		let flag = this._flag;
		if (flag & (FLAG_SHIELD | FLAG_PAUSED | FLAG_DISPOSED)) {
			return;
		}
		if (this._owned === null) {
			RECEIVERS[RECEIVER_COUNT++] = this;
		} else {
			enqueueScope(this);
		}
	};

	/**
	 * An Effect's run without the parts an Action does not have: no
	 * channel or shield to check, no children or cleanups to tear down,
	 * and no async tail.
	 * @this {Action}
	 * @param {number} time
	 */
	ActionProto._update = function (time) {
		let flag = this._flag;
		let args = this._args;
		this._time = time;

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
					this._fn(dep._value, this, args);
				} else {
					this._fn(this, args);
				}
			} finally {
				this._flag &= ~(FLAG_STALE | FLAG_PENDING);
			}
		} else {
			/** Setup or dynamic, so unbound: bump STAMP for dep tracking */
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
				this._fn(this, args);
			} finally {
				if (flag & FLAG_SETUP) {
					if (DCOUNT > DBASE) {
						let stack = DSTACK;
						let deps = (this._deps = stack.slice(DBASE, DCOUNT));
						for (let i = DBASE; i < DCOUNT; i++) {
							stack[i] = null;
						}
						for (let i = 0; i < deps.length; i += 2) {
							deps[i + 1] = connect(/** @type {Sender} */ (deps[i]), this, i);
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
						stack[i]._stamp = stack[i + 1];
						stack[i] = null;
					}
					VCOUNT = saveStart;
				}
				STAMP = current;
				this._flag &= ~(FLAG_SETUP | FLAG_STALE | FLAG_PENDING);
			}
		}
	};

	/**
	 * @this {Action}
	 * @returns {void}
	 */
	ActionProto._receive = function () {
		if (!(this._flag & (FLAG_PAUSED | FLAG_DISPOSED))) {
			RECEIVERS[RECEIVER_COUNT++] = this;
		}
	};

	/**
	 * @this {Action}
	 * @returns {null} an action has no teardown to fail
	 */
	ActionProto._dispose = function () {
		this._flag = FLAG_DISPOSED;
		clearDeps(this);
		this._fn = this._args = this._owner = null;
		return null;
	};

	/**
	 * Creates a compute, or a task when async is FLAG_ASYNC.
	 * Unbound: compute(fn, seed?, opts?, args?)
	 * Bound:   compute(dep, fn, seed?, opts?, args?)
	 * @template T, U, W
	 * @param {Owner} owner
	 * @param {number} async
	 * @param {Sender<U> | (function(T, W): T)} depOrFn
	 * @param {(function(U, T, W): T) | T=} fnOrSeed
	 * @param {number | T=} optsOrSeed
	 * @param {number | W=} argsOrOpts
	 * @param {W=} args
	 * @returns {Compute<T, U, W>}
	 */
	function makeCompute(owner, async, depOrFn, fnOrSeed, optsOrSeed, argsOrOpts, args) {
		if (owner._flag & FLAG_DISPOSED) {
			throw new Error(ILLEGAL_READ);
		}
		let flag, node;
		if (typeof depOrFn === "function") {
			flag = async | FLAG_SETUP | ((0 | optsOrSeed) & OPTIONS);
			node = new Compute(depOrFn, flag, null, fnOrSeed, argsOrOpts);
		} else {
			flag = async | FLAG_STABLE | FLAG_BOUND | FLAG_SINGLE | ((0 | argsOrOpts) & OPTIONS);
			node = new Compute(/** @type {!Function} */(fnOrSeed), flag, depOrFn, optsOrSeed, args);
			node._dep1slot = connect(depOrFn, node, -1);
		}
		if (owner._flag & FLAG_OWNER) {
			addOwned(owner, node);
		}
		if (!(flag & FLAG_DEFER)) {
			startCompute(node);
		}
		return node;
	}

	/**
	 * Creates an effect, or a spawn when async is FLAG_ASYNC.
	 * Unbound: effect(fn, opts?, args?)
	 * Bound:   effect(dep, fn, opts?, args?)
	 * @template U, W
	 * @param {Owner} owner
	 * @param {number} async
	 * @param {Sender<U> | (function(W): void)} depOrFn
	 * @param {(function(U, W): void) | number=} fnOrOpts
	 * @param {number | W=} optsOrArgs
	 * @param {W=} args
	 * @returns {Effect<U, W>}
	 */
	function makeEffect(owner, async, depOrFn, fnOrOpts, optsOrArgs, args) {
		if (owner._flag & FLAG_DISPOSED) {
			throw new Error(ILLEGAL_READ);
		}
		let flag, node;
		if (typeof depOrFn === "function") {
			flag = async | FLAG_SETUP | ((0 | fnOrOpts) & OPTIONS);
			node = new Effect(flag, depOrFn, null, owner, optsOrArgs);
		} else {
			flag = async | FLAG_STABLE | FLAG_BOUND | FLAG_SINGLE | ((0 | optsOrArgs) & OPTIONS);
			node = new Effect(flag, /** @type {!Function} */(fnOrOpts), depOrFn, owner, args);
			node._dep1slot = connect(depOrFn, node, -1);
		}
		let level = owner._level + 1;
		/** LEVELS and SCOPES start with levels 0 to 3, so only an owner
		 *  at level 3 or deeper needs the length check. */
		if (owner._level > 2 && level >= LEVELS.length) {
			LEVELS.push(0);
			SCOPES.push([]);
		}
		node._level = level;
		if (owner._flag & FLAG_OWNER) {
			addOwned(owner, node);
		}
		if ((flag & (FLAG_DEFER | FLAG_BOUND)) === (FLAG_DEFER | FLAG_BOUND)) {
			deferEffect(node);
		} else {
			startEffect(node);
		}
		return node;
	}

	/** @this {Owner} */
	function compute(depOrFn, fnOrSeed, optsOrSeed, argsOrOpts, args) {
		return makeCompute(this, 0, depOrFn, fnOrSeed, optsOrSeed, argsOrOpts, args);
	}

	/** @this {Owner} */
	function task(depOrFn, fnOrSeed, optsOrSeed, argsOrOpts, args) {
		return makeCompute(this, FLAG_ASYNC, depOrFn, fnOrSeed, optsOrSeed, argsOrOpts, args);
	}

	/** @this {Owner} */
	function effect(depOrFn, fnOrOpts, optsOrArgs, args) {
		return makeEffect(this, 0, depOrFn, fnOrOpts, optsOrArgs, args);
	}

	/** @this {Owner} */
	function spawn(depOrFn, fnOrOpts, optsOrArgs, args) {
		return makeEffect(this, FLAG_ASYNC, depOrFn, fnOrOpts, optsOrArgs, args);
	}

	/**
	 * Creates an action: a sync effect that owns nothing and takes no
	 * cleanup, recover or finalize. Its owner disposes it, and its
	 * errors go to its owner's recover handlers.
	 * Unbound: action(fn, opts?, args?)
	 * Bound:   action(dep, fn, opts?, args?)
	 * @this {Owner}
	 * @template U, W
	 * @param {Sender<U> | (function(Action, W): void)} depOrFn
	 * @param {(function(U, Action, W): void) | number=} fnOrOpts
	 * @param {number | W=} optsOrArgs
	 * @param {W=} args
	 * @returns {Action<U, W>}
	 */
	function action(depOrFn, fnOrOpts, optsOrArgs, args) {
		if (this._flag & FLAG_DISPOSED) {
			throw new Error(ILLEGAL_READ);
		}
		let flag, node;
		if (typeof depOrFn === "function") {
			flag = FLAG_SETUP | ((0 | fnOrOpts) & OPTIONS);
			node = new Action(flag, depOrFn, null, this, optsOrArgs);
		} else {
			flag =
				FLAG_STABLE | FLAG_BOUND | FLAG_SINGLE | ((0 | optsOrArgs) & OPTIONS);
			node = new Action(flag, /** @type {!Function} */(fnOrOpts), depOrFn, this, args);
			node._dep1slot = connect(depOrFn, node, -1);
		}
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
	RootProto.action = EffectProto.action = ClockProto.action = action;
}

/**
 * Whether any dep the node has read in its current run is loading:
 * c.pending() with no argument. The reads already subscribed, so this
 * only scans. In the sync part of a first run, the deps read so far
 * are _dep1 and the run's DSTACK slice; in a dynamic re-run, the deps
 * stamped with its version, since the others may be dropped after it.
 * A stable node reads the same deps every run, and after an await the
 * deps are linked as they are read, so then every dep counts.
 * @param {Receiver} node
 * @returns {boolean}
 */
function depsLoading(node) {
	let flag = node._flag;
	let dep = node._dep1;
	let deps = node._deps;
	let version = -1;
	if (!(flag & FLAG_LOADING) && (flag & (FLAG_STABLE | FLAG_SETUP)) !== FLAG_STABLE) {
		if (flag & FLAG_SETUP) {
			if (dep !== null && dep._flag & FLAG_LOADING) {
				return true;
			}
			for (let i = DBASE; i < DCOUNT; i += 2) {
				if (DSTACK[i]._flag & FLAG_LOADING) {
					return true;
				}
			}
			return false;
		}
		version = STAMP;
	}
	if (dep !== null && dep._flag & FLAG_LOADING && (version < 0 || dep._stamp === version)) {
		return true;
	}
	if (deps !== null) {
		for (let i = 0; i < deps.length; i += 2) {
			let sender = deps[i];
			if (sender._flag & FLAG_LOADING && (version < 0 || sender._stamp === version)) {
				return true;
			}
		}
	}
	return false;
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
 * Links receiver into the sender's subscriber list. Most senders have
 * one or two subscribers, so the first sits in _sub1, and only the
 * second allocates _subs.
 *
 * Links are two-way. _subs holds [receiver, depslot] pairs and _deps
 * holds [sender, subslot] pairs, each slot being the index of the
 * matching pair on the other side, or -1 for _sub1/_dep1. Either side
 * can then unlink in O(1) by swapping its last pair into the hole.
 * _sub1 needs no slot: it never moves, and unlinking it only clears it.
 * @param {Sender} sender
 * @param {Receiver} receiver
 * @param {number} depslot - index of the pair in receiver's _deps, -1 for _dep1
 * @returns {number} subslot - index of the pair in sender's _subs, -1 for _sub1
 */
function connect(sender, receiver, depslot) {
	if (sender._sub1 === null) {
		sender._sub1 = receiver;
		return -1;
	}
	let subs = sender._subs;
	if (subs === null) {
		sender._subs = [receiver, depslot];
		return 0;
	}
	let subslot = subs.length;
	subs.push(receiver, depslot);
	return subslot;
}

/**
 * Removes the receiver at subslot from sender's subscriber list.
 * Swap-with-last O(1), then points the moved receiver's dep pair at
 * its new index.
 * Disposed senders have already dropped their subscribers.
 * @param {Sender} sender
 * @param {number} subslot
 * @returns {void}
 */
function clearReceiver(sender, subslot) {
	if (sender._flag & FLAG_DISPOSED) {
		return;
	}
	if (subslot === -1) {
		sender._sub1 = null;
	} else {
		let subs = sender._subs;
		let lastSlot = /** @type {number} */ (subs.pop());
		let lastNode = /** @type {Receiver} */ (subs.pop());
		if (subslot !== subs.length) {
			subs[subslot] = lastNode;
			subs[subslot + 1] = lastSlot;
			if (lastSlot === -1) {
				lastNode._dep1slot = subslot;
			} else {
				lastNode._deps[lastSlot + 1] = subslot;
			}
		}
	}
	if (
		sender._flag & FLAG_WEAK &&
		sender._sub1 === null &&
		(sender._subs === null || sender._subs.length === 0)
	) {
		sender._drop();
	}
}

/**
 * Points sender's pair for a dep that moved to depslot in its
 * receiver's _deps (or to _dep1, for -1). A receiver in _sub1 has no
 * pair to update, and neither has a disposed sender, whose lists
 * clearSubs dropped.
 * @param {Sender} sender
 * @param {number} subslot
 * @param {number} depslot
 * @returns {void}
 */
function moveDep(sender, subslot, depslot) {
	if (subslot !== -1 && sender._subs !== null) {
		sender._subs[subslot + 1] = depslot;
	}
}

/**
 * Removes the dep pair at i from a receiver's _deps array.
 * Swap-with-last O(1).
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
 * Removes receiver from all its deps' subscriber lists.
 * @param {Receiver} receiver
 * @returns {void}
 */
function clearDeps(receiver) {
	if (receiver._dep1 !== null) {
		clearReceiver(receiver._dep1, receiver._dep1slot);
		receiver._dep1 = null;
	}
	let deps = receiver._deps;
	if (deps !== null) {
		let count = deps.length;
		for (let i = 0; i < count; i += 2) {
			clearReceiver(
				/** @type {Sender} */ (deps[i]),
				/** @type {number} */ (deps[i + 1])
			);
		}
		receiver._deps = null;
	}
}

/**
 * Nulls out sender's subscriber list on disposal.
 * Receivers self-heal: dynamic nodes remove stale deps via
 * patchDeps on next re-run, and a disposed sender never notifies its
 * stable receivers again. clearReceiver skips disposed senders, so
 * their pairs need no unlinking.
 * @param {Sender} sender
 * @returns {void}
 */
function clearSubs(sender) {
	sender._sub1 = null;
	sender._subs = null;
}

/**
 * Runs a node's cleanups, last registered first. The list is taken off
 * the node before any of them runs, so each runs exactly once.
 * @param {Owner | Receiver} node
 * @returns {Defect | null} the first error, see callAll()
 */
function clearCleanup(node) {
	let cleanup = node._cleanup;
	node._cleanup = null;
	return callAll(cleanup, true);
}

/**
 * Runs an effect's finalizers, first registered first, and clears the
 * field.
 * @param {Effect} node
 * @returns {Defect | null} the first error, see callAll()
 */
function clearFinalize(node) {
	let finalize = node._finalize;
	node._finalize = null;
	return callAll(finalize, false);
}

/**
 * Calls a list of cleanups or finalizers. One that throws does not stop
 * the rest: the first error is returned, for the caller to raise once
 * the teardown has finished, or to drop if its node has failed already,
 * so it never replaces another error.
 * @param {Function | Array<Function>} fns
 * @param {boolean} reverse - last registered first
 * @returns {Defect | null}
 */
function callAll(fns, reverse) {
	let error = null;
	if (typeof fns === "function") {
		try {
			fns();
		} catch (err) {
			error = failure(err);
		}
	} else {
		let step = reverse ? -1 : 1;
		let i = reverse ? fns.length - 1 : 0;
		let end = i + step * fns.length;
		for (; i !== end; i += step) {
			try {
				fns[i]();
			} catch (err) {
				if (error === null) {
					error = failure(err);
				}
			}
		}
	}
	return error;
}

/**
 * Throws `error`, unless it is null.
 * @param {Defect | null} error
 * @returns {void}
 */
function unwrap(error) {
	if (error !== null) {
		throw error;
	}
}

/**
 * Adds fn to a list of callbacks, stored compactly: null, a single fn,
 * then an array from the second on.
 * @param {Function | Array<Function> | null} list
 * @param {Function} fn
 * @returns {Function | Array<Function>}
 */
function append(list, fn) {
	if (list === null) {
		return fn;
	}
	if (typeof list === "function") {
		return [list, fn];
	}
	list.push(fn);
	return list;
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
 * Disposes all owned children, last created first. Called before
 * re-running an owner effect and on disposal. Only call when
 * `_owned !== null` — owned is lazy and only allocated when an effect
 * or root actually adopts children.
 * @param {Owner} owner
 * @returns {Defect | null} the first error a child's teardown ended with
 */
function clearOwned(owner) {
	let owned = owner._owned;
	let count = owned.length;
	let error = null;
	while (count-- > 0) {
		let err = owned.pop()._dispose();
		if (error === null) {
			error = err;
		}
	}
	return error;
}

/**
 * Tears down what an owner's run made: the finalizers of a run still in
 * flight, its children, then its cleanups (D2). The first error, a
 * child's teardown's included, goes to the run's own recover handlers,
 * which are dropped after. After a c.fatal(), until the flush ends, it is
 * dropped.
 * @param {Owner} owner
 * @returns {Defect | Object | null} the error, if no handler took it, or
 *     FATAL if a c.fatal() in it ended the owner's tree
 */
function clearRun(owner) {
	let finalized = owner._finalize !== null ? clearFinalize(/** @type {Effect} */(owner)) : null;
	let owned = owner._owned !== null ? clearOwned(owner) : null;
	let cleaned = owner._cleanup !== null ? clearCleanup(owner) : null;
	let error = finalized || owned || cleaned;
	if (PENDING === FATAL) {
		/** A c.fatal() in it paused the owner: the run it was about to
		 *  start is aborted. */
		error = owner._flag & FLAG_PAUSED ? FATAL : null;
	} else if (error !== null) {
		error = checkRecover(owner, error);
	}
	owner._recover = null;
	return error;
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
 * Classifies a value caught where it becomes a node's value: a compute,
 * a task or a resource. A Defect travels on unchanged; a value thrown
 * by user code is wrapped as PANIC.
 * @param {*} error
 * @returns {Defect}
 */
function defect(error) {
	return error instanceof Defect ? error : new Defect(error, PANIC);
}

/**
 * Classifies a value that failed a run, a teardown or a recover handler.
 * A REFUSE becomes a PANIC with the same error: an effect has no value
 * to refuse, so an expected failure it did not check is a bug in it, and
 * recover handlers only ever see PANIC.
 * @param {*} error
 * @returns {Defect}
 */
function failure(error) {
	if (error instanceof Defect) {
		return error.type === REFUSE ? new Defect(error.error, PANIC) : error;
	}
	return new Defect(error, PANIC);
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
 * Asks one owner's recover handlers, in registration order. A handler
 * that returns has handled the error, whatever it returns. One that
 * throws passes its own error on, to the next handler and then up the
 * owner chain, as a panic in a Go deferred call replaces the one being
 * recovered. A handler that calls c.fatal() ends the walk: its tree is
 * dead already.
 * @param {Owner} owner
 * @param {Defect} error
 * @returns {Defect | null} null if a handler took it, or the error to pass on
 */
function checkRecover(owner, error) {
	let recover = owner._recover;
	if (recover !== null) {
		if (typeof recover === "function") {
			recover = [recover];
		}
		for (let i = 0; i < recover.length; i++) {
			try {
				recover[i](error);
				return null;
			} catch (err) {
				if (err === FATAL) {
					return null;
				}
				error = failure(err);
			}
		}
	}
	return error;
}

/**
 * Asks the handlers of `owner` and of each owner above it in turn.
 * @param {Owner | null} owner
 * @param {Defect} error
 * @returns {Defect | null} null if a handler took it, or the error to pass on
 */
function bubble(owner, error) {
	while (owner !== null && error !== null) {
		error = checkRecover(owner, error);
		owner = owner._owner;
	}
	return error;
}

/**
 * Passes the error a disposal ended with on from `owner`, the disposed
 * node's owner, up. The flush throws one that no handler takes once it
 * ends, unless it has one already.
 * @param {Owner | null} owner
 * @param {Defect} error
 * @returns {void}
 */
function raise(owner, error) {
	error = bubble(owner, error);
	if (error !== null && PENDING === null) {
		PENDING = error;
	}
}

/**
 * Marks the tree `node` is in for disposal, for c.fatal(). Its
 * outermost owner, a root or an effect made on the global `c`, is
 * paused, so nothing in it runs again, and queued: code of the tree may
 * still be on the stack, so the flush disposes it once that has
 * unwound. Its shields are ended now, so the disposal doesn't wait for
 * them, as dispose(true) does. Every other tree is left alone.
 * @param {Owner} node
 * @param {*} error - what c.fatal() was given
 * @returns {void}
 */
function killTree(node, error) {
	FATALS.push(error);
	PENDING = FATAL;
	let top = node;
	while (top._owner !== null && top._owner._flag & FLAG_OWNER) {
		top = top._owner;
	}
	if (top._flag & FLAG_SHIELD) {
		endShields(top);
	}
	if (!(top._flag & FLAG_DISPOSED)) {
		pauseNode(top);
	}
	/** Queued even when disposed already, so that a flush runs and
	 *  throws the Fatal. */
	DISPOSES[DISPOSER_COUNT++] = top;
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
	if (dep1 !== null && dep1._stamp !== version) {
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
	 *   i      - forward through the existing region
	 *   newidx - next new dep to consume (unsubscribed, in new region)
	 *   tail   - end of the live region, shrinks as reused deps are
	 *            taken from the back
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
			/** Fill the slot with a kept dep from the back, unbinding the
			 *  dropped ones passed on the way; none left ends the region. */
			for (; ;) {
				if (tail <= i + 2) {
					tail = i;
					break;
				}
				tail -= 2;
				let tDep = /** @type {Sender} */ (deps[tail]);
				let tSlot = /** @type {number} */ (deps[tail + 1]);
				if (tDep._stamp === version) {
					deps[i] = tDep;
					deps[i + 1] = tSlot;
					moveDep(tDep, tSlot, i);
					i += 2;
					break;
				}
				clearReceiver(tDep, tSlot);
			}
		}
	}
	/** No deps before this run: the first new dep becomes dep1. */
	if (node._dep1 === null && newidx < newLen) {
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
 * Stamps a receiver's existing deps with `stamp` (the run's STAMP - 1)
 * before a dynamic run, saving any stamp above FENCE to VSTACK. A dep
 * that the run reads again is then counted in REUSED.
 * @param {number} stamp
 * @param {Sender | null} dep1
 * @param {Array<Sender> | null} deps
 * @returns {number} the number of deps
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
 * Marks every subscriber of `node` with `flag`, and wakes (_receive)
 * the ones that were neither pending nor stale already. Disposed,
 * paused and locked subscribers are marked but not woken; _receive
 * tests these too.
 * @param {Sender} node
 * @param {number} flag
 */
function notify(node, flag) {
	let sub = node._sub1;
	if (sub !== null) {
		let flags = sub._flag;
		sub._flag |= flag;
		if (!(flags & (FLAG_PENDING | FLAG_STALE | FLAG_DISPOSED | FLAG_SHIELD | FLAG_PAUSED))) {
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
				!(flags & (FLAG_PENDING | FLAG_STALE | FLAG_DISPOSED | FLAG_SHIELD | FLAG_PAUSED))
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
 * checkRun for a FLAG_SINGLE node: brings its one dep up to date, then
 * re-runs the node if that dep changed, or clears its flags. It
 * recurses along single-dep chains. It cannot loop forever: a cycle
 * that a change can reach has a node with two deps, which goes to
 * checkRun, and checkRun detects cycles.
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
 * Brings a pending receiver up to date. Walks its deps depth-first on
 * an explicit stack (CSTACK, CINDEX), re-running each node whose deps
 * changed, and clearing the flags of each node whose deps did not.
 * @param {Receiver} node
 * @param {number} time
 * @returns {void}
 */
function checkRun(node, time) {
	let base = CTOP;
	let dep = node._dep1;
	let mark = CMARK;

	/**
	 * Fast descent: walk chains of pending dep1s without the overhead
	 * of the full scan loop. Stops at the first dep1 that is not just
	 * pending.
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
			 * node is the child the parent was scanning when it pushed.
			 * CINDEX is only read when that child did not change.
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
 * doubles CMARK and returns it, so deep graphs pay this scan once per
 * doubling of the deepest walk, not per pull.
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
 * A task that starts loading tells its readers, as a resource's async
 * write does (startLoading): its value is unchanged, but a reader of
 * c.pending() must run again to see it. The reader checking it, and
 * the others it marked pending, see the change time. Already loading,
 * its readers know. On a first run no reader has run before it, so the
 * stamp is no news to anyone.
 * @param {Compute} node
 * @param {number} flag the state before the run
 * @param {number} time
 * @returns {void}
 */
function startedLoading(node, flag, time) {
	if (!(flag & FLAG_LOADING)) {
		node._ctime = time;
	}
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
 * Whether the activation started at `time` is still the node's, and
 * the node is live: not disposed, or locked to run to its end (D10).
 * @param {AsyncDisposer} node
 * @param {number} time
 * @returns {boolean}
 */
function isLive(node, time) {
	return node._time === time && (node._flag & (FLAG_DISPOSED | FLAG_SHIELD)) !== FLAG_DISPOSED;
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
	if (!isLive(node, time)) {
		return false;
	}
	let flag = node._flag;
	if (flag & (FLAG_SHIELD | FLAG_CALLBACK)) {
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
 * Queues a settle made while the engine is busy, such as a callback
 * resolved from inside another node's fn, as set() queues a write. The
 * node stays loading until the drain settles it, so a run in progress
 * never sees the graph change under it. A settle made while the node's
 * own fn runs (FLAG_CALLBACK) is held by the node instead. No
 * FLAG_SCHEDULED: a write to a resource supersedes its activation
 * through _time, which isCurrent checks when the settle drains.
 * @param {AsyncDisposer} node
 * @param {{ _value: *, _time: number }} payload
 * @param {Function} fn
 * @returns {void}
 */
function postSettle(node, payload, fn) {
	let index = SENDER_COUNT++;
	SENDERS[index] = node;
	PAYLOADS[index] = payload;
	UPDATES[index] = fn;
}

/**
 * Settles, or fails, `node` with `value`, if the activation started at
 * `time` is still current.
 * @param {AsyncDisposer} node
 * @param {*} value
 * @param {number} time
 * @param {boolean} failed
 * @returns {void}
 */
function settleIf(node, value, time, failed) {
	if (isCurrent(node, time)) {
		if (failed) {
			node._error(value);
		} else {
			node._settle(value);
		}
	} else if (failed && value instanceof Fatal) {
		/** Thrown into a continuation that did not catch it, after its
		 *  c.fatal() disposed it: it has no other caller. */
		throw value;
	}
}

/**
 * Settles, or fails, `node` now when the engine is idle or the node's
 * own fn runs, and otherwise queues the settle for the drain.
 * @param {AsyncDisposer} node
 * @param {*} value
 * @param {number} time
 * @param {boolean} failed
 * @returns {void}
 */
function settleOrQueue(node, value, time, failed) {
	if (IDLE) {
		settleIdle(node, value, time, failed);
	} else if (node._flag & FLAG_CALLBACK) {
		settleIf(node, value, time, failed);
	} else {
		postSettle(node, { _value: value, _time: time }, failed ? errorLater : settleLater);
	}
}

/**
 * settleIf() at idle. What the settle runs, finalizers, recover handlers
 * and callbacks, runs inside anod (NESTED), so a c.fatal() there waits
 * for it to finish. What the flush has to throw then, a Fatal or a
 * teardown's error a shield released, it throws now: nothing else would.
 * @param {Resource | Compute | Effect} node
 * @param {*} value
 * @param {number} time
 * @param {boolean} failed
 * @returns {void}
 */
function settleIdle(node, value, time, failed) {
	NESTED = true;
	try {
		settleIf(node, value, time, failed);
	} finally {
		NESTED = false;
	}
	if (PENDING !== null) {
		flush();
	}
}

/**
 * Drain handler for a queued resolve.
 * @param {AsyncDisposer} node
 * @param {{ _value: *, _time: number }} payload
 * @returns {void}
 */
function settleLater(node, payload) {
	settleIf(node, payload._value, payload._time, false);
}

/**
 * Drain handler for a queued reject.
 * @param {AsyncDisposer} node
 * @param {{ _value: *, _time: number }} payload
 * @returns {void}
 */
function errorLater(node, payload) {
	settleIf(node, payload._value, payload._time, true);
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
			settleOrQueue(node, val, time, false);
		}
	};
	/** @param {*} err */
	let reject = function (err) {
		if (!done) {
			done = true;
			settleOrQueue(node, err, time, true);
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
			if (result.value !== void 0) {
				settleIdle(node, result.value, time, false);
			} else if (node._flag & FLAG_LOADING) {
				settleIdle(node, node._value, time, false);
			}
			return;
		}

		/** Requested before the settle, whose flush can throw, so that a
		 *  throwing reader does not stop the iteration. */
		iterator.next().then(onNext, onError);

		settleIdle(node, result.value, time, false);
	};

	/** @param {*} err */
	let onError = (err) => {
		settleIdle(node, err, time, true);
	};

	iterator.next().then(onNext, onError);
}

/**
 * Four-pass settle notification. Detaches the node's waiters and resolves
 * them with its value or error, without triggering redundant stale
 * notifications on nodes that appear in both the sync subscriber list and
 * the async waiter list.
 *
 * Pass 1: Mark all sync subs with FLAG_VISIT.
 * Pass 2: Walk waiters — subscribe the unmarked ones, and unmark the
 *         ones that are sync subs too, so pass 3 skips them.
 * Pass 3: Unmark the subs, and inline notify the ones that were marked
 *         (not a waiter). The notify is skipped when quiet.
 * Pass 4: Call the waiters' callbacks. They run last, so a callback
 *         that reads the graph sees every subscriber marked stale,
 *         and the waiters are already detached, so a waiter added by
 *         a callback goes into a fresh list.
 *
 * The marks are flags, not stamps: a settle can happen inside another
 * node's run, and a subscriber's stamp may be one that run tracks with.
 * Nothing between pass 1 and pass 3 runs user code.
 *
 * A node walking an array await (FLAG_BLOCKED) is neither subscribed
 * as a waiter nor woken as a sub: its walk rescans instead, and
 * subscribes to every member when it ends.
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

	/** Pass 1: mark all sync subs. */
	let sub = node._sub1;
	if (sub !== null) {
		sub._flag |= FLAG_VISIT;
	}
	let subs = node._subs;
	if (subs !== null) {
		let count = subs.length;
		for (let i = 0; i < count; i += 2) {
			subs[i]._flag |= FLAG_VISIT;
		}
	}

	/** Pass 2: subscribe each waiter that is not a sync sub already,
	 *  and unmark the ones that are, so pass 3 does not notify them. */
	for (let i = 0; i < waiterCount; i += 3) {
		let awaiter = /** @type {AsyncReceiver} */(waiters[i]);
		if (awaiter._flag & FLAG_VISIT) {
			awaiter._flag &= ~FLAG_VISIT;
		} else if (!(awaiter._flag & FLAG_BLOCKED)) {
			subscribe(awaiter, node);
		}
		clearRespond(awaiter, node);
	}

	/** Pass 3: unmark, and notify the subs that are not waiters. A
	 *  waiter subscribed in pass 2 was never marked. */
	if (sub !== null) {
		notifyMarked(sub, quiet);
	}
	subs = node._subs;
	if (subs !== null) {
		let count = subs.length;
		for (let i = 0; i < count; i += 2) {
			notifyMarked(subs[i], quiet);
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
 * Pass 3 of settleNotify() for one sub: unmarks it, and unless quiet,
 * marks it stale and wakes it. An unmarked sub is a waiter, which pass
 * 4 resumes instead. An array-awaiting sub (FLAG_BLOCKED) is marked
 * but not woken: its re-scan reads the value.
 * @param {Receiver} sub
 * @param {boolean} quiet
 * @returns {void}
 */
function notifyMarked(sub, quiet) {
	let flags = sub._flag;
	if (flags & FLAG_VISIT) {
		sub._flag = flags & ~FLAG_VISIT;
		if (!quiet) {
			sub._flag |= FLAG_STALE;
			if (!(flags & (FLAG_PENDING | FLAG_STALE | FLAG_BLOCKED | FLAG_DISPOSED | FLAG_PAUSED))) {
				sub._receive();
			}
		}
	}
}

/**
 * c.suspend(setup): the callback form, setup(resolve, reject). Sets
 * FLAG_SUSPEND, so the run knows the node waits for a callback, not a
 * returned promise. A resolve or reject made before the node's fn
 * returns is held until it does (callbackFlags). Once per step.
 * @param {AsyncReceiver | AsyncSender} node
 * @param {function(function(*): void, function(*): void)} setup
 * @returns {void}
 */
function suspendWith(node, setup) {
	if (node._flag & FLAG_SUSPEND) {
		throw new Error(SUSPEND_TWICE);
	}
	node._flag |= callbackFlags(node);
	resolvePromise(node, setup, node._time);
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
	if (findHeld(node) >= 0) {
		return;
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
 * Drops the node's held delivery, if any: its fn or a step's callback
 * threw (see dropStep, failStart, flushEffects), or it was disposed
 * while the fn ran.
 * @param {Receiver | AsyncSender} node
 * @returns {void}
 */
function unhold(node) {
	let i = findHeld(node);
	if (i >= 0) {
		dropHeld(i);
	}
}

/**
 * Hands a settled value to one waiter's callback, unless the waiter
 * has been disposed. A node waiting through c.suspend(task, onResolve,
 * onReject) is relayed: its own callback runs, and the node settles
 * with what it returns, or, while the node's fn still runs, the
 * callback is held until it returns. During an array await
 * (FLAG_BLOCKED) the callback is the internal re-scan.
 * @param {AsyncReceiver} awaiter
 * @param {Function | null} fn
 * @param {*} value
 * @param {boolean} isError
 * @returns {void}
 */
function deliver(awaiter, fn, value, isError) {
	/** A disposed node never resumes. A locked one runs to the end. */
	if ((awaiter._flag & (FLAG_DISPOSED | FLAG_SHIELD)) === FLAG_DISPOSED) {
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
		result = runStep(node, fn, isError ? defect(value) : value);
	} catch (err) {
		node._flag &= ~FLAG_CALLBACK;
		dropStep(node);
		node._error(err);
		return;
	}
	node._flag &= ~FLAG_CALLBACK;
	if (result !== REGRET) {
		node._settle(result);
	}
}

/**
 * Finishes a task's run with what a callback suspend delivered while
 * its fn ran (HELD entry i): the run ends with it, and the fn's return
 * value is ignored, as on any callback suspend. A callback runs now,
 * loading, so that its reads link like reads after an await, and the
 * steps it continues with run too (see runStep). FLAG_CALLBACK stays
 * set while it settles, so _settle writes as part of this run. A step
 * that waits leaves the task loading, to settle through relay().
 * @param {Compute} node
 * @param {number} i
 * @returns {void}
 */
function settleHeld(node, i) {
	let fn = HELD[i + 1];
	let held = HELD[i + 2];
	let failed = false;
	dropHeld(i);
	try {
		held = runStep(node, fn, held);
	} catch (err) {
		dropStep(node);
		held = err;
		failed = true;
	}
	if (held === REGRET && !failed) {
		node._flag &= ~FLAG_CALLBACK;
		return;
	}
	if (failed) {
		node._error(held);
	} else {
		node._settle(held);
	}
	node._flag &= ~FLAG_CALLBACK;
	/** _settle under FLAG_CALLBACK only wrote the value. Finish the
	 *  settle: the deferred deps, then the waiters, quietly, as the
	 *  readers see the change through the run's _ctime. */
	if (node._flag & FLAG_CHANNEL) {
		if (node._chan._defers !== null) {
			settleDeps(node);
		}
		if (node._flag & FLAG_WAITER) {
			settleNotify(node, true);
		}
	}
}

/**
 * Finishes an effect's run with what a callback suspend delivered while
 * its fn ran (HELD entry i), as settleHeld() does for a task. A
 * rejection, or a throw from a callback, fails the run as a throw in
 * the body does: the creator or c.recover() gets it.
 * @param {Effect} node
 * @param {number} i
 * @returns {void}
 */
function settleHeldEffect(node, i) {
	let fn = HELD[i + 1];
	let held = HELD[i + 2];
	dropHeld(i);
	try {
		held = runStep(node, fn, held);
	} catch (err) {
		dropStep(node);
		node._flag &= ~(FLAG_LOADING | FLAG_SUSPEND | FLAG_CALLBACK);
		throw err;
	}
	node._flag &= ~FLAG_CALLBACK;
	if (held !== REGRET) {
		node._settle();
	}
}

/**
 * Runs a callback suspend's callback, and the steps it continues with,
 * until the run settles or waits. The callback runs as STEP, loading,
 * with FLAG_CALLBACK set, so that a suspend made in it is held like one
 * made in the fn. Then:
 *
 * - It suspended again: the new suspend is the run's next step, and the
 *   callback's return value is ignored. A step that has settled runs
 *   here, in a loop rather than recursively, so a long chain of settled
 *   steps runs in constant stack. One that is loading resumes the run
 *   through relay() when it settles.
 * - It returned a promise or an async iterable: the run settles with
 *   what that gives, as when the fn returns one.
 * - Otherwise, the run settles with what it returned, a task or a
 *   resource included, as when the fn returns one.
 *
 * Only an async node (task or spawn) adopts what a callback returns, as
 * only an async node adopts what its fn returns.
 *
 * fn is undefined to settle with value, or null to fail with it, as a
 * HELD entry's. The caller clears FLAG_CALLBACK, and settles the node
 * with the result, or fails it with what this throws.
 * @param {AsyncReceiver} node
 * @param {Function | null | undefined} fn
 * @param {*} value
 * @returns {*} the result, or REGRET while the run waits
 */
function runStep(node, fn, value) {
	for (;;) {
		node._flag &= ~(FLAG_SUSPEND | FLAG_RELAY);
		if (fn === void 0) {
			return value;
		}
		if (fn === null) {
			throw value;
		}
		node._flag |= FLAG_LOADING | FLAG_CALLBACK;
		let prev = STEP;
		STEP = node;
		try {
			value = fn(value);
		} finally {
			STEP = prev;
		}
		if (!(node._flag & FLAG_SUSPEND)) {
			if (
				node._flag & FLAG_ASYNC &&
				startAsync(node, value, node._time)
			) {
				return REGRET;
			}
			return value;
		}
		let i = findHeld(node);
		if (i < 0) {
			return REGRET;
		}
		fn = HELD[i + 1];
		value = HELD[i + 2];
		dropHeld(i);
	}
}

/**
 * Drops what a step that threw had started: a delivery held for it, and
 * its waits on the senders of its next step.
 * @param {AsyncReceiver} node
 * @returns {void}
 */
function dropStep(node) {
	unhold(node);
	if (node._flag & FLAG_CHANNEL) {
		clearChannel(node._chan, node);
	}
	node._flag &= ~(FLAG_SUSPEND | FLAG_RELAY | FLAG_BLOCKED);
}

/**
 * The sender that a suspend waits on for a promise or a plain value: a
 * resource that no one owns, loading until the promise settles, or
 * holding the value. It is only reachable through the waiter's deps,
 * so it goes away with them.
 * @param {*} value
 * @returns {Resource}
 */
function toSender(value) {
	if (value !== null && typeof value === "object" && typeof value.then === "function") {
		let node = new Resource(void 0, FLAG_ASYNC | FLAG_LOADING, null);
		resolvePromise(node, value, 0);
		return node;
	}
	return new Resource(value, FLAG_ASYNC, null);
}

/**
 * A suspend array with each promise or plain value made a sender (see
 * toSender): the array itself if it has none, or else a copy, so the
 * caller's array is left as it was.
 * @param {Array<*>} tasks
 * @returns {Array<AsyncSender>}
 */
function toSenders(tasks) {
	let count = tasks.length;
	/** @type {Array<*> | null} */
	let senders = null;
	for (let i = 0; i < count; i++) {
		let task = tasks[i];
		if (task === null || typeof task !== "object" || task._flag === void 0) {
			if (senders === null) {
				senders = tasks.slice();
			}
			senders[i] = toSender(task);
		}
	}
	return senders !== null ? senders : tasks;
}

/**
 * Sweeps an async node's deps when its activation settles. Drops the
 * duplicate deps that reads across awaits leave in _deps, subscribes
 * the deferred deps from c.defer(), and returns whether any of those
 * changed since it was read, so that the node runs again. An async
 * node whose fn returned a sync value settles here too, so its
 * deferred deps are subscribed without ever loading; it read them in
 * this same run, so the result is ignored.
 * Seen senders are marked with FLAG_VISIT, not stamped: a settle can
 * happen inside another node's run (a callback suspend resolved from
 * its fn), and a sender's stamp may be one that run tracks with. Every
 * marked sender ends up in _dep1 or _deps, and unmarkDeps() clears
 * them all; nothing in between runs user code.
 * @param {AsyncReceiver} node
 * @returns {boolean}
 */
function settleDeps(node) {
	let dep1 = node._dep1;
	let deps = node._deps;

	/** Grab defers before clearing. */
	let defers = null;
	if (node._flag & FLAG_CHANNEL) {
		defers = node._chan._defers;
		node._chan._defers = null;
	}

	/** Mark dep1. */
	if (dep1 !== null) {
		dep1._flag |= FLAG_VISIT;
	}

	/** Dedup scan of _deps — remove duplicates via swap-with-last.
	 *  Walks back to front, so the pair swapped in is already seen. */
	if (deps !== null) {
		for (let i = deps.length - 2; i >= 0; i -= 2) {
			let dep = /** @type {Sender} */ (deps[i]);
			if (dep._flag & FLAG_VISIT) {
				removeDep(deps, i);
			} else {
				dep._flag |= FLAG_VISIT;
			}
		}
	}

	/** Subscribe the deferred deps and detect changes. A sender
	 *  disposed during the await is dropped: it never changes again. */
	let changed = false;
	if (defers !== null) {
		let count = defers.length;
		for (let i = 0; i < count; i += 2) {
			let sender = /** @type {Sender} */(defers[i]);
			if (sender._flag & FLAG_DISPOSED) {
				continue;
			}
			if (!(sender._flag & FLAG_VISIT)) {
				sender._flag |= FLAG_VISIT;
				subscribe(node, sender);
			}
			if (sender._value !== defers[i + 1]) {
				changed = true;
			}
		}
	}
	unmarkDeps(node);
	return changed;
}

/**
 * Clears the FLAG_VISIT marks settleDeps() put on the senders of
 * `node`. Every sender it marks is one of the node's deps by then: a
 * deferred one was subscribed.
 * @param {Receiver} node
 * @returns {void}
 */
function unmarkDeps(node) {
	let dep1 = node._dep1;
	if (dep1 !== null) {
		dep1._flag &= ~FLAG_VISIT;
	}
	let deps = node._deps;
	if (deps !== null) {
		let count = deps.length;
		for (let i = 0; i < count; i += 2) {
			deps[i]._flag &= ~FLAG_VISIT;
		}
	}
}

/**
 * Ends the previous activation's async state before a re-run: aborts
 * its controller, drops its deferred reads, and unbinds its waits,
 * abandoning an array await (FLAG_BLOCKED) and a pending relay
 * (FLAG_RELAY) with them. Used by a re-run, and by the disposal of a
 * task or spawn.
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
	clearChannel(chan, node);
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
 * @param {AsyncReceiver} awaiter
 * @returns {void}
 */
function removeWaiter(responder, awaiter) {
	let responderCh = responder._chan;
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
		removeWaiter(res, awaiter);
	}
	let responds = channel._responds;
	if (responds !== null) {
		channel._responds = null;
		for (let i = 0; i < responds.length; i++) {
			let responder = responds[i];
			if (responder !== null) {
				removeWaiter(responder, awaiter);
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
 * first, so nothing a reject does can reach the list. The rejections
 * are queued on REJECTS: every dispose runs inside a flush or a
 * teardown(), which delivers them once the disposal has finished.
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
 * all owned child effects and actions. While paused, notifications are
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
			let child = owned[i];
			if (child._flag & FLAG_OWNER) {
				pauseNode(/** @type {Owner} */(child));
			} else if (child instanceof Action) {
				child._flag |= FLAG_PAUSED;
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
	if (!(node._flag & FLAG_DISPOSING)) {
		node._flag |= FLAG_DISPOSING;
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
		if (next._flag & FLAG_DISPOSING) {
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
	if (SHIELDS.indexOf(node) !== -1) {
		countOff(node);
		replay(node);
	}
}

/**
 * Locks `node` and every owner above it. The walk stops at a root,
 * which has no owner, or at the global `c`, which has no FLAG_OWNER.
 * @param {Owner} node
 * @returns {void}
 */
function lockPath(node) {
	for (let next = node; next !== null && next._flag & FLAG_OWNER; next = next._owner) {
		next._flag |= FLAG_SHIELD;
	}
}

/**
 * Takes the shield of `node` off SHIELDS, unlocks its path and locks
 * again what the remaining shields hold. A node on the path that is
 * left unlocked is freed; one whose disposal waited is marked disposed,
 * for replay() to tear down.
 * @param {Effect} node
 * @returns {void}
 */
function countOff(node) {
	SHIELDS.splice(SHIELDS.indexOf(node), 1);
	let next = /** @type {Owner | null} */(node);
	for (; next !== null && next._flag & FLAG_OWNER; next = next._owner) {
		next._flag &= ~FLAG_SHIELD;
	}
	for (let i = 0; i < SHIELDS.length; i++) {
		lockPath(SHIELDS[i]);
	}
	for (next = node; next !== null && next._flag & FLAG_OWNER; next = next._owner) {
		if ((next._flag & (FLAG_SHIELD | FLAG_DISPOSING)) === FLAG_DISPOSING) {
			next._flag = (next._flag & ~FLAG_DISPOSING) | FLAG_DISPOSED;
		}
	}
}

/**
 * Replays what the released shields deferred, on the path from `node`
 * up. The nodes they freed are the bottom of the path, as an owner
 * stays locked while any shield below it is active. The topmost freed node whose disposal
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
		if (flag & FLAG_SHIELD) {
			if (flag & FLAG_DISPOSING) {
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
 * teardown must not dispose it a second time. What the teardown throws
 * goes up the owners above it.
 * @param {Owner} node
 * @returns {void}
 */
function disposeHeld(node) {
	let owner = node._owner;
	let error;
	try {
		error = teardown(node);
	} finally {
		if (owner !== null && owner._flag & FLAG_OWNER && owner._owned !== null) {
			let i = owner._owned.lastIndexOf(node);
			if (i !== -1) {
				owner._owned.splice(i, 1);
			}
		}
	}
	if (error !== null) {
		raise(owner, error);
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
	endShields(node);
	disposeHeld(node);
	if (owner !== null) {
		replay(owner);
	}
}

/**
 * Ends every shield under `node`, its own included: each is counted
 * off, so `node` is unlocked, and a disposal that waited under it is
 * marked for its teardown to take.
 * @param {Owner} node
 * @returns {void}
 */
function endShields(node) {
	/** @type {Array<Effect>} */
	let shields = [];
	for (let i = 0; i < SHIELDS.length; i++) {
		for (let next = SHIELDS[i]; next !== null; next = next._owner) {
			if (next === node) {
				shields.push(SHIELDS[i]);
				break;
			}
		}
	}
	for (let i = 0; i < shields.length; i++) {
		countOff(shields[i]);
	}
}

/**
 * Disposes a node from outside the dispose queue: a deferred dispose
 * replayed when a shield releases, or a node its error disposes. Outside
 * a flush, the rejections the teardown collects are delivered once it
 * has finished; inside one, the flush delivers them.
 * @param {Disposer} node
 * @returns {Defect | null} the teardown's error, if no handler took it
 */
function teardown(node) {
	if (FLUSHING || TEARING) {
		return node._dispose();
	}
	TEARING = true;
	try {
		return node._dispose();
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
 * on Root (compute, effect, task, etc.) use `this` (the root) as the owner.
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
		/** Its tree is marked for disposal, which the running flush
		 *  takes, and the creator goes on. */
		if (error === FATAL) {
			return;
		}
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
 * UNHANDLED so the creator's own endRun does not ask them again.
 * FATAL is not rethrown: its tree, which the creator may not be in, is
 * marked for disposal, and the flush throws a Fatal.
 * @param {Effect} node
 * @param {*} error
 * @returns {void}
 */
function failStart(node, error) {
	let err = abortRun(node, error, 0);
	if (err !== null) {
		UNHANDLED = err;
		UNHANDLED_NODE = node;
		throw err;
	}
}

/**
 * Aborts an effect's run that threw: drops a held delivery, clears the
 * run's flags and `mask`, runs its finalizers, and ends the run, unless
 * it threw FATAL: its tree is marked for disposal already.
 * @param {Effect | Action} node
 * @param {*} error
 * @param {number} mask
 * @returns {Defect | null} what endRun() returns
 */
function abortRun(node, error, mask) {
	if (node._flag & FLAG_CALLBACK) {
		unhold(node);
	}
	node._flag &= ~(mask | FLAG_SUSPEND | FLAG_CALLBACK);
	if (node._finalize !== null) {
		clearFinalize(node);
	}
	return error === FATAL ? null : endRun(node, failure(error));
}

/**
 * Ends an effect's or action's failed run. Its own recover handlers are
 * asked first: one that takes the error keeps it alive. Otherwise its
 * owners' are asked, and it is disposed; the teardown's own error is
 * dropped, as the run's comes first. The shield ends either way: a locked effect's
 * disposal waits for it, which a throwing teardown does not skip.
 *
 * An error that failStart rethrew from one of node's own children has
 * been declined by node and its owners already, so they are not asked
 * again.
 * @param {Effect | Action} node
 * @param {Defect} error
 * @returns {Defect | null} the error, if no handler took it
 */
function endRun(node, error) {
	if (
		error === UNHANDLED &&
		/** @type {Effect} */(node)._owned !== null &&
		/** @type {Effect} */(node)._owned.lastIndexOf(UNHANDLED_NODE) !== -1
	) {
		UNHANDLED = UNHANDLED_NODE = null;
	} else {
		error = checkRecover(node, error);
		if (error === null) {
			if (node._flag & FLAG_SHIELD) {
				unshield(node);
			}
			return null;
		}
		error = bubble(node._owner, error);
	}
	try {
		teardown(node);
	} finally {
		if (node._flag & FLAG_SHIELD) {
			unshield(node);
		}
	}
	return error;
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
			/** A throw before the run aborts it before it clears these,
			 *  and a throw ends a callback suspend's activation. */
			/** The throw ends the activation, and its shield: a locked
			 *  node is disposed once that releases. */
			let err = abortRun(node, error, FLAG_STALE | FLAG_PENDING);
			if (thrown === null) {
				thrown = err;
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
						let err = node._dispose();
						if (owner !== null) {
							purgeOwned(owner);
						}
						if (err !== null) {
							raise(owner, err);
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
				/** Writes queued while the queue drains, by an updater,
				 *  drain in the same pass, in order. */
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
				error = new Error(CYCLE);
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
		/** A Fatal comes first, then the flush's own first error. */
		if (PENDING !== null) {
			if (PENDING === FATAL) {
				error = new Fatal(FATALS);
				FATALS = [];
			} else if (!thrown) {
				error = PENDING;
			}
			PENDING = null;
			thrown = true;
		}
		if (thrown) {
			throw error;
		}
	}
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
	FLAG_SETUP,
	FLAG_LOADING,
	FLAG_DEFER,
	FLAG_STABLE,
	FLAG_EQUAL,
	FLAG_ASYNC,
	FLAG_BOUND,
	FLAG_WAITER,
	FLAG_CHANNEL,
	FLAG_BLOCKED,
	FLAG_SHIELD,
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
	Defect,
	Fatal,
	DEFER,
	STABLE,
	WEAK,
	EAGER,
	OPTIONS,
	DISPOSED,
	LOADING,
	ERROR,
	PUBLIC,
	REGRET,
	NOOP,
	ILLEGAL_READ,
	c,

	Clock,
	Root,
	Signal,
	Resource,
	Compute,
	Effect,
	Action,
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
