import { Anod } from "./api.js";
import { Disposer, Owner, Sender, Receiver, ISignal, ICompute, IEffect } from "./types.js";

const FLAG_STALE = 1 << 0;
const FLAG_PENDING = 1 << 1;
const FLAG_SCHEDULED = 1 << 2;
const FLAG_DISPOSED = 1 << 3;

const FLAG_COMPUTE = 1 << 4;
const FLAG_INIT = 1 << 5;
const FLAG_SETUP = 1 << 6;
const FLAG_RUNNING = 1 << 7;
const FLAG_LOADING = 1 << 8;
const FLAG_ERROR = 1 << 9;
const FLAG_DEFER = 1 << 10;
const FLAG_STABLE = 1 << 11;
const FLAG_RECOVER = 1 << 13;
const FLAG_BOUND = 1 << 14;
const FLAG_DERIVED = 1 << 15;
const FLAG_WEAK = 1 << 17;


const FLAG_EQUAL = 1 << 18;
const FLAG_NOTEQUAL = 1 << 19;
const FLAG_ASYNC = 1 << 20;
const FLAG_STREAM = 1 << 21;

const OPT_DEFER = FLAG_DEFER;
const OPT_STABLE = FLAG_STABLE;
const OPT_SETUP = FLAG_SETUP;
const OPT_WEAK = FLAG_WEAK;

const OPT_DYNAMIC = 0x800000;

const OPTIONS = OPT_DEFER | OPT_STABLE | OPT_SETUP | OPT_WEAK | FLAG_ASYNC | FLAG_STREAM;

/**
 * @type {number}
 */
var TRANSACTION = 0;

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
var VERSION = 1;

/** @const @type {Array<Disposer>} */
var DISPOSES = [];

var DISPOSES_COUNT = 0;

/**
 * @const
 * @type {Array<Signal>}
 */
var SIGNALS = [];
/**
 * @const
 * @type {Array}
 */
var PAYLOADS = [];
var SIGNALS_COUNT = 0;

/**
 * @const
 * @type {Array<Compute>}
 */
var COMPUTES = [];

var COMPUTES_COUNT = 0;

/** @const @type {Array<number>} */
var LEVELS = [0, 0, 0, 0];
/** @const @type {Array<Array<Effect>>} */
var SCOPES = [[], [], [], []];

var SCOPES_COUNT = 0;

/** @const @type {Array<Effect>} */
var EFFECTS = [];

var EFFECTS_COUNT = 0;

/**
 * @this {Disposer}
 * @returns {void}
 */
function dispose() {
    if (!(this._flag & FLAG_DISPOSED)) {
        if (IDLE) {
            this._dispose();
        } else {
            DISPOSES[DISPOSES_COUNT++] = this;
        }
    }
}

/**
 * @this {!Receiver}
 * @returns {boolean}
 */
function error() {
    return (this._flag & FLAG_ERROR) !== 0;
}

/**
 * @this {!Receiver}
 * @returns {boolean}
 */
function loading() {
    return (this._flag & FLAG_LOADING) !== 0;
}


// ─── Shared node methods ───────────────────────────────────────────────────
// These implementations are installed on both Compute and Effect prototypes
// so user callbacks can invoke them on the node itself (e.g. `c.equal(true)`
// inside a compute, `e.cleanup(fn)` inside an effect). Ownership-creating
// methods live further down on the Root and Effect prototypes — since the
// callback is passed the node (Root or Effect) directly, `this` inside a
// prototype method is the owner, no global state needed.

/**
 * Declares the current compute's output semantically equal (or not)
 * to its previous value.
 * @this {Receiver}
 * @param {boolean=} eq
 * @returns {void}
 */
function _equal(eq) {
    if (eq === false) {
        this._flag = (this._flag | FLAG_NOTEQUAL) & ~FLAG_EQUAL;
    } else {
        this._flag = (this._flag | FLAG_EQUAL) & ~FLAG_NOTEQUAL;
    }
}

/**
 * Marks the current node stable — no dynamic dep tracking on subsequent runs.
 * @this {Receiver}
 * @returns {void}
 */
function _stable() {
    this._flag |= FLAG_STABLE;
}

/**
 * Registers a cleanup fn on the current node. Valid on any Effect or Root.
 * @this {Owner}
 * @param {function(): void} fn
 * @returns {void}
 */
function _cleanup(fn) {
    addCleanup(this, fn);
}

/**
 * Registers a recover handler on the current node. Valid on any Effect or Root.
 * @this {Owner}
 * @param {function(*): boolean} fn
 * @returns {void}
 */
function _recover(fn) {
    addRecover(this, fn);
}

// ─── Ownership methods installed on Root & Effect prototypes ───────────────
// `this` is the owner (Root or Effect). Created nodes are appended to
// `this._owned` (lazily allocated as an array). Compute-creating methods are
// shared verbatim between Root and Effect; Effect-creating methods split
// (see _effEffect/_rootEffect below) because the child's topological level
// depends on whether the owner is an Effect (level+1) or a Root (level 0).

/**
 * @this {Owner}
 * @template T,W
 * @param {function(T,W): T} fn
 * @param {T=} seed
 * @param {number=} opts
 * @param {W=} args
 * @returns {Compute<T,W>}
 */
function _ownCompute(fn, seed, opts, args) {
    let flag = FLAG_SETUP | ((0 | opts) & OPTIONS);
    let node = new Compute(flag, fn, null, seed, args);
    if (this._owned === null) {
        this._owned = [node];
    } else {
        this._owned.push(node);
    }
    if (!(flag & FLAG_DEFER)) {
        startCompute(node);
    }
    return node;
}

/**
 * Stable compute owned by this node.
 * @this {Owner}
 * @param {function|Sender} fnOrDep
 * @param {*=} seedOrFn
 * @param {*=} argsOrSeed
 * @param {*=} args
 * @returns {!Compute}
 */
function _ownDerive(fnOrDep, seedOrFn, argsOrSeed, args) {
    let node;
    if (typeof fnOrDep === 'function') {
        node = new Compute(FLAG_STABLE | FLAG_SETUP, fnOrDep, null, seedOrFn, argsOrSeed);
    } else {
        node = new Compute(FLAG_STABLE | FLAG_BOUND, seedOrFn, fnOrDep, argsOrSeed, args);
        node._dep1slot = subscribe(fnOrDep, node, -1);
    }
    if (this._owned === null) {
        this._owned = [node];
    } else {
        this._owned.push(node);
    }
    startCompute(node);
    return node;
}

/**
 * Async compute owned by this node.
 * @this {Owner}
 * @template T,W
 * @param {function(T,W): Promise<T>} fn
 * @param {T=} seed
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Compute<T,null,null,W>}
 */
function _ownTask(fn, seed, opts, args) {
    opts = 0 | opts;
    let flag = FLAG_ASYNC | FLAG_SETUP | (opts & OPTIONS);
    if (!(opts & OPT_DYNAMIC)) {
        flag |= FLAG_STABLE;
    }
    let node = new Compute(flag, fn, null, seed, args);
    if (this._owned === null) {
        this._owned = [node];
    } else {
        this._owned.push(node);
    }
    if (!(flag & FLAG_DEFER)) {
        startCompute(node);
    }
    return node;
}

/**
 * A nested Root owned by this node. The Root still escapes reactive
 * tracking, but is tied to this owner for disposal.
 * @this {Owner}
 * @param {function(!Root): ((function(): void) | void)} fn
 * @returns {!Root}
 */
function _ownRoot(fn) {
    let node = new Root();
    if (this._owned === null) {
        this._owned = [node];
    } else {
        this._owned.push(node);
    }
    startRoot(node, fn);
    return node;
}

