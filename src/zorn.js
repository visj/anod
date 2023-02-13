//@ts-check

/**
 * @typedef {function(boolean): void}
 */
var Cleanup;

/** 
 * @abstract
 * @constructor 
 */
function Nil() { }

/**
 * @template T
 * @interface
 */
function Respond() { }

/**
 * @package
 * @type {number}
 */
Respond.prototype._state;

/**
 * @package
 * @type {T}
 */
Respond.prototype._value;

/**
 * @package
 * @returns {void}
 */
Respond.prototype._update = function () { }

/**
 * @package
 * @param {number} time 
 * @returns {void}
 */
Respond.prototype._dispose = function (time) { }

/**
 * @template T
 * @interface
 * @extends {Respond<T>}
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
 * @template T
 * @interface
 * @extends {Respond}
 */
function Func() { }

/**
 * @export
 * @public
 * @type {T}
 * @readonly
 */
Func.prototype.val;

/**
 * @template T
 * @interface
 * @extends {Respond}
 */
function Signal() { }

/**
 * @public
 * @export
 * @type {T}
 */
Signal.prototype.val;

/**
 * @typedef {Func | Signal}
 */
var Source;

/**
 * @interface
 */
function IOpt() { }

/**
 * @const
 * @public
 * @export
 * @type {number}
 */
IOpt.prototype.Defer;

/**
 * @const
 * @public
 * @export
 * @type {number}
 */
IOpt.prototype.Static;

/**
 * @const
 * @type {!IOpt}
 */
var Opt = /** @type {!IOpt} */({
    Defer: 8 /* State.Defer */,
    Static: 16 /* State.Static */
});

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
 * 
 * @returns {?Receive}
 */
function listener() {
    return LISTENER;
}

/**
 * 
 * @param {!Source} node 
 * @returns {void}
 */
function dispose(node) {
    if ((node._state & (64 /* State._dispose */ | 256 /* State._disposed */)) === 0) {
        if (STAGE === 0 /* Stage.Idle */) {
            node._dispose(TIME);
        }
        else {
            node._state |= 64 /* State._dispose */;
            DISPOSES.add(node);
        }
    }
}

/**
 * @template S, T
 * @param {!Func<S> | !Array<!Func>} src 
 * @param {function((S | !Array<S>), T, (S | undefined)): T} fn 
 * @returns {function(T): T}
 */
function bind(src, fn) {
    /**
     * @type {S | !Array<S> | Nil}
     */
    var prev = NIL;
    /**
     * @type {number}
     */
    var ln;
    /**
     * @type {S | !Array<S>}
     */
    var next;
    /**
     * @type {boolean}
     */
    var defer;
    /**
     * @type {S | !Array<S>}
     */
    var holder;
    /**
     * @const
     * @type {boolean}
     */
    var isArray = Array.isArray(src);
    if (isArray) {
        ln = /** @type {!Array<S>} */(src).length;
        prev = new Array(ln);
        next = new Array(ln);
    }
    return function (seed) {
        if (defer === void 0) {
            LISTENER = /** @type {!Receive} */(OWNER);
            LISTENER._state |= 16 /* State.Static */;
            defer = (LISTENER._state & 8 /* State.Defer */) !== 0;
        }
        if (isArray) {
            for (var i = 0; i < ln; i++) {
                next[i] = /** @type {!Array<Func>} */(src)[i].val;
            }
        } else {
            next = /** @type {!Func<S>} */(src).val;
        }
        LISTENER = null;
        if (defer) {
            defer = false;
        } else {
            seed = fn(next, seed, prev);
        }
        holder = next;
        next = prev;
        prev = holder;
        return seed;
    };
}
/**
 * @template T
 * @param {function(T): T} fn 
 * @param {T=} seed 
 * @param {number=} opt 
 * @returns {Computation<T>}
 */
function compute(fn, seed, opt) {
    return new Computation(fn, seed, opt);
}

/**
 * @template T 
 * @param {function(T): T} fn 
 * @param {T=} seed 
 * @param {number=} opt 
 * @returns {void}
 */
function effect(fn, seed, opt) {
    new Computation(fn, seed, opt);
}

/**
 * @template T
 * @param {function(): T} fn 
 * @returns {Owner<T>}
 */
