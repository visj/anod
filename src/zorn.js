/**
 * @typedef {function(boolean): void}
 */
var Cleanup;

/**
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
function Op() { }

/**
 * @package
 * @type {number}
 */
Op.prototype._state;

/**
 * @package
 * @returns {void}
 */
Op.prototype._update = function () { }

/**
 * @package
 * @returns {void}
 */
Op.prototype._dispose = function () { }

/**
 * @interface
 * @template T
 * @extends {Op}
 */
function React() { }

/**
 * @package
 * @type {T}
 */
React.prototype._value;

/**
 * @template T
 * @interface
 * @extends {Op}
 */
function Scope() { }

/**
 * @package
 * @type {?Array<!React>}
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
 * @template T
 * @interface
 */
function Signal() { }

/**
 * @public
 * @type {T}
 */
Signal.prototype.val;

/**
 * @public
 * @type {T}
 */
Signal.prototype.peek;

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
    Error: 64,
    Respond: 128,
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
 */
Send.prototype._send = function () { };

/**
 * @abstract
 */
Receive.prototype._recUpdate = function () { };

/**
 * @abstract
 */
Receive.prototype._recDispose = function () { };

/* START_OF_FILE */

// Public API

/**
 * 
 * @returns {Nil}
 */
function nil() {
    return NIL;
}

/**
 * 
 * @returns {?Scope}
 */
function owner() {
    return OWNER;
}

/**
 * @template T
 * @param {function(): T} fn 
 * @returns {!Scope<T>}
 */
