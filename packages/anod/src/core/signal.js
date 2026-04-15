import { Anod } from "./api.js";
import {
    Disposer,
    Owner,
    Sender,
    Receiver,
    ISignal,
    ICompute,
    IEffect
} from "./types.js";

/* Sender flags */

const FLAG_STALE = 1 << 0;
const FLAG_PENDING = 1 << 1;
const FLAG_SCHEDULED = 1 << 2;
const FLAG_DISPOSED = 1 << 3;

/* Receiver flags */

const FLAG_INIT = 1 << 4;
const FLAG_SETUP = 1 << 5;
const FLAG_RUNNING = 1 << 6;
const FLAG_LOADING = 1 << 7;
const FLAG_ERROR = 1 << 8;
const FLAG_BOUND = 1 << 9;
const FLAG_STABLE = 1 << 10;
const FLAG_NOTIFY = 1 << 11;
const FLAG_DEFER = 1 << 12;
const FLAG_WEAK = 1 << 13;
const FLAG_EQUAL = 1 << 14;
const FLAG_NOTEQUAL = 1 << 15;
const FLAG_ASYNC = 1 << 16;
const FLAG_DEP1 = 1 << 17;

const FOUND = 1 << 29;
const MISSING = 1 << 30;

const OPT_DEFER = FLAG_DEFER;
const OPT_STABLE = FLAG_STABLE;
const OPT_SETUP = FLAG_SETUP;
const OPT_NOTIFY = FLAG_NOTIFY;
const OPT_WEAK = FLAG_WEAK;

const OPTIONS =
    OPT_DEFER | OPT_STABLE | OPT_SETUP | OPT_NOTIFY | OPT_WEAK | FLAG_ASYNC;

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
var VERSION = -2;

/** @const @type {Array<Disposer>} */
var DISPOSES = new Array(16);

var DISPOSES_COUNT = 0;

/**
 * @const
 * @type {Array<Signal>}
 */
var SENDERS = new Array(32);

/**
 * @const
 * @type {Array}
 */
var PAYLOADS = new Array(32);

/**
 * @type {number}
 */
var SENDERS_COUNT = 0;

/**
 * @const @type {Array<Compute>}
 */
var COMPUTES = new Array(64);

var COMPUTES_COUNT = 0;

/** @const @type {Array<number>} */
var LEVELS = [0, 0, 0, 0];
/** @const @type {Array<Array<Effect>>} */
var SCOPES = [[], [], [], []];

var SCOPES_COUNT = 0;

/** @const @type {Array<Effect>} */
var EFFECTS = new Array(32);

var EFFECTS_COUNT = 0;

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
    this._slot = 0;
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
    this._flag = FLAG_INIT | FLAG_STALE | opts;
    /**
     * @type {T}
     */
    this._value = seed;
    /**
     * @type {number}
     */
    this._slot = 0;
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
     * @type {Reader<W> | W | undefined}
     */
    this._args = this._flag & FLAG_ASYNC ? new Reader(this, args) : args;
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
    this._flag = FLAG_INIT | opts;
    /**
     * @type {number}
     */
    this._slot = 0;
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
    this._owner = null;
    /**
     * @type {(function(*): boolean) | Array<(function(*): boolean)> | null}
     */
    this._recover = null;
    /**
     * @type {Reader<W> | W | undefined}
     */
    this._args = args;
}

