/**
 * @public
 * @typedef {function(boolean): void}
 */
var Cleanup;

/**
 * @public
 * @typedef {function(*): void}
 */
var Recover;

/** 
 * @interface
 */
function Nil() { }

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
 * @template T
 * @interface
 * @extends {Dispose}
 */
function Scope() { }

/**
 * @package
 * @type {?Array<!Respond>}
 */
Scope.prototype._owned;

/**
 * @package
 * @type {?Array<!Cleanup>}
 */
Scope.prototype._cleanups;

/**
 * @package
 * @type {?Array<!Recover>}
 */
Scope.prototype._recovers;

/**
 * @public
 * @interface
 * @template T
 * @extends {Dispose}
 */
function Respond() { }

/**
 * @public
 * @type {T}
 */
Respond.prototype.val;

/**
 * @public
 * @type {T}
 */
Respond.prototype.peek;

/**
 * @package
 * @returns {void}
 */
Respond.prototype._recDispose = function () { };

/**
 * @const 
 * @enum {number}
 */
export var State = {
    Static: 1,
    DisposeFlags: 6,
    Disposed: 2,
    Dispose: 4,
    UpdateFlags: 24,
    Updated: 8,
    Update: 16,
    Send: 32,
    Respond: 64,
    Compare: 128,
    Error: 256,
}

/**
 * @const
 * @enum
 */
export var Stage = {
    Idle: 0,
    Started: 1,
    Disposes: 2,
    Changes: 3,
    Computes: 4,
    Effects: 5,
}

/**
 * @abstract
 * @returns {void}
 */
Send.prototype._send = function () { };

/**
 * @package
 * @returns {void}
 */
Send.prototype._update = function () { }

/**
 * @abstract
 * @returns {void}
 */
Receive.prototype._recUpdate = function () { };

/* START_OF_FILE */

// Public API

/**
 * @public
 * @template T
 * @param {function(): T} fn 
 * @returns {!Scope<T>}
 */
function root(fn) {
    /** @const {!Owner} */
    var node = new Owner();
    /** @const {?Scope} */
    var owner = OWNER;
    /** @const {boolean} */
    var listen = LISTEN;
    OWNER = node;
    LISTEN = false;
    if (STAGE === Stage.Idle) {
        try {
            fn();
        } finally {
            OWNER = owner;
            LISTEN = listen;
        }
    } else {
        fn();
        OWNER = owner;
        LISTEN = listen;
    }
    return node;
}

/**
 * @public
 * @template T
 * @param {function(T): T} fn 
 * @param {T=} seed 
 * @param {(function(T,T): boolean)|boolean=} eq
 * @returns {!Respond<T>}
 */
function compute(fn, seed, eq) {
    return new Computation(fn, seed, State.Static, eq);
}

/**
 * @public
 * @template T
 * @param {function(T): T} fn 
 * @param {T=} seed 
 * @param {(function(T,T): boolean)|boolean=} eq
 * @returns {!Respond<T>}
 */
function $compute(fn, seed, eq) {
    return new Computation(fn, seed, 0, eq);
}

/**
 * @public
 * @template T
 * @param {function(): T} fn 
 * @returns {!Respond<T>}
 */
function val(fn) {
    return new Value(fn);
}

/**
 * @public
 * @template T
 * @param {T} value 
 * @param {(function(T,T): boolean)|boolean=} eq
 * @returns {!Respond<T>}
 */
function signal(value, eq) {
    return new Signal(value, eq);
}

/**
 * @public
 * @param {!Respond} node 
 */
function dispose(node) {
    /** @const {number} */
    var state = node._state;
    if ((state & State.DisposeFlags) === 0) {
        if (STAGE === Stage.Idle) {
            node._dispose();
        } else {
            node._state = (state & ~State.Update) | State.Dispose;
            DISPOSES._add(node);
        }
    }
}

/**
 * @public
 * @template T
 * @param {function(): T} fn 
 * @returns {T}
 */
function peek(fn) {
    /** @const {boolean} */
    var listen = LISTEN;
    LISTEN = false;
    /** @const {T} */
    var result = fn();
    LISTEN = listen;
    return result;
}

/**
 * @public
 * @template T
 * @param {function(): T} fn 
 * @returns {T}
 */
