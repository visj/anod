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
 * @package
 * @interface
 */
function Opt() { }

/**
 * @package
 * @type {number}
 */
Opt.prototype._opt;

/**
 * @package
 * @interface
 * @extends {Opt}
 */
function Dispose() { }

/**
 * @package
 * @type {number}
 */
Dispose.prototype._age;

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Dispose.prototype._dispose = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Dispose.prototype._recDispose = function (time) { };

/**
 * @template T
 * @interface
 * @extends {Dispose}
 */
function Own() { }

/**
 * @package
 * @type {?Array<!Signal>}
 */
Own.prototype._owned;

/**
 * @package
 * @type {?Array<!Cleanup>}
 */
Own.prototype._cleanups;

/**
 * @package
 * @type {?Array<!Recover>}
 */
Own.prototype._recovers;

/**
 * @package
 * @param {!Signal} child 
 */
Own.prototype._add = function(child) { };

/**
 * @public
 * @interface
 * @template T
 * @extends {Dispose}
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
 * @package
 * @type {?Own}
 */
Signal.prototype._owner;

/**
 * @package
 * @type {number}
 */
Signal.prototype._mayDisposeAge;

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Signal.prototype._recMayDispose = function (time) { };

/**
 * @const 
 * @enum {number}
 */
export var Opts = {
    Static: 1,
    Dispose: 2,
    Disposed: 4,
    /**
     * Dispose | Disposed
     */
    DisposeFlags: 6,
    Update: 8,
    Updated: 16,
    /**
     * Update | Updated
     */
    UpdateFlags: 24,
    MayDispose: 32,
    MayUpdate: 64,
    MayCleared: 128,
    /**
     * MayDispose | MayUpdate | MayCleared
     */
    MayFlags: 224,
    Send: 256,
    NoSend: 512,
    Respond: 1024,
    Compare: 2048,
    Error: 4096,
};

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
};

/**
 * @package
 * @interface
 * @template T
 * @extends {Signal<T>}
 */
function Send() { }

/**
 * @package
 * @type {T}
 */
Send.prototype._value;

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Send.prototype._update = function (time) { };

/**
 * @package
 * @interface
 * @extends {Send}
 */
function Receive() { }

/**
 * @package
 * @type {number}
 */
Receive.prototype._age;

/**
 * @package
 * @type {number}
 */
Receive.prototype._mayUpdateAge;

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Receive.prototype._recUpdate = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Receive.prototype._recMayUpdate = function (time) { };

/**
 * @package
 * @interface
 * @template T
 * @extends {Receive}
 */
function ReceiveOne() { }

/**
 * @package
 * @type {?T}
 */
ReceiveOne.prototype._source1;

/**
 * @package
 * @type {number}
 */
ReceiveOne.prototype._source1slot;

/**
 * @package
 * @interface
 * @template T
 * @extends {ReceiveOne<T>}
 */
function ReceiveMany() { }

/**
 * @package
 * @type {?Array<T>}
 */
ReceiveMany.prototype._sources;

/**
 * @package
 * @type {?Array<number>}
 */
ReceiveMany.prototype._sourceslots;

/* START_OF_FILE */

// Public API

/**
 * @public
 * @template T
 * @param {function(): T} fn 
 * @returns {!Own<T>}
 */