function root(fn) {
    var node = new Owner();
    var owner = OWNER;
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
 * @template T
 * @param {function(T): T} fn 
 * @param {T=} seed 
 * @param {boolean | (function(T, T): boolean)=} eq
 * @returns {!Signal<T>}
 */
function compute(fn, seed, eq) {
    return new Computation(fn, seed, State.Static, eq);
}

/**
 * @template T
 * @param {function(T): T} fn 
 * @param {T=} seed 
 * @param {boolean | (function(T, T): boolean)=} eq
 * @returns {!Signal<T>}
 */
function $compute(fn, seed, eq) {
    return new Computation(fn, seed, 0, eq);
}

/**
 * @template S,T,P
 * @param {!Signal<S>|!Array<!Signal>} src
 * @param {function((S|!Array<S>),T,P): T} fn 
 * @param {boolean=} defer
 * @param {P=} args
 * @returns {function(T): T}
 */
function when(src, fn, defer, args) {
    /** @type {number} */
    var ln;
    /** @type {S|!Array<S>} */
    var srcVal;
    /** @const {boolean} */
    var isArray = Array.isArray(src);
    if (isArray) {
        ln = src.length;
        srcVal = new Array(ln);
    }
    return function (seed) {
        if (isArray) {
            for (var i = 0; i < ln; i++) {
                srcVal[i] = src[i].val;
            }
        } else {
            srcVal = src.val;
        }
        if (defer) {
            defer = false;
        } else {
            seed = peek(fn, srcVal, seed, args);
        }
        return seed;
    };
}

/**
 * @template T
 * @param {function(): T} fn 
 * @returns {!Signal<T>}
 */
function val(fn) {
    return new Val(fn);
}

/**
 * @template T
 * @param {T} value 
 * @returns {!Signal<T>}
 */
function data(value) {
    return new Data(value);
}

/**
 * @template T
 * @param {T} value 
 * @param {function(T, T): boolean=} eq
 * @returns {!Signal<T>}
 */
function value(value, eq) {
    return new Value(value, eq);
}

/**
 * @param {!Op} node 
 */
function dispose(node) {
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
 * @template P1,P2,P3,T
 * @param {function(P1,P2,P3): T} fn 
 * @param {P1=} arg1 
 * @param {P2=} arg2
 * @param {P3=} arg3
 * @returns {T}
 */
function peek(fn, arg1, arg2, arg3) {
    var listen = LISTEN;
    LISTEN = false;
    var result = fn(arg1, arg2, arg3);
    LISTEN = listen;
    return result;
}

/**
 * @template T
 * @param {function(): T} fn 
 * @returns {T}
 */
function freeze(fn) {
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
 * 
 * @param {Cleanup} fn 
 *
 */
function cleanup(fn) {
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
 * @param {!Recover} fn
 */
function recover(fn) {
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
 * @template T
 * @this {React}
 * @returns {T}
 */
function getValue() {
    return this._value;
}

/**
 * @struct
 * @template T
 * @constructor
 * @implements {Signal<T>}
 * @param {function(): T} fn
 */
function Val(fn) {
    /**
     * @package
     * @const {function(): T}
     */
    this._fn = fn;
}

/**
 * @template T 
 * @this {!Val<T>}
 * @returns {T}
 */
function getVal() {
    return this._fn();
}

/**
 * @template T 
 * @this {!Val<T>}
 * @returns {T}
 */
function peekVal() {
    return peek(this._fn);
}

setValProto(Val.prototype, getVal, peekVal);

/**
 * @struct
 * @template T
 * @abstract
 * @constructor
 * @implements {React}
 * @param {?Scope} owner 
 * @param {number|undefined} state 
 * @param {T} value 
 */
function Send(owner, state, value) {
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
    if (owner !== null) {
        if (owner._owned === null) {
            owner._owned = [this];
        } else {
            owner._owned.push(this);
        }
    }
}

/**
 * @this {!Send} 
 */
function sendUpdate() {
    /** @type {number} */
    var ln;
    var node1 = this._node1;
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
 * @param {!Send} node 
 */
function disposeSender(node) {
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
 * @abstract
 * @constructor
 * @extends {Send<T>}
 * @param {?Scope} owner 
 * @param {number=} state 
 * @param {T=} value 
 */
function Receive(owner, state, value) {
    Send.call(this, owner, state, value);
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
 * @struct
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
     * @type {?Array<!Op>}
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
 * @this {!Scope}
 */
function disposeOwner() {
    this._state = State.Disposed;
    /** @type {number} */
    var i;
    /** @type {number} */
    var ln;
    var owned = this._owned;
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
Owner.prototype._update = function () { };

/**
 * @package
 * @this {!Owner}
 */
Owner.prototype._dispose = disposeOwner;

/**
 * @struct
 * @template T
 * @constructor
 * @param {T} value
 * @extends {Send<T>}
 * @implements {Signal<T>}
 */
function Data(value) {
    Send.call(this, OWNER, 0, value);
    /**
     * @package
     * @type {T|Nil}
     */
    this._pending = NIL;
}

/**
 * @template T
 * @this {!Data<T>}
 * @returns {T}
 */
function getData() {
    if ((this._state & State.DisposeFlags) === 0) {
        if (LISTEN) {
            logRead(this, /** @type {!Receive} */(OWNER));
        }
    }
    return this._value;
}

/**
 * @template T
 * @this {!Data<T>}
 * @param {T} value
 * @returns {T}
 */
function setData(value) {
    var state = this._state;
    if ((state & State.DisposeFlags) === 0) {
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
    return value;
}

/**
 * @template T
 * @this {!Data<T>}
 *
 */
function updateData() {
    this._value = this._pending;
    this._pending = NIL;
    this._state &= ~State.Update;
    if ((this._state & State.Send) !== 0) {
        this._send();
    }
}

/**
 * @template T
 * @this {!Data<T>}
 */
function disposeData() {
    disposeSender(this);
    this._pending = void 0;
}

setValProto(Data.prototype, getData, getValue, setData);

/**
 * @package
 * @this {!Data<T>}
 */
Data.prototype._update = updateData;

/**
 * @package
 * @this {!Data<T>}
 */
Data.prototype._dispose = disposeData;

/**
 * @package
 * @this {!Data<T>}
 */
Data.prototype._send = sendUpdate;

/**
 * @struct
 * @template T
 * @constructor
 * @extends {Data<T>}
 * @param {T} value 
 * @param {(function(T,T): boolean)=} eq
 */
function Value(value, eq) {
    Data.call(this, value);
    /**
     * @package
     * @type {?(function(T,T): boolean)|undefined}
     */
    this._eq = eq;
}

/**
 * @template T
 * @this {!Value<T>}
 * @param {T} value 
 * @returns {T} 
 */
function setValue(value) {
    if ((this._state & State.DisposeFlags) === 0) {
        if (this._eq === void 0 ? value !== this._value : !this._eq(value, this._value)) {
            setData.call(this, value);
        }
    }
    return value;
}

setValProto(Value.prototype, getData, getValue, setValue);

/**
 * @package
 * @this {!Value<T>}
 */
Value.prototype._update = updateData;

/**
 * @package
 * @this {!Value<T>}
 */
Value.prototype._dispose = function () {
    this._eq = null;
    disposeData.call(this);
};

/**
 * @package
 * @this {!Value<T>}
 */
Value.prototype._send = sendUpdate;

/**
 * @struct
 * @template T 
 * @constructor
 * @extends {Receive<T>}
 * @implements {Scope<T>}
 * @implements {Signal<T>}
 * @param {function(T): T} fn 
 * @param {T} value 
 * @param {(function(T,T): boolean)|boolean=} eq
 * @param {number} state
 */
function Computation(fn, value, state, eq) {
    var owner = OWNER;
    var listen = LISTEN;
    Receive.call(this, owner, state);
    /**
     * @package
     * @type {?Array<!React>}
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
    /**
     * @package
     * @type {(function(T,T): boolean)|boolean|undefined}
     */
    this._eq = void 0;
    if (eq === false) {
        this._state |= State.Respond;
    } else if (eq !== void 0) {
        this._eq = eq;
    }
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

/**
 * @template T
 * @this {Computation<T>}
 * @returns {T}
 */
function getComputation() {
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
}

setValProto(Computation.prototype, getComputation, getValue);

/**
 * @package
 * @this {Computation<T>}
 */
Computation.prototype._update = function () {
    /** @type {number} */
    var i;
    /** @type {number} */
    var ln;
    var owner = OWNER;
    var listen = LISTEN;
    OWNER = null;
    LISTEN = false;
    var state = this._state;
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
    disposeOwner.call(this);
    disposeSender(this);
    cleanupReceiver(this);
};

/**
 * @package
 * @this {!Computation<T>}
 */
Computation.prototype._send = sendUpdate;

/**
 * @package
 * @this {!Computation<T>}
 */
Computation.prototype._recUpdate = function () {
    var state = this._state;
    if ((state & State.DisposeFlags) === 0 && (state & State.Update) === 0) {
        this._state |= State.Update;
        if ((state & (State.Respond | State.Send)) === State.Send) {
            PENDINGS._add(this);
        } else {
            UPDATES._add(this);
        }
        var owned = this._owned;
        if (owned !== null) {
            for (var ln = owned.length; ln-- !== 0;) {
                owned.pop()._recDispose();
            }
        }
        if ((state & State.Send) !== 0) {
            this._send();
        }
    }
};

/**
 * @package
 * @this {!Computation<T>}
 */
Computation.prototype._recDispose = function () {
    this._state = State.Dispose;
    DISPOSES._add(this);
    var owned = this._owned;
    if (owned !== null) {
        for (var ln = owned.length; ln-- !== 0;) {
            owned.pop()._recDispose();
        }
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
     * @const {!Array<?Op>}
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
 * @param {!Op} item
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
    var error = 0;
    for (var i = 0; i < this._count; i++) {
        var item = this._items[i];
        var state = item._state;
        if ((state & (State.Update | State.Dispose)) !== 0) {
            try {
                if ((state & State.Update) !== 0) {
                    item._update();
                } else {
                    item._dispose();
                }
            } catch (err) {
                error = 1;
                if ((state & State.Update) !== 0) {
                    item._value = err;
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

// Constants
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
 *
 */
function reset() {
    DISPOSES._count = CHANGES._count = PENDINGS._count = UPDATES._count = 0;
}

/**
 * 
 * @param {!Send} from 
 * @param {!Receive} to
 */
function logRead(from, to) {
    from._state |= State.Send;
    /** @type {number} */
    var fromslot;
    var toslot = to._source1 === null ? -1 : to._sources === null ? 0 : to._sources.length;
    if (from._node1 === null) {
        from._node1 = to;
        from._node1slot = toslot;
        fromslot = -1;
    } else if (from._nodes === null) {
        from._nodes = [to];
        from._nodeslots = [toslot];
        fromslot = 0;
    } else {
        fromslot = from._nodes.length;
        from._nodes.push(to);
        from._nodeslots.push(toslot);
    }
    if (to._source1 === null) {
        to._source1 = from;
        to._source1slot = fromslot;
    } else if (to._sources === null) {
        to._sources = [from];
        to._sourceslots = [fromslot];
    } else {
        to._sources.push(from);
        to._sourceslots.push(fromslot);
    }
}

/**
 *
 */
function exec() {
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
 *
 */
function start() {
    var cycle = 0;
    var errors = 0;
    var disposes = DISPOSES;
    var changes = CHANGES;
    var pendings = PENDINGS;
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
 * 
 * @param {!Receive} node
 *
 */
function cleanupReceiver(node) {
    /** @type {number} */
    var ln;
    var source1 = node._source1;
    var sources = node._sources;
    if (source1 !== null) {
        forgetReceiver(source1, node._source1slot);
        node._source1 = null;
    }
    if (sources !== null && (ln = sources.length) !== 0) {
        var sourceslots = node._sourceslots;
        for (; ln-- !== 0;) {
            forgetReceiver(sources.pop(), sourceslots.pop());
        }
    }
}

/**
 * 
 * @param {!Send} send 
 * @param {number} slot
 *
 */
function forgetReceiver(send, slot) {
    if ((send._state & State.DisposeFlags) === 0) {
        if (slot === -1) {
            send._node1 = null;
        } else {
            var nodes = send._nodes;
            var nodeslots = send._nodeslots;
            var last = nodes.pop();
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
 * 
 * @param {!Send} send
 *
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
 * 
 * @param {!Receive} receive 
 * @param {number} slot
 *
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
    root, dispose, val, owner,
    compute, $compute, when, peek,
    data, value, nil, freeze, recover,
    cleanup, Data, Value, Computation
};