function batch(fn) {
    /** @type {T} */
    var result;
    if (STAGE === Stage.Idle) {
        reset();
        STAGE = Stage.Started;
        try {
            result = fn();
            exec();
        } finally {
            STAGE = Stage.Idle;
        }
    } else {
        result = fn();
    }
    return result;
}

/**
 * @public
 */
function stable() {
    if (LISTEN) {
        OWNER._state |= State.Static;
    }
}

/**
 * @public
 * @param {Cleanup} fn 
 */
function cleanup(fn) {
    /** @const {?Scope} */
    var owner = OWNER;
    if (owner !== null) {
        if (owner._cleanups === null) {
            owner._cleanups = [fn];
        } else {
            owner._cleanups.push(fn);
        }
    }
}

/**
 * @public
 * @param {Recover} fn
 */
function recover(fn) {
    /** @const {?Scope} */
    var owner = OWNER;
    if (owner !== null) {
        if (owner._recovers === null) {
            owner._recovers = [fn];
        } else {
            owner._recovers.push(fn);
        }
    }
}

// Internal

/**
 * @package
 * @noinline
 * @template Proto,T
 * @param {Proto} obj
 * @param {function(this:Proto): T} getVal
 * @param {function(this:Proto): T} peekVal
 * @param {function(this:Proto, T): T=} setVal
 */
function setValProto(obj, getVal, peekVal, setVal) {
    Object.defineProperties(obj, { val: { get: getVal, set: setVal }, peek: { get: peekVal } });
}

/**
 * @package
 * @template T
 * @this {Respond}
 * @returns {T}
 */
function getValue() {
    return this._value;
}

/**
 * @package
 * @param {!Scope} owner 
 * @param {!Respond} node 
 */
function setOwner(owner, node) {
    if (owner._owned === null) {
        owner._owned = [node];
    } else {
        owner._owned.push(node);
    }
}

/**
 * @struct
 * @package
 * @template T
 * @constructor
 * @implements {Respond<T>}
 * @param {function(): T} fn
 */
function Value(fn) {
    /**
     * @package
     * @type {number}
     */
    this._state = 0;
    /**
     * @package
     * @type {?function(): T}
     */
    this._fn = fn;
    /** @const {?Scope} */
    var owner = OWNER;
    if (owner !== null) {
        setOwner(owner, this);
    }
}

/**
 * @package
 * @this {!Value<T>}
 */
Value.prototype._recDispose = recDispose;

Value.prototype._dispose = function () {
    this._fn = null;
}

setValProto(
    Value.prototype,
    /**
     * @template T 
     * @this {!Value<T>}
     * @returns {T}
     */
    function () {
        /** @type {T} */
        var result;
        /** @const {number} */
        var state = this._state;
        if ((state & State.DisposeFlags) === 0) {
            result = this._fn();
        } else if ((state & State.Dispose) !== 0) {
            result = peek(/** @type {function(): T} */(this._fn));
        }
        return result;
    },
    /**
     * @template T 
     * @this {!Value<T>}
     * @returns {T}
     */
    function () {
        if ((this._state & State.Disposed) === 0) {
            return peek(/** @type {function(): T} */(this._fn));
        }
    }
);

/**
 * @struct
 * @template T
 * @package
 * @abstract
 * @constructor
 * @implements {Respond}
 * @param {?Scope} owner 
 * @param {number|undefined} state 
 * @param {T} value 
 * @param {(function(T,T): boolean)|boolean=} eq
 */
function Send(owner, state, value, eq) {
    /**
     * @package
     * @type {number}
     */
    this._state = 0 | state;
    /**
     * @package
     * @type {T}
     */
    this._value = value;
    /**
     * @package
     * @type {?Receive}
     */
    this._node1 = null;
    /**
     * @package
     * @type {number}
     */
    this._node1slot = -1;
    /**
     * @package
     * @type {?Array<!Receive>}
     */
    this._nodes = null;
    /**
     * @package
     * @type {?Array<number>}
     */
    this._nodeslots = null;
    /**
     * @package
     * @type {?function(T,T): boolean}
     */
    this._eq = null;
    if (eq === false) {
        this._state |= State.Respond;
    } else if (eq !== void 0) {
        this._state |= State.Compare;
        this._eq = /** @type {function(T,T): boolean} */(eq);
    }
    if (owner !== null) {
        setOwner(owner, this);
    }
}

