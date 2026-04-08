import { Anod } from "./api.js";
import { Disposer, Owner, Sender, Receiver, Clock, ISignal, ICompute, IEffect } from "./types.js";

/** @const {number} */ const OP_VALUE = 1 << 30;
/** @const {number} */ const OP_CALLBACK = 1 << 29;

/** @const {Array<function(Signal, *): void>} */
var CALLBACKS = [];

/**
 * Registers a callback for deferred signal operations.
 * Returns an op value (callback index | OP_CALLBACK flag) that can be
 * passed to scheduleSignal. When the transaction loop processes the
 * entry, it calls CALLBACKS[op & ~OP_CALLBACK](signal, payload).
 * @param {function(Signal, *): void} fn
 * @returns {number}
 */
function register(fn) {
    let index = CALLBACKS.length;
    CALLBACKS[index] = fn;
    return index | OP_CALLBACK;
}

/**
 * Mutation tracking bit layout (32-bit unsigned via >>> 0):
 *
 *   Bits  0– 2 : op type   (MUT_ADD=1, MUT_DEL=2, MUT_SORT=4)
 *   Bits  3–14 : length    (12 bits, max 4095 — affected region extent)
 *   Bits 15–31 : position  (17 bits, max 131071 — mutation start index)
 */
/** @const {number} */ const MUT_ADD = 1;
/** @const {number} */ const MUT_DEL = 2;
/** @const {number} */ const MUT_SORT = 4;
/** @const {number} */ const MUT_OP_MASK = 7;
/** @const {number} */ const MUT_LEN_SHIFT = 3;
/** @const {number} */ const MUT_LEN_MASK = 0xFFF;
/** @const {number} */ const MUT_POS_SHIFT = 15;
/** @const {number} */ const MUT_POS_MASK = 0x1FFFF;

/**
 * Context state bits, stored on Reader._state / Subscriber._state.
 * Encodes per-execution state that the user can set
 * via the IReader API during a compute/effect fn.
 */
/** @const {number} */ const CTX_EQUAL = 1;
/** @const {number} */ const CTX_NOTEQUAL = 2;
/** @const {number} */ const CTX_PROMISE = 4;
/** @const {number} */ const CTX_ITERABLE = 8;
/** @const {number} */ const CTX_ASYNC = CTX_PROMISE | CTX_ITERABLE;
/** @const {number} */ const CTX_OWNER = 16;

/** @const {number} */ const FLAG_DEFER = 1;
/** @const {number} */ const FLAG_STABLE = 2;
/** @const {number} */ const FLAG_SETUP = 4;
/** @const {number} */ const FLAG_STALE = 8;
/** @const {number} */ const FLAG_TRANSMIT = 16;
/** @const {number} */ const FLAG_PENDING = 32;
/** @const {number} */ const FLAG_RUNNING = 64;
/** @const {number} */ const FLAG_DISPOSED = 128;
/** @const {number} */ const FLAG_LOADING = 256;
/** @const {number} */ const FLAG_ERROR = 512;
/** @const {number} */ const FLAG_RECOVER = 1024;
/** @const {number} */ const FLAG_BOUND = 2048;
/** @const {number} */ const FLAG_DERIVED = 4096;
/** @const {number} */ const FLAG_SCOPE = 8192;
/** @const {number} */ const FLAG_WEAK = 16384;

const FLAG_SCHEDULED = 1 << 30;

/**
 * Runtime bit set/cleared by the equal() method during a compute
 * execution.  Separate from FLAG_NOTIFY (the opt) so both features
 * can coexist on a single node.
 * Set  -> "I am equal, suppress notification"
 * Clear -> default; or if the user explicitly calls equal(false),
 *         the absence of FLAG_EQUAL combined with the absence of
 *         FLAG_NOTIFY triggers forced notification (see FLAG_NOTEQUAL).
 */
/** @const {number} */ const FLAG_EQUAL = 0x40000;
/**
 * Runtime bit set by equal(false) to indicate "I am NOT equal,
 * force notification regardless of value change".
 */
/** @const {number} */ const FLAG_NOTEQUAL = 0x80000;
/**
 * Set in Compute/Effect constructors, cleared after the first
 * runCompute/runEffect.  Lets optimization code distinguish a
 * never-executed node from one whose previous value is valid.
 */
/** @const {number} */ const FLAG_INIT = 0x100000;
/** @const {number} */ const FLAG_ASYNC = 0x200000;
/** @const {number} */ const FLAG_STREAM = 0x400000;

/** @const {number} */ const OPT_DEFER = FLAG_DEFER;
/** @const {number} */ const OPT_STABLE = FLAG_STABLE;
/** @const {number} */ const OPT_SETUP = FLAG_SETUP;
/** @const {number} */ const OPT_NOTIFY = FLAG_TRANSMIT;
/** @const {number} */ const OPT_WEAK = FLAG_WEAK;
/**
 * Opt-in to dynamic dependency tracking. Only consumed at
 * construction time by task/spawn/scope to suppress the default
 * FLAG_STABLE. Not stored in node._flag -- not in OPTIONS mask.
 */
/** @const {number} */ const OPT_DYNAMIC = 0x800000;

/** @const {number} */
const OPTIONS = OPT_DEFER | OPT_STABLE | OPT_SETUP | OPT_NOTIFY | OPT_WEAK | FLAG_ASYNC | FLAG_STREAM;

/** @const {number} */ const STATE_START = 0;
/** @const {number} */ const STATE_IDLE = 1;
/** @const {number} */ const STATE_OWNER = 8;
/** @const {number} */ const STATE_SCOPE = 16;

/** @const {number} */
const RESET = ~(STATE_IDLE | STATE_OWNER);

/** @const {number} */ const TYPEFLAG_MASK = 7;
/** @const {number} */ const TYPEFLAG_SEND = 8;
/** @const {number} */ const TYPEFLAG_RECEIVE = 16;
/** @const {number} */ const TYPEFLAG_OWNER = 32;

/** @const {number} */ const TYPE_ROOT = 1 | TYPEFLAG_OWNER;
/** @const {number} */ const TYPE_SIGNAL = 2 | TYPEFLAG_SEND;
/** @const {number} */ const TYPE_COMPUTE = 3 | TYPEFLAG_SEND | TYPEFLAG_RECEIVE;
/** @const {number} */ const TYPE_EFFECT = 4 | TYPEFLAG_OWNER | TYPEFLAG_RECEIVE;

/**
 * VER_HEAD watermark: snapshot of CLOCK._version at start of each
 * top-level node dispatch in start(). Used by prescanDep to detect
 * version conflicts between concurrently executing nodes in the
 * same execution tree.
 * @type {number}
 */
var VER_HEAD = 0;

/**
 * Global version conflict stack. Stores [sender, version] pairs
 * when prescanDep or _read encounters a dep already tagged by
 * another running node (version > VER_HEAD). Restored by
 * updateDynamicVersion after pruneDeps completes.
 * @type {Array}
 */
var VSTACK = new Array(64);
/** @type {number} Tail pointer into VSTACK */
var VCOUNT = 0;
/** @type {number} Count of existing deps confirmed during dynamic re-execution */
var REUSED = 0;

/**
 * @returns {!Clock}
 */
function clock() {
    let c = {
        _state: STATE_IDLE,
        _time: 1,
        _version: 1,
        _minlevel: 0,
        _maxlevel: 0,
        _disposes: 0,
        _signals: 0,
        _computes: 0,
        _scopes: 0,
        _effects: 0,
        _scope: null
    };
    return /** @type {!Clock} */(c);
}

/**
 * @const
 * @nocollapse
 * @type {!Clock}
 */
var CLOCK = clock();

/**
 * Pre-allocated queues. Fixed initial capacity avoids
 * V8 backing store growth/shrink churn when arrays are
 * filled and then nulled out every transaction cycle.
 * @const {number}
 */
var QUEUE_SIZE = 64;