/**
 * Unowned signal — signals don't participate in ownership chains. Exposed
 * on the Root/Effect prototypes purely for call-site symmetry.
 * @template T
 * @param {T} value
 * @returns {!Signal<T>}
 */
function _ownSignal(value) {
    return new Signal(value);
}

/**
 * Effect owned by a Root — child level stays at the default 0 because
 * Root is the topological root of its scheduling tree.
 * @this {!Root}
 * @template W
 * @param {function(!Effect, W): (function(): void | void)} fn
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Effect<null,null,W>}
 */
function _rootEffect(fn, opts, args) {
    let flag = FLAG_SETUP | ((0 | opts) & OPTIONS);
    let node = new Effect(flag, fn, null, this, args);
    if (this._owned === null) {
        this._owned = [node];
    } else {
        this._owned.push(node);
    }
    startEffect(node);
    return node;
}

/**
 * Watch owned by a Root.
 * @this {!Root}
 * @param {function|Sender} fnOrDep
 * @param {*=} fnOrArgs
 * @param {*=} args
 * @returns {!Effect}
 */
function _rootWatch(fnOrDep, fnOrArgs, args) {
    let node;
    if (typeof fnOrDep === 'function') {
        node = new Effect(FLAG_STABLE | FLAG_SETUP, fnOrDep, null, this, fnOrArgs);
    } else {
        node = new Effect(FLAG_STABLE | FLAG_BOUND, fnOrArgs, fnOrDep, this, args);
        node._dep1slot = subscribe(fnOrDep, node, -1);
    }
    if (this._owned === null) {
        this._owned = [node];
    } else {
        this._owned.push(node);
    }
    startEffect(node);
    return node;
}

/**
 * Async effect owned by a Root.
 * @this {!Root}
 * @template W
 * @param {function(!Effect, W): Promise<(function(): void) | void>} fn
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Effect<null,null,W>}
 */
function _rootSpawn(fn, opts, args) {
    let opts_ = 0 | opts;
    let flag = FLAG_ASYNC | FLAG_SETUP | (opts_ & OPTIONS);
    if (!(opts_ & OPT_DYNAMIC)) {
        flag |= FLAG_STABLE;
    }
    let node = new Effect(flag, fn, null, this, args);
    if (this._owned === null) {
        this._owned = [node];
    } else {
        this._owned.push(node);
    }
    startEffect(node);
    return node;
}

/**
 * Effect owned by another Effect — child level = parent._level + 1 so the
 * start() loop processes parents before children.
 * @this {!Effect}
 * @template W
 * @param {function(!Effect, W): (function(): void | void)} fn
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Effect<null,null,W>}
 */
function _effEffect(fn, opts, args) {
    let flag = FLAG_SETUP | ((0 | opts) & OPTIONS);
    let node = new Effect(flag, fn, null, this, args);
    let level = this._level + 1;
    node._level = level;
    if (level >= LEVELS.length) {
        LEVELS.push(0);
        SCOPES.push([]);
    }
    if (this._owned === null) {
        this._owned = [node];
    } else {
        this._owned.push(node);
    }
    startEffect(node);
    return node;
}

/**
 * Watch owned by an Effect.
 * @this {!Effect}
 * @param {function|Sender} fnOrDep
 * @param {*=} fnOrArgs
 * @param {*=} args
 * @returns {!Effect}
 */
function _effWatch(fnOrDep, fnOrArgs, args) {
    let node;
    if (typeof fnOrDep === 'function') {
        node = new Effect(FLAG_STABLE | FLAG_SETUP, fnOrDep, null, this, fnOrArgs);
    } else {
        node = new Effect(FLAG_STABLE | FLAG_BOUND, fnOrArgs, fnOrDep, this, args);
        node._dep1slot = subscribe(fnOrDep, node, -1);
    }
    let level = this._level + 1;
    node._level = level;
    if (level >= LEVELS.length) {
        LEVELS.push(0);
        SCOPES.push([]);
    }
    if (this._owned === null) {
        this._owned = [node];
    } else {
        this._owned.push(node);
    }
    startEffect(node);
    return node;
}

/**
 * Async effect owned by another Effect.
 * @this {!Effect}
 * @template W
 * @param {function(!Effect, W): Promise<(function(): void) | void>} fn
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Effect<null,null,W>}
 */
function _effSpawn(fn, opts, args) {
    let opts_ = 0 | opts;
    let flag = FLAG_ASYNC | FLAG_SETUP | (opts_ & OPTIONS);
    if (!(opts_ & OPT_DYNAMIC)) {
        flag |= FLAG_STABLE;
    }
    let node = new Effect(flag, fn, null, this, args);
    let level = this._level + 1;
    node._level = level;
    if (level >= LEVELS.length) {
        LEVELS.push(0);
        SCOPES.push([]);
    }
    if (this._owned === null) {
        this._owned = [node];
    } else {
        this._owned.push(node);
    }
    startEffect(node);
    return node;
}

/**
 * @constructor
 * @implements {Owner}
 */
function Root() {
    /**
     * @type {number}
     */
    this._flag = 0;
    /**
     * @type {(function(): void) | Array<(function(): void)> | null}
     */
    this._cleanup = null;
    /**
     * @type {Array<Receiver> | null}
     */
    this._owned = null;
    /**
     * @type {(function(*): boolean) | Array<(function(*): boolean)> | null}
     */
    this._recover = null;
}

/** @const */
var RootProto = Root.prototype;

/**
 * @type {Owner | null}
 */
RootProto._owner = null;

/**
 * @public
 * @this {!Root}
 * @returns {void}
 */
RootProto.dispose = dispose;

/**
 * @public
 * @this {!Root}
 * @param {function(): void} fn
 * @returns {void}
 */
RootProto.cleanup = function (fn) { addCleanup(this, fn); };

/**
 * @public
 * @this {!Root}
 * @param {function(*): boolean} fn
 * @returns {void}
 */
RootProto.recover = function (fn) { addRecover(this, fn); };

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
    this._owned =
        this._recover = null;
};

/**
 * Ownership methods on Root — shared with Effect for compute-creators,
 * distinct for effect-creators (root's children always start at level 0).
 */
RootProto.compute = _ownCompute;
RootProto.derive = _ownDerive;
RootProto.task = _ownTask;
RootProto.signal = _ownSignal;
RootProto.root = _ownRoot;
RootProto.effect = _rootEffect;
RootProto.watch = _rootWatch;
RootProto.spawn = _rootSpawn;

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
        let cleanup = fn(root);
        if (typeof cleanup === 'function') {
            addCleanup(root, cleanup);
        }
    } finally {
        IDLE = idle;
    }
}

/**
 * @template T
 * @constructor
 * @implements {ISignal<T>}
 * @param {T} value
 * @param {number=} opts
 */
function Signal(value, opts) {
    /**
     * @type {number}
     */
    this._flag = 0 | opts;
    /**
     * @type {T}
     */
    this._value = value;
    /**
     * @type {number}
     */
    this._version = 0;
    /**
     * @type {Receiver}
     */
    this._sub1 = null;
    /**
     * @type {number}
     */
    this._sub1slot = 0;
    /**
     * @type {Array<Receiver | number> | null}
     */
    this._subs = null;
}