{
    /** @const */
    let RootProto = Root.prototype;

    /**
     * @type {Owner | null}
     */
    RootProto._owner = null;

    /** @const */
    let SignalProto = Signal.prototype;

    /**
     * @type {number}
     */
    SignalProto._ctime = 0;

    /** @const */
    let ComputeProto = Compute.prototype;

    /** @const */
    let EffectProto = Effect.prototype;

    /**
     * Disposer interface
     */

    /**
     * @public
     * @this {Disposer}
     * @returns {void}
     */
    RootProto.dispose =
        SignalProto.dispose =
        ComputeProto.dispose =
        EffectProto.dispose =
        dispose;

    /**
     * @this {Root}
     * @returns {void}
     */
    RootProto._dispose = function() {
        if (!(this._flag & FLAG_DISPOSED)) {
            this._flag = FLAG_DISPOSED;
            this._clearOwned();
            this._cleanup = this._owned = this._recover = null;
        }
    };

    /**
     * @this {Signal}
     * @returns {void}
     */
    SignalProto._dispose = function() {
        if (!(this._flag & FLAG_DISPOSED)) {
            this._flag = FLAG_DISPOSED;
            this._clearSubs();
            this._value = null;
        }
    };

    /**
     * @this {Compute}
     * @returns {void}
     */
    ComputeProto._dispose = function() {
        if (!(this._flag & FLAG_DISPOSED)) {
            this._flag = FLAG_DISPOSED;
            this._clearSubs();
            this._clearDeps();
            this._fn = this._value = this._args = null;
        }
    };

    /**
     * @this {Effect}
     * @returns {void}
     */
    EffectProto._dispose = function() {
        if (!(this._flag & FLAG_DISPOSED)) {
            this._flag = FLAG_DISPOSED;
            this._clearDeps();
            this._clearOwned();
            this._fn = this._args = this._owner = null;
        }
    };

    /**
     * Owner interface
     */

    /**
     * @public
     * @this {Owner}
     * @param {function(): void} fn
     * @returns {void}
     */
    RootProto.cleanup = EffectProto.cleanup = addCleanup;

    /**
     * @public
     * @this {!Root}
     * @param {function(*): boolean} fn
     * @returns {void}
     */
    RootProto.recover = EffectProto.recover = addRecover;

    RootProto._clearOwned = EffectProto._clearOwned = clearOwned;

    /**
     * Sender interface
     */

    SignalProto._clearSubs =
        ComputeProto._clearSubs = clearSubs;

    SignalProto._disconnect =
        ComputeProto._disconnect = _disconnect;

    /**
     * Receiver interface
     */

    ComputeProto._clearDeps =
        EffectProto._clearDeps = clearDeps;

    /**
     *
     * @param {number} time
     */
    SignalProto._checkUpdate = function(time) { };

    /**
     * @public
     * @this {Signal<T>}
     * @returns {T}
     */
    SignalProto.val = function() {
        return this._value;
    };

    /**
     * @public
     * @this {Signal<T>}
     * @param {T} value
     * @returns {void}
     */
    SignalProto.set = function(value) {
        if (this._value !== value) {
            if (IDLE) {
                this._value = value;
                notify(this, FLAG_STALE, TIME + 1);
                start();
            } else {
                this._flag |= FLAG_SCHEDULED;
                let index = SENDERS_COUNT++;
                SENDERS[index] = this;
                PAYLOADS[index] = value;
            }
        }
    };

    /**
     *
     * @param {T} value
     * @param {number} time
     */
    SignalProto._assign = function(value, time) {
        this._value = value;
        if (this._flag & FLAG_SCHEDULED) {
            this._flag &= ~FLAG_SCHEDULED;
            notify(this, FLAG_STALE, time);
        }
    };

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
     * @this {Compute<T,U,V,W>}
     * @returns {T}
     */
    ComputeProto.val = function() {
        let flag = this._flag;
        if (flag & FLAG_DISPOSED) {
            return null;
        }
        if (flag & FLAG_RUNNING) {
            throw new Error("Circular dependency");
        }
        if (flag & (FLAG_STALE | FLAG_PENDING)) {
            if (IDLE) {
                IDLE = false;
                try {
                    this._checkUpdate(TIME);
                    if (SENDERS_COUNT > 0 || DISPOSES_COUNT > 0) {
                        start();
                    }
                } finally {
                    IDLE = true;
                }
            } else {
                this._checkUpdate(TIME);
            }
        }
        if (this._flag & FLAG_ERROR) {
            throw this._value;
        }
        return this._value;
    };

    /**
     * @public
     * @this {Compute<T>}
     * @param {T} value
     * @returns {void}
     */
    ComputeProto.set = function(value) {
        if (this._value !== value) {
            if (IDLE) {
                this._value = value;
                let time = TIME + 1;
                this._time = this._ctime = time;
                notify(this, FLAG_STALE, time);
                start();
            } else {
                this._flag |= FLAG_SCHEDULED;
                let index = SENDERS_COUNT++;
                SENDERS[index] = this;
                PAYLOADS[index] = value;
            }
        }
    };

    /**
     *
     * @param {T} value
     * @param {number} time
     */
    ComputeProto._assign = function(value, time) {
        this._value = value;
        this._time = this._ctime = time;
        if (this._flag & FLAG_SCHEDULED) {
            this._flag &= ~FLAG_SCHEDULED;
            notify(this, FLAG_STALE, time);
        }
    };

    ComputeProto._checkUpdate = checkUpdate;

    /**
     * @template T
     * @this {Compute<T>}
     * @param {number} time
     */
    ComputeProto._update = function(time) {
        let reader;
        let recon = false;
        let flag = this._flag;
        let slot = this._slot;
        let dep1slot = this._dep1slot;
        this._flag =
            (flag &
                ~(FLAG_STALE | FLAG_PENDING | FLAG_EQUAL | FLAG_NOTEQUAL | FLAG_DEP1)) |
            FLAG_RUNNING;
        if (!(flag & FLAG_ASYNC)) {
            if (flag & (FLAG_STABLE | FLAG_SETUP)) {
                if (flag & FLAG_BOUND) {
                    reader = this._dep1.val();
                } else {
                    reader = this;
                }
                if (flag & FLAG_SETUP) {
                    this._slot = VERSION--;
                }
            } else {
                this._slot = VERSION--;
                recon = this._deps !== null;
                if (recon) {
                    this._time = 0;
                    this._dep1slot = this._deps.length;
                } else {
                    this._flag |= FLAG_SETUP;
                    clearReceiver(this._dep1, dep1slot);
                }
            }
        } else {
            if (!(flag & FLAG_INIT)) {
                this._args = this._args._clone();
            }
        }
        let value;
        try {
            value = this._fn(reader, this._value, this._args);
            this._flag &= ~FLAG_ERROR;
        } catch (err) {
            this._value = err;
            this._time = this._ctime = time;
            this._flag |= FLAG_ERROR;
            return;
        } finally {
            if (recon) {
                reconcile(this, this._dep1slot);
            }
            this._slot = slot;
            this._dep1slot = dep1slot;
            flag = this._flag &= ~(FLAG_RUNNING | FLAG_INIT | FLAG_SETUP);
        }

        this._time = time;
        if (value !== this._value) {
            this._value = value;
            if (!(flag & FLAG_EQUAL)) {
                this._ctime = time;
            }
        } else if (flag & (FLAG_NOTEQUAL | FLAG_NOTIFY)) {
            this._ctime = time;
        }
    };

    /**
     * @template T
     * @this {Compute<T>}
     * @param {T | IThenable | IAsyncIterator} value
     * @param {number} time
     */
    ComputeProto._await = function(value, time) {
        if (value != null) {
            this._flag |= FLAG_LOADING;
            if (typeof value.then === "function") {
                resolvePromise(
                    new WeakRef(this),
          /** @type {IThenable} */(value),
                    time
                );
                return;
            }
            if (typeof result[Symbol.asyncIterator] === "function") {
                resolveIterator(
                    new WeakRef(this),
          /** @type {AsyncIterator | AsyncIterable} */(value),
                    time
                );
                return;
            }
        }
        this._flag &= ~FLAG_LOADING;
        this._value = value;
        this._ctime = time;
    };

    /**
     * @param {number} time
     * @returns {void}
     */
    ComputeProto._receive = function(time) {
        if (this._flag & FLAG_NOTIFY) {
            COMPUTES[COMPUTES_COUNT++] = this;
            notify(this, FLAG_STALE, time);
        } else {
            notify(this, FLAG_PENDING, time);
        }
    };

    /**
     * @template T
     * @this {Compute<T>}
     * @param {!Sender<T>} sender
     * @returns {T}
     */
    ComputeProto.read = read;

    ComputeProto._subscribe = _subscribe;

    ComputeProto._readUpdate = readUpdate;

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

    EffectProto._checkUpdate = checkUpdate;

    /**
     * @param {number} time
     */
    EffectProto._update = function(time) { };

    /**
     * @returns {void}
     */
    EffectProto._receive = function() {
        if (this._owned === null) {
            EFFECTS[EFFECTS_COUNT++] = this;
        } else {
            SCOPES_COUNT++;
            let level = this._level;
            let count = LEVELS[level];
            SCOPES[level][count] = this;
            LEVELS[level] = count + 1;
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
}

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

/**
 * @template W
 * @constructor
 * @param {Receiver} node
 * @param {W=} args
 */
function Reader(node, args) {
    /** @type {number} */
    this._flag = node._flag;
    /** @type {Sender | null} */
    this._dep1 = node._dep1;
    /** @type {number} */
    this._deps = node._deps;
    /** @type {number} */
    this._slot = 0;
    /** @type {number} */
    this._time = 0;
    /** @type {number} */
    this._dep1slot = 0;
    /** @type {Receiver} */
    this._node = node;
    /** @type {W | undefined} */
    this._args = args;
}

/** @const */
var ReaderProto = Reader.prototype;

/**
 * @template T
 * @param {Sender<T>} sender
 * @returns {T}
 */
ReaderProto.read = function(sender) {
    if (this._flag & FLAG_DISPOSED) {
        throw new Error("Disposed");
    }
    return read.call(this, sender);
};

/**
 * @returns {Reader}
 */
ReaderProto._clone = function() {
    this._flag = FLAG_DISPOSED;
    let clone = new Reader(this._node, this._args);
    this._dep1 = this._deps = this._node = this._args = null;
    return clone;
};

/**
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
 * @template T
 * @this {Receiver}
 * @param {!Sender<T>} sender
 * @returns {T}
 */
function read(sender) {
    let value = sender.val();
    if (
        (this._flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE ||
        sender._slot === this._slot ||
        this._flag & FLAG_DISPOSED
    ) {
        return value;
    }
    sender._slot = this._slot;
    if (this._flag & FLAG_SETUP) {
        this._subscribe(sender);
    } else {
        this._readUpdate(sender);
    }
    return value;
}

/**
 * @template T
 * @this {Receiver}
 * @param {Sender<T>} sender
 * @returns {void}
 */
function _subscribe(sender) {
    let depslot = -1;
    if (this._dep1 === null) {
        this._dep1 = sender;
    } else if (this._deps === null) {
        depslot = 0;
    } else {
        depslot = this._deps.length;
    }
    let subslot = subscribe(sender, this, depslot);
    if (depslot === -1) {
        this._dep1slot = subslot;
    } else if (depslot === 0) {
        this._deps = [sender, subslot];
    } else {
        this._deps.push(sender, subslot);
    }
}

/**
 * @template T
 * @this {Receiver}
 * @param {Sender<T>} sender
 * @returns {void}
 */
function readUpdate(sender) {
    let deps = this._deps;
    let cursor = this._time;
    if (deps[cursor] === sender) {
        this._time += 2;
        deps[cursor + 1] &= ~FOUND;
        return;
    }
    if (this._dep1 === sender) {
        this._flag |= FLAG_DEP1;
        return;
    }
    let oldlen = this._dep1slot;
    let reuse = cursor < oldlen;
    if (reuse && deps[cursor + 1] & FOUND) {
        do {
            deps[cursor + 1] &= ~FOUND;
            cursor += 2;
        } while (cursor < oldlen && deps[cursor + 1] & FOUND);
        if (deps[cursor] === sender) {
            this._time = cursor + 2;
            return;
        }
    }
    if (cursor + 2 < oldlen && deps[cursor + 2] === sender) {
        deps[cursor]._slot = cursor;
        deps[cursor + 1] |= MISSING;
        deps.push(null, cursor);
        this._time = cursor + 4;
        return;
    }
    let slot = -2;
    if (sender._sub1 === this) {
        slot = sender._sub1slot;
    } else {
        let _slot = sender._slot;
        if (_slot >= 0 && _slot < oldlen && deps[_slot] === sender) {
            slot = _slot;
        }
    }
    if (slot > -2) {
        if (slot === -1) {
            this._flag |= FLAG_DEP1;
        } else if (slot < cursor) {
            deps[slot + 1] &= ~MISSING;
        } else {
            deps[slot + 1] |= FOUND;
        }
        return;
    }
    if (reuse) {
        this._time = cursor + 2;
        deps.push(sender, cursor);
    } else {
        deps.push(sender, -1);
    }
}

/**
 * @param {Compute} node
 * @returns {void}
 */
function startCompute(node) {
    if (IDLE) {
        try {
            node._update(TIME);
            if (SENDERS_COUNT > 0 || DISPOSES_COUNT > 0) {
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
 * @this {Receiver}
 * @param {number} time
 * @returns {void}
 */
function checkUpdate(time) {
    if (this._flag & FLAG_STALE) {
        this._update(time);
        return;
    }

    let dep = this._dep1;
    let lastRun = this._time;
    if (dep !== null) {
        if (dep._flag & (FLAG_STALE | FLAG_PENDING)) {
            dep._checkUpdate(time);
        }
        if (dep._ctime > lastRun) {
            this._update(time);
            return;
        }
    }
    let deps = this._deps;
    if (deps !== null) {
        let count = deps.length;
        for (let i = 0; i < count; i += 2) {
            dep = /** @type {Sender} */ (deps[i]);
            if (dep._flag & (FLAG_STALE | FLAG_PENDING)) {
                dep._checkUpdate(time);
            }
            if (dep._ctime > lastRun) {
                this._update(time);
                return;
            }
        }
    }
    this._time = time;
    this._flag &= ~(FLAG_STALE | FLAG_PENDING);
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
    node._flag &= ~FLAG_LOADING;

    if (value !== node._value || node._flag & FLAG_ERROR) {
        node._value = value;
        let time = TIME + 1;
        node._ctime = time;
        if (unbound(node)) {
            node._fn = node._args = null;
        }
        notify(node, FLAG_STALE, time);
        start();
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
            node._update(TIME);
            if (SENDERS_COUNT > 0 || DISPOSES_COUNT > 0) {
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
        } catch {
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
    promise.then(
        (val) => {
            let node = ref.deref();
            if (node !== void 0 && !(node._flag & FLAG_DISPOSED)) {
                node._flag &= ~FLAG_LOADING;
                if (typeof val === "function") {
                    addCleanup(node, val);
                }
            }
        },
        (err) => {
            let node = ref.deref();
            if (node !== void 0 && !(node._flag & FLAG_DISPOSED)) {
                node._flag &= ~FLAG_LOADING;
                let recovered = tryRecover(node, err);
                if (!recovered) {
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
            return;
        }
        iterator.next().then(onNext, onError);
        node._flag &= ~FLAG_LOADING;
        if (typeof result.value === "function") {
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
 * @this {Owner}
 * @param {function(): void} fn
 * @returns {void}
 */
function addCleanup(fn) {
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
 * @this {Owner}
 * @param {function(*): boolean} fn
 * @returns {void}
 */
function addRecover(fn) {
    let cur = this._recover;
    if (cur === null) {
        this._recover = fn;
    } else if (typeof cur === "function") {
        this._recover = [cur, fn];
    } else {
        cur.push(fn);
    }
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
            if (SENDERS_COUNT > 0) {
                let count = SENDERS_COUNT;
                for (let i = 0; i < count; i++) {
                    SENDERS[i]._assign(PAYLOADS[i], time);
                    SENDERS[i] = PAYLOADS[i] = null;
                }
                SENDERS_COUNT = 0;
            }
            if (COMPUTES_COUNT > 0) {
                let i = 0;
                while (i < COMPUTES_COUNT) {
                    let count = COMPUTES_COUNT;
                    for (let i = 0; i < count; i++) {
                        let node = COMPUTES[i];
                        if (node._flag & FLAG_STALE) {
                            node._update(time);
                        }
                        COMPUTES[i] = null;
                    }
                }
                COMPUTES_COUNT = 0;
            }
            if (SCOPES_COUNT > 0) {
                let levels = LEVELS.length;
                for (let i = 0; i <= levels; i++) {
                    let count = LEVELS[i];
                    let effects = SCOPES[i];
                    for (let j = 0; j < count; j++) {
                        try {
                            effects[j]._checkUpdate(time);
                            effects[j] = null;
                        } catch (err) {
                            if (throwError(effects, i, thrown)) {
                                error = err;
                                thrown = true;
                            }
                        }
                    }
                    LEVELS[i] = 0;
                }
                SCOPES_COUNT = 0;
            }
            if (EFFECTS_COUNT > 0) {
                let count = EFFECTS_COUNT;
                for (let i = 0; i < count; i++) {
                    try {
                        EFFECTS[i]._checkUpdate(time);
                        EFFECTS[i] = null;
                    } catch (err) {
                        if (throwError(EFFECTS, i, thrown)) {
                            error = err;
                            thrown = true;
                        }
                    }
                }
                EFFECTS_COUNT = 0;
            }
            if (cycle++ === 1e5) {
                error = new Error("Runaway cycle");
                thrown = true;
                break;
            }
        } while (!thrown && (SENDERS_COUNT > 0 || DISPOSES_COUNT > 0));
    } finally {
        IDLE = true;
        DISPOSES_COUNT =
            SENDERS_COUNT =
            COMPUTES_COUNT =
            SCOPES_COUNT =
            EFFECTS_COUNT =
            0;
        if (thrown) {
            throw error;
        }
    }
}

function throwError(effects, i, thrown) {
    let node = effects[i];
    effects[i] = null;
    if (!thrown && tryRecover(node, err)) {
        thrown = false;
    }
    node._dispose();
    return thrown;
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
 * @this {Sender}
 * @returns {void}
 */
function clearSubs() {
    if (this._sub1 !== null) {
        this._sub1._unsubscribe(this._sub1slot);
        this._sub1 = null;
    }
    let subs = this._subs;
    if (subs !== null) {
        let count = subs.length;
        for (let i = 0; i < count; i += 2) {
            subs[i]._unsubscribe(subs[i + 1]);
        }
        this._subs = null;
    }
}

/**
 * @this {Sender}
 * @param {number} depslot
 * @returns {void}
 */
function _disconnect(depslot) {
    if (depslot === -1) {
        this._sub1 = null;
    } else {
        let subs = this._subs;
        let lastSlot = /** @type {number} */ (subs.pop());
        let lastNode = /** @type {Receiver} */ (subs.pop());
        if (depslot !== subs.length) {
            subs[depslot] = lastNode;
            subs[depslot + 1] = lastSlot;
            if (lastSlot === -1) {
                lastNode._dep1slot = depslot;
            } else {
                lastNode._deps[lastSlot + 1] = depslot;
            }
        }
    }
}

/**
 * @this {Receiver}
 * @returns {void}
 */
function clearDeps() {
    if (this._dep1 !== null) {
        this._dep1._disconnect(this._dep1slot);
        this._dep1 = null;
    }
    let deps = this._deps;
    if (deps !== null) {
        let count = deps.length;
        for (let i = 0; i < count; i += 2) {
            deps[i]._disconnect(deps[i + 1]);
        }
        this._deps = null;
    }
}

/**
 * @this {Receiver}
 * @param {number} subslot
 * @returns {void}
 */
function _unsubscribe(subslot) {
    if (subslot === -1) {
        this._dep1 = null;
    } else {
        let deps = this._deps;
        let lastSlot = /** @type {number} */ (deps.pop());
        let lastNode = /** @type {Sender} */ (deps.pop());
        if (subslot !== deps.length) {
            deps[subslot] = lastNode;
            deps[subslot + 1] = lastSlot;
            if (lastSlot === -1) {
                lastNode._sub1slot = subslot;
            } else {
                lastNode._subs[lastSlot + 1] = subslot;
            }
        }
    }
}

/**
 * @this {Owner}
 * @returns {void}
 */
function clearOwned() {
    let owned = this._owned;
    if (owned !== null) {
        let count = owned.length;
        for (let i = 0; i < count; i++) {
            owned[i]._dispose();
        }
        this._owned = null;
    }
    let cleanup = this._cleanup;
    if (cleanup !== null) {
        this._cleanup = null;
        if (typeof cleanup === "function") {
            cleanup();
        } else {
            let count = cleanup.length;
            for (let i = 0; i < count; i++) {
                cleanup[i]();
            }
        }
    }
    this._recover = null;
}

/**
 * Walks the ownership chain looking for recover handlers.
 * @param {Effect} node
 * @param {*} error
 * @returns {boolean} true if error was handled
 */
function tryRecover(node, error) {
    let recover;
    let owner = node._owner;
    while (owner !== null) {
        recover = owner._recover;
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
        node._dep1 === null && (node._deps === null || node._deps.length === 0)
    );
}

/**
 * @const
 * @type {Array<number>}
 */
var MISSED = [0];

/**
 * @const
 * @type {Array<number>}
 */
var REUSED = [0];

/**
 * @param {Compute} node
 * @param {number} oldlen
 */
function reconcile(node, oldlen) {
    let deps = node._deps;
    let cursor = node._time;
    let newlen = deps.length;

    if (node._dep1 !== null && !(node._flag & FLAG_DEP1)) {
        clearReceiver(node._dep1, node._dep1slot);
        node._dep1 = null;
    }

    if (cursor === oldlen && newlen > oldlen) {
        for (let i = oldlen; i < newlen; i += 2) {
            let dep = deps[i];
            if (dep !== null) {
                deps[i + 1] = subscribe(dep, node, i);
            }
        }
        return;
    }

    if (cursor < oldlen && newlen === oldlen) {
        for (let i = cursor; i < oldlen; i += 2) {
            clearReceiver(deps[i], deps[i + 1]);
        }
        deps.length = cursor;
        return;
    }

    let append = node._slot;
    let reuse = VERSION--;
    let missed = MISSED;
    let reused = REUSED;
    let missTail = 0;
    let reuseTail = 0;

    for (let i = oldlen; i < newlen; i += 2) {
        let dep = deps[i];
        let index = deps[i + 1];
        if (index !== -1) {
            if (deps[index]._slot === append || !(deps[index + 1] & MISSING)) {
                deps[index]._slot = reuse;
                deps[index + 1] &= ~MISSING;
            } else {
                missed[missTail++] = index;
            }
        }
        if (dep !== null && dep._slot !== reuse) {
            dep._slot = append;
        }
    }

    for (let i = oldlen - 2; i >= cursor; i -= 2) {
        if (deps[i + 1] & FOUND) {
            reused[reuseTail++] = i;
        }
    }

    for (let i = newlen - 2; i >= oldlen; i -= 2) {
        if (deps[i] !== null && deps[i]._slot === append) {
            reused[reuseTail++] = i;
        }
    }

    let missHead = 0;

    while (missHead < missTail) {
        if (reuseTail === 0) {
            let write = missed[missHead];
            for (let j = write; j < cursor; j += 2) {
                if (deps[j + 1] & MISSING) {
                    clearReceiver(deps[j], deps[j + 1] & ~MISSING);
                } else {
                    deps[write] = deps[j];
                    deps[write + 1] = deps[j + 1];
                    let depslot = deps[write + 1];
                    if (depslot === -1) {
                        deps[j]._sub1slot = write;
                    } else {
                        deps[j]._subs[depslot] = write;
                    }
                    write += 2;
                }
            }
            for (let j = cursor; j < oldlen; j += 2) {
                let slot = deps[j + 1];
                if (!(slot & FOUND)) {
                    clearReceiver(deps[j], slot);
                }
            }
            deps.length = write;
            return;
        }

        let index = reused[--reuseTail];
        let dep = deps[index];

        if (dep._slot === reuse) {
            continue;
        }
        dep._slot = reuse;
        let dropped = missed[missHead++];
        clearReceiver(deps[dropped], deps[dropped + 1] & ~MISSING);
        deps[dropped] = dep;
        if (index >= oldlen) {
            deps[dropped + 1] = subscribe(dep, node, dropped);
        } else {
            let depslot = deps[index + 1] & ~FOUND;
            deps[dropped + 1] = depslot;
            if (depslot === -1) {
                dep._sub1slot = dropped;
            } else {
                dep._subs[depslot] = dropped;
            }
        }
    }

    let write = cursor;
    let i = cursor;

    while (i < oldlen || reuseTail > 0) {
        if (i < oldlen && deps[i + 1] & FOUND) {
            if (write === i) {
                deps[i + 1] &= ~FOUND;
                write += 2;
            }
            i += 2;
        } else {
            if (i < oldlen) {
                clearReceiver(deps[i], deps[i + 1]);
            }

            if (reuseTail === 0) {
                i += 2;
                continue;
            }

            let kept = reused[--reuseTail];
            let dep = deps[kept];

            if (dep._slot === reuse) {
                if (kept < oldlen) {
                    deps[kept + 1] &= ~FOUND;
                }
                continue;
            }

            dep._slot = reuse;
            if (kept >= oldlen) {
                deps[write] = dep;
                deps[write + 1] = subscribe(dep, node, write);
            } else if (kept !== write) {
                let depslot = deps[kept + 1] & ~FOUND;
                deps[write] = dep;
                deps[write + 1] = depslot;
                if (depslot === -1) {
                    dep._sub1slot = write;
                } else {
                    dep._subs[depslot] = write;
                }
            } else {
                deps[kept + 1] &= ~FOUND;
            }
            write += 2;
            if (i < oldlen) {
                i += 2;
            }
        }
    }

    if (write !== oldlen) {
        deps.length = write;
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
        let flags = sub._flag;
        sub._flag = flags | flag;
        if (!(flags & (FLAG_PENDING | FLAG_STALE))) {
            sub._receive(time);
        }
    }
    /** @type {Array<Receiver | number> | null} */
    let subs = node._subs;
    if (subs !== null) {
        let count = subs.length;
        for (let i = 0; i < count; i += 2) {
            sub = /** @type {Receiver} */ (subs[i]);
            let flags = sub._flag;
            sub._flag = flags | flag;
            if (!(flags & (FLAG_PENDING | FLAG_STALE))) {
                sub._receive(time);
            }
        }
    }
}

/**
 * @param {function(): void} fn
 * @returns {Root}
 */
function root(fn) {
    let node = new Root();
    fn(node);
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
 * @template T,W
 * @param {function(T,W): Promise<T>} fn
 * @param {T=} seed
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Compute<T,null,null,W>}
 */
function task(fn, seed, opts, args) {
    let flag = FLAG_ASYNC | FLAG_SETUP | ((0 | opts) & OPTIONS);
    let node = new Compute(flag, fn, null, seed, args);
    if (!(flag & FLAG_DEFER)) {
        startCompute(node);
    }
    return node;
}

/**
 * @template W
 * @param {function(W): Promise<(function(): void) | void>} fn
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Effect<null,null,W>}
 */
function spawn(fn, opts, args) {
    let flag = FLAG_ASYNC | FLAG_SETUP | ((0 | opts) & OPTIONS);
    let node = new Effect(flag, fn, null, args);
    startEffect(node);
    return node;
}

/**
 * @template T,U,W
 * @param {Sender<U> | (function(T,W): T)} fnOrDep
 * @param {T | (function(T): T)=} seedOrFn
 * @param {T | W=} argsOrSeed
 * @param {W=} args
 * @returns {!Compute<T,U,W>}
 */
function derive(fnOrDep, seedOrFn, argsOrSeed, args) {
    let node;
    if (typeof fnOrDep === "function") {
        node = new Compute(
            FLAG_STABLE | FLAG_SETUP,
            fnOrDep,
            null,
            seedOrFn,
            argsOrSeed
        );
    } else {
        node = new Compute(
            FLAG_STABLE | FLAG_BOUND,
            seedOrFn,
            fnOrDep,
            argsOrSeed,
            args
        );
        node._dep1slot = subscribe(fnOrDep, node, 0);
    }
    startCompute(node);
    return node;
}

/**
 * @template U,W
 * @param {Sender<U> | (function(W): (void | (function(): void)))} fnOrDep
 * @param {W | (function(W): (void | (function(): void)))=} fnOrArgs
 * @param {W=} args
 * @returns {!Effect<U,W>}
 */
function watch(fnOrDep, fnOrArgs, args) {
    let node;
    if (typeof fnOrDep === "function") {
        node = new Effect(FLAG_STABLE | FLAG_SETUP, fnOrDep, null, fnOrArgs);
    } else {
        node = new Effect(FLAG_STABLE | FLAG_BOUND, fnOrArgs, fnOrDep, args);
        node._dep1slot = subscribe(fnOrDep, node, 0);
    }
    startEffect(node);
    return node;
}

/**
 * @template T,U,W
 * @param {Sender<U> | (function(T,W): T)} fnOrDep
 * @param {T | (function(T): T)=} seedOrFn
 * @param {T | W=} argsOrSeed
 * @param {W=} args
 * @returns {!Compute<T,U,W>}
 */
function transmit(fnOrDep, seedOrFn, argsOrSeed, args) {
    let node;
    if (typeof fnOrDep === "function") {
        node = new Compute(
            FLAG_STABLE | FLAG_SETUP | FLAG_NOTIFY,
            fnOrDep,
            null,
            seedOrFn,
            argsOrSeed
        );
    } else {
        node = new Compute(
            FLAG_STABLE | FLAG_BOUND | FLAG_NOTIFY,
            seedOrFn,
            fnOrDep,
            argsOrSeed,
            args
        );
        node._dep1slot = subscribe(fnOrDep, node, 0);
    }
    startCompute(node);
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
    FLAG_DEFER,
    FLAG_STABLE,
    FLAG_SETUP,
    FLAG_STALE,
    FLAG_PENDING,
    FLAG_RUNNING,
    FLAG_DISPOSED,
    FLAG_LOADING,
    FLAG_ERROR,
    FLAG_BOUND,
    FLAG_SCOPE,
    FLAG_EQUAL,
    FLAG_WEAK,
    FLAG_INIT,
    FLAG_NOTIFY,
    FLAG_ASYNC,
    OPT_DEFER,
    OPT_STABLE,
    OPT_SETUP,
    OPT_NOTIFY,
    OPT_WEAK,
    OPTIONS,
    subscribe,
    startEffect
};

export {
    Root,
    Signal,
    Compute,
    Effect,
    Reader,
    root,
    signal,
    compute,
    derive,
    transmit,
    task,
    effect,
    watch,
    spawn,
    batch
};