/** @const @type {Array<Disposer>} */
var DISPOSES = new Array(QUEUE_SIZE);

/** @const @type {Array<number>} */
var SIGNAL_OPS = new Array(QUEUE_SIZE);

/**
 * @const
 * @type {Array<Signal>}
 */
var SIGNALS = new Array(32);
/**
 * @const
 * @type {Array}
 */
var PAYLOADS = new Array(32);

/**
 * Compute queue for FLAG_TRANSMIT nodes. These are eagerly
 * re-evaluated during the transaction loop before effects.
 * @const @type {Array<Compute>}
 */
var COMPUTES = new Array(QUEUE_SIZE);

/** @const @type {Array<number>} */
var LEVELS = [0, 0, 0, 0];
/** @const @type {Array<Array<Effect>>} */
var SCOPES = [[], [], [], []];
/** @const @type {Array<Effect>} */
var EFFECTS = new Array(QUEUE_SIZE);


/**
 *
 * @param {*} value
 * @returns {boolean}
 */
function isSignal(value) {
    return value !== null && typeof value === 'object' && (/** @type {Anod} */(value).t & TYPEFLAG_SEND) !== 0;
}

/**
 * @param {*} value
 * @returns {boolean}
 */
function isNumber(value) {
    return typeof value === 'number';
}

/**
 * @param {*} value
 * @returns {boolean}
 */
function isPrimitive(value) {
    if (value === null) {
        return true;
    }
    let type = typeof value;
    return type !== 'object' && type !== 'function';
}

/**
 * @param {*} value
 * @returns {boolean}
 */
function isFunction(value) {
    return typeof value === 'function';
}

export { isPrimitive, isNumber, isFunction, isSignal }

/**
 * @param {Signal} node
 * @param {number} op
 * @param {*} value
 * @returns {void}
 */
function scheduleSignal(node, op, value) {
    let index = CLOCK._signals++;
    SIGNAL_OPS[index] = op;
    SIGNALS[index * 2] = node;
    SIGNALS[index * 2 + 1] = value;
}

/**
 * @this {Disposer}
 * @returns {void}
 */