{
    /** @const */
    let SignalProto = Signal.prototype;

    /**
     * @type {number}
     */
    SignalProto._ctime = 0;

    /**
     * @public
     * @returns {void}
     */
    SignalProto.dispose = dispose;

    /**
     * @public
     * @this {!Signal<T>}
     * @returns {T}
     */
    SignalProto.val = function () {
        return this._value;
    };

    /**
     * @public
     * @this {!Signal<T>}
     * @param {T} value
     * @returns {void}
     */
    SignalProto.set = function (value) {
        if (this._value !== value) {
            if (IDLE) {
                this._value = value;
                notify(this, FLAG_STALE);
                start();
            } else {
                this._flag |= FLAG_SCHEDULED;
                let index = SIGNALS_COUNT++;
                SIGNALS[index] = this;
                PAYLOADS[index] = value;
            }
        }
    };

    /**
     * 
     * @param {T} value 
     */
    SignalProto._assign = function (value) {
        this._value = value;
        if (this._flag & FLAG_SCHEDULED) {
            this._flag &= ~FLAG_SCHEDULED;
            notify(this, FLAG_STALE);
        }
    };

    /**
     * @this {!Signal<T>}
     * @returns {void}
     */
    SignalProto._dispose = function () {
        this._flag = FLAG_DISPOSED;
        clearSubs(this);
        this._value = null;
    };

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
    /**
     * @type {number}
     */
    this._flag = FLAG_COMPUTE | FLAG_INIT | FLAG_STALE | opts;
    /**
     * @type {T}
     */
    this._value = seed;
    /**
     * @type {number}
     */
    this._version = 0;
    /**
     * @type {Receiver}
     */
    this._sub1 = null;
    /**
     * @type {number}
     */
    this._sub1slot = 0;
    /**
     * @type {Array<Receiver | number> | null}
     */
    this._subs = null;
    /**
     * @type {(function(T): T) | (function(T, U): T) | (function(T,U,V): T) | null}
     */
    this._fn = fn;
    /**
     * @type {Sender<U>}
     */
    this._dep1 = dep1;
    /**
     * @type {number}
     */
    this._dep1slot = 0;
    /**
     * @type {Array<Sender | number> | null}
     */
    this._deps = null;
    /**
     * @type {number}
     */
    this._time = 0;
    /**
     * @type {number}
     */
    this._ctime = 0;
    /**
     * @type {W | undefined}
     */
    this._args = args;
}

{
    /** @const */
    let ComputeProto = Compute.prototype;

    /**
     * @public
     * @this {!Compute<T,U,V,W>}
     * @returns {void}
     */
    ComputeProto.dispose = dispose;

    /**
     * @public
     * @this {!Compute<T,U,V,W>}
     * @returns {boolean}
     */
    ComputeProto.error = error;

    /**
     * @public
     * @this {!Compute<T,U,V,W>}
     * @returns {boolean}
     */
    ComputeProto.loading = loading;

    /**
     * @public
     * @throws
     * @this {!Compute<T,U,V,W>}
     * @returns {T}
     */
    ComputeProto.val = function () {
        let flag = this._flag;
        if (flag & (FLAG_STALE | FLAG_PENDING)) {
            if (IDLE) {
                IDLE = false;
                try {
                    TRANSACTION = VERSION;
                    if (flag & FLAG_STALE) {
                        this._update(TIME);
                    } else {
                        checkRun(this, TIME);
                    }
                    if (SIGNALS_COUNT > 0 || DISPOSES_COUNT > 0) {
                        start();
                    }
                } finally {
                    IDLE = true;
                }
            } else {
                if (flag & FLAG_STALE) {
                    this._update(TIME);
                } else {
                    checkRun(this, TIME);
                }
            }
        }
        if (this._flag & FLAG_ERROR) {
            throw this._value;
        }
        return this._value;
    };

    /**
     * @this {!Compute<T,U,V,W>}
     * @returns {void}
     */
    ComputeProto._dispose = function () {
        this._flag = FLAG_DISPOSED;
        clearSubs(this);
        clearDeps(this);
        this._fn =
            this._value =
            this._args = null;
    };

    /**
     * @param {number} time
     */
    ComputeProto._update = function (time) {
        let flag = this._flag;
        this._time = time;
        this._flag = (flag & ~(FLAG_STALE | FLAG_INIT | FLAG_EQUAL | FLAG_NOTEQUAL)) | FLAG_RUNNING;
        if (flag & (FLAG_ASYNC | FLAG_STREAM)) {
            return this._updateAsync(time);
        }

        let value;
        if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
            /** Stable or bound: no version tracking, no dep management */
            try {
                value = (flag & FLAG_BOUND)
                    ? this._fn(this._dep1.val(), this._value, this._args)
                    : this._fn(this, this._value, this._args);
                this._flag &= ~FLAG_ERROR;
            } catch (err) {
                this._value = err;
                this._flag = flag & ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING | FLAG_INIT | FLAG_SETUP) | FLAG_ERROR;
                this._ctime = time;
                return;
            }
        } else {
            /** Setup or dynamic: bump version for dep tracking */
            let prevVersion = this._version;
            let version = VERSION += 2;
            this._version = version;
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
                depCount = sweep(version - 1, this._dep1, this._deps);
                depsLen = this._deps !== null ? this._deps.length : 0;
            }

            try {
                value = this._fn(this, this._value, this._args);
                this._flag &= ~FLAG_ERROR;
            } catch (err) {
                this._value = err;
                this._flag = flag & ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING | FLAG_INIT | FLAG_SETUP) | FLAG_ERROR;
                this._ctime = time;
                return;
            } finally {
                if (flag & FLAG_SETUP) {
                    /** Create exact-capacity _deps from DSTACK (setup only) */
                    if (DCOUNT > DBASE) {
                        this._deps = DSTACK.slice(DBASE, DCOUNT);
                        DCOUNT = DBASE;
                    }
                    DBASE = prevDBase;
                } else {
                    /** Reconcile deps (dynamic only) */
                    if ((REUSED !== depCount || (this._deps !== null ? this._deps.length : 0) !== depsLen)) {
                        pruneDeps(this, version, depCount);
                    }
                    REUSED = prevReused;
                }

                /** Restore saved version tags from VSTACK (both setup and dynamic) */
                if (VCOUNT > saveStart) {
                    let count = VCOUNT;
                    let stack = VSTACK;
                    for (let i = saveStart; i < count; i += 2) {
                        stack[i]._version = stack[i + 1];
                    }
                    VCOUNT = saveStart;
                }
                this._version = prevVersion;
            }
        }

        flag = this._flag;
        this._flag &= ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING | FLAG_INIT | FLAG_SETUP);
        if (value !== this._value) {
            this._value = value;
            if (!(flag & FLAG_EQUAL)) {
                this._ctime = time;
            }
        } else if (flag & (FLAG_NOTEQUAL)) {
            this._ctime = time;
        }
    };

    /**
     * Async update path. Same two-branch structure as _update but with
     * async post-processing (resolvePromise/resolveIterator).
     * @param {number} time
     */
    ComputeProto._updateAsync = function (time) {
        let flag = this._flag;
        let value;
        if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
            try {
                value = (flag & FLAG_BOUND)
                    ? this._fn(this._dep1.val(), this._value, this._args)
                    : this._fn(this, this._value, this._args);
                this._flag &= ~FLAG_ERROR;
            } catch (err) {
                value = err;
                this._flag |= FLAG_ERROR;
            }
        } else {
            let prevVersion = this._version;
            let version = VERSION += 2;
            this._version = version;
            let saveStart = VCOUNT;
            let depCount = 0;
            let dep1 = this._dep1;
            let depsLen = 0;
            let prevReused = REUSED;

            let prevDBase = DBASE;
            if (flag & FLAG_SETUP) {
                DBASE = DCOUNT;
            }

            if (!(flag & FLAG_SETUP)) {
                REUSED = 0;
                let stamp = version - 1;
                if (dep1 !== null) {
                    let depver = dep1._version;
                    if (depver > TRANSACTION) {
                        VSTACK[VCOUNT++] = dep1;
                        VSTACK[VCOUNT++] = depver;
                    }
                    dep1._version = stamp;
                    depCount = 1;
                }
                let deps = this._deps;
                if (deps !== null) {
                    depsLen = deps.length;
                    for (let i = 0; i < depsLen; i += 2) {
                        let dep = /** @type {Sender} */(deps[i]);
                        let depver = dep._version;
                        if (depver > TRANSACTION) {
                            VSTACK[VCOUNT++] = dep;
                            VSTACK[VCOUNT++] = depver;
                        }
                        dep._version = stamp;
                    }
                    depCount += depsLen / 2;
                }
            }

            try {
                value = this._fn(this, this._value, this._args);
                this._flag &= ~FLAG_ERROR;
            } catch (err) {
                value = err;
                this._flag |= FLAG_ERROR;
            }

            if (!(flag & FLAG_SETUP) && (REUSED !== depCount || (this._deps !== null ? this._deps.length : 0) !== depsLen)) {
                pruneDeps(this, version, depCount);
            }
            if (DCOUNT > DBASE) {
                this._deps = DSTACK.slice(DBASE, DCOUNT);
                DCOUNT = DBASE;
            }
            DBASE = prevDBase;
            REUSED = prevReused;
            if (VCOUNT > saveStart) {
                let count = VCOUNT;
                let stack = VSTACK;
                for (let i = saveStart; i < count; i += 2) {
                    stack[i]._version = stack[i + 1];
                }
                VCOUNT = saveStart;
            }
            this._version = prevVersion;
        }

        flag = this._flag;
        this._flag &= ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING | FLAG_INIT | FLAG_SETUP);
        if (flag & FLAG_ERROR) {
            this._value = value;
            this._ctime = time;
        } else {
            this._flag |= FLAG_LOADING;
            if (flag & FLAG_STREAM) {
                resolveIterator(new WeakRef(this), /** @type {AsyncIterator | AsyncIterable} */(value), time);
            } else {
                resolvePromise(new WeakRef(this), /** @type {IThenable} */(value), time);
            }
        }
    };

    /**
     * @this {Compute}
     * @returns {void}
     */
    ComputeProto._receive = function () {
        notify(this, FLAG_PENDING);
    };

    /**
     * The _read method is the core of dependency tracking. Called as
     * node.read(sender) during a compute/effect fn execution.
     * @template T
     * @param {!Sender<T>} sender
     * @returns {T}
     */
    ComputeProto.read = read;

    /**
     * Declares that this compute's output is semantically equal
     * to its previous value.
     * @param {boolean=} eq
     * @returns {void}
     */
    ComputeProto.equal = _equal;

    /**
     * Marks the current node as stable (no more dynamic dep
     * tracking on subsequent runs).
     * @returns {void}
     */
    ComputeProto.stable = _stable;
}