/**
 * @package
 * @this {!Send} 
 */
function send() {
    /** @type {number} */
    var ln;
    /** @const {?Receive} */
    var node1 = this._node1;
    /** @const {?Array<!Receive>} */
    var nodes = this._nodes;
    if (node1 !== null) {
        node1._recUpdate();
    }
    if (nodes !== null && (ln = nodes.length) > 0) {
        for (var i = 0; i < ln; i++) {
            nodes[i]._recUpdate();
        }
    }
}

/**
 * @package
 * @param {!Send} node
 */
function disposeSend(node) {
    node._state = State.Disposed;
    node._value = void 0;
    node._node1 = null;
    node._nodes = null;
    node._nodeslots = null;
    cleanupSender(node);
}

/**
 * @struct
 * @template T
 * @package
 * @abstract
 * @constructor
 * @extends {Send<T>}
 * @param {?Scope} owner 
 * @param {number=} state 
 * @param {T=} value 
 * @param {(function(T,T): boolean)|boolean=} eq
 */
function Receive(owner, state, value, eq) {
    Send.call(this, owner, state, value, eq);
    /**
     * @package
     * @type {?Send}
     */
    this._source1 = null;
    /**
     * @package
     * @type {number}
     */
    this._source1slot = 0;
    /**
     * @package
     * @type {?Array<!Send>}
     */
    this._sources = null;
    /**
     * @package
     * @type {?Array<number>}
     */
    this._sourceslots = null;
}

/**
 * @package
 * @this {!Respond}
 */
function recDispose() {
    this._state = State.Dispose;
    DISPOSES._add(this);
}

/**
 * @struct
 * @package
 * @constructor
 * @implements {Scope}
 */
function Owner() {
    /**
     * @package
     * @type {number}
     */
    this._state = 0;
    /**
     * @package
     * @type {?Array<!Respond>}
     */
    this._owned = null;
    /**
     * @package
     * @type {?Array<!Cleanup>}
     */
    this._cleanups = null;
    /**
     * @package
     * @type {?Array<!Recover>}
     */
    this._recovers = null;
}

/**
 * @package
 * @this {!Scope}
 */
function disposeScope() {
    this._state = State.Disposed;
    /** @type {number} */
    var i;
    /** @type {number} */
    var ln;
    /** @const {?Array<!Respond>} */
    var owned = this._owned;
    /** @const {?Array<Cleanup>} */
    var cleanups = this._cleanups;
    if (owned !== null && (ln = owned.length) !== 0) {
        for (i = 0; i < ln; i++) {
            owned[i]._dispose();
        }
    }
    this._owned = null;
    if (cleanups !== null && (ln = cleanups.length) !== 0) {
        for (i = 0; i < ln; i++) {
            cleanups[i](true);
        }
    }
    this._cleanups = null;
}

/**
 * @package
 * @this {!Owner}
 */
Owner.prototype._dispose = disposeScope;

/**
 * @struct
 * @template T
 * @package
 * @constructor
 * @param {T} value
 * @param {(function(T,T): boolean)|boolean=} eq
 * @extends {Send<T>}
 * @implements {Respond<T>}
 */
function Signal(value, eq) {
    Send.call(this, OWNER, 0, value, eq);
    /**
     * @package
     * @type {T|Nil}
     */
    this._pending = NIL;
}

setValProto(
    Signal.prototype,
    /**
     * @template T
     * @this {!Signal<T>}
     * @returns {T}
     */
    function () {
        if ((this._state & State.DisposeFlags) === 0) {
            if (LISTEN) {
                logRead(this, /** @type {!Receive} */(OWNER));
            }
        }
        return this._value;
    },
    getValue,
    /**
     * @template T
     * @this {!Signal<T>}
     * @param {T} value
     * @returns {T}
     */
    function (value) {
        /** @const {number} */
        var state = this._state;
        if ((state & State.DisposeFlags) === 0) {
            if (((state & State.Respond) !== 0) || ((state & State.Compare) === 0 ? value !== this._value : !this._eq(value, this._value))) {
                if (STAGE === Stage.Idle) {
                    if ((state & State.Send) !== 0) {
                        reset();
                        this._value = value;
                        this._send();
                        exec();
                    } else {
                        this._value = value;
                    }
                } else {
                    if (this._pending === NIL) {
                        this._pending = value;
                        this._state |= State.Update;
                        CHANGES._add(this);
                    } else if (value !== this._pending) {
                        throw new Error("Zorn: Conflict");
                    }
                }
            }
        }
        return value;
    }
);