function root(fn) {
    /** @const {!Owner} */
    var node = new Owner();
    /** @const {?Own} */
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
 * @param {(function(T,T): boolean)|null=} eq
 * @returns {!Signal<T>}
 */
function compute(fn, seed, eq) {
    return new Computation(fn, seed, Opts.Static, eq);
}

/**
 * @public
 * @template T
 * @param {function(T): T} fn 
 * @param {T=} seed 
 * @param {(function(T,T): boolean)|null=} eq
 * @returns {!Signal<T>}
 */
function $compute(fn, seed, eq) {
    return new Computation(fn, seed, 0, eq);
}

/**
 * @public
 * @template T
 * @param {function(T): T} fn 
 * @param {T=} seed 
 * @returns {!Signal<T>}
 */
function respond(fn, seed) {
    return new Computation(fn, seed, Opts.Static, null);
}

/**
 * @public
 * @template T
 * @param {function(T): T} fn 
 * @param {T=} seed 
 * @returns {!Signal<T>}
 */
function $respond(fn, seed) {
    return new Computation(fn, seed, 0, null);
}


/**
 * @public
 * @template T
 * @param {function(T): T} fn 
 * @param {T=} seed 
 * @returns {!Signal<T>}
 */
function effect(fn, seed) {
    return new Computation(fn, seed, Opts.NoSend | Opts.Static);
}

/**
 * @public
 * @template T
 * @param {function(T): T} fn 
 * @param {T=} seed 
 * @returns {!Signal<T>}
 */
function $effect(fn, seed) {
    return new Computation(fn, seed, Opts.NoSend);
}

/**
 * @public
 * @template T
 * @param {T} value 
 * @returns {!Signal<T>}
 */
function data(value) {
    return new Data(value, null);
}

/**
 * @public
 * @template T
 * @param {T} value 
 * @param {(function(T,T): boolean)=} eq
 * @returns {!Signal<T>}
 */
function value(value, eq) {
    return new Data(value, eq);
}

/**
 * @public
 * @param {!Signal} node 
 */
function dispose(node) {
    if ((node._opt & Opts.DisposeFlags) === 0) {
        if (STAGE === Stage.Idle) {
            node._dispose(TIME);
        } else {
            node._recDispose(TIME);
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
 * @param {function(): void} fn 
 * @returns {void}
 */
function batch(fn) {
    if (STAGE === Stage.Idle) {
        reset();
        STAGE = Stage.Started;
        try {
            fn();
            exec();
        } finally {
            STAGE = Stage.Idle;
        }
    } else {
        fn();
    }
}

/**
 * @public
 */
function stable() {
    if (LISTEN) {
        OWNER._opt |= Opts.Static;
    }
}

/**
 * @public
 * @param {Cleanup} fn 
 */
function cleanup(fn) {
    /** @const {?Own} */
    var owner = OWNER;
    if (owner !== null) {
        /** @const {?Array<Cleanup>} */
        var cleanups = owner._cleanups;
        if (cleanups === null) {
            owner._cleanups = [fn];
        } else {
            cleanups[cleanups.length] = fn;
        }
    }
}

/**
 * @public
 * @param {Recover} fn
 */
function recover(fn) {
    /** @const {?Own} */
    var owner = OWNER;
    if (owner !== null) {
        /** @const {?Array<Recover>} */
        var recovers = owner._recovers;
        if (recovers === null) {
            owner._recovers = [fn];
        } else {
            recovers[recovers.length] = fn;
        }
    }
}

// Internal

/**
 * @package
 * @abstract
 * @constructor
 * @implements {Dispose}
 */
function Disposer() { }

/**
 * @package
 * @this {!Disposer}
 * @param {number} time
 * @returns {void}
 */
Disposer.prototype._recDispose = function (time) {
    this._age = time;
    this._opt = Opts.Dispose;
    DISPOSES._add(this);
};

/**
 * @package
 * @this {!Disposer}
 * @param {number} time
 */
Disposer.prototype._recMayDispose = function (time) {
    this._mayDisposeAge = time;
    this._opt |= Opts.MayDispose;
};;

/**
 * @noinline
 * @param {Function} ctor
 */
function setDisposeProto(ctor) {
    ctor.prototype = new /** @type {Function} */(Disposer)();
    ctor.constructor = ctor;
}

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
 * @this {Signal}
 * @returns {T}
 */
function getValue() {
    return this._value;
}

/**
 * @param {Own|Receive} node 
 * @param {number} time
 */
function clearMayUpdate(node, time) {
    if ((node._opt & Opts.MayDispose) !== 0 && /** @type {Receive} */(node)._mayDisposeAge === time) {
        clearMayUpdate(/** @type {Receive} */(node)._owner, time);
        node._opt &= ~Opts.MayDispose;
    }
    if ((node._opt & Opts.DisposeFlags) === 0) {
        if ((node._opt & Opts.MayUpdate) !== 0 && node._mayUpdateAge === time) {
            checkSource: {
                var source1 = /** @type {Receive} */(node._source1);
                if (source1 !== null && ((source1._opt & Opts.MayUpdate) !== 0) && source1._mayUpdateAge === time) {
                    clearMayUpdate(source1, time);
                    if (node._age === time) {
                        break checkSource;
                    }
                }
                /** @type {number} */
                var ln;
                /** @const {?Array<!Send>} */
                var sources = node._sources;
                if (sources !== null && (ln = sources.length) > 0) {
                    for (var i = 0; i < ln; i++) {
                        source1 = /** @type {Receive} */(sources[i]);
                        if ((source1._opt & Opts.MayUpdate) !== 0 && source1._mayUpdateAge === time) {
                            clearMayUpdate(source1, time);
                            if (node._age === time) {
                                break checkSource;
                            }
                        }
                    }
                }
            }
        }
    }
    node._opt &= ~Opts.MayUpdate;
    if ((node._opt & Opts.Update) !== 0 && node._age === time) {
        node._update(time);
    }
}

/**
 * @struct
 * @template T
 * @package
 * @abstract
 * @constructor
 * @extends {Disposer}
 * @implements {Send<T>}
 * @implements {Signal<T>}
 * @param {?Own} owner 
 * @param {number|undefined} opt 
 * @param {T} value
 * @param {(function(T,T): boolean)|null=} eq
 */
function Sender(owner, opt, value, eq) {
    /**
     * @package
     * @type {number}
     */
    this._opt = (
        ((opt & Opts.NoSend) !== 0) ?
            0 :
            eq === null ?
                Opts.Respond :
                eq !== void 0 ?
                    Opts.Compare :
                    0
    ) | opt;
    /**
     * @package
     * @type {T}
     */
    this._value = value;
    /**
     * @package
     * @type {?Own}
     */
    this._owner = owner;
    /**
     * @package
     * @type {(function(T,T): boolean)|null|undefined}
     */
    this._eq = eq;
    /**
     * @package
     * @type {number}
     */
    this._age = 0;
    /**
     * @package
     * @type {number}
     */
    this._mayDisposeAge = 0;
    /**
     * @package
     * @type {?ReceiveMany}
     */
    this._node1 = null;
    /**
     * @package
     * @type {number}
     */
    this._node1slot = -1;
    /**
     * @package
     * @type {?Array<!ReceiveMany>}
     */
    this._nodes = null;
    /**
     * @package
     * @type {?Array<number>}
     */
    this._nodeslots = null;
    if (owner !== null) {
        owner._add(this);
    }
}

/**
 * @package
 * @param {!Sender} node
 */
function disposeSender(node) {
    node._opt = Opts.Disposed;
    cleanupSender(node);
    node._value =
        node._owner =
        node._eq =
        node._nodes =
        node._nodeslots = null;
}

/**
 * @package
 * @param {!Send} send
 * @param {number} time
 */
function sendUpdate(send, time) {
    /** @type {number} */
    var ln;
    /** @type {?Receive} */
    var node1 = send._node1;
    /** @const {?Array<!Receive>} */
    var nodes = send._nodes;
    if (node1 !== null && node1._age < time) {
        node1._recUpdate(time);
    }
    if (nodes !== null && (ln = nodes.length) > 0) {
        for (var i = 0; i < ln; i++) {
            node1 = nodes[i];
            if (node1._age < time) {
                node1._recUpdate(time);
            }
        }
    }
}

/**
 * @package
 * @param {!Send} send
 * @param {number} time
 */
function sendMayUpdate(send, time) {
    /** @type {?Receive} */
    var node1 = send._node1;
    /** @const {?Array<!Receive>} */
    var nodes = send._nodes;
    if (node1 !== null && node1._age < time && node1._mayUpdateAge < time) {
        node1._recMayUpdate(time);
    }
    /** @type {number} */
    var ln;
    if (nodes !== null && (ln = nodes.length) > 0) {
        for (var i = 0; i < ln; i++) {
            node1 = nodes[i];
            if (node1._age < time && node1._mayUpdateAge < time) {
                node1._recMayUpdate(time);
            }
        }
    }
}

/**
 * @package
 * @param {!Array<!Signal>} owned 
 * @param {number} time
 */
function sendDispose(owned, time) {
    /** @type {number} */
    var ln = owned.length;
    for (; ln-- !== 0;) {
        /** @const {Signal} */
        var child = owned.pop();
        if ((child._opt & Opts.DisposeFlags) === 0) {
            child._recDispose(time);
        }
    }
}

/**
 * @package
 * @param {!Array<!Signal>} owned 
 * @param {number} time
 */
function sendMayDispose(owned, time) {
    /** @const {number} */
    var ln = owned.length;
    for (var i = 0; i < ln; i++) {
        /** @const {Signal} */
        var child = owned[i];
        if (child._opt !== Opts.Disposed && child._mayDisposeAge < time) {
            child._recMayDispose(time);
        }
    }
}

/**
 * @struct
 * @package
 * @constructor
 * @extends {Disposer}
 * @implements {Own}
 */
function Owner() {
    /**
     * @package
     * @type {number}
     */
    this._opt = 0;
    /**
     * @package
     * @type {number}
     */
    this._age = 0;
    /**
     * @package
     * @type {?Array<!Signal>}
     */
    this._owned = [];
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

setDisposeProto(Owner);

/**
 * @package
 * @this {!Own}
 * @param {number} time
 */
function disposeOwn(time) {
    this._opt = Opts.Disposed;
    /** @type {number} */
    var i;
    /** @type {number} */
    var ln;
    /** @const {?Array<!Signal>} */
    var owned = this._owned;
    /** @const {?Array<Cleanup>} */
    var cleanups = this._cleanups;
    if (owned !== null && (ln = owned.length) !== 0) {
        for (i = 0; i < ln; i++) {
            owned[i]._dispose(time);
        }
    }
    if (cleanups !== null && (ln = cleanups.length) !== 0) {
        for (i = 0; i < ln; i++) {
            cleanups[i](true);
        }
    }
    this._cleanups = 
        this._owned = 
        this._recovers = null;
}

/**
 * @package
 * @override
 * @this {!Owner}
 */
Owner.prototype._dispose = disposeOwn;

/**
 * @package
 * @param {!Signal} child 
 */
Owner.prototype._add = function(child) {
    this._owned[this._owned.length] = child;
}

/**
 * @struct
 * @template T
 * @package
 * @constructor
 * @extends {Sender<T>}
 * @param {T} value
 * @param {(function(T,T): boolean)|null=} eq
 * @implements {Signal<T>}
 * @implements {Send<T>}
 */
function Data(value, eq) {
    Sender.call(this, OWNER, 0, value, eq);
    /**
     * @package
     * @type {T|Nil}
     */
    this._pending = NIL;
}

setDisposeProto(Data);

setValProto(
    Data.prototype,
    /**
     * @template T
     * @this {!Data<T>}
     * @returns {T}
     */
    function () {
        /** @const {number} */
        var opt = this._opt;
        log: if ((opt & Opts.DisposeFlags) === 0 && STAGE !== Stage.Idle) {
            /** @const {number} */
            var time = TIME;
            if ((opt & Opts.MayDispose) !== 0 && this._mayDisposeAge === time) {
                if ((opt & Opts.MayCleared) !== 0) {
                    // cyclical ownership ??
                    throw new Error();
                }
                this._opt |= Opts.MayCleared;
                clearMayUpdate(/** @type {Computation} */(this._owner), time);
                if ((this._opt & Opts.DisposeFlags) !== 0) {
                    break log;
                }
            }
            if (LISTEN) {
                logRead(this, /** @type {!ReceiveMany} */(OWNER));
            }
        }
        return this._value;
    },
    getValue,
    /**
     * @template T
     * @this {!Data<T>}
     * @param {T} value
     * @returns {T}
     */
    function (value) {
        /** @const {number} */
        var opt = this._opt;
        if ((opt & Opts.DisposeFlags) === 0) {
            if ((
                ((opt & Opts.Respond) !== 0) || (
                    ((opt & Opts.Compare) === 0) ?
                        value !== this._value :
                        !this._eq(value, this._value)
                )
            ) && (STAGE !== Stage.Idle || (opt & Opts.Send) !== 0)) {
                if (STAGE === Stage.Idle) {
                    reset();
                    this._value = value;
                    sendUpdate(this, TIME + 1);
                    exec();
                } else {
                    if (this._pending === NIL) {
                        this._pending = value;
                        this._opt |= Opts.Update;
                        CHANGES._add(this);
                    } else if (value !== this._pending) {
                        throw new Error("Zorn: Conflict");
                    }
                }
            } else {
                this._value = value;
            }
        }
        return value;
    }
);

/**
 * @package
 * @this {!Data<T>}
 * @param {number} time
 */
Data.prototype._update = function (time) {
    this._value = this._pending;
    this._pending = NIL;
    this._opt &= ~Opts.Update;
    if ((this._opt & Opts.Send) !== 0) {
        sendUpdate(this, time);
    }
};

/**
 * @package
 * @override
 * @this {!Data<T>}
 */
Data.prototype._dispose = function () {
    disposeSender(this);
    this._pending = void 0;
};

/**
 * @struct
 * @template T 
 * @package
 * @constructor
 * @extends {Sender<T>}
 * @param {function(T): T} fn 
 * @param {T} value 
 * @param {(function(T,T): boolean)|null=} eq
 * @param {number} opt
 * @implements {Signal<T>}
 * @implements {Own<T>}
 * @implements {Send<T>}
 * @implements {ReceiveMany<T>}
 */
function Computation(fn, value, opt, eq) {
    /** @const {?Own} */
    var owner = OWNER;
    /** @const {boolean} */
    var listen = LISTEN;
    Sender.call(this, owner, opt, value, eq);
    /**
     * @package
     * @type {number}
     */
    this._mayUpdateAge = 0;
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
     * @type {?Array<!Signal>}
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

setDisposeProto(Computation);

setValProto(
    Computation.prototype,
    /**
     * @template T
     * @this {Computation<T>}
     * @returns {T}
     */
    function getComputation() {
        /** @type {number} */
        var opt = this._opt;
        if ((opt & Opts.DisposeFlags) === 0 && STAGE !== Stage.Idle) {
            /** @const {number} */
            var time = TIME;
            if ((opt & Opts.Update) !== 0 && this._age === time) {
                if ((opt & Opts.Updated) !== 0) {
                    throw new Error("cyclic dependency");
                }
                this._update(time);
            } else if ((opt & Opts.MayDispose | Opts.MayUpdate) !== 0 && this._age < time && (this._mayDisposeAge === time || this._mayUpdateAge === time)) {
                if ((opt & Opts.MayCleared) !== 0) {
                    // cyclic dependency
                    throw new Error("cyclic pending dependency");
                }
                this._opt |= Opts.MayCleared;
                clearMayUpdate(this, time);
            }
            if ((this._opt & (Opts.DisposeFlags | Opts.NoSend)) === 0 && LISTEN) {
                logRead(this, /** @type {!ReceiveMany} */(OWNER));
            }
        }
        return this._value;
    },
    getValue
);

/**
 * @package
 * @override
 * @this {Computation<T>}
 * @param {number} time
 */
Computation.prototype._update = function (time) {
    /** @type {number} */
    var i;
    /** @type {number} */
    var ln;
    /** @const {?Own} */
    var owner = OWNER;
    /** @const {boolean} */
    var listen = LISTEN;
    OWNER = null;
    LISTEN = false;
    /** @const {number} */
    var opt = this._opt;
    /** @const {?Array<Cleanup>} */
    var cleanups = this._cleanups;
    if (cleanups !== null && (ln = cleanups.length) !== 0) {
        for (i = 0; i < ln; i++) {
            cleanups[i](false);
        }
        cleanups.length = 0;
    }
    OWNER = this;
    LISTEN = (opt & Opts.Static) === 0;
    if (LISTEN) {
        cleanupReceiver(this);
    }
    /** @const {T} */
    var value = this._value;
    this._opt |= Opts.Updated;
    this._value = this._fn(value);
    if (((opt & (Opts.Send | Opts.Respond | Opts.NoSend)) === Opts.Send) && ((opt & Opts.Compare) === 0 ? value !== this._value : !this._eq(value, this._value))) {
        sendUpdate(this, time);
    }
    this._opt &= ~Opts.UpdateFlags;
    OWNER = owner;
    LISTEN = listen;
};

/**
 * @package
 * @override
 * @this {!Computation<T>}
 */
Computation.prototype._dispose = function (time) {
    disposeOwn.call(this, time);
    disposeSender(this);
    cleanupReceiver(this);
    this._fn =
        this._sources =
        this._sourceslots = null;
};

/**
 * @package
 * @param {!Signal} child 
 */
Computation.prototype._add = function(child) {
    if (this._owned === null) {
        this._owned = [child];
    } else {
        this._owned[this._owned.length] = child;
    }
}

/**
 * @package
 * @override
 * @this {!Computation<T>}
 * @param {number} time
 */
Computation.prototype._recDispose = function (time) {
    /** @const {number} */
    var age = this._age;
    this._age = time;
    this._opt = (this._opt | Opts.Dispose) & ~Opts.Update;
    /*
     * If age is current, then this computation has already been
     * flagged for update and been enqueued in COMPUTES or RESPONDS.
     */
    if (age < time) {
        if (STAGE === Stage.Computes) {
            COMPUTES._add(this);
        } else {
            DISPOSES._add(this);
        }
        if (this._owned !== null) {
            sendDispose(this._owned, time);
        }
    }
};

/**
 * @package
 * @override
 * @this {!Computation<T>}
 * @param {number} time
 */
Computation.prototype._recMayDispose = function (time) {
    this._mayDisposeAge = time;
    this._opt = (this._opt | Opts.MayDispose) & ~Opts.MayCleared;
    if (this._owned !== null && this._mayUpdateAge < time) {
        sendMayDispose(this._owned, time);
    }
};

/**
 * @package
 * @this {!Computation<T>}
 * @param {number} time
 */
Computation.prototype._recUpdate = function (time) {
    /** @const {number} */
    var opt = this._opt;
    this._age = time;
    this._opt |= Opts.Update;
    if (this._owned !== null) {
        sendDispose(this._owned, time);
    }
    if ((opt & (Opts.Send | Opts.Respond)) === Opts.Send) {
        COMPUTES._add(this);
        if ((opt & Opts.Send) !== 0 && this._mayUpdateAge < time) {
            sendMayUpdate(this, time);
        }
    } else {
        EFFECTS._add(this);
        if ((opt & Opts.Send) !== 0) {
            sendUpdate(this, time);
        }
    }
};

/**
 * @package
 * @this {!Computation<T>}
 * @param {number} time
 */
Computation.prototype._recMayUpdate = function (time) {
    this._mayUpdateAge = time;
    this._opt = (this._opt | Opts.MayUpdate) & ~Opts.MayCleared;
    if (this._owned !== null && this._mayDisposeAge < time) {
        sendMayDispose(this._owned, time);
    }
    if ((this._opt & Opts.Send) !== 0) {
        sendMayUpdate(this, time);
    }
};

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
     * @const {!Array<?Dispose>}
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
 * @param {!Dispose} item
 * @this {!Queue}
 */
Queue.prototype._add = function (item) {
    this._items[this._count++] = item;
};

/**
 * @package
 * @returns {number}
 * @this {!Queue}
 * @param {number} time
 */
Queue.prototype._run = function (time) {
    STAGE = this._stage;
    /** @type {number} */
    var error = 0;
    for (var i = 0; i < this._count; i++) {
        /** @const {?Dispose} */
        var item = this._items[i];
        if ((item._opt & (Opts.Update | Opts.Dispose)) !== 0) {
            try {
                if ((item._opt & Opts.Update) !== 0) {
                    item._update(time);
                } else {
                    item._dispose(time);
                }
            } catch (err) {
                error = 1;
            }
        }
        this._items[i] = null;
    }
    this._count = 0;
    return error;
};

/** @const {!Nil} */
var NIL = /** @type {!Nil} */({});
/** @type {number} */
var TIME = 1;
/** @type {number} */
var STAGE = Stage.Idle;
/** @const {!Queue} */
var DISPOSES = new Queue(Stage.Disposes);
/** @const {!Queue} */
var CHANGES = new Queue(Stage.Changes);
/** @const {!Queue} */
var COMPUTES = new Queue(Stage.Computes);
/** @const {!Queue} */
var EFFECTS = new Queue(Stage.Effects);
/** @type {?Own} */
var OWNER = null;
/** @type {boolean} */
var LISTEN = false;

/**
 * @package
 */
function reset() {
    DISPOSES._count = CHANGES._count = COMPUTES._count = EFFECTS._count = 0;
}

/**
 * @package
 * @param {!Send} from 
 * @param {!ReceiveMany} to
 */
function logRead(from, to) {
    from._opt |= Opts.Send;
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
    /** @const {?Own} */
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
    var time;
    /** @type {number} */
    var cycle = 0;
    /** @type {number} */
    var errors = 0;
    /** @const {!Queue} */
    var disposes = DISPOSES;
    /** @const {!Queue} */
    var changes = CHANGES;
    /** @const {!Queue} */
    var computes = COMPUTES;
    /** @const {!Queue} */
    var effects = EFFECTS;
    do {
        time = ++TIME;
        if (disposes._count !== 0) {
            errors += disposes._run(time);
        }
        if (changes._count !== 0) {
            errors += changes._run(time);
        }
        if (disposes._count !== 0) {
            errors += disposes._run(time);
        }
        if (computes._count !== 0) {
            errors += computes._run(time);
        }
        if (effects._count !== 0) {
            errors += effects._run(time);
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
 * @package
 * @param {!ReceiveMany} node
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
    if ((send._opt & Opts.DisposeFlags) === 0) {
        if (slot === -1) {
            send._node1 = null;
        } else {
            /** @const {?Array<ReceiveMany>} */
            var nodes = send._nodes;
            /** @const {?Array<number>} */
            var nodeslots = send._nodeslots;
            /** @const {ReceiveMany} */
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
    /** @const {?ReceiveMany} */
    var node1 = send._node1;
    /** @const {?Array<!ReceiveMany>} */
    var nodes = send._nodes;
    if (node1 !== null) {
        forgetSender(node1, send._node1slot);
        send._node1 = null;
    }
    if (nodes !== null && (ln = nodes.length) !== 0) {
        /** @const {?Array<number>} */
        var nodeslots = send._nodeslots;
        for (; ln-- !== 0;) {
            forgetSender(nodes.pop(), nodeslots.pop());
        }
    }
}

/**
 * @package
 * @param {!ReceiveMany} receive 
 * @param {number} slot
 */
function forgetSender(receive, slot) {
    if ((receive._opt & Opts.DisposeFlags) === 0) {
        if (slot === -1) {
            receive._source1 = null;
        } else {
            /** @const {?Array<Send>} */
            var sources = receive._sources;
            /** @const {?Array<number>} */
            var sourceslots = receive._sourceslots;
            /** @const {Send} */
            var last = sources.pop();
            /** @const {number} */
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
    root, peek, batch, stable,
    recover, cleanup, dispose,
    value, data,
    compute, $compute,
    respond, $respond,
    effect, $effect
};