/**
 * @param {Compute} node
 * @returns {void}
 */
function startCompute(node) {
    if (IDLE) {
        IDLE = false;
        try {
            TRANSACTION = VERSION;
            node._update(TIME);
            if (SIGNALS_COUNT > 0 || DISPOSES_COUNT > 0) {
                start();
            }
        } finally {
            IDLE = true;
        }
    } else {
        node._update(TIME);
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
            TRANSACTION = VERSION;
                /** @type {Compute} */(dep)._update(time);
        } else if (flag & FLAG_PENDING) {
            TRANSACTION = VERSION;
            checkRun(/** @type {Compute} */(dep), time);
        }
        if (dep._ctime > lastRun) {
            return true;
        }
    }
    let deps = node._deps;
    if (deps !== null) {
        let len = deps.length;
        for (let i = 0; i < len; i += 2) {
            dep = /** @type {Sender} */(deps[i]);
            let flag = dep._flag;
            if (flag & FLAG_STALE) {
                TRANSACTION = VERSION;
                    /** @type {Compute} */(dep)._update(time);
            } else if (flag & FLAG_PENDING) {
                TRANSACTION = VERSION;
                checkRun(/** @type {Compute} */(dep), time);
            }
            if (dep._ctime > lastRun) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Pull-based evaluation using an explicit stack instead of recursion.
 * Walks down PENDING dep chains, updates STALE leaves, then ascends
 * checking whether each dep's _ctime changed and updating accordingly.
 *
 * Stack frame encoding:
 *   CSTACK[i] = the parent node that was being scanned
 *   CINDEX[i] = -1 if we descended from dep1, >= 0 if from _deps[index]
 *
 * Re-entrancy safe: each call saves/restores CTOP via `base`.
 *
 * The ascend phase uses a tight while loop to cascade updates (when
 * deps changed) or fast-clear flags (when deps didn't change) without
 * re-entering the main scan loop. This avoids resumeFrom branching
 * overhead in the common single-dep-chain case.
 *
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
    while (dep !== null && ((dep._flag & (FLAG_STALE | FLAG_PENDING)) === FLAG_PENDING)) {
        CSTACK[CTOP] = node;
        CINDEX[CTOP] = -1;
        CTOP++;
        node = dep;
        dep = node._dep1;
    }

    /** -2 = fresh entry (scan from dep1), -1 = resume after dep1, >= 0 = resume after _deps[n] */
    let resumeFrom = -2;

    outer:
    for (; ;) {
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
                    dep = /** @type {Sender} */(deps[i]);
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
            let idx = CINDEX[CTOP];
            /**
             * `node` is always the child that the parent was scanning
             * when it pushed — no need to look it up from parent._dep1
             * or parent._deps[idx].
             */
            if (node._ctime > parent._time) {
                /** Child changed — update parent and keep cascading */
                parent._update(time);
                node = parent;
                continue;
            }
            /** Child unchanged — check if parent has more deps to scan */
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
 * @param {WeakRef<!Compute<T>>} ref
 * @param {IThenable<T>} promise
 * @param {number} time
 * @returns {void}
 */
function resolvePromise(ref, promise, time) {
    promise.then((val) => {
        let node = ref.deref();
        if (node !== void 0 && !(node._flag & FLAG_DISPOSED) && node._time === time) {
            node._flag &= ~FLAG_ERROR;
            settle(node, val);
        }
    }, (err) => {
        let node = ref.deref();
        if (node !== void 0 && !(node._flag & FLAG_DISPOSED) && node._time === time) {
            node._flag |= FLAG_ERROR;
            settle(node, err);
        }
    });
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
    let iterator = typeof iterable[Symbol.asyncIterator] === 'function'
        ? iterable[Symbol.asyncIterator]()
        : iterable;

    /** @param {IteratorResult<T>} result */
    let onNext = (result) => {
        let node = ref.deref();

        if (node === void 0 || (node._flag & FLAG_DISPOSED) || node._time !== time) {
            if (typeof iterator.return === 'function') {
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
        if (node !== void 0 && !(node._flag & FLAG_DISPOSED) && node._time === time) {
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
    node._flag &= ~FLAG_LOADING;

    if (value !== node._value || (node._flag & FLAG_ERROR)) {
        node._value = value;
        let time = TIME + 1;
        node._ctime = time;
        if (unbound(node)) {
            node._fn = node._args = null;
        }
        notify(node, FLAG_STALE);
        start();
    }
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
    /**
     * @type {number}
     */
    this._flag = FLAG_INIT | (0 | opts);
    /**
     * @type {number}
     */
    this._version = 0;
    /**
     * @type {(function(W): (function(): void | void)) | (function(U,W): (function(): void | void)) | (function(U,V,W): (function(): void | void)) | null}
     */
    this._fn = fn;
    /**
     * @type {Sender<U> | null}
     */
    this._dep1 = dep1;
    /**
     * @type {number}
     */
    this._dep1slot = 0;
    /**
     * @type {Array<Sender | number> | null}
     */
    this._deps = null;
    /**
     * @type {number}
     */
    this._time = 0;
    /**
     * @type {(function(): void) | Array<(function(): void)> | null}
     */
    this._cleanup = null;
    /**
     * @type {Array<Receiver> | null}
     */
    this._owned = null;
    /**
     * @type {number}
     */
    this._level = 0;
    /**
     * @type {Owner | null}
     */
    this._owner = owner;
    /**
     * @type {(function(*): boolean) | Array<(function(*): boolean)> | null}
     */
    this._recover = null;
    /**
     * @type {W | undefined}
     */
    this._args = args;
}

{
    /** @const */
    let EffectProto = Effect.prototype;

    /**
     * @public
     * @this {!Effect<U,V,W>}
     * @returns {void}
     */
    EffectProto.dispose = dispose;

    /**
     * @public
     * @this {!Effect<U,V,W>}
     * @returns {boolean}
     */
    EffectProto.error = error;

    /**
     * @public
     * @this {!Effect<U,V,W>}
     * @returns {boolean}
     */
    EffectProto.loading = loading;

    /**
     * Unified update method for effects. Two top-level branches:
     * 1. Stable/bound — set FLAG_RUNNING, call fn, restore state
     * 2. Setup/dynamic — version bump, optional prescan, VSTACK restore
     * Pre-execution cleanup and scope save happen before branching.
     * Async nodes delegate to _updateAsync before state modification.
     * @param {number} time
     */
    EffectProto._update = function (time) {
        let flag = this._flag;

        this._time = time;
        this._flag |= FLAG_RUNNING;
        if (!(flag & FLAG_SETUP)) {
            if (this._cleanup !== null) {
                clearCleanup(this);
            }
            if (this._owned !== null) {
                clearOwned(this);
            }
            this._recover = null;
        }

        /** Async nodes delegate after pre-exec cleanup. */
        if (flag & (FLAG_ASYNC | FLAG_STREAM)) {
            return this._updateAsync(time);
        }
        /** @type {(function(): void) | null | undefined} */
        let value;

        if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
            /** Stable or bound: no version tracking, no dep management */
            try {
                value = (flag & FLAG_BOUND)
                    ? this._fn(this._dep1.val(), this._args)
                    : this._fn(this, this._args);
            } finally {
                this._flag &= ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING);
            }
        } else {
            /** Setup or dynamic: bump version for dep tracking */
            let prevVersion = this._version;
            let version = VERSION += 2;
            this._version = version;
            let saveStart = VCOUNT;
            let depCount = 0;
            let depsLen = 0;
            let prevDBase;
            let prevReused;
            if (flag & FLAG_SETUP) {
                prevDBase = DBASE
                DBASE = DCOUNT;
            } else {
                prevReused = REUSED
                REUSED = 0;
                depCount = sweep(version - 1, this._dep1, this._deps);
                depsLen = this._deps !== null ? this._deps.length : 0;
            }

            try {
                value = this._fn(this, this._args);
            } finally {
                if (flag & FLAG_SETUP) {
                    if (DCOUNT > DBASE) {
                        this._deps = DSTACK.slice(DBASE, DCOUNT);
                        DCOUNT = DBASE;
                    }
                    DBASE = prevDBase;
                } else {
                    if ((REUSED !== depCount || (this._deps !== null ? this._deps.length : 0) !== depsLen)) {
                        pruneDeps(this, version, depCount);
                    }
                    REUSED = prevReused;
                }
                /** Restore saved version tags from VSTACK (both setup and dynamic) */
                if (VCOUNT > saveStart) {
                    let count = VCOUNT;
                    let stack = VSTACK;
                    for (let i = saveStart; i < count; i += 2) {
                        stack[i]._version = stack[i + 1];
                    }
                    VCOUNT = saveStart;
                }
                this._version = prevVersion;
                this._flag &= ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING | FLAG_INIT | FLAG_SETUP);
            }
        }

        if (typeof value === 'function') {
            addCleanup(this, value);
        }
    };

    /**
     * Async update path for effects. Same two-branch structure as _update
     * but with async post-processing (resolveEffectPromise/resolveEffectIterator).
     * @param {number} time
     */
    EffectProto._updateAsync = function (time) {
        let flag = this._flag;
        let value;

        if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
            this._flag |= FLAG_RUNNING;
            try {
                value = (flag & FLAG_BOUND)
                    ? this._fn(this._dep1.val(), this._args)
                    : this._fn(this, this._args);
            } finally {
                this._time = time;
                this._flag &= ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING);
            }
        } else {
            let prevVersion = this._version;
            let version = VERSION += 2;
            this._version = version;
            let saveStart = VCOUNT;
            let depCount = 0;
            let dep1 = this._dep1;
            let depsLen = 0;
            let prevReused = REUSED;

            let prevDBase = DBASE;
            if (flag & FLAG_SETUP) {
                DBASE = DCOUNT;
            }

            if (!(flag & FLAG_SETUP)) {
                this._flag |= FLAG_RUNNING;
                REUSED = 0;
                let stamp = version - 1;
                if (dep1 !== null) {
                    let depver = dep1._version;
                    if (depver > TRANSACTION) {
                        VSTACK[VCOUNT++] = dep1;
                        VSTACK[VCOUNT++] = depver;
                    }
                    dep1._version = stamp;
                    depCount = 1;
                }
                let deps = this._deps;
                if (deps !== null) {
                    depsLen = deps.length;
                    for (let i = 0; i < depsLen; i += 2) {
                        let dep = /** @type {Sender} */(deps[i]);
                        let depver = dep._version;
                        if (depver > TRANSACTION) {
                            VSTACK[VCOUNT++] = dep;
                            VSTACK[VCOUNT++] = depver;
                        }
                        dep._version = stamp;
                    }
                    depCount += depsLen >> 1;
                }
            }

            try {
                value = this._fn(this, this._args);
            } finally {
                if (!(flag & FLAG_SETUP) && (REUSED !== depCount || (this._deps !== null ? this._deps.length : 0) !== depsLen)) {
                    pruneDeps(this, version, depCount);
                }
                if (DCOUNT > DBASE) {
                    this._deps = DSTACK.slice(DBASE, DCOUNT);
                    DCOUNT = DBASE;
                }
                DBASE = prevDBase;
                REUSED = prevReused;
                if (VCOUNT > saveStart) {
                    let count = VCOUNT;
                    let stack = VSTACK;
                    for (let i = saveStart; i < count; i += 2) {
                        stack[i]._version = stack[i + 1];
                    }
                    VCOUNT = saveStart;
                }
                this._version = prevVersion;
                this._time = time;
                this._flag &= ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING | FLAG_INIT | FLAG_SETUP);
            }
        }

        this._flag |= FLAG_LOADING;
        if (flag & FLAG_STREAM) {
            resolveEffectIterator(new WeakRef(this), value);
        } else {
            resolveEffectPromise(new WeakRef(this), value);
        }
    };

    /**
     * @this {!Effect<U,V,W>}
     * @returns {void}
     */
    EffectProto._dispose = function () {
        this._flag = FLAG_DISPOSED;
        clearDeps(this);
        if (this._cleanup !== null) {
            clearCleanup(this);
        }
        if (this._owned !== null) {
            clearOwned(this);
        }
        this._fn =
            this._args =
            this._owned =
            this._owner =
            this._recover = null;
    };

    /**
     * @returns {void}
     */
    EffectProto._receive = function () {
        if (this._owned === null) {
            EFFECTS[EFFECTS_COUNT++] = this;
        } else {
            let level = this._level;
            let count = LEVELS[level];
            SCOPES[level][count] = this;
            LEVELS[level] = count + 1;
            SCOPES_COUNT++;
        }
    };

    /**
     * The _read method for Effect nodes.
     * @template T
     * @param {!Sender<T>} sender
     * @returns {T}
     */
    EffectProto.read = read;

    /**
     * Declares equal/not-equal semantics on the node.
     * @param {boolean=} eq
     * @returns {void}
     */
    EffectProto.equal = _equal;

    /**
     * Marks the current node as stable.
     * @returns {void}
     */
    EffectProto.stable = _stable;

    /**
     * Registers a cleanup function.
     * @param {function(): void} fn
     * @returns {void}
     */
    EffectProto.cleanup = _cleanup;

    /**
     * Registers a recover handler.
     * @param {function(*): boolean} fn
     * @returns {void}
     */
    EffectProto.recover = _recover;

    /**
     * Ownership methods on Effect — install the shared implementations.
     * The Compute-creating methods (compute/derive/task) are identical on
     * Root; Effect-creating methods (effect/watch/spawn) differ because the
     * child's topological level = parent._level + 1 for Effect owners,
     * and 0 for Root owners.
     */
    EffectProto.compute = _ownCompute;
    EffectProto.derive = _ownDerive;
    EffectProto.task = _ownTask;
    EffectProto.signal = _ownSignal;
    EffectProto.root = _ownRoot;
    EffectProto.effect = _effEffect;
    EffectProto.watch = _effWatch;
    EffectProto.spawn = _effSpawn;
}



/**
 * @param {!Effect} node
 * @returns {void}
 */
function startEffect(node) {
    if (IDLE) {
        IDLE = false;
        try {
            TRANSACTION = VERSION;
            node._update(TIME);
            if (SIGNALS_COUNT > 0 || DISPOSES_COUNT > 0) {
                start();
            }
        } catch (err) {
            let recovered = tryRecover(node, err);
            node._dispose();
            if (!recovered) {
                throw err;
            }
        } finally {
            IDLE = true;
        }
    } else {
        try {
            node._update(TIME);
        } catch (err) {
            let recovered = tryRecover(node, err);
            node._dispose();
            if (!recovered) {
                throw err;
            }
        }
    }
}

/**
 * Resolves a promise returned by an async effect. If the
 * resolved value is a function, registers it as cleanup.
 * @param {WeakRef<!Effect>} ref
 * @param {!Promise} promise
 * @returns {void}
 */
function resolveEffectPromise(ref, promise) {
    promise.then((val) => {
        let node = ref.deref();
        if (node !== void 0 && !(node._flag & FLAG_DISPOSED)) {
            node._flag &= ~FLAG_LOADING;
            if (typeof val === 'function') {
                addCleanup(node, val);
            }
        }
    }, (err) => {
        let node = ref.deref();
        if (node !== void 0 && !(node._flag & FLAG_DISPOSED)) {
            node._flag &= ~FLAG_LOADING;
            let recovered = tryRecover(node, err);
            if (!recovered) {
                node._dispose();
            }
        }
    });
}

/**
 * Resolves an async iterable returned by a streaming effect.
 * Each yielded function is registered as cleanup.
 * @param {WeakRef<!Effect>} ref
 * @param {AsyncIterable | AsyncIterator} iterable
 * @returns {void}
 */
function resolveEffectIterator(ref, iterable) {
    let iterator = typeof iterable[Symbol.asyncIterator] === 'function'
        ? iterable[Symbol.asyncIterator]()
        : iterable;
    let onNext = (result) => {
        let node = ref.deref();
        if (node === void 0 || (node._flag & FLAG_DISPOSED)) {
            if (typeof iterator.return === 'function') {
                iterator.return();
            }
            return;
        }
        if (result.done) {
            node._flag &= ~FLAG_LOADING;
            return;
        }
        iterator.next().then(onNext, onError);
        node._flag &= ~FLAG_LOADING;
        if (typeof result.value === 'function') {
            addCleanup(node, result.value);
        }
    };
    let onError = (err) => {
        let node = ref.deref();
        if (node !== void 0 && !(node._flag & FLAG_DISPOSED)) {
            node._flag &= ~FLAG_LOADING;
            let recovered = tryRecover(node, err);
            if (!recovered) {
                node._dispose();
            }
        }
    };
    iterator.next().then(onNext, onError);
}

/**
 * @param {Owner} node
 * @param {function(): void} fn
 * @returns {void}
 */
function addCleanup(node, fn) {
    let cur = node._cleanup;
    if (cur === null) {
        node._cleanup = fn;
    } else if (typeof cur === 'function') {
        node._cleanup = [cur, fn];
    } else {
        cur.push(fn);
    }
}

/**
 * @param {Owner} node
 * @param {function(*): boolean} fn
 * @returns {void}
 */
function addRecover(node, fn) {
    let cur = node._recover;
    if (cur === null) {
        node._recover = fn;
    } else if (typeof cur === 'function') {
        node._recover = [cur, fn];
    } else {
        cur.push(fn);
    }
    node._flag |= FLAG_RECOVER;
}

/**
 * @returns {void}
 */
function start() {
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
            if (DISPOSES_COUNT > 0) {
                let count = DISPOSES_COUNT;
                for (let i = 0; i < count; i++) {
                    DISPOSES[i]._dispose();
                    DISPOSES[i] = null;
                }
                DISPOSES_COUNT = 0;
            }
            if (SIGNALS_COUNT > 0) {
                let count = SIGNALS_COUNT;
                for (let i = 0; i < count; i++) {
                    SIGNALS[i]._assign(PAYLOADS[i]);
                    SIGNALS[i] = PAYLOADS[i] = null;
                }
                SIGNALS_COUNT = 0;
            }
            if (SCOPES_COUNT > 0) {
                let levels = LEVELS.length;
                for (let i = 0; i < levels; i++) {
                    let count = LEVELS[i];
                    let effects = SCOPES[i];
                    for (let j = 0; j < count; j++) {
                        let node = effects[j];
                        if ((node._flag & FLAG_STALE) || ((node._flag & FLAG_PENDING) && needsUpdate(node, time))) {
                            try {
                                TRANSACTION = VERSION;
                                node._update(time);
                            } catch (err) {
                                let recovered = tryRecover(node, err);
                                node._dispose();
                                if (!recovered && !thrown) {
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
                SCOPES_COUNT = 0;
            }
            if (EFFECTS_COUNT > 0) {
                let count = EFFECTS_COUNT;
                for (let i = 0; i < count; i++) {
                    let node = EFFECTS[i];
                    EFFECTS[i] = null;
                    if ((node._flag & FLAG_STALE) || ((node._flag & FLAG_PENDING) && needsUpdate(node, time))) {
                        TRANSACTION = VERSION;
                        try {
                            node._update(time);
                        } catch (err) {
                            let recovered = tryRecover(node, err);
                            node._dispose();
                            if (!recovered && !thrown) {
                                error = err;
                                thrown = true;
                            }
                        }
                    } else {
                        node._flag &= ~(FLAG_STALE | FLAG_PENDING);
                    }
                }
                EFFECTS_COUNT = 0;
            }
            if (cycle++ === 1e5) {
                error = new Error('Runaway cycle');
                thrown = true;
                break;
            }
        } while (
            !thrown &&
            (SIGNALS_COUNT > 0 ||
                DISPOSES_COUNT > 0)
        );
    } finally {
        IDLE = true;
        DISPOSES_COUNT =
            SIGNALS_COUNT =
            EFFECTS_COUNT =
            SCOPES_COUNT = 0;
        if (thrown) {
            throw error;
        }
    }
}

/**
 * @param {Sender} send
 * @param {Receiver} receive
 * @param {number} depslot
 * @returns {number}
 */
function subscribe(send, receive, depslot) {
    /** @type {number} */
    let subslot = -1;
    if (send._sub1 === null) {
        send._sub1 = receive;
        send._sub1slot = depslot;
        /* subslot = -1 */
    } else if (send._subs === null) {
        subslot = 0;
        send._subs = [receive, depslot];
    } else {
        subslot = send._subs.length;
        send._subs.push(receive, depslot);
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
        let lastSlot = /** @type {number} */(subs.pop());
        let lastNode = /** @type {Receiver} */(subs.pop());
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
     * FLAG_WEAK computes release their cached value when the last
     * subscriber is removed.  The node stays alive (deps intact)
     * but marks itself STALE so the next .val() recomputes fresh.
     * This keeps idle weak computes from retaining large objects.
     */
    if (
        (send._flag & FLAG_WEAK) &&
        send._sub1 === null &&
        (send._subs === null || send._subs.length === 0)
    ) {
        send._flag |= FLAG_STALE;
        /** @type {Compute} */(send)._value = null;
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
        let lastSlot = /** @type {number} */(deps.pop());
        let lastNode = /** @type {Sender} */(deps.pop());
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
            clearReceiver(/** @type {Sender} */(deps[i]), /** @type {number} */(deps[i + 1]));
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
            clearSender(/** @type {Receiver} */(subs[i]), /** @type {number} */(subs[i + 1]));
        }
        send._subs = null;
    }
}

/**
 * Runs and clears any registered cleanup fns. Called before re-running an
 * effect, and on disposal. Cheap when `_cleanup` is null (common) — caller
 * is expected to guard via the null check before invoking.
 * @param {Owner} owner
 * @returns {void}
 */
function clearCleanup(owner) {
    let cleanup = owner._cleanup;
    if (typeof cleanup === 'function') {
        cleanup();
        owner._cleanup = null;
    } else {
        /** array form */
        let count = /** @type {!Array} */(cleanup).length;
        while (count-- > 0) {
            /** @type {!Array} */(cleanup).pop()();
        }
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
    let count = /** @type {!Array} */(owned).length;
    while (count-- > 0) {
        /** @type {!Array} */(owned).pop()._dispose();
    }
    owner._recover = null;
}

/**
 * Walks the ownership chain looking for recover handlers.
 * @param {Effect} node
 * @param {*} error
 * @returns {boolean} true if error was handled
 */
function tryRecover(node, error) {
    let owner = node._owner;
    while (owner !== null) {
        if (owner._flag & FLAG_RECOVER) {
            let recover = owner._recover;
            if (typeof recover === 'function') {
                if (recover(error) === true) {
                    return true;
                }
            } else if (recover !== null) {
                let len = recover.length;
                for (let i = 0; i < len; i++) {
                    if (recover[i](error) === true) {
                        return true;
                    }
                }
            }
        }
        owner = owner._owner;
    }
    return false;
}

/**
 * @param {Receiver} node
 * @returns {boolean}
 */
function unbound(node) {
    return (
        node._dep1 === null &&
        (
            node._deps === null ||
            node._deps.length === 0
        )
    )
}

/**
 * @template T
 * @this {Receiver}
 * @param {!Sender<T>} sender
 * @returns {T}
 */
function read(sender) {
    if (sender._version === this._version) {
        return sender._value;
    }
    let flag = this._flag;
    let value = sender.val();
    if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
        return value;
    }
    let version = this._version;
    let stamp = sender._version;

    sender._version = version;

    /** Reuse: was our dep last run, visited again this run — O(1) */
    if (stamp === version - 1) {
        REUSED++;
        return value;
    }

    /**
     * Conflict: tagged by some other running node in this execution
     * tree. Save [sender, version] to global VSTACK for restoration.
     */
    if (stamp > TRANSACTION) {
        VSTACK[VCOUNT++] = sender;
        VSTACK[VCOUNT++] = stamp;
    }

    if (flag & FLAG_SETUP) {
        connect(this, sender);
    } else {
        if (this._deps === null) {
            this._deps = [sender, 0];
        } else {
            this._deps.push(sender, 0);
        }
    }
    return value;
}

/**
 * Setup-mode dependency connection. Writes deps to DSTACK instead
 * of creating/growing _deps arrays directly. After the fn returns,
 * _update slices DSTACK to create an exact-capacity _deps array.
 * @param {Receiver} receiver
 * @param {Sender} sender
 */
function connect(receiver, sender) {
    if (receiver._dep1 === null) {
        let subslot = subscribe(sender, receiver, -1);
        receiver._dep1 = sender;
        receiver._dep1slot = subslot;
    } else {
        let depslot = DCOUNT - DBASE;
        let subslot = subscribe(sender, receiver, depslot);
        DSTACK[DCOUNT++] = sender;
        DSTACK[DCOUNT++] = subslot;
    }
}

// ─── pruneDeps ─────────────────────────────────────────────────────────────

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
function pruneDeps(node, version, depCount) {
    let deps = node._deps;
    let existingLen = depCount > 1 ? (depCount - 1) * 2 : 0;
    /** ni = index of next new dep to consume (unsubscribed, slot 0) */
    let ni = deps !== null ? existingLen : 0;
    let totalLen = deps !== null ? deps.length : 0;

    /** Check dep1 */
    let dep1 = node._dep1;
    if (dep1 !== null && depCount >= 1) {
        if (dep1._version !== version) {
            clearReceiver(dep1, node._dep1slot);
            if (ni < totalLen) {
                /** Fill dep1 with a new dep */
                node._dep1 = /** @type {Sender} */(deps[ni]);
                node._dep1slot = subscribe(/** @type {Sender} */(deps[ni]), node, -1);
                ni += 2;
            } else {
                node._dep1 = null;
                node._dep1slot = 0;
            }
        }
    }

    if (deps === null) {
        return;
    }

    /**
     * Three-pointer scan:
     *   i    — forward through existing region
     *   ni   — next new dep to consume (unsubscribed, in new region)
     *   tail — end of live region, shrinks when we pop reused deps from the back
     *
     * When we hit a dropped dep at position i:
     *   1. If new deps available (ni < totalLen): subscribe new dep at position i
     *   2. Else: scan backward from tail to find last reused dep, move it to i
     *      Any dropped deps found during backward scan are also cleared.
     *      When forward and backward pointers meet, we're done.
     */
    let tail = existingLen;
    let i = 0;
    while (i < tail) {
        let dep = /** @type {Sender} */(deps[i]);
        let slot = /** @type {number} */(deps[i + 1]);
        if (dep._version === version) {
            /** Reused — stays in place */
            i += 2;
            continue;
        }
        /** Dropped — unbind */
        clearReceiver(dep, slot);
        if (ni < totalLen) {
            /** Fill hole with next new dep */
            let newDep = /** @type {Sender} */(deps[ni]);
            let subslot = subscribe(newDep, node, i);
            deps[i] = newDep;
            deps[i + 1] = subslot;
            ni += 2;
            i += 2;
        } else {
            /**
             * No new deps left. Scan backward from tail to find
             * the last reused dep and swap it into this hole.
             */
            let found = 0;
            while (tail > i + 2) {
                tail -= 2;
                let tDep = /** @type {Sender} */(deps[tail]);
                let tSlot = /** @type {number} */(deps[tail + 1]);
                if (tDep._version === version) {
                    /** Move reused dep into the hole at i */
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
                    clearReceiver(tDep, tSlot);
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

    /** Remaining new deps — subscribe at the end of the live region */
    while (ni < totalLen) {
        let dep = /** @type {Sender} */(deps[ni]);
        let subslot = subscribe(dep, node, tail);
        deps[tail] = dep;
        deps[tail + 1] = subslot;
        tail += 2;
        ni += 2;
    }

    /** Trim or null out */
    if (tail === 0) {
        node._deps = null;
    } else if (tail === 2 && node._dep1 === null) {
        /** Single dep in array, dep1 empty — promote to dep1 */
        let dep = /** @type {Sender} */(deps[0]);
        let slot = /** @type {number} */(deps[1]);
        node._dep1 = dep;
        node._dep1slot = slot;
        if (slot === -1) {
            dep._sub1slot = -1;
        } else {
            dep._subs[slot + 1] = -1;
        }
        node._deps = null;
    } else {
        deps.length = tail;
    }
}

/**
 * @param {number} stamp
 * @param {Receiver | null} dep1 
 * @param {Array<Receiver> | null} deps 
 */
function sweep(stamp, dep1, deps) {
    let depCount = 0;
    if (dep1 !== null) {
        let depver = dep1._version;
        if (depver > TRANSACTION) {
            VSTACK[VCOUNT++] = dep1;
            VSTACK[VCOUNT++] = depver;
        }
        dep1._version = stamp;
        depCount = 1;
    }
    if (deps !== null) {
        let count = deps.length;
        for (let i = 0; i < count; i += 2) {
            let dep = /** @type {Sender} */(deps[i]);
            let depver = dep._version;
            if (depver > TRANSACTION) {
                VSTACK[VCOUNT++] = dep;
                VSTACK[VCOUNT++] = depver;
            }
            dep._version = stamp;
        }
        depCount += count >> 1;
    }
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
            sub = /** @type {Receiver} */(subs[i]);
            let flags = sub._flag;
            sub._flag |= flag;
            if (!(flags & (FLAG_PENDING | FLAG_STALE))) {
                sub._receive();
            }
        }
    }
}

/**
 * @param {function(): ((function(): void) | void)} fn
 * @returns {Root}
 */
function root(fn) {
    let node = new Root();
    startRoot(node, fn);
    return node;
}

/**
 * @template T
 * @param {T} value
 * @returns {Signal<T>}
 */
function signal(value) {
    return new Signal(value);
}

/**
 * @template T,W
 * @param {function(T,W): T} fn
 * @param {T=} seed
 * @param {number=} opts
 * @param {W=} args
 * @returns {Compute<T,W>}
 */
function compute(fn, seed, opts, args) {
    let flag = FLAG_SETUP | ((0 | opts) & OPTIONS);
    let node = new Compute(flag, fn, null, seed, args);
    if (!(flag & FLAG_DEFER)) {
        startCompute(node);
    }
    return node;
}

/**
 * @param {function|Sender} fnOrDep
 * @param {*=} seedOrFn
 * @param {*=} argsOrSeed
 * @param {*=} args
 * @returns {!Compute}
 */
function derive(fnOrDep, seedOrFn, argsOrSeed, args) {
    let node;
    if (typeof fnOrDep === 'function') {
        node = new Compute(FLAG_STABLE | FLAG_SETUP, fnOrDep, null, seedOrFn, argsOrSeed);
    } else {
        node = new Compute(FLAG_STABLE | FLAG_BOUND, seedOrFn, fnOrDep, argsOrSeed, args);
        node._dep1slot = subscribe(fnOrDep, node, -1);
    }
    startCompute(node);
    return node;
}

/**
 * Async compute. Returns a promise whose resolved value becomes
 * the node's settled value. Stable by default; pass OPT_DYNAMIC
 * for dynamic dependency tracking.
 * @template T,W
 * @param {function(T,W): Promise<T>} fn
 * @param {T=} seed
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Compute<T,null,null,W>}
 */
function task(fn, seed, opts, args) {
    opts = 0 | opts;
    let flag = FLAG_ASYNC | FLAG_SETUP | (opts & OPTIONS);
    if (!(opts & OPT_DYNAMIC)) {
        flag |= FLAG_STABLE;
    }
    let node = new Compute(flag, fn, null, seed, args);
    if (!(flag & FLAG_DEFER)) {
        startCompute(node);
    }
    return node;
}

/**
 * @template W
 * @param {function(!Effect, W): (function(): void | void)} fn
 * @param {number=} opts
 * @param {W=} args
 * @returns {Effect<null,null,W>}
 */
function effect(fn, opts, args) {
    let flag = FLAG_SETUP | ((0 | opts) & OPTIONS);
    let node = new Effect(flag, fn, null, null, args);
    startEffect(node);
    return node;
}

/**
 * Async effect. Returns a promise whose resolved value, if a
 * function, is registered as cleanup. Stable by default; pass
 * OPT_DYNAMIC for dynamic dependency tracking.
 * @template W
 * @param {function(!Effect, W): Promise<(function(): void) | void>} fn
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Effect<null,null,W>}
 */
function spawn(fn, opts, args) {
    opts = 0 | opts;
    let flag = FLAG_ASYNC | FLAG_SETUP | (opts & OPTIONS);
    if (!(opts & OPT_DYNAMIC)) {
        flag |= FLAG_STABLE;
    }
    let node = new Effect(flag, fn, null, null, args);
    startEffect(node);
    return node;
}

/**
 * Stable effect. Two signatures:
 *   watch(fn, args?)       — multi-dep, uses setup tracking
 *   watch(dep, fn, args?)  — bound single-dep, skips setup
 * @param {function|Sender} fnOrDep
 * @param {*=} fnOrArgs
 * @param {*=} args
 * @returns {!Effect}
 */
function watch(fnOrDep, fnOrArgs, args) {
    if (typeof fnOrDep === 'function') {
        let node = new Effect(FLAG_STABLE | FLAG_SETUP, fnOrDep, null, null, fnOrArgs);
        startEffect(node);
        return node;
    }
    let node = new Effect(FLAG_STABLE | FLAG_BOUND, fnOrArgs, fnOrDep, null, args);
    node._dep1slot = subscribe(fnOrDep, node, -1);
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
            start();
        } finally {
            IDLE = true;
        }
    } else {
        fn();
    }
}

export {
    FLAG_DEFER, FLAG_STABLE, FLAG_SETUP, FLAG_STALE, FLAG_PENDING,
    FLAG_RUNNING, FLAG_DISPOSED, FLAG_LOADING, FLAG_ERROR, FLAG_RECOVER,
    FLAG_BOUND, FLAG_DERIVED, FLAG_EQUAL, FLAG_WEAK,
    FLAG_INIT,
    FLAG_ASYNC, FLAG_STREAM,
    OPT_DEFER, OPT_STABLE, OPT_SETUP, OPT_WEAK, OPT_DYNAMIC,
    OPTIONS,
    IDLE,
    subscribe,
    startEffect,
}

export {
    Root,
    Signal,
    Compute,
    Effect,
    root,
    signal,
    compute,
    derive,
    task,
    effect,
    watch,
    spawn,
    batch
}
