import {
    Nil, Cleanup, Recover, Respond, Scope,
    Compute, Signal, State, Stage, Source
} from "./lib";

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
 * @template T
 * @constructor
 * @implements {Compute<T>}
 * @param {function(): T} fn
 */
function Val(fn) {
    this._fn = fn;
}

setValProto(Val.prototype, {
    /**
     * @template T 
     * @this {!Val<T>}
     * @returns {T}
     */
    get: function () { return this._fn(); }
});

/**
 * @template T
 * @param {function(): T} fn 
 * @returns {!Compute<T>}
 */
function val(fn) {
    return new Val(fn);
}

/**
 * 
 * @param {!Source} node 
 * @returns {void}
 */
function dispose(node) {
    var state = node._state;
    if ((state & State.DisposeFlags) === 0) {
        if (STAGE === Stage.Idle) {
            node._dispose(TIME);
        } else {
            node._state = (state & ~State.Update) | State.Dispose;
            DISPOSES.add(/** @type {!Respond} */(node));
        }
    }
}

/**
 * @template S, T
 * @param {!Compute<S> | !Array<!Compute>} src 
 * @param {function((S | !Array<S>), T, (S | undefined)): T} fn 
 * @param {boolean=} defer
 * @returns {function(T): T}
 */
function when(src, fn, defer) {
    /**
     * @type {S | !Array<S>}
     */
    var prev;
    /**
     * @type {number}
     */
    var ln;
    /**
     * @type {S | !Array<S>}
     */
    var next;
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
        if (isArray) {
            for (var i = 0; i < ln; i++) {
                next[i] = /** @type {!Array<Compute>} */(src)[i].val;
            }
        } else {
            next = /** @type {!Compute<S>} */(src).val;
        }
        if (defer) {
            defer = false;
        } else {
            LISTENER = null;
            seed = fn(next, seed, prev);
        }
        var temp = next;
        next = prev;
        prev = temp;
        return seed;
    };
}

/**
 * @template T
 * @param {function(T): T} fn 
 * @param {T=} seed 
 * @param {boolean | (function(T, T): boolean)=} eq
 * @returns {Computation<T>}
 */
function compute(fn, seed, eq) {
    return new Computation(fn, seed, State.Compare | State.Static, eq);
}

/**
 * @template T
 * @param {function(T): T} fn 
 * @param {T=} seed 
 * @param {boolean | (function(T, T): boolean)=} eq
 * @returns {Computation<T>}
 */
function $compute(fn, seed, eq) {
    return new Computation(fn, seed, State.Compare, eq);
}

/**
 * @template T 
 * @param {function(T): T} fn 
 * @param {T=} seed 
 * @returns {void}
 */
function effect(fn, seed) {
    new Computation(fn, seed, State.Static);
}

/**
 * @template T 
 * @param {function(T): T} fn 
 * @param {T=} seed 
 * @returns {void}
 */
function $effect(fn, seed) {
    new Computation(fn, seed, 0);
}

/**
 * @template T
 * @param {function(): T} fn 
 * @returns {!Scope<T>}
 */
function root(fn) {
    var node = new Owner();
    var owner = OWNER;
    var listener = LISTENER;
    OWNER = node;
    LISTENER = null;
    if (STAGE === Stage.Idle) {
        try {
            node._value = fn();
        } finally {
            OWNER = owner;
            LISTENER = listener;
        }
    } else {
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
 * @template T
 * @param {Source} node 
 * @returns {T}
 */
function peek(node) {
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
    var result = node.val;
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
        } else {
            owner._cleanups.push(fn);
        }
    }
}

/**
 * 
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

/**
 * @noinline
 * @param {Object} obj 
 * @param {!ObjectPropertyDescriptor<?Object>} config 
 */