/**
 * @package
 * @this {!Signal<T>}
 */
Signal.prototype._update = function () {
    this._value = this._pending;
    this._pending = NIL;
    this._state &= ~State.Update;
    if ((this._state & State.Send) !== 0) {
        this._send();
    }
};

/**
 * @package
 * @this {!Signal<T>}
 */
Signal.prototype._dispose = function () {
    disposeSend(this);
    this._pending = void 0;
};

/**
 * @package
 * @this {!Signal<T>}
 */
Signal.prototype._recDispose = recDispose;

/**
 * @package
 * @this {!Signal<T>}
 */
Signal.prototype._send = send;

/**
 * @struct
 * @template T 
 * @package
 * @constructor
 * @extends {Receive<T>}
 * @implements {Scope<T>}
 * @implements {Respond<T>}
 * @param {function(T): T} fn 
 * @param {T} value 
 * @param {(function(T,T): boolean)|boolean=} eq
 * @param {number} state
 */
function Computation(fn, value, state, eq) {
    /** @const {?Scope} */
    var owner = OWNER;
    /** @const {boolean} */
    var listen = LISTEN;
    Receive.call(this, owner, state, eq);
    /**
     * @package
     * @type {?Array<!Respond>}
     */
    this._owned = null;
    /**
     * @package
     * @type {?Array<!Cleanup>}
     */
    this._cleanups = null;
    /**
     * @package
     * @type {?Array<!Recover>}
     */
    this._recovers = null;
    /**
     * @package
     * @type {?function(T): T}
     */
    this._fn = fn;
    OWNER = this;
    LISTEN = true;
    if (STAGE === Stage.Idle) {
        reset();
        STAGE = Stage.Started;
        try {
            this._value = fn(value);
            if (CHANGES._count !== 0 || DISPOSES._count !== 0) {
                start();
            }
        } finally {
            STAGE = Stage.Idle;
            OWNER = null;
            LISTEN = false;
        }
    } else {
        this._value = fn(value);
    }
    OWNER = owner;
    LISTEN = listen;
};

setValProto(
    Computation.prototype,
    /**
     * @template T
     * @this {Computation<T>}
     * @returns {T}
     */
    function getComputation() {
        /** @const {number} */
        var state = this._state;
        if ((state & State.DisposeFlags) === 0 && STAGE !== Stage.Idle) {
            if ((state & State.Update) !== 0) {
                if ((state & State.Updated) !== 0) {
                    throw new Error();
                }
                this._update();
            }
            if (LISTEN) {
                logRead(this, /** @type {!Receive} */(OWNER));
            }
        }
        return this._value;
    },
    getValue
);

/**
 * @package
 * @this {Computation<T>}
 */
Computation.prototype._update = function () {
    /** @type {number} */
    var i;
    /** @type {number} */
    var ln;
    /** @const {?Scope} */
    var owner = OWNER;
    /** @const {boolean} */
    var listen = LISTEN;
    OWNER = null;
    LISTEN = false;
    /** @const {number} */
    var state = this._state;
    /** @const {?Array<Cleanup>} */
    var cleanups = this._cleanups;
    if (cleanups !== null && (ln = cleanups.length) !== 0) {
        for (i = 0; i < ln; i++) {
            cleanups[i](false);
        }
        cleanups.length = 0;
    }
    OWNER = this;
    LISTEN = (state & State.Static) === 0
    if (LISTEN) {
        cleanupReceiver(this);
    }
    this._state |= State.Updated;
    /** @const {?Array<Recover>} */
    var recovers = this._recovers;
    if (recovers !== null) {
        try {
            this._value = this._fn(this._value);
        } catch (err) {
            ln = recovers.length;
            for (i = 0; i < ln; i++) {
                recovers[i](err);
            }
            recovers.length = 0;
        }
    } else {
        this._value = this._fn(this._value);
    }
    this._state &= ~State.UpdateFlags;
    OWNER = owner;
    LISTEN = listen;
};

/**
 * @package
 * @this {!Computation<T>}
 */
