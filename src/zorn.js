/* __EXCLUDE__ */

/** @typedef {function(boolean): void} */
var Cleanup;

/** @typedef {function(*): void} */
var Recover;

/** 
 * @interface
 */
function nil() { }

/**
 * @protected
 * @interface
 * @extends {Signal}
 */
function Dispose() { }

/**
 * @protected
 * @type {number}
 */
Dispose.prototype._opt;

/**
 * @protected
 * @type {number}
 */
Dispose.prototype._age;

/**
 * @protected
 * @param {number} time
 * @returns {void}
 */
Dispose.prototype._dispose = function (time) { };

/**
 * @protected
 * @param {number} time
 * @returns {void}
 */
Dispose.prototype._recDispose = function (time) { };

/**
 * @template T
 * @interface
 * @extends {Dispose}
 */
function Owner() { }

/**
 * @protected
 * @type {?Array<!Child>}
 */
Owner.prototype._owned;

/**
 * @protected
 * @type {?Array<Cleanup>}
 */
Owner.prototype._cleanups;

/**
 * @protected
 * @type {?Array<Recover>}
 */
Owner.prototype._recovers;

/**
 * @protected
 * @param {!Child} child 
 */
Owner.prototype._addChild = function (child) { };

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
 * @protected
 * @interface
 * @template T
 * @extends {Dispose}
 */
function Child() { }

/**
 * @protected
 * @type {T}
 */
Child.prototype._value;

/**
 * @protected
 * @type {?Owner}
 */
Child.prototype._owner;

/**
 * @protected
 * @type {number}
 */
Child.prototype._mayDisposeAge;

/**
 * @protected
 * @param {number} time
 * @returns {void}
 */
Child.prototype._recMayDispose = function (time) { };

/**
 * @protected
 * @interface
 * @template T
 * @extends {Child<T>}
 */
function Send() { }

/**
 * @protected
 * @type {?Receive}
 */
Send.prototype._node1;

/**
 * @protected
 * @type {number}
 */
Send.prototype._node1slot;

/**
 * @protected
 * @type {?Array<!Receive>}
 */
Send.prototype._nodes;

/**
 * @protected
 * @type {?Array<number>}
 */
Send.prototype._nodeslots;

/**
 * @protected
 * @param {number} time
 * @returns {void}
 */
Send.prototype._update = function (time) { };

/**
 * @protected
 * @interface
 * @template T
 * @extends {Child<T>}
 */
function Receive() { }

/**
 * @protected
 * @type {number}
 */
Receive.prototype._age;

/**
 * @protected
 * @type {number}
 */
Receive.prototype._mayUpdateAge;

/**
 * @protected
 * @type {?Send}
 */
Receive.prototype._source1;

/**
 * @protected
 * @type {number}
 */
Receive.prototype._source1slot;

/**
 * @protected
 * @param {number} time
 * @returns {void}
 */
Receive.prototype._recUpdate = function (time) { };

/**
 * @protected
 * @param {number} time
 * @returns {void}
 */
Receive.prototype._recMayUpdate = function (time) { };

/**
 * @protected
 * @interface
 * @template T
 * @extends {Receive<T>}
 */
function ReceiveMany() { }

/**
 * @protected
 * @type {?Array<!Send>}
 */
ReceiveMany.prototype._sources;

/**
 * @protected
 * @type {?Array<number>}
 */
ReceiveMany.prototype._sourceslots;

/* __EXCLUDE__ */

/**
 * @public
 * @template T
 * @param {function(): T} fn 
 * @returns {!Signal<T>}
 */