function dispose() {
    if (!(this._flag & FLAG_DISPOSED)) {
        if (CLOCK._state & STATE_IDLE) {
            this._dispose();
        } else {
            DISPOSES[CLOCK._disposes++] = this;
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

// ─── Update functions ──────────────────────────────────────────────────────
// These function-pointer based update strategies replace the old
// if/else branching inside runCompute/runEffect. Each node stores
// a reference to its current update function in _update, which is
// set to updateSetup at construction and transitioned to
// updateStable or updateDynamic after the first execution.

/**
 * Counts the total number of dependencies on a node.
 * @param {Receiver} node
 * @returns {number}
 */
function countDeps(node) {
    let count = node._dep1 !== null ? 1 : 0;
    if (node._deps !== null) {
        count += node._deps.length / 2;
    }
    return count;
}

/**
 * Pre-stamps a dependency with version - 1 before fn() runs,
 * enabling _read to detect reuse with a single comparison.
 * If the dep was already tagged by another running node in this
 * execution tree (version > VER_HEAD), saves its tag to _vstack
 * so pruneDeps can restore it.
 * @param {Sender} dep
 * @param {number} version
 * @returns {void}
 */
/**
 * Pre-stamps a dependency with version - 1 before fn() runs.
 * Returns 0 if no conflict, 1 if a version conflict was detected
 * (dep was already tagged by another running node this tree).
 * @param {Sender} dep
 * @param {number} version
 * @returns {number}
 */
function prescanDep(dep, version) {
    let v = dep._version;
    dep._version = version - 1;
    if (v > VER_HEAD) {
        /** Conflict: save [sender, version] to global VSTACK */
        VSTACK[VCOUNT++] = dep;
        VSTACK[VCOUNT++] = v;
        return 1;
    }
    return 0;
}

/**
 * @template T
 * @this {Compute<T>}
 * @param {Compute} this
 * @param {number} time
 * @returns {T}
 */
function updateSetup(time) {
    let prevVersion = this._version;
    let version = CLOCK._version += 2;
    this._version = version;

    let value = this._fn(this, this._value, this._args);

    this._version = prevVersion;
    if (this._flag & FLAG_STABLE) {
        this._update = updateStable;
    } else {
        this._update = updateDynamic;
    }
    return value;
}

/**
 * Stable re-execution path. Does NOT bump CLOCK._version because
 * stable nodes never touch sender._version in _read. The _read
 * function returns early on the (FLAG_STABLE | FLAG_SETUP) ===
 * FLAG_STABLE check without any tracking overhead.
 * @param {Compute} this
 * @param {number} time
 * @returns {void}
 */
function updateStable(time) {
    return this._fn(this, this._value, this._args);
}

/**
 * Dynamic re-execution path. Bumps CLOCK._version, prescans
 * existing deps, runs fn(), then reconciles via pruneDeps.
 * New deps discovered during fn() are pushed directly to _deps
 * beyond the _depCount region.
 * @param {Compute} this
 * @param {number} time
 * @returns {void}
 */
function updateDynamic(time) {
    let prevVersion = this._version;
    let version = CLOCK._version += 2;
    this._version = version;

    /**
     * Prescan all existing deps with version - 1 so _read
     * can confirm them with a single comparison.
     */
    let depCount = 0;
    let dep1 = this._dep1;
    if (dep1 !== null) {
        if (this._flag & FLAG_BOUND) {
            dep1._version = version;
        } else {
            if (prescanDep(dep1, version)) {
                return updateDynamicVersion.call(this, version, prevVersion, 1);
            }
        }
        depCount = 1;
    }
    let deps = this._deps;
    if (deps !== null) {
        let len = deps.length;
        for (let i = 0; i < len; i += 2) {
            if (prescanDep(/** @type {Sender} */(deps[i]), version)) {
                return updateDynamicVersion.call(this, version, prevVersion, depCount + i / 2 + 1);
            }
        }
        depCount += len / 2;
    }

    let value = this._fn(this, this._value, this._args);
    pruneDeps(this, version, depCount);
    this._version = prevVersion;
    return value;
}

/**
 * Slow path for dynamic execution when a version conflict was
 * detected at dep index `depCount` during prescan. Continues
 * prescanning from where updateDynamic stopped, runs fn(), then
 * restores VSTACK entries in a finally block.
 * @param {number} version
 * @param {number} depCount - number of deps already prescanned
 * @returns {*}
 */
function updateDynamicVersion(version, prevVersion, depCount) {
    let saveStart = VCOUNT;
    /**
     * Continue prescanning remaining deps that updateDynamic
     * didn't reach. The dep that triggered the conflict was
     * already saved by prescanDep before we got here.
     */
    let deps = this._deps;
    if (deps !== null) {
        let startIdx = depCount > 1 ? (depCount - 1) * 2 : 0;
        let len = deps.length;
        for (let i = startIdx; i < len; i += 2) {
            prescanDep(/** @type {Sender} */(deps[i]), version);
        }
        depCount += (len - startIdx) / 2;
    }
    let value;
    try {
        value = this._fn(this, this._value, this._args);
    } finally {
        pruneDeps(this, version, depCount);
        for (let i = VCOUNT - 2; i >= saveStart; i -= 2) {
            VSTACK[i]._version = VSTACK[i + 1];
        }
        VCOUNT = saveStart;
        this._version = prevVersion;
    }
    return value;
}

/**
 * First-run execution path for effects. Similar to updateSetup
 * for computes but handles cleanup/ownership and doesn't produce
 * a value.
 * @param {Effect} node
 * @returns {void}
 */
function updateEffectSetup(node) {
    let prevVersion = node._version;
    let version = CLOCK._version += 2;
    node._version = version;

    let value = node._fn(node, node._args);

    node._version = prevVersion;

    /** Clear FLAG_SETUP after first run */
    node._flag &= ~FLAG_SETUP;

    /** Transition update function for future runs */
    if (node._flag & FLAG_STABLE) {
        node._update = updateEffectStable;
    } else {
        node._update = updateEffectDynamic;
    }

    return value;
}

/**
 * Stable re-execution path for effects.
 * @param {Effect} node
 * @returns {*}
 */
function updateEffectStable(node) {
    node._flag |= FLAG_RUNNING;
    return node._fn(node, node._args);
}

/**
 * Dynamic re-execution path for effects.
 * @param {Effect} node
 * @returns {*}
 */
function updateEffectDynamic(node) {
    let prevVersion = node._version;
    let version = CLOCK._version += 2;
    node._version = version;

    let depCount = 0;
    let dep1 = node._dep1;
    if (dep1 !== null) {
        if (node._flag & FLAG_BOUND) {
            dep1._version = version;
        } else {
            if (prescanDep(dep1, version)) {
                return updateEffectDynamicVersion(node, version, prevVersion, 1);
            }
        }
        depCount = 1;
    }
    let deps = node._deps;
    if (deps !== null) {
        let len = deps.length;
        for (let i = 0; i < len; i += 2) {
            if (prescanDep(/** @type {Sender} */(deps[i]), version)) {
                return updateEffectDynamicVersion(node, version, prevVersion, depCount + i / 2 + 1);
            }
        }
        depCount += len / 2;
    }

    node._flag |= FLAG_RUNNING;
    let value = node._fn(node, node._args);
    pruneDeps(node, version, depCount);
    node._version = prevVersion;
    return value;
}

/**
 * Slow path for effect dynamic execution with version conflicts.
 * @param {Effect} node
 * @param {number} version
 * @param {number} prevVersion
 * @param {number} depCount
 * @returns {*}
 */
function updateEffectDynamicVersion(node, version, prevVersion, depCount) {
    let saveStart = VCOUNT;
    let deps = node._deps;
    if (deps !== null) {
        let startIdx = depCount > 1 ? (depCount - 1) * 2 : 0;
        let len = deps.length;
        for (let i = startIdx; i < len; i += 2) {
            prescanDep(/** @type {Sender} */(deps[i]), version);
        }
        depCount += (len - startIdx) / 2;
    }
    node._flag |= FLAG_RUNNING;
    let value;
    try {
        value = node._fn(node, node._args);
    } finally {
        pruneDeps(node, version, depCount);
        for (let i = VCOUNT - 2; i >= saveStart; i -= 2) {
            VSTACK[i]._version = VSTACK[i + 1];
        }
        VCOUNT = saveStart;
        node._version = prevVersion;
    }
    return value;
}

// ─── Reader / Subscriber ───────────────────────────────────────────────────
// Reader and Subscriber still exist as exported constructors for backward
// compatibility with anod-list, which extends their prototypes with
// _source() and _getMod(). In the new architecture the node itself is
// passed as the first argument to fn(), so Reader/Subscriber are only
// used as the context bridge for list.js.
//
// Reader is used for stable/bound/SETUP paths. Subscriber is aliased
// to the same constructor for API compatibility.

/**
 * Lightweight execution context. In the new architecture, the node
 * itself is the primary execution context. Reader wraps the node
 * reference for backward compat with anod-list.
 * @constructor
 */
function Reader() {
    /** @type {Receiver | null} */
    this._node = null;
    /** @type {number} */
    this._state = 0;
    /** @type {number} */
    this._version = 0;
}

/** @const */
var ReaderProto = Reader.prototype;

/**
 * Reader.read delegates to the node's _read method.
 * @template T
 * @param {!Sender<T>} sender
 * @returns {T}
 */
ReaderProto.read = function (sender) {
    return read.call(this._node, sender);
};

/**
 * Subscriber is aliased to Reader for backward compatibility.
 * @constructor
 */
function Subscriber() {
    /** @type {Receiver | null} */
    this._node = null;
    /** @type {number} */
    this._state = 0;
    /** @type {number} */
    this._version = 0;
}

/** @const */
var SubscriberProto = Subscriber.prototype;

/**
 * Subscriber.read delegates to the node's _read method.
 * @template T
 * @param {!Sender<T>} sender
 * @returns {T}
 */
SubscriberProto.read = function (sender) {
    return read.call(this._node, sender);
};

/**
 * Shared method: declares that this compute's output is
 * semantically equal to its previous value. Sets FLAG_EQUAL
 * or FLAG_NOTEQUAL directly on the node's _flag.
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
 * Shared method: marks the current node as stable (no more
 * dynamic dep tracking on subsequent runs).
 * @returns {void}
 */
function _stable() {
    this._flag |= FLAG_STABLE;
}

/**
 * Shared method: registers a cleanup function on the current node.
 * Only valid when the node is an Owner (Effect/Scope).
 * @param {function(): void} fn
 * @returns {void}
 */
function _cleanup(fn) {
    addCleanup(this, fn);
}

/**
 * Shared method: registers a recover handler on the current node.
 * Only valid when the node is an Owner (Effect/Scope).
 * @param {function(*): boolean} fn
 * @returns {void}
 */
function _recover(fn) {
    addRecover(this, fn);
}

/**
 * Reader/Subscriber equal/stable delegate to _node for compat with
 * anod-list which creates Reader/Subscriber instances.
 */
function _ctxEqual(eq) {
    if (eq === false) {
        this._node._flag = (this._node._flag | FLAG_NOTEQUAL) & ~FLAG_EQUAL;
    } else {
        this._node._flag = (this._node._flag | FLAG_EQUAL) & ~FLAG_NOTEQUAL;
    }
}
function _ctxStable() {
    this._node._flag |= FLAG_STABLE;
}
function _ctxError() {
    return (this._node._flag & FLAG_ERROR) !== 0;
}
function _ctxLoading() {
    return (this._node._flag & FLAG_LOADING) !== 0;
}
function _ctxCleanup(fn) {
    addCleanup(this._node, fn);
}
function _ctxRecover(fn) {
    addRecover(this._node, fn);
}

ReaderProto.equal = SubscriberProto.equal = _ctxEqual;
ReaderProto.stable = SubscriberProto.stable = _ctxStable;
ReaderProto.error = SubscriberProto.error = _ctxError;
ReaderProto.loading = SubscriberProto.loading = _ctxLoading;
ReaderProto.cleanup = SubscriberProto.cleanup = _ctxCleanup;
ReaderProto.recover = SubscriberProto.recover = _ctxRecover;

/**
 * Creates an owned Compute node. Only valid inside a Root or Scope.
 * @template T,W
 * @param {function(T,W): T} fn
 * @param {T=} seed
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Compute<T,null,null,W>}
 */
function _ctxCompute(fn, seed, opts, args) {
    let owner = CLOCK._scope;
    if (owner === null) {
        throw new Error('Ownership required');
    }
    let flag = FLAG_SETUP | ((0 | opts) & OPTIONS);
    let node = new Compute(flag, fn, null, seed, args);
    addOwned(owner, node);
    if (!(flag & FLAG_DEFER)) {
        startCompute(node);
    }
    return node;
}

/**
 * Creates an owned stable Compute node. Only valid inside a Root or Scope.
 * @template T,W
 * @param {function(T,W): T} fn
 * @param {T=} seed
 * @param {W=} args
 * @returns {!Compute<T,null,null,W>}
 */
function _ctxDerive(fn, seed, args) {
    let owner = CLOCK._scope;
    if (owner === null) {
        throw new Error('Ownership required');
    }
    let node = new Compute(FLAG_STABLE | FLAG_SETUP, fn, null, seed, args);
    addOwned(owner, node);
    startCompute(node);
    return node;
}

/**
 * Creates an owned stable Compute with OPT_NOTIFY. Only valid inside a Root or Scope.
 * @template T,W
 * @param {function(T,W): T} fn
 * @param {T=} seed
 * @param {W=} args
 * @returns {!Compute<T,null,null,W>}
 */
function _ctxTransmit(fn, seed, args) {
    let owner = CLOCK._scope;
    if (owner === null) {
        throw new Error('Ownership required');
    }
    let node = new Compute(FLAG_STABLE | FLAG_SETUP | FLAG_TRANSMIT | FLAG_TRANSMIT, fn, null, seed, args);
    addOwned(owner, node);
    startCompute(node);
    return node;
}

/**
 * Creates an owned Effect node. Only valid inside a Root or Scope.
 * @template W
 * @param {function(W): (function(): void | void)} fn
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Effect<null,null,W>}
 */
function _ctxEffect(fn, opts, args) {
    let owner = CLOCK._scope;
    if (owner === null) {
        throw new Error('Ownership required');
    }
    let flag = FLAG_SETUP | ((0 | opts) & OPTIONS);
    let node = new Effect(flag, fn, null, args);
    node._owner = owner;
    addOwned(owner, node);
    startEffect(node);
    return node;
}

/**
 * Creates an owned stable Effect node. Only valid inside a Root or Scope.
 * @template W
 * @param {function(W): (function(): void | void)} fn
 * @param {W=} args
 * @returns {!Effect<null,null,W>}
 */
function _ctxWatch(fn, args) {
    let owner = CLOCK._scope;
    if (owner === null) {
        throw new Error('Ownership required');
    }
    let node = new Effect(FLAG_STABLE | FLAG_SETUP, fn, null, args);
    node._owner = owner;
    addOwned(owner, node);
    startEffect(node);
    return node;
}

/**
 * Creates an owned Scope (Effect with FLAG_SCOPE). Only valid inside a Root or Scope.
 * @param {function(): (function(): void | void)} fn
 * @param {number=} opts
 * @returns {!Effect}
 */
function _ctxScope(fn, opts) {
    let owner = CLOCK._scope;
    if (owner === null) {
        throw new Error('Ownership required');
    }
    opts = 0 | opts;
    let flag = FLAG_SETUP | FLAG_SCOPE | (opts & OPTIONS);
    if (!(opts & OPT_DYNAMIC)) {
        flag |= FLAG_STABLE;
    }
    let node = new Effect(flag, fn, null);
    node._owner = owner;
    addOwned(owner, node);
    /** Only call setScope for scope Effects, not Root (Root has FLAG_SCOPE but no _level) */
    if ((owner._flag & FLAG_SCOPE) && (owner.t & TYPEFLAG_RECEIVE)) {
        setScope(node, owner);
    }
    startEffect(node);
    return node;
}

/**
 * Creates an owned async Compute. Only valid inside a Root or Scope.
 * @template T,W
 * @param {function(T,W): Promise<T>} fn
 * @param {T=} seed
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Compute<T,null,null,W>}
 */
function _ctxTask(fn, seed, opts, args) {
    let owner = CLOCK._scope;
    if (owner === null) {
        throw new Error('Ownership required');
    }
    opts = 0 | opts;
    let flag = FLAG_ASYNC | FLAG_SETUP | (opts & OPTIONS);
    if (!(opts & OPT_DYNAMIC)) {
        flag |= FLAG_STABLE;
    }
    let node = new Compute(flag, fn, null, seed, args);
    addOwned(owner, node);
    if (!(flag & FLAG_DEFER)) {
        startCompute(node);
    }
    return node;
}

/**
 * Creates an owned async Effect. Only valid inside a Root or Scope.
 * @template W
 * @param {function(W): Promise<(function(): void) | void>} fn
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Effect<null,null,W>}
 */
function _ctxSpawn(fn, opts, args) {
    let owner = CLOCK._scope;
    if (owner === null) {
        throw new Error('Ownership required');
    }
    opts = 0 | opts;
    let flag = FLAG_ASYNC | FLAG_SETUP | (opts & OPTIONS);
    if (!(opts & OPT_DYNAMIC)) {
        flag |= FLAG_STABLE;
    }
    let node = new Effect(flag, fn, null, args);
    node._owner = owner;
    addOwned(owner, node);
    startEffect(node);
    return node;
}

/**
 * Creates an owned Root. Only valid inside a Root or Scope.
 * @param {function(): ((function(): void) | void)} fn
 * @returns {!Root}
 */
function _ctxRoot(fn) {
    let owner = CLOCK._scope;
    if (owner === null) {
        throw new Error('Ownership required');
    }
    let node = new Root();
    addOwned(owner, node);
    startRoot(node, fn);
    return node;
}

/**
 * Creates an owned Signal. Only valid inside a Root or Scope.
 * @template T
 * @param {T} value
 * @returns {!Signal<T>}
 */
function _ctxSignal(value) {
    let owner = CLOCK._scope;
    if (owner === null) {
        throw new Error('Ownership required');
    }
    return new Signal(value);
}

/**
 * Ctx methods on Reader/Subscriber delegate to CLOCK._scope
 * through the _node for ownership checks. For backward compat
 * with anod-list, these use `this._node` as the context check.
 */
function _rdrCtxCompute(fn, seed, opts, args) {
    if (!(this._state & CTX_OWNER)) {
        throw new Error('Ownership required');
    }
    return _ctxCompute.call(null, fn, seed, opts, args);
}
function _rdrCtxDerive(fn, seed, args) {
    if (!(this._state & CTX_OWNER)) {
        throw new Error('Ownership required');
    }
    return _ctxDerive.call(null, fn, seed, args);
}
function _rdrCtxTransmit(fn, seed, args) {
    if (!(this._state & CTX_OWNER)) {
        throw new Error('Ownership required');
    }
    return _ctxTransmit.call(null, fn, seed, args);
}
function _rdrCtxEffect(fn, opts, args) {
    if (!(this._state & CTX_OWNER)) {
        throw new Error('Ownership required');
    }
    return _ctxEffect.call(null, fn, opts, args);
}
function _rdrCtxWatch(fn, args) {
    if (!(this._state & CTX_OWNER)) {
        throw new Error('Ownership required');
    }
    return _ctxWatch.call(null, fn, args);
}
function _rdrCtxScope(fn, opts) {
    if (!(this._state & CTX_OWNER)) {
        throw new Error('Ownership required');
    }
    return _ctxScope.call(null, fn, opts);
}
function _rdrCtxTask(fn, seed, opts, args) {
    if (!(this._state & CTX_OWNER)) {
        throw new Error('Ownership required');
    }
    return _ctxTask.call(null, fn, seed, opts, args);
}
function _rdrCtxSpawn(fn, opts, args) {
    if (!(this._state & CTX_OWNER)) {
        throw new Error('Ownership required');
    }
    return _ctxSpawn.call(null, fn, opts, args);
}
function _rdrCtxRoot(fn) {
    if (!(this._state & CTX_OWNER)) {
        throw new Error('Ownership required');
    }
    return _ctxRoot.call(null, fn);
}
function _rdrCtxSignal(value) {
    if (!(this._state & CTX_OWNER)) {
        throw new Error('Ownership required');
    }
    return _ctxSignal.call(null, value);
}

ReaderProto.compute = SubscriberProto.compute = _rdrCtxCompute;
ReaderProto.derive = SubscriberProto.derive = _rdrCtxDerive;
ReaderProto.transmit = SubscriberProto.transmit = _rdrCtxTransmit;
ReaderProto.effect = SubscriberProto.effect = _rdrCtxEffect;
ReaderProto.watch = SubscriberProto.watch = _rdrCtxWatch;
ReaderProto.scope = SubscriberProto.scope = _rdrCtxScope;
ReaderProto.task = SubscriberProto.task = _rdrCtxTask;
ReaderProto.spawn = SubscriberProto.spawn = _rdrCtxSpawn;
ReaderProto.root = SubscriberProto.root = _rdrCtxRoot;
ReaderProto.signal = SubscriberProto.signal = _rdrCtxSignal;

/**
 * Reader singleton used by startRoot for the ownership context.
 * @type {Reader}
 */
var READER = new Reader();

/**
 * @constructor
 * @implements {Owner}
 */
function Root() {
    /**
     * @type {number}
     */
    this._flag = FLAG_SCOPE;
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
 * @const
 * @type {number}
 */
RootProto.t = TYPE_ROOT;

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
    if (!(this._flag & FLAG_DISPOSED)) {
        this._flag |= FLAG_DISPOSED;
        clearOwned(this);
        this._cleanup =
            this._owned =
            this._recover = null;
    }
};

/**
 * @param {Root} root
 * @param {function(): ((function(): void) | void)} fn
 * @returns {void}
 */
function startRoot(root, fn) {
    let state = CLOCK._state;
    let scope = CLOCK._scope;
    /** @type {Reader} */
    let ctx = READER;
    let prevNode = ctx._node;
    let prevCtxState = ctx._state;
    CLOCK._state &= (RESET | STATE_IDLE);
    CLOCK._scope = root;
    CLOCK._state |= STATE_OWNER;
    ctx._node = root;
    ctx._state = CTX_OWNER;
    try {
        let cleanup = fn(ctx);
        if (typeof cleanup === 'function') {
            addCleanup(root, cleanup);
        }
    } finally {
        ctx._node = prevNode;
        ctx._state = prevCtxState;
        CLOCK._state = state;
        CLOCK._scope = scope;
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
    /**
     * @type {number}
     */
    this._mod = 0;
}

{
    /** @const */
    let SignalProto = Signal.prototype;

    /**
     * @const
     * @type {number}
     */
    SignalProto.t = TYPE_SIGNAL;

    /**
     * Change time: stamped when this signal's value changes.
     * Moved to prototype because Signal always sends FLAG_STALE,
     * so downstream nodes receiving from a Signal are always STALE,
     * never PENDING. The dep._ctime > node._time check is only
     * reached for FLAG_PENDING nodes, which cannot have been
     * notified by a Signal.
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
            if (CLOCK._state & STATE_IDLE) {
                this._value = value;
                notify(this, FLAG_STALE, CLOCK._time + 1);
                start(CLOCK);
            } else {
                this._flag |= FLAG_SCHEDULED;
                let index = CLOCK._signals++;
                SIGNALS[index] = this;
                PAYLOADS[index] = value;
            }
        }
    };

    /**
     * 
     * @param {T} value 
     * @param {number} time
     */
    SignalProto._update = function (value, time) {
        this._value = value;
        if (this._flag & FLAG_SCHEDULED) {
            this._flag &= ~FLAG_SCHEDULED;
            notify(this, FLAG_STALE, time);
        }
    };

    /**
     * @this {!Signal<T>}
     * @returns {void}
     */
    SignalProto._dispose = function () {
        if (!(this._flag & FLAG_DISPOSED)) {
            clearSubs(this);
            this._value = null;
        }
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
    this._flag = FLAG_STALE | FLAG_INIT | opts;
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
     * @type {function(number): void}
     */
    this._update = updateSetup;
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
     * Change time: stamped when this compute's value changes.
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
     * @const
     * @type {number}
     */
    ComputeProto.t = TYPE_COMPUTE;

    /**
     * @const
     * @type {number}
     */
    ComputeProto._mod = 0;

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
        let clock = CLOCK;
        let time = clock._time;
        let opts = this._flag;
        if (opts & FLAG_RUNNING) {
            throw new Error('Circular dependency');
        }
        if (opts & (FLAG_STALE | FLAG_PENDING)) {
            if (clock._state & STATE_IDLE) {
                clock._state &= RESET;
                try {
                    if (opts & FLAG_STALE) {
                        this._run(time);
                    } else {
                        checkRun(this, time);
                    }
                    if (clock._signals > 0 || clock._disposes > 0) {
                        start(clock);
                    }
                } finally {
                    clock._state = STATE_IDLE;
                }
            } else {
                if (opts & FLAG_STALE) {
                    this._run(time);
                } else {
                    checkRun(this, time);
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
        if (!(this._flag & FLAG_DISPOSED)) {
            this._flag |= FLAG_DISPOSED;
            clearSubs(this);
            clearDeps(this);
            this._fn =
                this._value =
                this._args = null;
        }
    };

    /**
     * 
     * @param {number} time 
     */
    ComputeProto._run = function (time) {
        let flag = this._flag;
        this._flag = (flag & ~(FLAG_STALE | FLAG_INIT | FLAG_EQUAL | FLAG_NOTEQUAL)) | FLAG_RUNNING;

        let value;
        try {
            value = this._update(time);
            this._flag &= ~FLAG_ERROR;
        } catch (err) {
            value = err;
            this._flag |= FLAG_ERROR;
        }
        flag = this._flag;
        this._flag &= ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING | FLAG_INIT | FLAG_SETUP);
        this._time = time;
        if (flag & FLAG_ERROR) {
            this._value = value;
            this._ctime = time;
        } else if (flag & (FLAG_ASYNC | FLAG_STREAM)) {
            this._flag |= FLAG_LOADING;
            if (flag & FLAG_STREAM) {
                resolveIterator(new WeakRef(this), /** @type {AsyncIterator | AsyncIterable} */(value), time);
            } else {
                resolvePromise(new WeakRef(this), /** @type {IThenable} */(value), time);
            }
        } else if (value !== this._value) {
            this._value = value;
            if (!(flag & FLAG_EQUAL)) {
                this._ctime = time;
            }
        } else if (flag & FLAG_NOTEQUAL) {
            this._ctime = time;
        } else if (flag & FLAG_TRANSMIT) {
            /**
             * FLAG_NOTIFY: always signal change to downstream
             * even when value is identical. Overrides equal(true).
             */
            this._ctime = time;
        }
    };

    /**
     * @param {number} time
     * @returns {void}
     */
    ComputeProto._receive = function (time) {
        if (this._flag & FLAG_TRANSMIT) {
            COMPUTES[CLOCK._computes++] = this;
            notify(this, FLAG_STALE, time);
        } else {
            notify(this, FLAG_PENDING, time);
        }
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

    /**
     * Registers a cleanup function. Only valid on Owner nodes.
     * @param {function(): void} fn
     * @returns {void}
     */
    ComputeProto.cleanup = _cleanup;

    /**
     * Registers a recover handler. Only valid on Owner nodes.
     * @param {function(*): boolean} fn
     * @returns {void}
     */
    ComputeProto.recover = _recover;
}

/**
 * @param {Compute} node
 * @returns {void}
 */
function startCompute(node) {
    let clock = CLOCK;
    let state = clock._state;
    try {
        VER_HEAD = clock._version;
        node._run(clock._time);
        if (clock._signals > 0 || clock._disposes > 0) {
            start(clock);
        }
    } finally {
        clock._state = state;
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
        if (dep._flag & (FLAG_STALE | FLAG_PENDING)) {
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
            if (dep._flag & (FLAG_STALE | FLAG_PENDING)) {
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
 * Pull-based evaluation. Recursively pulls deps, then only
 * runs this compute if a dep's value actually changed (_ctime).
 * @param {Compute | Effect} node
 * @param {number} time
 * @returns {void}
 */
function checkRun(node, time) {
    if (node._flag & FLAG_STALE) {
        node._run(time);
        return;
    }

    let lastRun = node._time;
    let dep = node._dep1;
    if (dep !== null) {
        if (dep._flag & FLAG_STALE) {
            dep._run(time);
        } else if (dep._flag & FLAG_PENDING) {
            checkRun(dep, time);
        }
        if (dep._ctime > lastRun) {
            node._run(time);
            return;
        }
    }
    let deps = node._deps;
    if (deps !== null) {
        let count = deps.length;
        for (let i = 0; i < count; i += 2) {
            dep = /** @type {Sender} */(deps[i]);
            if (dep._flag & FLAG_STALE) {
                dep._run(time);
            } else if (dep._flag & FLAG_PENDING) {
                checkRun(dep, time);
            }
            if (dep._ctime > lastRun) {
                node._run(time);
                return;
            }
        }
    }
    /** No dep changed -- clear flags without re-executing */
    node._flag &= ~(FLAG_STALE | FLAG_PENDING);
    node._time = time;
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
        let time = CLOCK._time + 1;
        node._ctime = time;
        if (unbound(node)) {
            node._fn = node._args = null;
        }
        notify(node, FLAG_STALE, time);
        start(CLOCK);
    }
}

/**
 * @constructor
 * @template U,W
 * @param {number} opts
 * @param {(function(W): (function(): void | void)) | (function(U,W): (function(): void | void))} fn
 * @param {Sender<U> | null} dep1
 * @param {W=} args
 * @implements {IEffect}
 */
function Effect(opts, fn, dep1, args) {
    /**
     * @type {number}
     */
    this._flag = FLAG_INIT | (0 | opts);
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
     * @type {W | undefined}
     */
    this._args = args;
    /**
     * @type {Owner | null}
     */
    this._owner = null;
    /**
     * @type {(function(*): boolean) | Array<(function(*): boolean)> | null}
     */
    this._recover = null;
    /**
     * @type {number}
     */
    this._version = 0;
    /**
     * Function pointer for the current update strategy.
     * @type {function(Effect): *}
     */
    this._update = updateEffectSetup;
}

{
    /** @const */
    let EffectProto = Effect.prototype;

    /**
     * @const
     * @type {number}
     */
    EffectProto.t = TYPE_EFFECT;


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
     * 
     * @param {number} time 
     */
    EffectProto._run = function (time) {
        let opts = this._flag;
        if (!(opts & FLAG_SETUP) && ((opts & FLAG_SCOPE) || this._cleanup !== null)) {
            clearOwned(this);
        }
        /** @type {(function(): void) | null | undefined} */
        let value;
        let state = CLOCK._state;
        let scope = CLOCK._scope;
        CLOCK._state &= RESET;
        if (opts & FLAG_SCOPE) {
            CLOCK._scope = this;
            CLOCK._state |= STATE_OWNER | STATE_SCOPE;
        }
        try {
            value = this._update(this);
        } finally {
            CLOCK._state = state;
            CLOCK._scope = scope;
        }
        this._time = time;
        this._flag &= ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING | FLAG_INIT);
        if (opts & (FLAG_ASYNC | FLAG_STREAM)) {
            this._flag |= FLAG_LOADING;
            if (opts & FLAG_STREAM) {
                resolveEffectIterator(new WeakRef(this), value);
            } else {
                resolveEffectPromise(new WeakRef(this), value);
            }
        } else if (typeof value === 'function') {
            addCleanup(this, value);
        }
    };

    /**
     * @this {!Effect<U,V,W>}
     * @returns {void}
     */
    EffectProto._dispose = function () {
        let opts = this._flag;
        if (!(opts & FLAG_DISPOSED)) {
            this._flag |= FLAG_DISPOSED;
            clearOwned(this);
            clearDeps(this);
            this._fn =
                this._owned =
                this._args =
                this._cleanup =
                this._recover =
                this._owner = null;
        }
    };

    /**
     * @param {number} time
     * @returns {void}
     */
    EffectProto._receive = function (time) {
        if (this._flag & FLAG_SCOPE) {
            let level = this._level;
            let count = LEVELS[level];
            SCOPES[level][count] = this;
            LEVELS[level] = count + 1;
            if (CLOCK._scopes++ === 0) {
                CLOCK._minlevel =
                    CLOCK._maxlevel = level;
            } else {
                if (level < CLOCK._minlevel) {
                    CLOCK._minlevel = level;
                }
                if (level > CLOCK._maxlevel) {
                    CLOCK._maxlevel = level;
                }
            }
        } else {
            EFFECTS[CLOCK._effects++] = this;
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
     * Ownership context methods on Effect.
     */
    EffectProto.compute = _ctxCompute;
    EffectProto.derive = _ctxDerive;
    EffectProto.transmit = _ctxTransmit;
    EffectProto.effect = _ctxEffect;
    EffectProto.watch = _ctxWatch;
    EffectProto.scope = _ctxScope;
    EffectProto.task = _ctxTask;
    EffectProto.spawn = _ctxSpawn;
    EffectProto.root = _ctxRoot;
    EffectProto.signal = _ctxSignal;
}



/**
 * @param {!Effect} node
 * @returns {void}
 */
function startEffect(node) {
    let clock = CLOCK;
    let state = clock._state;
    try {
        VER_HEAD = clock._version;
        node._run();
        node._time = clock._time;
        if (clock._signals > 0 || clock._disposes > 0) {
            start(clock);
        }
    } catch (err) {
        let recovered = tryRecover(node, err);
        node._dispose();
        if (!recovered) {
            throw err;
        }
    } finally {
        clock._state = state;
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
 * @param {Owner} node
 * @param {Receiver} child
 * @returns {void}
 */
function addOwned(node, child) {
    if (node._owned === null) {
        node._owned = [child];
    } else {
        node._owned.push(child);
    }
}

/**
 * @param {Owner} node
 * @param {Owner} owner
 * @returns {void}
 */
function setScope(node, owner) {
    let level = owner._level + 1;
    node._level = level;
    if (level > 3) {
        let depth = LEVELS.length;
        if (level >= depth) {
            LEVELS[depth] = 0;
            SCOPES[depth] = [];
        }
    }
}

/**
 * @param {!Clock} clock
 * @returns {void}
 */
function start(clock) {
    /** @type {number} */
    let time = 0;
    /** @type {number} */
    let cycle = 0;
    /** @type {*} */
    let error = null;
    /** @type {boolean} */
    let thrown = false;
    clock._state = STATE_START;
    try {
        do {
            time = ++clock._time;
            if (clock._disposes > 0) {
                let count = CLOCK._disposes;
                for (let i = 0; i < count; i++) {
                    DISPOSES[i]._dispose();
                    DISPOSES[i] = null;
                }
                clock._disposes = 0;
            }
            if (clock._signals > 0) {
                let count = clock._signals;
                for (let i = 0; i < count; i++) {
                    SIGNALS[i]._update(PAYLOADS[i]);
                    SIGNALS[i] = PAYLOADS[i] = null;
                }
                clock._signals = 0;
            }
            if (clock._computes > 0) {
                for (let i = 0; i < clock._computes; i++) {
                    let node = COMPUTES[i];
                    if (node._flag & FLAG_STALE) {
                        VER_HEAD = clock._version;
                        node._run(time);
                    }
                    COMPUTES[i] = null;
                }
                clock._computes = 0;
            }
            if (clock._scopes > 0) {
                let minlevel = clock._minlevel;
                let maxlevel = clock._maxlevel;
                let levels = LEVELS;
                let scopes = SCOPES;
                for (let i = minlevel; i <= maxlevel; i++) {
                    let effects = scopes[i];
                    let count = levels[i];
                    for (let j = 0; j < count; j++) {
                        let node = effects[j];
                        if ((node._flag & FLAG_STALE) || ((node._flag & FLAG_PENDING) && needsUpdate(node, time))) {
                            VER_HEAD = clock._version;
                            try {
                                node._run();
                            } catch (err) {
                                clock._state = STATE_START;
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
                        node._time = time;
                        effects[j] = null;
                    }
                    levels[i] = 0;
                }
                clock._scopes =
                    clock._minlevel =
                    clock._maxlevel = 0;
            }
            if (clock._effects > 0) {
                let i = 0;
                let count = clock._effects;
                while (i < count) {
                    try {
                        for (; i < count; i++) {
                            VER_HEAD = clock._version;
                            checkRun(EFFECTS[i], time);
                            EFFECTS[i] = null;
                        }
                    } catch (err) {
                        let node = EFFECTS[i];
                        EFFECTS[i++] = null;
                        clock._state = STATE_START;
                        let caught = tryRecover(node, err);
                        node._dispose();
                        if (!caught && !thrown) {
                            error = err;
                            thrown = true;
                        }
                    }
                }
                clock._effects = 0;
            }
            if (cycle++ === 1e5) {
                error = new Error('Runaway cycle');
                thrown = true;
                break;
            }
        } while (
            !thrown &&
            (clock._signals > 0 ||
                clock._disposes > 0)
        );
    } finally {
        clock._state = STATE_IDLE;
        if (clock._scopes > 0) {
            let min = clock._minlevel;
            let max = clock._maxlevel;
            while (min < max) {
                LEVELS[min++] = 0;
            }
        }
        clock._disposes =
            clock._signals =
            clock._computes =
            clock._effects =
            clock._scopes =
            clock._minlevel =
            clock._maxlevel = 0;
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
    let subslot = 0;
    if (send._sub1 === null) {
        send._sub1 = receive;
        send._sub1slot = depslot;
        /* subslot = 0 */
    } else if (send._subs === null) {
        subslot = 1;
        send._subs = [receive, depslot];
    } else {
        subslot = (send._subs.length / 2) + 1;
        send._subs.push(receive, depslot);
    }
    if (!(send._flag & FLAG_DERIVED) && (receive.t === TYPE_COMPUTE)) {
        send._flag |= FLAG_DERIVED;
    }
    return subslot;
}

/**
 * @param {Sender} send
 * @param {number} slot
 * @returns {void}
 */
function clearReceiver(send, slot) {
    if (slot === 0) {
        send._sub1 = null;
    } else {
        let subs = send._subs;
        let lastSlot = /** @type {number} */(subs.pop());
        let lastNode = /** @type {Receiver} */(subs.pop());
        let realIndex = (slot - 1) * 2;
        if (realIndex !== subs.length) {
            subs[realIndex] = lastNode;
            subs[realIndex + 1] = lastSlot;
            if (lastSlot === 0) {
                lastNode._dep1slot = slot;
            } else {
                lastNode._deps[(lastSlot - 1) * 2 + 1] = slot;
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
    if (slot === 0) {
        receive._dep1 = null;
    } else {
        let deps = receive._deps;
        let lastSlot = /** @type {number} */(deps.pop());
        let lastNode = /** @type {Sender} */(deps.pop());
        let realIndex = (slot - 1) * 2;
        if (realIndex !== deps.length) {
            deps[realIndex] = lastNode;
            deps[realIndex + 1] = lastSlot;
            if (lastSlot === 0) {
                lastNode._sub1slot = slot;
            } else {
                lastNode._subs[(lastSlot - 1) * 2 + 1] = slot;
            }
        }
    }
    if (receive._dep1 === null && (receive._deps === null || receive._deps.length === 0)) {
        if (receive.t === TYPE_EFFECT) {
            // todo
        } else {
            /** @type {Compute} */(receive)._fn = null;
        }
    }
}

/**
 * Removes receive from all its deps' subscriber lists.
 * @param {Receiver} receive
 * @returns {void}
 */
function clearDeps(receive) {
    let dep = receive._dep1;
    if (dep !== null) {
        clearReceiver(dep, receive._dep1slot);
        receive._dep1 = null;
    }
    let deps = receive._deps;
    if (deps !== null) {
        let len = deps.length;
        for (let i = 0; i < len; i += 2) {
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
    let sub = send._sub1;
    if (sub !== null) {
        clearSender(sub, send._sub1slot);
        send._sub1 = null;
    }
    let subs = send._subs;
    if (subs !== null) {
        let len = subs.length;
        for (let i = 0; i < len; i += 2) {
            clearSender(/** @type {Receiver} */(subs[i]), /** @type {number} */(subs[i + 1]));
        }
        send._subs = null;
    }
}

/**
 * @param {Owner} owner
 * @returns {void}
 */
function clearOwned(owner) {
    if (owner._flag & FLAG_SCOPE) {
        let owned = owner._owned;
        if (owned !== null) {
            let len = owned.length;
            for (let i = 0; i < len; i++) {
                owned[i]._dispose();
            }
            owner._owned = null;
        }
    }
    let cleanup = owner._cleanup;
    if (cleanup !== null) {
        owner._cleanup = null;
        if (typeof cleanup === 'function') {
            cleanup();
        } else {
            let len = cleanup.length;
            for (let i = 0; i < len; i++) {
                cleanup[i]();
            }
        }
    }
    if (owner._recover !== null) {
        owner._recover = null;
        owner._flag &= ~FLAG_RECOVER;
    }
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

// ─── _read function ────────────────────────────────────────────────────────

/**
 * Core dependency tracking function. Called as node.read(sender)
 * during a compute/effect fn execution. Handles three execution
 * modes:
 *
 * 1. STABLE post-setup: pure value return, zero tracking overhead
 * 2. SETUP: subscribes deps directly onto the node
 * 3. DYNAMIC: confirms reused deps via version tag, pushes new deps
 *    directly to _deps beyond the _depCount region
 *
 * @template T
 * @this {Receiver}
 * @param {!Sender<T>} sender
 * @returns {T}
 */
function read(sender) {
    let value = sender.val();
    let flag = this._flag;

    /**
     * Stable post-setup: pure value return, zero tracking overhead.
     * (FLAG_STABLE | FLAG_SETUP) === FLAG_STABLE means stable AND
     * NOT in setup mode.
     */
    if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
        return value;
    }

    let version = this._version;
    let v = sender._version;

    /** Re-read dedup: already visited this execution — O(1) */
    if (v === version) {
        return value;
    }

    /** Reuse: was our dep last run, visited again this run — O(1) */
    if (v === version - 1) {
        sender._version = version;
        REUSED++;
        return value;
    }

    /**
     * Conflict: tagged by some other running node in this execution
     * tree. Save [sender, version] to global VSTACK for restoration.
     */
    if (v > VER_HEAD) {
        VSTACK[VCOUNT++] = sender;
        VSTACK[VCOUNT++] = v;
    }

    /** New dep (or cold sender): stamp and subscribe */
    sender._version = version;

    if (flag & FLAG_SETUP) {
        /**
         * SETUP path: subscribe directly, same as original Reader code.
         */
        /** @type {number} */
        let depslot = 0;
        if (this._dep1 === null) {
            this._dep1 = sender;
        } else if (this._deps === null) {
            depslot = 1;
        } else {
            depslot = (this._deps.length / 2) + 1;
        }
        let subslot = subscribe(sender, this, depslot);
        switch (depslot) {
            case 0: this._dep1slot = subslot; break;
            case 1: this._deps = [sender, subslot]; break;
            default: this._deps.push(sender, subslot);
        }
    } else {
        /**
         * DYNAMIC path: push new dep directly beyond _depCount region.
         * No OVERFLOW needed -- just append to _deps and subscribe
         * immediately.
         */
        if (this._dep1 === null) {
            this._dep1 = sender;
            let subslot = subscribe(sender, this, 0);
            this._dep1slot = subslot;
        } else {
            let depslot = this._deps === null ? 1 : this._deps.length / 2 + 1;
            let subslot = subscribe(sender, this, depslot);
            if (this._deps === null) {
                this._deps = [sender, subslot];
            } else {
                this._deps.push(sender, subslot);
            }
        }
    }

    return value;
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
    /** Handle dep1 separately */
    let dep1 = node._dep1;
    if (dep1 !== null && depCount >= 1) {
        if (dep1._version !== version) {
            clearReceiver(dep1, node._dep1slot);
            node._dep1 = null;
            node._dep1slot = 0;
        }
    }

    let deps = node._deps;
    if (deps !== null) {
        let existingLen = depCount > 1 ? (depCount - 1) * 2 : 0;
        let totalLen = deps.length;
        let write = 0;

        /** Pass over existing deps: keep confirmed, drop stale */
        for (let i = 0; i < existingLen; i += 2) {
            let dep = /** @type {Sender} */(deps[i]);
            let slot = /** @type {number} */(deps[i + 1]);
            if (dep._version === version) {
                /** Reused — compact into write position */
                if (write !== i) {
                    deps[write] = dep;
                    deps[write + 1] = slot;
                    let newDepslot = write / 2 + 1;
                    if (slot === 0) {
                        dep._sub1slot = newDepslot;
                    } else {
                        dep._subs[(slot - 1) * 2 + 1] = newDepslot;
                    }
                }
                write += 2;
            } else {
                /** Dropped — unbind */
                clearReceiver(dep, slot);
            }
        }

        /** Append new deps (pushed beyond depCount during fn()) */
        for (let i = existingLen; i < totalLen; i += 2) {
            if (write !== i) {
                let dep = /** @type {Sender} */(deps[i]);
                let slot = /** @type {number} */(deps[i + 1]);
                deps[write] = dep;
                deps[write + 1] = slot;
                let newDepslot = write / 2 + 1;
                if (slot === 0) {
                    dep._sub1slot = newDepslot;
                } else {
                    dep._subs[(slot - 1) * 2 + 1] = newDepslot;
                }
            }
            write += 2;
        }

        if (write === 0) {
            node._deps = null;
        } else {
            deps.length = write;
        }
    }

    /** dep1 was dropped but new deps exist — promote first from _deps */
    if (node._dep1 === null && node._deps !== null && node._deps.length > 0) {
        let dep = /** @type {Sender} */(node._deps[0]);
        let slot = /** @type {number} */(node._deps[1]);
        node._dep1 = dep;
        node._dep1slot = slot;
        if (slot === 0) {
            dep._sub1slot = 0;
        } else {
            dep._subs[(slot - 1) * 2 + 1] = 0;
        }
        if (node._deps.length === 2) {
            node._deps = null;
        } else {
            node._deps.splice(0, 2);
            let dps = node._deps;
            for (let i = 0; i < dps.length; i += 2) {
                let d = /** @type {Sender} */(dps[i]);
                let s = /** @type {number} */(dps[i + 1]);
                let newDepslot = i / 2 + 1;
                if (s === 0) {
                    d._sub1slot = newDepslot;
                } else {
                    d._subs[(s - 1) * 2 + 1] = newDepslot;
                }
            }
        }
    }
}

/**
 * @param {Sender} node
 * @param {number} flag
 * @param {number} time
 */
function notify(node, flag, time) {
    /** @type {Receiver} */
    let sub = node._sub1;
    if (sub !== null) {
        if (sub._flag & (FLAG_PENDING | FLAG_STALE)) {
            sub._flag |= flag;
        } else {
            sub._flag |= flag;
            sub._receive(time);
        }
    }
    /** @type {Array<Receiver | number> | null} */
    let subs = node._subs;
    if (subs !== null) {
        let count = subs.length;
        for (let i = 0; i < count; i += 2) {
            sub = /** @type {Receiver} */(subs[i]);
            if (sub._flag & (FLAG_PENDING | FLAG_STALE)) {
                sub._flag |= flag;
            } else {
                sub._flag |= flag;
                sub._receive(time);
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
 * @template W
 * @param {function(): (function(): void | void)} fn
 * @param {number=} opts
 * @param {W=} args
 * @returns {Effect<null,null,W>}
 */
function effect(fn, opts, args) {
    let flag = FLAG_SETUP | ((0 | opts) & OPTIONS);
    let node = new Effect(flag, fn, null, args);
    startEffect(node);
    return node;
}

/**
 * @param {function(): (function(): void | void)} fn
 * @param {number=} opts
 * @returns {Effect}
 */
function scope(fn, opts) {
    opts = 0 | opts;
    let flag = FLAG_SETUP | FLAG_SCOPE | (opts & OPTIONS);
    if (!(opts & OPT_DYNAMIC)) {
        flag |= FLAG_STABLE;
    }
    let node = new Effect(flag, fn, null);
    let state = CLOCK._state;
    if (state & STATE_SCOPE) {
        setScope(node, CLOCK._scope);
    }
    startEffect(node);
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
 * Async effect. Returns a promise whose resolved value, if a
 * function, is registered as cleanup. Stable by default; pass
 * OPT_DYNAMIC for dynamic dependency tracking.
 * @template W
 * @param {function(W): Promise<(function(): void) | void>} fn
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
    let node = new Effect(flag, fn, null, args);
    startEffect(node);
    return node;
}

/**
 * Stable compute. Tracks deps on first run, then never
 * re-tracks. Like compute() with implicit OPT_STABLE.
 * @template T,W
 * @param {function(T,W): T} fn
 * @param {T=} seed
 * @param {W=} args
 * @returns {!Compute<T,null,null,W>}
 */
function derive(fn, seed, args) {
    let node = new Compute(FLAG_STABLE | FLAG_SETUP, fn, null, seed, args);
    startCompute(node);
    return node;
}

/**
 * Stable effect. Tracks deps on first run, then never
 * re-tracks. Like effect() with implicit OPT_STABLE.
 * @template W
 * @param {function(W): (function(): void | void)} fn
 * @param {W=} args
 * @returns {!Effect<null,null,W>}
 */
function watch(fn, args) {
    let node = new Effect(FLAG_STABLE | FLAG_SETUP, fn, null, args);
    startEffect(node);
    return node;
}

/**
 * Stable compute with OPT_NOTIFY. Always propagates STALE
 * downstream regardless of value equality.
 * @template T,W
 * @param {function(T,W): T} fn
 * @param {T=} seed
 * @param {W=} args
 * @returns {!Compute<T,null,null,W>}
 */
function transmit(fn, seed, args) {
    let node = new Compute(FLAG_STABLE | FLAG_SETUP | FLAG_TRANSMIT, fn, null, seed, args);
    startCompute(node);
    return node;
}

/**
 * @param {function(): void} fn
 * @returns {void}
 */
function batch(fn) {
    let clock = CLOCK;
    if (clock._state & STATE_IDLE) {
        clock._state = STATE_START;
        try {
            fn();
            start(clock);
        } finally {
            clock._state = STATE_IDLE;
        }
    } else {
        fn();
    }
}

export {
    CLOCK,
    STATE_START, STATE_IDLE, STATE_OWNER, STATE_SCOPE,
    FLAG_DEFER, FLAG_STABLE, FLAG_SETUP, FLAG_STALE, FLAG_PENDING,
    FLAG_RUNNING, FLAG_DISPOSED, FLAG_LOADING, FLAG_ERROR, FLAG_RECOVER,
    FLAG_BOUND, FLAG_DERIVED, FLAG_SCOPE, FLAG_TRANSMIT as FLAG_NOTIFY, FLAG_EQUAL, FLAG_WEAK,
    FLAG_INIT, FLAG_TRANSMIT,
    OP_VALUE, OP_CALLBACK,
    register,
    MUT_ADD, MUT_DEL, MUT_SORT,
    MUT_OP_MASK, MUT_LEN_SHIFT, MUT_LEN_MASK, MUT_POS_SHIFT, MUT_POS_MASK,
    CTX_EQUAL, CTX_NOTEQUAL, CTX_PROMISE, CTX_ITERABLE, CTX_ASYNC, CTX_OWNER,
    FLAG_ASYNC, FLAG_STREAM,
    OPT_DEFER, OPT_STABLE, OPT_SETUP, OPT_NOTIFY, OPT_WEAK, OPT_DYNAMIC,
    TYPE_ROOT, TYPE_SIGNAL, TYPE_COMPUTE, TYPE_EFFECT,
    TYPEFLAG_MASK, TYPEFLAG_SEND, TYPEFLAG_RECEIVE, TYPEFLAG_OWNER,
    RESET, OPTIONS,
    scheduleSignal,
    subscribe,
    startEffect,
}

export {
    Root,
    Signal,
    Compute,
    Effect,
    Reader,
    Subscriber,
    root,
    signal,
    compute,
    derive,
    transmit,
    task,
    effect,
    watch,
    spawn,
    scope,
    batch
}