Computation.prototype._dispose = function () {
    this._fn = null;
    this._value = void 0;
    disposeScope.call(this);
    disposeSend(this);
    cleanupReceiver(this);
};

/**
 * @package
 * @this {!Computation<T>}
 */
Computation.prototype._recDispose = function () {
    this._state = State.Dispose;
    DISPOSES._add(this);
    /** @const {?Array<!Respond>} */
    var owned = this._owned;
    if (owned !== null) {
        recOwnedDisposed(owned);
    }
}

/**
 * @package
 * @this {!Computation<T>}
 */
Computation.prototype._send = send;

/**
 * @package
 * @this {!Computation<T>}
 */
Computation.prototype._recUpdate = function () {
    /** @const {number} */
    var state = this._state;
    if ((state & State.DisposeFlags) === 0 && (state & State.Update) === 0) {
        this._state |= State.Update;
        if ((state & (State.Respond | State.Send)) === State.Send) {
            PENDINGS._add(this);
        } else {
            UPDATES._add(this);
        }
        /** @const {?Array<!Respond>} */
        var owned = this._owned;
        if (owned !== null) {
            recOwnedDisposed(owned);
        }
        if ((state & State.Send) !== 0) {
            this._send();
        }
    }
};

/**
 * @package
 * @param {!Array<!Respond>} owned 
 */
function recOwnedDisposed(owned) {
    /** @type {number} */
    var ln = owned.length
    for (; ln-- !== 0;) {
        owned.pop()._recDispose();
    }
}

/**
 * @struct
 * @package
 * @constructor
 * @param {number} stage 
 */