function root(fn) {
    /** @const {!Owner} */
    var node = new Root();
    /** @const {?Owner} */
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
 * @template T
 * @param {!Array<T>=} value 
 * @returns {!SignalArray<T>}
 */
function array(value) {
    return new DataArray(value == null ? [] : value);
}

/**
 * @public
 * @param {!Dispose} node 
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
    /** @const {?Owner} */
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
    /** @const {?Owner} */
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
 * @protected
 * @abstract
 * @constructor
 * @implements {Dispose}
 */
function Disposer() { }

/**
 * @protected
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
 * @protected
 * @this {!Disposer}
 * @param {number} time
 */
Disposer.prototype._recMayDispose = function (time) {
    this._mayDisposeAge = time;
    this._opt |= Opts.MayDispose;
};;

/**
 * @noinline
 * @param {Function} parent
 * @param {Function} child
 */
function extend(parent, child) {
    child.prototype = new parent;
    child.constructor = child;
}

/**
 * @protected
 * @template T
 * @param {Function} obj
 * @param {function(this:Child): T} getVal
 * @param {function(this:Child): T} peekVal
 * @param {function(this:Child, T): T=} setVal
 */
function setValProto(obj, getVal, peekVal, setVal) {
    Object.defineProperties(obj.prototype, { val: { get: getVal, set: setVal }, peek: { get: peekVal } });
}

/**
 * @protected
 * @template T
 * @this {!Child<T>}
 * @returns {T}
 */
function getValue() {
    return this._value;
}

/**
 * @param {Dispose} node 
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
 * @protected
 * @constructor
 * @extends {Disposer}
 * @implements {Owner}
 */
function Root() {
    /**
     * @protected
     * @type {number}
     */
    this._opt = 0;
    /**
     * @protected
     * @type {number}
     */
    this._age = 0;
    /**
     * @protected
     * @type {?Array<!Child>}
     */
    this._owned = [];
    /**
     * @protected
     * @type {?Array<!Cleanup>}
     */
    this._cleanups = null;
    /**
     * @protected
     * @type {?Array<!Recover>}
     */
    this._recovers = null;
}

extend(Disposer, Root);

/**
 * @protected
 * @this {!Owner}
 * @param {number} time
 */
function disposeOwn(time) {
    this._opt = Opts.Disposed;
    /** @type {number} */
    var i;
    /** @type {number} */
    var ln;
    /** @const {?Array<!Child>} */
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
 * @protected
 * @override
 * @this {!Owner}
 */
Root.prototype._dispose = disposeOwn;

/**
 * @protected
 * @param {!Child} child 
 */
Root.prototype._addChild = function (child) {
    this._owned[this._owned.length] = child;
}

/**
 * @struct
 * @template T
 * @protected
 * @abstract
 * @constructor
 * @extends {Disposer}
 * @implements {Send<T>}
 * @param {?Owner} owner 
 * @param {number|undefined} opt 
 * @param {T} value
 * @param {(function(T,T): boolean)|null=} eq
 */
function Sender(owner, opt, value, eq) {
    /**
     * @protected
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
     * @protected
     * @type {T}
     */
    this._value = value;
    /**
     * @protected
     * @type {?Owner}
     */
    this._owner = owner;
    /**
     * @protected
     * @type {(function(T,T): boolean)|null|undefined}
     */
    this._eq = eq;
    /**
     * @protected
     * @type {number}
     */
    this._age = 0;
    /**
     * @protected
     * @type {number}
     */
    this._mayDisposeAge = 0;
    /**
     * @protected
     * @type {?ReceiveMany}
     */
    this._node1 = null;
    /**
     * @protected
     * @type {number}
     */
    this._node1slot = -1;
    /**
     * @protected
     * @type {?Array<!ReceiveMany>}
     */
    this._nodes = null;
    /**
     * @protected
     * @type {?Array<number>}
     */
    this._nodeslots = null;
    if (owner !== null) {
        owner._addChild(this);
    }
}

/**
 * @protected
 * @param {!Sender} node
 */
function disposeSender(node) {
    node._opt = Opts.Disposed;
    updateSender(node);
    node._value =
        node._owner =
        node._eq =
        node._nodes =
        node._nodeslots = null;
}

/**
 * @protected
 * @param {!Send} send
 */
function updateSender(send) {
    /** @type {number} */
    var ln;
    /** @const {?Receive} */
    var node1 = send._node1;
    /** @const {?Array<!Receive>} */
    var nodes = send._nodes;
    if (node1 !== null) {
        removeSender(node1, send._node1slot);
        send._node1 = null;
    }
    if (nodes !== null && (ln = nodes.length) !== 0) {
        /** @const {?Array<number>} */
        var nodeslots = send._nodeslots;
        for (; ln-- !== 0;) {
            removeSender(nodes.pop(), nodeslots.pop());
        }
    }
}

/**
 * @protected
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
 * @protected
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
 * @protected
 * @param {!Array<!Child>} owned 
 * @param {number} time
 */
function sendDispose(owned, time) {
    /** @type {number} */
    var ln = owned.length;
    for (; ln-- !== 0;) {
        /** @const {!Child} */
        var child = owned.pop();
        if ((child._opt & Opts.DisposeFlags) === 0) {
            child._recDispose(time);
        }
    }
}

/**
 * @protected
 * @param {!Array<!Child>} owned 
 * @param {number} time
 */
function sendMayDispose(owned, time) {
    /** @const {number} */
    var ln = owned.length;
    for (var i = 0; i < ln; i++) {
        /** @const {!Child} */
        var child = owned[i];
        if (child._opt !== Opts.Disposed && child._mayDisposeAge < time) {
            child._recMayDispose(time);
        }
    }
}

/**
 * @struct
 * @template T
 * @protected
 * @constructor
 * @extends {Sender<T>}
 * @implements {WritableSignal<T>}
 * @param {T} value
 * @param {(function(T,T): boolean)|null=} eq
 */
function Data(value, eq) {
    Sender.call(this, OWNER, 0, value, eq);
    /**
     * @protected
     * @type {T|nil}
     */
    this._pending = NIL;
}

extend(Disposer, Data);

/* __EXCLUDE__ */

/**
 * @type {T}
 * @nocollapse
 * @throws {Error}
 */
Data.prototype.val;

/**
 * @type {T}
 * @readonly
 */
Data.prototype.peek;

/* __EXCLUDE__ */

setValProto(
    Data,
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
 * @protected
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
 * @protected
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
 * @protected
 * @abstract
 * @constructor
 * @extends {Sender<T>}
 */
function Receiver() {
    /**
     * @protected
     * @type {number}
     */
    this._mayUpdateAge = 0;
    /**
     * @protected
     * @type {?Send}
     */
    this._source1 = null;
    /**
     * @protected
     * @type {number}
     */
    this._source1slot = 0;
}

/**
 * @protected
 * @param {!Receiver} node
 */
function updateReceiver(node) {
    if (node._source1 !== null) {
        removeReceiver(node._source1, node._source1slot);
        node._source1 = null;
    }
}

/**
 * @protected
 * @param {!Send} send 
 * @param {number} slot
 */
function removeReceiver(send, slot) {
    if ((send._opt & Opts.DisposeFlags) === 0) {
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
 * @struct
 * @template T 
 * @protected
 * @constructor
 * @extends {Receiver<T,(function(T): T)>}
 * @implements {ReadonlySignal<T>}
 * @implements {Owner<T>}
 * @implements {ReceiveMany<T>}
 * @param {function(T): T} fn 
 * @param {T} value 
 * @param {(function(T,T): boolean)|null=} eq
 * @param {number} opt
 */
function Computation(fn, value, opt, eq) {
    /** @const {?Owner} */
    var owner = OWNER;
    /** @const {boolean} */
    var listen = LISTEN;
    Root.call(/** @type {?} */(this));
    Sender.call(this, owner, opt, value, eq);
    Receiver.call(this);
    /**
     * @protected
     * @type {?(function(T): T)}
     */
    this._fn = fn;
    /**
     * @protected
     * @type {?Array<!Send>}
     */
    this._sources = null;
    /**
     * @protected
     * @type {?Array<number>}
     */
    this._sourceslots = null;
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

extend(Disposer, Computation);

/* __EXCLUDE__ */

/**
 * @type {T}
 * @nocollapse
 * @throws {Error}
 */
Computation.prototype.val;

/**
 * @type {T}
 * @readonly
 */
Computation.prototype.peek;
/**
 * @protected
 * @type {?Array<!Child>}
 */
Computation.prototype._owned;
/**
 * @protected
 * @type {?Array<Cleanup>}
 */
Computation.prototype._cleanups;
/**
 * @protected
 * @type {?Array<Recover>}
 */
Computation.prototype._recovers;

/* __EXCLUDE__ */

setValProto(
    Computation,
    /**
     * @template T
     * @this {!Computation<T>}
     * @returns {T}
     */
    function getComputation() {
        /** @const {number} */
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
 * 
 * @param {Computation} node 
 */
function updateManyReceivers(node) {
    updateReceiver(/** @type {?} */(node));
    /** @type {number} */
    var ln;
    /** @const {?Array<!Send>} */
    var sources = node._sources;
    if (sources !== null && (ln = sources.length) !== 0) {
        /** @const {?Array<number>} */
        var sourceslots = node._sourceslots;
        for (; ln-- !== 0;) {
            removeReceiver(sources.pop(), sourceslots.pop());
        }
    }
}

/**
 * @protected
 * @override
 * @this {!Computation<T>}
 * @param {!Child} child 
 */
Computation.prototype._addChild = function (child) {
    if (this._owned === null) {
        this._owned = [child];
    } else {
        this._owned[this._owned.length] = child;
    }
};

/**
 * @protected
 * @override
 * @this {!Computation<T>}
 */
Computation.prototype._dispose = function (time) {
    disposeOwn.call(this, time);
    disposeSender(this);
    updateManyReceivers(this);
    this._fn =
        this._sources =
        this._sourceslots = null;
};

/**
 * @protected
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
 * @protected
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
 * @protected
 * @override
 * @this {Computation<T>}
 * @param {number} time
 */
Computation.prototype._update = function (time) {
    /** @type {number} */
    var i;
    /** @type {number} */
    var ln;
    /** @const {?Owner} */
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
        updateManyReceivers(this);
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
 * @protected
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
 * @protected
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
 * @protected
 * @constructor
 * @param {number} stage 
 */
function Queue(stage) {
    /**
     * @protected
     * @const {number}
     */
    this._stage = stage;
    /**
     * @protected
     * @const {!Array<?Dispose>}
     */
    this._items = [];
    /**
     * @protected
     * @type {number}
     */
    this._count = 0;
}

/**
 * @protected
 * @param {!Dispose} item
 * @this {!Queue}
 */
Queue.prototype._add = function (item) {
    this._items[this._count++] = item;
};

/**
 * @protected
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

/** @const {!nil} */
var NIL = /** @type {!nil} */({});
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
/** @type {?Owner} */
var OWNER = null;
/** @type {boolean} */
var LISTEN = false;

/**
 * @protected
 */
function reset() {
    DISPOSES._count = CHANGES._count = COMPUTES._count = EFFECTS._count = 0;
}

/**
 * @protected
 * @param {!Send} from 
 * @param {!Receive|!ReceiveMany} to
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
 * @protected
 * @throws {Error}
 */
function exec() {
    /** @const {?Owner} */
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
 * @protected
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
 * @protected
 * @param {!Receive} receive 
 * @param {number} slot
 */
function removeSender(receive, slot) {
    if ((receive._opt & Opts.DisposeFlags) === 0) {
        if (slot === -1) {
            receive._source1 = null;
        } else {
            /** @const {?Array<Send>} */
            var sources = /** @type {ReceiveMany} */(receive)._sources;
            /** @const {?Array<number>} */
            var sourceslots = /** @type {ReceiveMany} */(receive)._sourceslots;
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

/**
 * @struct
 * @protected
 * @abstract
 * @template T
 * @constructor
 * @extends {Sender<!Array<T>>}
 */
function Collection() { }

/**
 * @param {function(T,!Signal<number>): boolean} callbackFn
 * @returns {!Signal<boolean>}
 */
Collection.prototype.every = function (callbackFn) { };

/**
 * @param {function(T,!Signal<number>): boolean} callbackFn
 * @returns {!SignalCollection<T>}
 */
Collection.prototype.filter = function (callbackFn) { };

/**
 * @param {function(T,!Signal<number>): boolean} callbackFn
 * @returns {!Signal<T|undefined>}
 */
Collection.prototype.find = function (callbackFn) { };

/**
 * @param {function(T,!Signal<number>): boolean} callbackFn
 * @returns {!Signal<number>}
 */
Collection.prototype.findIndex = function (callbackFn) { };

/**
 * @param {function(T,!Signal<number>): boolean} callbackFn
 * @returns {!Signal<T|undefined>}
 */
Collection.prototype.findLast = function (callbackFn) { };

/**
 * @param {function(T,!Signal<number>): boolean} callbackFn
 * @returns {!Signal<number>}
 */
Collection.prototype.findLastIndex = function (callbackFn) { };

/**
 * @param {function(T): void} callbackFn
 * @returns {void} 
 */
Collection.prototype.forEach = function (callbackFn) { };

/**
 * @param {T} searchElement
 * @returns {!Signal<boolean>}
 */
Collection.prototype.includes = function (searchElement) { };

/**
 * 
 * @param {T} searchElement 
 * @param {number=} fromIndex
 * @returns {!Signal<number>}
 */
Collection.prototype.indexOf = function (searchElement, fromIndex) { };

/**
 * 
 * @param {string=} separator
 * @returns {!Signal<string>}
 */
Collection.prototype.join = function (separator) { };

/**
 * 
 * @param {T} searchElement 
 * @param {number=} fromIndex
 * @returns {!Signal<number>}
 */
Collection.prototype.lastIndexOf = function (searchElement, fromIndex) { };

/**
 * @template U
 * @param {function(T,!Signal<number>): U} callbackFn
 * @returns {!SignalCollection<U>}
 */
Collection.prototype.map = function (callbackFn) { };

/**
 * @template U
 * @param {function((T|U),T,!Signal<number>): U} callbackFn 
 * @param {U=} initialValue 
 * @returns {!SignalCollection<U>}
 */
Collection.prototype.reduce = function (callbackFn, initialValue) { };

/**
 * @template U
 * @param {function((T|U),T,!Signal<number>): U} callbackFn 
 * @param {U=} initialValue 
 * @returns {!SignalCollection<U>}
 */
Collection.prototype.reduceRight = function (callbackFn, initialValue) { };

/**
 * @returns {!SignalCollection<T>}
 */
Collection.prototype.reverse = function () { };

/**
 * @param {number=} start
 * @param {number=} end
 * @returns {!SignalCollection<T>}
 */
Collection.prototype.slice = function (start, end) { };

/**
 * 
 * @param {function(T,!Signal<number>): boolean} callbackFn
 * @returns {!Signal<boolean>} 
 */
Collection.prototype.some = function (callbackFn) { };

/**
 * @struct
 * @protected
 * @template T,U
 * @constructor
 * @extends {Collection<T>}
 * @implements {ReadonlySignal<!Array<T>>}
 * @implements {Receive<!Array<T>>}
 * @param {!Send<!Array>} src
 * @param {function(T,ReadonlySignal<number>): U} fn
 */
function Enumerable(src, fn) {
    Sender.call(this, OWNER, 0, []);
    Receiver.call(/** @type {?} */(this));
    /**
     * @protected
     * @type {?(function(T,ReadonlySignal<number>): U)}
     */
    this._fn = fn;
    logRead(src, this);
}

extend(Collection, Enumerable);

/* __EXCLUDE__ */
/**
 * @type {T}
 * @nocollapse
 * @throws {Error}
 */
Enumerable.prototype.val;

/**
 * @type {T}
 * @readonly
 */
Enumerable.prototype.peek;
/**
 * @protected
 * @type {T}
 */
Enumerable.prototype._source1;
/**
 * @protected
 * @type {number}
 */
Enumerable.prototype._source1slot;
/**
 * @protected
 * @type {number}
 */
Enumerable.prototype._mayUpdateAge;
/* __EXCLUDE__ */

setValProto(
    Enumerable,
    /**
     * @template T
     * @this {!Enumerable<T>}
     * @returns {!Array<T>}
     */
    function () {
        return this._value;
    },
    getValue
);

/**
 * @protected
 * @override
 * @this {!Enumerable<T>}
 * @param {number} time 
 */
Enumerable.prototype._dispose = function (time) {

};

/**
 * @protected
 * @override 
 * @this {!Enumerable<T>}
 * @param {number} time 
 */
Enumerable.prototype._recDispose = function (time) {

};

/**
 * @protected
 * @override 
 * @this {!Enumerable<T>}
 * @param {number} time 
 */
Enumerable.prototype._recMayDispose = function (time) {

};

/**
 * @protected
 * @override
 * @this {!Enumerable<T>}
 * @param {number} time 
 */
Enumerable.prototype._update = function (time) {

};

/**
 * @protected
 * @this {!Enumerable<T>}
 * @param {number} time 
 */
Enumerable.prototype._recUpdate = function (time) {

};

/**
 * @protected
 * @param {number} time 
 */
Enumerable.prototype._recMayUpdate = function (time) {

};

/**
 * @struct
 * @protected
 * @template T
 * @constructor
 * @extends {Collection<T>}
 * @implements {SignalArray<T>}
 * @param {!Array<T>} value
 */
function DataArray(value) {
    Sender.call(this, OWNER, 0, value);
}

extend(Collection, DataArray);

/* __EXCLUDE__ */
/**
 * @type {T}
 * @noinline
 */
DataArray.prototype.val;

/**
 * @type {T}
 * @readonly
 */
DataArray.prototype.peek;
/* __EXCLUDE__ */

setValProto(
    DataArray,
    /**
     * @template T
     * @this {!DataArray<T>}
     * @returns {!Array<T>}
     */
    function () {
        return this._value;
    },
    getValue,
    /**
     * @template T
     * @this {!DataArray<T>}
     * @returns {!Array<T>}
     */
    function (value) {
        return this._value;
    }
);

/**
 * @protected
 * @override
 * @this {!DataArray<T>}
 * @param {number} time
 */
DataArray.prototype._dispose = function (time) {

};

/**
 * @protected
 * @override
 * @this {!DataArray<T>}
 * @param {number} time
 */
DataArray.prototype._update = function (time) {

};

/**
 * @this {!DataArray<T>}
 * @throws {Error}
 */
DataArray.prototype.pop = function () { };

/**
 * @this {!DataArray<T>}
 * @param {...T} elementN
 * @throws {Error}
 */
DataArray.prototype.push = function (elementN) { };

/**
 * @this {!DataArray<T>}
 * @throws {Error}
 */
DataArray.prototype.shift = function () { };

/**
 * @this {!DataArray<T>}
 * @param {function(T,T): number} compareFn
 * @throws {Error}
 */
DataArray.prototype.sort = function (compareFn) { };

/**
 * @this {!DataArray<T>}
 * @param {number} start 
 * @param {number=} deleteCount 
 * @param {...T} items
 * @throws {Error}
 */
DataArray.prototype.splice = function (start, deleteCount, items) { };

/**
 * @this {!DataArray<T>}
 * @param {...T} elementN
 * @throws {Error} 
 */
DataArray.prototype.unshift = function (elementN) { };

export {
    root, peek, batch, stable,
    recover, cleanup, dispose,
    data, value, array,
    compute, $compute,
    effect, $effect
};