function setValProto(obj, config) {
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
 * 
 * @param {!Send} node 
 * @param {number} time 
 * @returns {void}
 */
function sendUpdate(node, time) {
    /** @type {number} */
    var ln;
    var node1 = node._node1;
    var nodes = node._nodes;
    if (node1 !== null) {
        receiveUpdate(node1, time);
    }
    if (nodes !== null && (ln = nodes.length) > 0) {
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
    node._state = State.Disposed;
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
    this._state = 0;
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
    /**
     * @package
     * @type {?Array<!Recover>}
     */
    this._recovers = null;
}

/**
 * @template T 
 * @this {Scope<T>}
 * @param {number} time 
 */
function disposeOwner(time) {
    this._state = State.Disposed;
    this._value = /** @type {T} */(void 0);
    /** @type {number} */
    var i;
    /** @type {number} */
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

setValProto(Owner.prototype, {
    /**
     * @template T
     * @this {!Owner<T>}
     * @returns {T}
     */
    get: function () {
        return this._value;
    }
});

Owner.prototype._update = function () { };

Owner.prototype._dispose = disposeOwner;

/**
 * 
 * @param {!Receive} node 
 * @param {number} time 
 */
function receiveUpdate(node, time) {
    var state = node._state;
    if ((state & State.DisposeFlags) === 0 && node._age < time) {
        node._age = time;
        node._state |= State.Update;
        if ((state & State.Compare) !== 0) {
            COMPUTES.add(node);
        } else {
            EFFECTS.add(node);
        }
        if (node._owned !== null) {
            receiveDispose(node._owned, time);
        }
        if ((state & State.Send) !== 0) {
            sendUpdate(node, time);
        }
    }
}

/**
 * 
 * @param {!Array<!Receive>} nodes 
 * @param {number} time 
 */
function receiveDispose(nodes, time) {
    var ln = nodes.length;
    for (var i = 0; i < ln; i++) {
        var node = nodes[i];
        node._age = time;
        node._state = State.Dispose;
        DISPOSES.add(node);
        var owned = node._owned;
        if (owned !== null) {
            receiveDispose(owned, time);
            owned.length = 0;
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
    /**
     * @package
     * @type {?Array<!Recover>}
     */
    this._recovers = null;
}

/**
 * @template T
 * @constructor
 * @param {T} value
 * @extends {Send<T>}
 * @implements {Signal<T>}
 */
function Data(value) {
    Send.call(this, OWNER, 0, value);
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
    if ((this._state & State.DisposeFlags) === 0) {
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
    if ((state & State.DisposeFlags) === 0) {
        if (STAGE === Stage.Idle) {
            if ((state & State.Send) !== 0) {
                reset();
                this._value = value;
                sendUpdate(this, TIME + 1);
                exec();
            } else {
                this._value = value;
            }
        } else {
            if (this._pending === NIL) {
                this._pending = value;
                this._state |= State.Update;
                CHANGES.add(this);
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
 * @param {number} time
 * @returns {void}
 */
function updateData(time) {
    this._value = this._pending;
    this._pending = NIL;
    this._state &= ~State.Update;
    if ((this._state & State.Send) !== 0) {
        sendUpdate(this, time);
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

setValProto(Data.prototype, { get: getData, set: setData });

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
 * @param {(function(T, T): boolean)=} eq
 */
function Value(value, eq) {
    Data.call(this, value);
    /**
     * @package
     * @type {(function(T, T): boolean) | undefined | null}
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

setValProto(Value.prototype, { get: getData, set: setValue });

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
    this._eq = null;
    disposeData.call(this);
};

/**
 * @template T 
 * @constructor
 * @extends {Receive<T>}
 * @implements {Compute<T>}
 * @param {function(T): T} fn 
 * @param {T} value 
 * @param {(function(T,T): boolean)|boolean=} eq
 * @param {number} state
 */
function Computation(fn, value, state, eq) {
    var owner = OWNER;
    var listener = LISTENER;
    Receive.call(this, owner, state);
    /**
     * @package
     * @type {(function(T,T): boolean)|undefined}
     */
    this._eq = void 0;
    if (eq !== void 0) {
        if (eq === false) {
            this._state &= ~State.Compare;
        } else {
            this._eq = /** @type {function(T,T): boolean} */(eq);
        }
    }
    /**
     * @package
     * @type {?function(T): T}
     */
    this._fn = fn;
    OWNER = LISTENER = this;
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
            OWNER = LISTENER = null;
        }
    } else {
        this._value = fn(value);
    }
    OWNER = owner;
    LISTENER = listener;
};

setValProto(Computation.prototype, {
    /**
     * @template T
     * @this {Computation<T>}
     * @returns {T}
     */
    get: function () {
        var state = this._state;
        if ((state & State.DisposeFlags) === 0 && STAGE !== Stage.Idle) {
            if (this._age === TIME) {
                if ((state & State.Updated) !== 0) {
                    throw new Error();
                } else if ((state & State.Update) !== 0) {
                    this._update(this._age);
                }
            }
            if (LISTENER !== null) {
                logRead(this, LISTENER);
            }
        }
        return this._value;
    }
});

/**
 * @param {number} time
 * @returns {void}
 */
Computation.prototype._update = function (time) {
    /** @type {number} */
    var i;
    /** @type {number} */
    var ln;
    var owner = OWNER;
    var listener = LISTENER;
    OWNER = LISTENER = null;
    var state = this._state;
    var cleanups = this._cleanups;
    if (cleanups !== null && (ln = cleanups.length) !== 0) {
        for (i = 0; i < ln; i++) {
            cleanups[i](false);
        }
        cleanups.length = 0;
    }
    if ((state & State.Static) === 0) {
        cleanupReceiver(this);
    }
    OWNER = this;
    LISTENER = (state & State.Static) !== 0 ? null : this;
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
    LISTENER = listener;
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
 * @param {number} stage 
 */
function Queue(stage) {
    /**
     * @package
     * @type {number}
     */
    this._stage = stage;
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
 * @returns {number}
 */
Queue.prototype.run = function (time) {
    STAGE = this._stage;
    var error = 0;
    for (var i = 0; i < this._count; i++) {
        var item = /** @type {!Respond} */(this._items[i]);
        var state = item._state;
        if ((state & (State.Update | State.Dispose)) !== 0) {
            try {
                if ((state & State.Update) !== 0) {
                    item._update(time);
                } else {
                    item._dispose(time);
                }
            } catch(err) {
                error = 1;
                if ((state & State.Update) !== 0) {
                    item._value = err;
                    item._state |= State.Error;
                }
            }
        }
        this._items[i] = null;
    }
    this._count = 0;
    return error;
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
var STAGE = Stage.Idle;
/**
 * @const
 * @type {!Queue}
 */
var DISPOSES = new Queue(Stage.Disposes);
/**
 * @const
 * @type {!Queue}
 */
var CHANGES = new Queue(Stage.Changes);
/**
 * @const
 * @type {!Queue}
 */
var COMPUTES = new Queue(Stage.Computes);
/**
 * @const
 * @type {!Queue}
 */
var EFFECTS = new Queue(Stage.Effects);
/**
 * @type {Scope | null}
 */
var OWNER = null;
/**
 * @type {Receive | null}
 */
var LISTENER = null;

/**
 * @returns {void}
 */
function reset() {
    DISPOSES._count = CHANGES._count = COMPUTES._count = EFFECTS._count = 0;
}

/**
 * 
 * @param {!Send} from 
 * @param {!Receive} to
 * @returns {void} 
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
 * @returns {void}
 */
function exec() {
    var owner = OWNER;
    try {
        start();
    } finally {
        STAGE = Stage.Idle;
        OWNER = owner;
        LISTENER = null;
    }
}

/**
 * @returns {void}
 */
function start() {
    /** @type {number} */
    var time;
    var cycle = 0;
    var errors = 0;
    var disposes = DISPOSES;
    var changes = CHANGES;
    var computes = COMPUTES;
    var effects = EFFECTS;
    do {
        time = ++TIME;
        if (disposes._count !== 0) {
            errors += disposes.run(time);
        }
        if (changes._count !== 0) {
            errors += changes.run(time);
        }
        if (disposes._count !== 0) {
            errors += disposes.run(time);
        }
        if (computes._count !== 0) {
            errors += computes.run(time);
        }
        if (effects._count !== 0) {
            errors += effects.run(time);
        }
        if (errors !== 0) {
            throw new Error("Zorn: Error");
        }
        if (cycle++ > 1e5) {
            throw new Error("Zorn: Cycle");
        }
    } while (changes._count !== 0 || disposes._count !== 0 || computes._count !== 0 || effects._count !== 0);
}

/**
 * 
 * @param {!Receive} node
 * @returns {void}
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
 * @returns {void}
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
 * @returns {void}
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
 * @returns {void}
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
    root, dispose, val, owner, listener,
    compute, $compute, effect, $effect, when,
    data, value, nil, freeze, recover,
    peek, cleanup, Data, Value, Computation
};