function Queue(stage) {
    /**
     * @package
     * @const {number}
     */
    this._stage = stage;
    /**
     * @package
     * @const {!Array<?Respond>}
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
 * @param {!Respond} item
 * @this {!Queue}
 */
Queue.prototype._add = function (item) {
    this._items[this._count++] = item;
};

/**
 * @package
 * @returns {number}
 * @this {!Queue}
 */
Queue.prototype._run = function () {
    STAGE = this._stage;
    /** @type {number} */
    var error = 0;
    for (var i = 0; i < this._count; i++) {
        /** @const {?Respond} */
        var item = this._items[i];
        /** @const {number} */
        var state = item._state;
        if ((state & (State.Update | State.Dispose)) !== 0) {
            try {
                if ((state & State.Update) !== 0) {
                    /** @type {!Send} */(item)._update();
                } else {
                    item._dispose();
                }
            } catch (err) {
                error = 1;
                if ((state & State.Update) !== 0) {
                    item._state |= State.Error;
                }
                item._state &= ~State.UpdateFlags;
            }
        }
        this._items[i] = null;
    }
    this._count = 0;
    return error;
};

/**
 * @const {!Nil}
 */
var NIL = /** @type {!Nil} */({});
/**
 * @type {number}
 */
var STAGE = Stage.Idle;
/**
 * @const {!Queue}
 */
var DISPOSES = new Queue(Stage.Disposes);
/**
 * @const {!Queue}
 */
var CHANGES = new Queue(Stage.Changes);
/**
 * @const {!Queue}
 */
var PENDINGS = new Queue(Stage.Computes);
/**
 * @const {!Queue}
 */
var UPDATES = new Queue(Stage.Effects);
/**
 * @type {?Scope}
 */
var OWNER = null;
/**
 * @type {boolean}
 */
var LISTEN = false;

/**
 * @package
 */
function reset() {
    DISPOSES._count = CHANGES._count = PENDINGS._count = UPDATES._count = 0;
}

/**
 * @package
 * @param {!Send} from 
 * @param {!Receive} to
 */
function logRead(from, to) {
    from._state |= State.Send;
    /** @type {number} */
    var fromslot;
    /** @const {number} */
    var toslot = to._source1 === null ? -1 : to._sources === null ? 0 : to._sources.length;
    if (from._node1 === null) {
        fromslot = -1;
        from._node1 = to;
        from._node1slot = toslot;
    } else if (from._nodes === null) {
        fromslot = 0;
        from._nodes = [to];
        from._nodeslots = [toslot];
    } else {
        fromslot = from._nodes.length;
        from._nodes[fromslot] = to;
        from._nodeslots[fromslot] = toslot;
    }
    if (to._source1 === null) {
        to._source1 = from;
        to._source1slot = fromslot;
    } else if (to._sources === null) {
        to._sources = [from];
        to._sourceslots = [fromslot];
    } else {
        to._sources[toslot] = from;
        to._sourceslots[toslot] = fromslot;
    }
}

/**
 * @package
 * @throws {Error}
 */
function exec() {
    /** @const {?Scope} */
    var owner = OWNER;
    try {
        start();
    } finally {
        STAGE = Stage.Idle;
        OWNER = owner;
        LISTEN = false;
    }
}

/**
 * @package
 * @throws {Error}
 */
function start() {
    /** @type {number} */
    var cycle = 0;
    /** @type {number} */
    var errors = 0;
    /** @const {!Queue} */
    var disposes = DISPOSES;
    /** @const {!Queue} */
    var changes = CHANGES;
    /** @const {!Queue} */
    var pendings = PENDINGS;
    /** @const {!Queue} */
    var updates = UPDATES;
    do {
        if (disposes._count !== 0) {
            errors += disposes._run();
        }
        if (changes._count !== 0) {
            errors += changes._run();
        }
        if (disposes._count !== 0) {
            errors += disposes._run();
        }
        if (pendings._count !== 0) {
            errors += pendings._run();
        }
        if (updates._count !== 0) {
            errors += updates._run();
        }
        if (errors !== 0) {
            throw new Error("Zorn: Error");
        }
        if (cycle++ > 1e5) {
            throw new Error("Zorn: Cycle");
        }
    } while (changes._count !== 0 || disposes._count !== 0 || pendings._count !== 0 || updates._count !== 0);
}

/**
 * @package
 * @param {!Receive} node
 */
function cleanupReceiver(node) {
    /** @type {number} */
    var ln;
    /** @const {?Send} */
    var source1 = node._source1;
    /** @const {?Array<!Send>} */
    var sources = node._sources;
    if (source1 !== null) {
        forgetReceiver(source1, node._source1slot);
        node._source1 = null;
    }
    if (sources !== null && (ln = sources.length) !== 0) {
        /** @const {?Array<number>} */
        var sourceslots = node._sourceslots;
        for (; ln-- !== 0;) {
            forgetReceiver(sources.pop(), sourceslots.pop());
        }
    }
}

/**
 * @package
 * @param {!Send} send 
 * @param {number} slot
 */
function forgetReceiver(send, slot) {
    if ((send._state & State.DisposeFlags) === 0) {
        if (slot === -1) {
            send._node1 = null;
        } else {
            /** @const {?Array<Receive>} */
            var nodes = send._nodes;
            /** @const {?Array<number>} */
            var nodeslots = send._nodeslots;
            /** @const {Receive} */
            var last = nodes.pop();
            /** @const {number} */
            var lastslot = nodeslots.pop();
            if (slot !== nodes.length) {
                nodes[slot] = last;
                nodeslots[slot] = lastslot;
                if (lastslot === -1) {
                    last._source1slot = slot;
                } else {
                    last._sourceslots[lastslot] = slot;
                }
            }
        }
    }
}

/**
 * @package
 * @param {!Send} send
 */
function cleanupSender(send) {
    /** @type {number} */
    var ln;
    var node1 = send._node1;
    var nodes = send._nodes;
    if (node1 !== null) {
        forgetSender(node1, send._node1slot);
        send._node1 = null;
    }
    if (nodes !== null && (ln = nodes.length) !== 0) {
        var nodeslots = send._nodeslots;
        for (; ln-- !== 0;) {
            forgetSender(nodes.pop(), nodeslots.pop());
        }
    }
}

/**
 * @package
 * @param {!Receive} receive 
 * @param {number} slot
 */
function forgetSender(receive, slot) {
    if ((receive._state & State.DisposeFlags) === 0) {
        if (slot === -1) {
            receive._source1 = null;
        } else {
            var sources = receive._sources;
            var sourceslots = receive._sourceslots;
            var last = sources.pop();
            var lastslot = sourceslots.pop();
            if (slot !== sources.length) {
                sources[slot] = last;
                sourceslots[slot] = lastslot;
                if (lastslot === -1) {
                    last._node1slot = slot;
                } else {
                    last._nodeslots[lastslot] = slot;
                }
            }
        }
    }
}

export {
    root, dispose, val,
    compute, $compute, peek, stable,
    signal, batch, recover, cleanup
};