function root(fn) {
    var node = new Owner();
    var owner = OWNER;
    var listener = LISTENER;
    OWNER = node;
    LISTENER = null;
    if (STAGE === 0 /* Stage.Idle */) {
        try {
            node._value = fn();
        }
        finally {
            OWNER = owner;
            LISTENER = listener;
        }
    }
    else {
        node._value = fn();
        OWNER = owner;
        LISTENER = listener;
    }
    return node;
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
 * @template T
 * @param {function(): T} fn 
 * @returns {T}
 */
function freeze(fn) {
    var result;
    if (STAGE === 0 /* Stage.Idle */) {
        reset();
        STAGE = 1 /* Stage.Started */;
        try {
            result = fn();
            exec();
        }
        finally {
            STAGE = 0 /* Stage.Idle */;
        }
    }
    else {
        result = fn();
    }
    return result;
}

/**
 * @template T
 * @param {Func | Signal | function(): T} fn 
 * @returns {T}
 */
function peek(fn) {
    /**
     * @const
     * @type {?Receive}
     */
    var listener = LISTENER;
    LISTENER = null;
    /**
     * @const
     * @type {T}
     */
    var result = isFunction(fn) ? /** @type {function(): T} */(fn)() : /** @type {Func | Signal} */(fn).val;
    LISTENER = listener;
    return result;
}

/**
 * 
 * @param {Cleanup} fn 
 * @returns {void}
 */
function cleanup(fn) {
    var owner = OWNER;
    if (owner !== null) {
        if (owner._cleanups === null) {
            owner._cleanups = [fn];
        }
        else {
            owner._cleanups.push(fn);
        }
    }
}

/**
 * @noinline
 * @param {Object} obj 
 * @param {!ObjectPropertyDescriptor<?Object>} config 
 */
function setVal(obj, config) {
    Object.defineProperty(obj, "val", config);
}

/**
 * @template T
 * @abstract
 * @constructor
 * @implements {Respond<T>}
 * @param {Scope | null} owner 
 * @param {number | undefined} state 
 * @param {T} value 
 */
function Send(owner, state, value) {
    /**
     * @package
     * @type {number}
     */
    this._state = 0 /* State.None */ | state;
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
        }
        else {
            owner._owned.push(this);
        }
    }
}

/**
 * 
 * @param {!Send} node 
 * @param {number} time 
 * @returns {void}
 */
function sendUpdate(node, time) {
    var node1 = node._node1;
    var nodes = node._nodes;
    if (node1 !== null) {
        receiveUpdate(node1, time);
    }
    if (nodes !== null) {
        var ln = nodes.length;
        for (var i = 0; i < ln; i++) {
            receiveUpdate(nodes[i], time);
        }
    }
}

/**
 * 
 * @param {!Send} node 
 * @returns {void}
 */
function disposeSender(node) {
    node._state = 256 /* State._disposed */;
    node._value = void 0;
    node._node1 = null;
    node._nodes = null;
    node._nodeslots = null;
    cleanupSender(node);
}

/**
 * @template T
 * @constructor
 * @implements {Scope<T>}
 */
function Owner() {
    /**
     * @package
     * @type {number}
     */
    this._state = 0 /* State.None */;
    /**
     * @package
     * @type {T}
    */
    this._value = /** @type {T} */(void 0);
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
}

/**
 * @template T 
 * @this {Scope<T>}
 * @param {number} time 
 */
function disposeOwner(time) {
    this._state = 256 /* State._disposed */;
    this._value = /** @type {T} */(void 0);
    var i;
    var ln;
    var owned = this._owned;
    var cleanups = this._cleanups;
    if (owned !== null && (ln = owned.length) !== 0) {
        for (i = 0; i < ln; i++) {
            owned[i]._dispose(time);
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

setVal(Owner.prototype, {
    /**
     * @template T
     * @this {Owner<T>}
     * @returns {T}
     */
    get: function () {
        return this._value;
    }
});

Owner.prototype._update = NoOp;

Owner.prototype._dispose = disposeOwner;

/**
 * 
 * @param {!Receive} node 
 * @param {number} time 
 */
function receiveUpdate(node, time) {
    var /** number */ ln;
    if (node._age < time) {
        if (node._owned !== null && (ln = node._owned.length) !== 0) {
            for (; ln-- !== 0;) {
                node._owned.pop()._dispose(time);
            }
        }
        node._age = time;
        node._state |= 32 /* State._update */;
        EFFECTS.add(node);
        if ((node._state & 1024 /* State.Send */) !== 0) {
            sendUpdate(node, time);
        }
    }
}

/**
 * @template T
 * @abstract
 * @constructor
 * @extends {Send<T>}
 * @implements {Scope<T>}
 * @param {?Scope} owner 
 * @param {number=} state 
 * @param {T=} value 
 */
function Receive(owner, state, value) {
    Send.call(this, owner, state, value);
    /**
     * @package
     * @type {number}
     */
    this._age = 0;
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
    /**
     * @package
     * @type {?Array<!Scope<*>>}
     */
    this._owned = null;
    /**
     * @package
     * @type {?Array<!Cleanup>}
     */
    this._cleanups = null;
}

/**
 * @template T
 * @constructor
 * @param {T} value
 * @extends {Send<T>}
 * @implements {Signal<T>}
 */
function Data(value) {
    Send.call(this, OWNER, 0 /* State.None */, value);
    /**
     * @type {T | Nil}
     */
    this._pending = NIL;
}

/**
 * @template T
 * @this {!Data<T>}
 * @returns {T}
 */
function getData() {
    if ((this._state & (64 /* State._dispose */ | 256 /* State._disposed */)) === 0) {
        if (LISTENER !== null) {
            logRead(this, LISTENER);
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
    if ((state & (64 /* State._dispose */ | 256 /* State._disposed */)) === 0) {
        if (STAGE === 0 /* Stage.Idle */) {
            if ((state & 1024 /* State.Send */) !== 0) {
                reset();
                this._pending = value;
                this._state |= 32 /* State._update */;
                CHANGES.add(this);
                exec();
            }
            else {
                this._value = value;
            }
        }
        else {
            if (this._pending === NIL) {
                this._pending = value;
                this._state |= 32 /* State._update */;
                CHANGES.add(this);
            }
            else if (value !== this._pending) {
                throw new Error("conflicting changes: " + value + " !== " + this._pending);
            }
        }
    }
    return value;
}

/**
 * @template T
 * @this {!Data<T>}
 * @returns {void}
 */
function updateData() {
    this._value = this._pending;
    this._pending = NIL;
    this._state &= ~32 /* State._update */;
    if ((this._state & 1024 /* State.Send */) !== 0) {
        sendUpdate(this, TIME);
    }
}

/**
 * @template T
 * @this {!Data<T>}
 * @returns {void}
 */
function disposeData() {
    disposeSender(this);
    this._pending = void 0;
}

setVal(Data.prototype, { get: getData, set: setData });

/**
 * @this {!Data<T>}
 * @returns {void}
 */
Data.prototype._update = updateData;

/**
 * @this {!Data<T>}
 * @param {number} time
 * @returns {void}
 */
Data.prototype._dispose = disposeData;

/**
 * @template T
 * @constructor
 * @extends {Data<T>}
 * @param {T} value 
 * @param {function(T, T): boolean=} eq
 */
function Value(value, eq) {
    Data.call(this, value);
    this.eq = eq || Equals;
}

/**
 * @template T
 * @this {!Value<T>}
 * @param {T} value 
 * @returns {T} 
 */
function setValue(value) {
    if ((this._state & (64 /* State._dispose */ | 256 /* State._disposed */)) === 0 && !this.eq(this._value, value)) {
        setData.call(this, value);
    }
    return value;
}
setVal(Value.prototype, { get: getData, set: setValue });

/**
 * @this {!Value<T>}
 * @returns {void}
 */
Value.prototype._update = updateData;

/**
 * @this {!Value<T>}
 * @returns {void}
 */
Value.prototype._dispose = function () {
    this.eq = null;
    disposeData.call(this);
};

/**
 * @template T 
 * @constructor
 * @extends {Receive<T>}
 * @implements {Func<T>}
 * @param {function(T): T} fn 
 * @param {T=} value 
 * @param {number=} state
 */
function Computation(fn, value, state) {
    var owner = OWNER;
    var listener = LISTENER;
    Receive.call(this, owner, state);
    this._fn = fn;
    OWNER = LISTENER = this;
    if (STAGE === 0 /* Stage.Idle */) {
        reset();
        STAGE = 1 /* Stage.Started */;
        try {
            this._value = fn(value);
            if (CHANGES._count > 0 || DISPOSES._count > 0) {
                start();
            }
        }
        finally {
            STAGE = 0 /* Stage.Idle */;
            OWNER = LISTENER = null;
        }
    }
    else {
        this._value = fn(value);
    }
    OWNER = owner;
    LISTENER = listener;
};

setVal(Computation.prototype, {
    /**
     * @template T
     * @this {Computation<T>}
     * @returns {T}
     */
    get: function () {
        var state = this._state;
        if ((state & (64 /* State._dispose */ | 256 /* State._disposed */)) === 0 && STAGE !== 0 /* Stage.Idle */) {
            if (this._age === TIME) {
                if ((state & 128 /* State._updated */) !== 0) {
                    throw new Error("circular dependency");
                }
                this._update();
            }
            if (LISTENER !== null) {
                logRead(this, LISTENER);
            }
        }
        return this._value;
    }
});

/**
 * @returns {void}
 */
Computation.prototype._update = function () {
    if ((this._state & 32 /* State._update */) !== 0) {
        var owner = OWNER;
        var listener = LISTENER;
        OWNER = LISTENER = null;
        if (this._cleanups !== null) {
            var ln = this._cleanups.length;
            for (; ln-- !== 0;) {
                this._cleanups.pop()(false);
            }
        }
        if ((this._state & 16 /* State.Static */) === 0) {
            cleanupReceiver(this);
        }
        OWNER = this;
        LISTENER = (this._state & 16 /* State.Static */) !== 0 ? null : this;
        this._state |= 128 /* State._updated */;
        this._value = this._fn(this._value);
        this._state &= ~(32 /* State._update */ | 128 /* State._updated */);
        OWNER = owner;
        LISTENER = listener;
    }
};

/**
 * 
 * @param {number} time
 * @returns {void} 
 */
Computation.prototype._dispose = function (time) {
    this._fn = null;
    this._age = time;
    disposeOwner.call(this, time);
    disposeSender(this);
    cleanupReceiver(this);
};

/**
 * @constructor
 * @param {number} mode 
 */
function Queue(mode) {
    /**
     * @package
     * @type {number}
     */
    this._mode = mode;
    /**
     * @package
     * @type {!Array<?Respond>}
     */
    this._items = [];
    /**
     * @package
     * @type {number}
     */
    this._count = 0;
}

/**
 * 
 * @param {!Respond} item
 * @returns {void} 
 */
Queue.prototype.add = function (item) {
    this._items[this._count++] = item;
};

/**
 * 
 * @param {number} time 
 */
Queue.prototype.run = function (time) {
    STAGE = this._mode;
    for (var i = 0; i < this._count; ++i) {
        var item = /** @type {!Respond} */(this._items[i]);
        if ((item._state & 32 /* State._update */) !== 0) {
            item._update();
        } else if ((item._state & 64 /* State._dispose */) !== 0) {
            item._dispose(time);
        }
        this._items[i] = null;
    }
    this._count = 0;
};

// Constants
/**
 * @const
 * @type {!Nil}
 */
var NIL = /** @type {!Nil} */({});
/**
 * @type {number}
 */
var TIME = 0;
/**
 * @type {number}
 */
var STAGE = 0 /* Stage.Idle */;
/**
 * @const
 * @type {!Queue}
 */
var DISPOSES = new Queue(1 /* Stage._disposes */);
/**
 * @const
 * @type {!Queue}
 */
var CHANGES = new Queue(2 /* Stage.Changes */);
/**
 * @const
 * @type {!Queue}
 */
var COMPUTES = new Queue(2 /* Stage.Computes */);
/**
 * @const
 * @type {!Queue}
 */
var EFFECTS = new Queue(4 /* Stage._updates */);
/**
 * @type {Scope | null}
 */
var OWNER = null;
/**
 * @type {Receive | null}
 */
var LISTENER = null;

/**
 * @template T
 * @param {T} a 
 * @param {T} b 
 * @returns {boolean}
 */
function Equals(a, b) {
    return a === b;
}

/**
 * @returns {void}
 */
function NoOp() { }

/**
 * 
 * @param {*} fn 
 * @returns {boolean}
 */
function isFunction(fn) {
    return typeof fn === "function";
}

/**
 * @returns {void}
 */
function reset() {
    DISPOSES._count = CHANGES._count = COMPUTES._count = EFFECTS._count = 0;
}
// Functions
function logRead(from, to) {
    from._state |= 1024 /* State.Send */;
    var fromslot;
    var toslot = to._source1 === null ? -1 : to._sources === null ? 0 : to._sources.length;
    if (from._node1 === null) {
        from._node1 = to;
        from._node1slot = toslot;
        fromslot = -1;
    }
    else if (from._nodes === null) {
        from._nodes = [to];
        from._nodeslots = [toslot];
        fromslot = 0;
    }
    else {
        fromslot = from._nodes.length;
        from._nodes.push(to);
        from._nodeslots.push(toslot);
    }
    if (to._source1 === null) {
        to._source1 = from;
        to._source1slot = fromslot;
    }
    else if (to._sources === null) {
        to._sources = [from];
        to._sourceslots = [fromslot];
    }
    else {
        to._sources.push(from);
        to._sourceslots.push(fromslot);
    }
}
function exec() {
    var owner = OWNER;
    try {
        start();
    }
    finally {
        STAGE = 0 /* Stage.Idle */;
        OWNER = owner;
        LISTENER = null;
    }
}
function start() {
    var time, cycle = 0, disposes = DISPOSES, changes = CHANGES, computes = COMPUTES, effects = EFFECTS;
    do {
        time = ++TIME;
        disposes.run(time);
        changes.run(time);
        computes.run(time);
        effects.run(time);
        if (cycle++ > 1e5) {
            throw new Error("Cycle overflow");
        }
    } while (changes._count > 0 || disposes._count > 0 || computes._count !== 0 || effects._count !== 0);
}

/**
 * 
 * @param {!Receive} node 
 */
function cleanupReceiver(node) {
    if (node._source1 !== null) {
        forgetReceiver(node._source1, node._source1slot);
        node._source1 = null;
    }
    var sources = node._sources;
    if (sources !== null) {
        var ln = sources.length;
        var sourceslots = node._sourceslots;
        for (; ln-- !== 0;) {
            forgetReceiver(sources.pop(), sourceslots.pop());
        }
    }
}

/**
 * 
 * @param {!Send} source 
 * @param {number} slot 
 */
function forgetReceiver(source, slot) {
    if ((source._state & (64 /* State._dispose */ | 256 /* State._disposed */)) === 0) {
        if (slot === -1) {
            source._node1 = null;
        }
        else {
            var nodes = source._nodes;
            var nodeslots = source._nodeslots;
            var last = nodes.pop();
            var lastslot = nodeslots.pop();
            if (slot !== nodes.length) {
                nodes[slot] = last;
                nodeslots[slot] = lastslot;
                if (lastslot === -1) {
                    last._source1slot = slot;
                }
                else {
                    last._sourceslots[lastslot] = slot;
                }
            }
        }
    }
}

/**
 * 
 * @param {!Send} send 
 */
function cleanupSender(send) {
    if (send._node1 !== null) {
        forgetSender(send._node1, send._node1slot);
        send._node1 = null;
    }
    var nodes = send._nodes;
    if (nodes !== null) {
        var ln = nodes.length;
        var nodeslots = send._nodeslots;
        for (; ln-- !== 0;) {
            forgetSender(nodes.pop(), nodeslots.pop());
        }
    }
}

/**
 * 
 * @param {!Receive} node 
 * @param {number} slot 
 */
function forgetSender(node, slot) {
    if ((node._state & (64 /* State._dispose */ | 256 /* State._disposed */)) === 0) {
        if (slot === -1) {
            node._source1 = null;
        }
        else {
            var sources = node._sources;
            var sourceslots = node._sourceslots;
            var last = sources.pop();
            var lastslot = sourceslots.pop();
            if (slot !== sources.length) {
                sources[slot] = last;
                sourceslots[slot] = lastslot;
                if (lastslot === -1) {
                    last._node1slot = slot;
                }
                else {
                    last._nodeslots[lastslot] = slot;
                }
            }
        }
    }
}

window["Opt"] = Opt;
window["root"] = root;
window["dispose"] = dispose;
window["compute"] = compute;
window["effect"] = effect;
window["bind"] = bind;
window["data"] = data;
window["value"] = value;
window["nil"] = nil;
window["owner"] = owner;
window["listener"] = listener;
window["freeze"] = freeze;
window["peek"] = peek;
window["cleanup"] = cleanup;
window["Data"] = Data;
window["Value"] = Value;
window["Computation"] = Computation;