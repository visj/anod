/* __EXTERNS_FILE__ */
/**
 * @fileoverview
 * @author Vilhelm Sjölund
 __EXTERNS__
 * @externs
 __EXTERNS__
 */

/* __EXCLUDE__ */

/**
 * @interface
 */
function RootSignal() { }

/**
 * @template T
 * @interface
 * @extends {RootSignal}
 */
function Signal() { }

/**
 * @type {T}
 * @readonly
 * @nocollapse
 * @throws {Error}
 */
Signal.prototype.val;

/**
 * @type {T}
 * @readonly
 * __EXTERNS__
 * @nosideeffects
 * __EXTERNS__
 */
Signal.prototype.peek;

/**
 * @interface
 * @template T
 * @extends {Signal<T>}
 */
function DataSignal() { }

/**
 * @param {T} value
 * @returns {void}
 * @throws {Error}
 */
DataSignal.prototype.set = function (value) { };

/**
 * @public
 * @interface
 * @template T
 * @extends {Signal<T>}
 */
function IterableSignal() { }

/**
 * @public
 * @readonly
 * @type {Signal<number>}
 */
IterableSignal.prototype.length;

/**
 * @public
 * @returns {Array}
 */
IterableSignal.prototype.mut = function () { };

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {Signal<number>|number} index 
 * @returns {Signal<T|undefined>}
 */
IterableSignal.prototype.at = function (index) { };

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {...(T|Array<T>|IterableSignal<T>)} items
 * @returns {IterableSignal<T>} 
 */
IterableSignal.prototype.concat = function (items) { };

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<boolean>}
 */
IterableSignal.prototype.every = function (callbackFn) { };

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {IterableSignal<T>}
 */
IterableSignal.prototype.filter = function (callbackFn) { };

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<T|undefined>}
 */
IterableSignal.prototype.find = function (callbackFn) { };

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<number>}
 */
IterableSignal.prototype.findIndex = function (callbackFn) { };

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<T|undefined>}
 */
IterableSignal.prototype.findLast = function (callbackFn) { };

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<number>}
 */
IterableSignal.prototype.findLastIndex = function (callbackFn) { };

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): void} callbackFn
 * @returns {void} 
 */
IterableSignal.prototype.forEach = function (callbackFn) { };

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {Signal<T>|T} searchElement
 * @returns {Signal<boolean>}
 */
IterableSignal.prototype.includes = function (searchElement) { };

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {Signal<T>|T} searchElement 
 * @param {Signal<number>|number=} fromIndex
 * @returns {Signal<number>}
 */
IterableSignal.prototype.indexOf = function (searchElement, fromIndex) { };

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {Signal<string>|string=} separator
 * @returns {Signal<string>}
 */
IterableSignal.prototype.join = function (separator) { };

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {Signal<T>|T} searchElement 
 * @param {Signal<number>|number=} fromIndex
 * @returns {Signal<number>}
 */
IterableSignal.prototype.lastIndexOf = function (searchElement, fromIndex) { };

/**
 * @public
 * @template U
 * @this {IterableSignal<T>}
 * @param {function(T,!Signal<number>): U} callbackFn
 * @returns {IterableSignal<U>}
 */
IterableSignal.prototype.map = function (callbackFn) { };

/**
 * @public
 * @template U
 * @this {IterableSignal<T>}
 * @param {function((T|U),T,number): U} callbackFn 
 * @param {Signal<U>|U=} initialValue 
 * @returns {Signal<U>}
 */
IterableSignal.prototype.reduce = function (callbackFn, initialValue) { };

/**
 * @public
 * @template U
 * @this {IterableSignal<T>}
 * @param {function((T|U),T,number): U} callbackFn
 * @param {Signal<U>|U=} initialValue 
 * @returns {Signal<U>}
 */
IterableSignal.prototype.reduceRight = function (callbackFn, initialValue) { };

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {Signal<number>|number=} start
 * @param {Signal<number>|number=} end
 * @returns {IterableSignal<T>}
 */
IterableSignal.prototype.slice = function (start, end) { };

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<boolean>} 
 */
IterableSignal.prototype.some = function (callbackFn) { };

/**
 * @interface
 * @template T
 * @extends {IterableSignal<T>}
 */
function ArraySignal() { }

/**
 * @param {Array<T>|number} value 
 * @param {T=} item 
 * @returns {void}
 * @throws {Error}
 */
ArraySignal.prototype.set = function (value, item) { };

/**
 * @returns {void}
 * @throws {Error}
 */
ArraySignal.prototype.pop = function () { };

/**
 * @param {...T} elementN
 * @returns {void}
 * @throws {Error}
 */
ArraySignal.prototype.push = function (elementN) { };

/**
 * @returns {void}
 * @throws {Error}
 */
ArraySignal.prototype.shift = function () { };

/**
 * @returns {void}
 * @throws {Error}
 */
ArraySignal.prototype.reverse = function () { };

/**
 * 
 * @param {function(T,T): number=} compareFn
 * @returns {void}
 * @throws {Error}
 */
ArraySignal.prototype.sort = function (compareFn) { };

/**
 * 
 * @param {number} start 
 * @param {number=} deleteCount 
 * @param {...T} items
 * @returns {void}
 * @throws {Error}
 */
ArraySignal.prototype.splice = function (start, deleteCount, items) { };

/**
 * 
 * @param {...T} elementN
 * @returns {void}
 * @throws {Error} 
 */
ArraySignal.prototype.unshift = function (elementN) { };

/* __EXTERNS_FILE__ */

/* __SOURCE__ */

/** @typedef {function(): void} */
var Func;

/** @typedef {function(boolean): void} */
var CleanupFn;

/** @typedef {function(*): void} */
var RecoverFn;

/** @typedef {Send|Array<Send>} */
var Source;

/** @typedef {boolean|number|null|void} */
var falsy;

/** 
 * @interface
 */
function nil() { }

/**
 * @interface
 */
function Context() { }

/**
 * @type {?Root}
 */
Context.prototype._root;

/**
 * @type {?Own}
 */
Context.prototype._owner;

/**
 * @type {boolean}
 */
Context.prototype._listen;

/**
 * @protected
 * @interface
 * @extends {RootSignal}
 */
function Dispose() { }

/**
 * @protected
 * @type {number}
 */
Dispose.prototype._opt;

/**
 * @protected
 * @param {number} time
 * @returns {void}
 */
Dispose.prototype._dispose = function (time) { };

/**
 * @interface
 * @extends {Dispose}
 */
function Own() { }

/**
 * @protected
 * @param {Child} child
 * @returns {void}
 */
Own.prototype._addChild = function (child) { };

/**
 * @protected
 * @param {CleanupFn} cleanupFn 
 */
Own.prototype._addCleanup = function (cleanupFn) { };

/**
 * @protected
 * @param {RecoverFn} recoverFn 
 */
Own.prototype._addRecover = function (recoverFn) { };

/**
 * @protected
 * @type {?Array<Child>}
 */
Own.prototype._children;

/**
 * @protected
 * @type {?Array<CleanupFn>}
 */
Own.prototype._cleanups;

/**
 * @protected
 * @type {?Array<RecoverFn>}
 */
Own.prototype._recovers;

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
    Own: 256,
    Send: 512,
    SendMany: 1024,
    Receive: 2048,
    ReceiveMany: 4096,
    Respond: 8192,
    Bound: 16384,
    Defer: 32768,
    Compare: 65536,
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
 * @extends {Dispose}
 */
function Child() { }

/**
 * @protected
 * @type {?Receive}
 */
Child.prototype._owner;

/**
 * @protected
 * @param {number} time
 * @returns {void}
 */
Child.prototype._recDispose = function (time) { };

/**
 * @protected
 * @param {Receive} owner
 * @param {number} time
 * @returns {void}
 */
Child.prototype._recMayDispose = function (owner, time) { };

/**
 * @protected
 * @param {number} time
 * @returns {void}
 */
Child.prototype._update = function (time) { };

/**
 * @protected
 * @param {number} stage
 * @param {number} time
 * @returns {void} 
 */
Child.prototype._clearMayUpdate = function (stage, time) { };

/**
 * @protected
 * @interface
 * @template T,U
 * @extends {Child}
 * @extends {Signal<T>}
 */
function Send() { }

/**
 * @protected
 * @type {T}
 */
Send.prototype._value;

/**
 * @protected
 * @type {U}
 */
Send.prototype._set;

/**
 * @protected
 * @type {(function(T,T): boolean)|null|undefined}
 */
Send.prototype._eq;

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
 * @type {?Array<Receive>}
 */
Send.prototype._nodes;

/**
 * @protected
 * @type {?Array<number>}
 */
Send.prototype._nodeslots;

/**
 * @protected
 * @interface
 * @template T,U
 * @extends {Own}
 * @extends {Send<T,U>}
 */
function Receive() { }

/**
 * @protected
 * @type {number}
 */
Receive.prototype._age;

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
 * @type {?Array<Send>|void}
 */
Receive.prototype._sources;

/**
 * @protected
 * @type {?Array<number>|void}
 */
Receive.prototype._sourceslots;

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

/* __EXCLUDE__ */

/**
 * @public
 * @template T
 * @param {function(Func): T} fn 
 * @returns {T}
 */
function root(fn) {
    /** @const {?Root} */
    var _root = SCOPE._root;
    /** @const {?Own} */
    var owner = SCOPE._owner;
    /** @const {boolean} */
    var listen = SCOPE._listen;
    /** @const {boolean} */
    var orphan = fn.length === 0;
    /** @const {Root} */
    var node = orphan ? _root : new Root();
    SCOPE._root = SCOPE._owner = node;
    SCOPE._listen = false;
    try {
        return fn(/** @type {Func} */(orphan ? void 0 : function () {
            dispose(node);
        }));
    } finally {
        SCOPE._root = _root;
        SCOPE._owner = owner;
        SCOPE._listen = listen;
    }
}

/**
 * @public
 * @template T
 * @param {T} value 
 * @returns {DataSignal<T>}
 */
function data(value) {
    return new Data(Opts.Respond, NIL, value, 0);
}

/**
 * @public
 * @template T
 * @param {T} value 
 * @param {(function(T,T): boolean)=} eq
 * @returns {DataSignal<T>}
 */
function value(value, eq) {
    return new Data(0, NIL, value, eq);
}

/**
 * @public
 * @template T
 * @param {Array<T>=} value 
 * @param {(function(Array<T>,Array<T>): boolean)=} eq
 * @returns {ArraySignal<T>}
 */
function array(value, eq) {
    return new DataArray(value, eq);
}

/**
 * @public
 * @template T,U
 * @param {function(T,U,Func): T} fn 
 * @param {T=} seed 
 * @param {U=} args
 * @param {(function(T,T): boolean)|null=} eq
 * @returns {Signal<T>}
 */
function compute(fn, seed, args, eq) {
    return new Computation(fn, seed, Opts.Static, args, null, eq);
}

/**
 * @public
 * @template T,U
 * @param {function(T,U,Func): T} fn 
 * @param {T=} seed 
 * @param {U=} args
 * @param {(function(T,T): boolean)|null=} eq
 * @returns {Signal<T>}
 */
function $compute(fn, seed, args, eq) {
    return new Computation(fn, seed, 0, args, null, eq);
}

/**
 * @public
 * @template T,U
 * @param {Source} src
 * @param {function(T,U,Func): T} fn 
 * @param {T=} seed 
 * @param {U=} args
 * @param {(function(T,T): boolean)|null=} eq
 * @returns {Signal<T>}
 */
function computeWhen(src, fn, seed, args, eq) {
    return new Computation(fn, seed, Opts.Static | Opts.Bound, args, src, eq);
}

/**
 * @public
 * @template T,U
 * @param {Func} src
 * @param {function(T,U,Func): T} fn 
 * @param {T=} seed 
 * @param {U=} args
 * @param {(function(T,T): boolean)|null=} eq
 * @returns {Signal<T>}
 */
function $computeWhen(src, fn, seed, args, eq) {
    return new Computation(evalSource(src, fn), seed, Opts.Bound, args, null, eq);
}

/**
 * @public
 * @template T,U
 * @param {function(T,U,Func): T} fn 
 * @param {T=} seed 
 * @param {U=} args
 * @returns {T}
 */
function effect(fn, seed, args) {
    return new Computation(fn, seed, Opts.Static, args)._value;
}

/**
 * @public
 * @template T,U
 * @param {function(T,U,Func): T} fn 
 * @param {T=} seed 
 * @param {U=} args
 * @returns {T}
 */
function $effect(fn, seed, args) {
    return new Computation(fn, seed, 0, args)._value;
}

/**
 * @public
 * @template T,U
 * @param {Source} src
 * @param {function(T,U,Func): T} fn 
 * @param {T=} seed 
 * @param {boolean=} defer
 * @param {U=} args
 * @returns {T}
 */
function effectWhen(src, fn, seed, defer, args) {
    return new Computation(fn, seed, Opts.Static | Opts.Bound | (defer ? Opts.Defer : 0), args, src)._value;
}

/**
 * @public
 * @template T,U
 * @param {Func} src
 * @param {function(T,U,Func): T} fn 
 * @param {T=} seed 
 * @param {boolean=} defer
 * @param {U=} args
 * @returns {T}
 */
function $effectWhen(src, fn, seed, defer, args) {
    return new Computation(evalSource(src, fn), seed, Opts.Bound | (defer ? Opts.Defer : 0), args)._value;
}

/**
 * @public
 * @param {Dispose} node
 * @returns {void}
 */
function dispose(node) {
    if ((node._opt & Opts.DisposeFlags) === 0) {
        if (STAGE === Stage.Idle) {
            node._dispose(TIME);
        } else {
            // Schedule disposal for next batch
            node._opt |= Opts.Dispose;
            DISPOSES._add(node);
        }
    }
}

/**
 * @template T
 * @param {T|Signal<T>} obj 
 * @returns {T}
 */
function val(obj) {
    return isReactive(obj) ? obj.val : obj;
}

/**
 * @template T
 * @param {T|Signal<T>|(function(): T)} obj 
 * @returns {T}
 */
function peek(obj) {
    /** @type {T} */
    var result;
    if (typeof obj === "function") {
        var listen = SCOPE._listen;
        SCOPE._listen = false;
        result = obj();
        SCOPE._listen = listen;
    } else if (isReactive(obj)) {
        result = obj.peek;
    } else {
        result = obj;
    }
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
 * @returns {void}
 */
function stable() {
    if (SCOPE._listen) {
        SCOPE._owner._opt |= Opts.Static;
    }
}

/**
 * @public
 * @param {CleanupFn} fn
 * @returns {void} 
 */
function cleanup(fn) {
    /** @const {?Own} */
    var owner = SCOPE._owner;
    if (owner !== null) {
        owner._addCleanup(fn);
    }
}

/**
 * @public
 * @param {RecoverFn} fn
 * @returns {void}
 */
function recover(fn) {
    /** @const {?Own} */
    var owner = SCOPE._owner;
    if (owner !== null) {
        owner._addRecover(fn);
    }
}

// Internal

/**
 * @struct
 * @protected
 * @constructor
 * @param {number} stage 
 */
function Queue(stage) {
    /**
     * @protected
     * @const
     * @type {number}
     */
    this._stage = stage;
    /**
     * @protected
     * @const
     * @type {Array<?Dispose>}
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
 * @this {Queue}
 * @param {Dispose} item
 * @returns {void}
 */
Queue.prototype._add = function (item) {
    this._items[this._count++] = item;
};

/**
 * 
 * @param {number} time
 * @returns {number}
 */
Queue.prototype._run = function (time) {
    STAGE = this._stage;
    /** @type {number} */
    var error = 0;
    for (var /** number */ i = 0; i < this._count; i++) {
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
            } finally {
                item._opt &= ~(Opts.UpdateFlags | Opts.MayFlags);
            }
        } else {
            item._opt &= ~Opts.MayFlags;
        }
        this._items[i] = null;
    }
    this._count = 0;
    return error;
};

/** @const {function(...?): ?} */
var NOOP = function () { };
/** @const  {nil} */
var NIL = /** @type {nil} */({});
/** @const {Array} */
var MUT = /** @type {Array} */([]);
/** @type {number} */
var TIME = 1;
/** @type {number} */
var STAGE = Stage.Idle;
/** @const {Queue} */
var DISPOSES = new Queue(Stage.Disposes);
/** @const {Queue} */
var CHANGES = new Queue(Stage.Changes);
/** @const {Queue} */
var COMPUTES = new Queue(Stage.Computes);
/** @const {Queue} */
var EFFECTS = new Queue(Stage.Effects);
/** @const {Context} */
var SCOPE = /** @type {Context} */({
    _root: null,
    _owner: null,
    _listen: false
});

/**
 * @param {Function} ctor
 * @param {Function} instance 
 * @param {Array<Function>} inherits 
 * @param {function(): *=} peek
 * @param {function(): *=} val
 * @returns {void}
 */
function extendReactive(ctor, instance, inherits, peek, val) {
    /** @const */
    var base = new instance();
    for (var /** number */ i = 0; i < inherits.length; i++) {
        /** @const */
        var proto = inherits[i].prototype;
        for (var /** string */ key in proto) {
            base[key] = proto[key];
        }
    }
    Object.defineProperties(base, { peek: { get: peek }, val: { get: val } });
    ctor.prototype = base;
    ctor.constructor = ctor;
}

/**
 * @throws {Error}
 * @param {string=} msg 
 * @returns {void}
 */
function panic(msg) {
    throw new Error(msg);
}

/**
 * @protected
 * @returns {void}
 */
function reset() {
    DISPOSES._count = CHANGES._count = COMPUTES._count = EFFECTS._count = 0;
}

/**
 * @protected
 * @param {Send} from 
 * @param {Receive} to
 */
function logRead(from, to) {
    from._opt |= Opts.Send;
    to._opt |= Opts.Receive;
    /** @type {number} */
    var fromslot;
    /** @const {number} */
    var toslot = to._source1 === null ? -1 : to._sources === null ? 0 : to._sources.length;
    if (from._node1 === null) {
        fromslot = -1;
        from._node1 = to;
        from._node1slot = toslot;
    } else if (from._nodes === null) {
        from._opt |= Opts.SendMany;
        fromslot = 0;
        from._nodes = [to];
        from._nodeslots = [toslot];
    } else {
        from._opt |= Opts.SendMany;
        fromslot = from._nodes.length;
        from._nodes[fromslot] = to;
        from._nodeslots[fromslot] = toslot;
    }
    if (to._source1 === null) {
        to._source1 = from;
        to._source1slot = fromslot;
    } else if (to._sources === null) {
        to._opt |= Opts.ReceiveMany;
        to._sources = [from];
        to._sourceslots = [fromslot];
    } else {
        to._opt |= Opts.ReceiveMany;
        to._sources[toslot] = from;
        to._sourceslots[toslot] = fromslot;
    }
}

/**
 * @protected
 * @throws {Error}
 */
function exec() {
    /** @const {?Own} */
    var owner = SCOPE._owner;
    try {
        start();
    } finally {
        STAGE = Stage.Idle;
        SCOPE._owner = owner;
        SCOPE._listen = false;
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
    /** @const {Queue} */
    var disposes = DISPOSES;
    /** @const {Queue} */
    var changes = CHANGES;
    /** @const {Queue} */
    var computes = COMPUTES;
    /** @const {Queue} */
    var effects = EFFECTS;
    do {
        time = ++TIME;
        if (disposes._count !== 0) {
            errors += disposes._run(time);
        }
        if (changes._count !== 0) {
            errors += changes._run(time);
        }
        if (computes._count !== 0) {
            errors += computes._run(time);
        }
        if (effects._count !== 0) {
            errors += effects._run(time);
        }
        if (errors !== 0) {
            panic("error encountered");
        }
        if (cycle++ > 1e5) {
            panic("cycle detected");
        }
    } while (changes._count !== 0 || disposes._count !== 0 || computes._count !== 0 || effects._count !== 0);
}

/**
 * @struct
 * @protected
 * @constructor
 * @implements {Own}
 * @implements {RootSignal}
 */
function Root() {
    /**
     * @protected
     * @type {number}
     */
    this._opt = 0;
    /**
     * @protected
     * @type {?Array<Child>}
     */
    this._children = [];
    /**
     * @protected
     * @type {?Array<CleanupFn>}
     */
    this._cleanups = null;
    /**
     * @protected
     * @type {?Array<RecoverFn>}
     */
    this._recovers = null;
}

/**
 * @protected
 * @param {Own} owner
 * @param {number} time
 */
function disposeOwner(owner, time) {
    owner._opt = Opts.Disposed;
    /** @type {number} */
    var i;
    /** @type {number} */
    var ln;
    /** @const {?Array<Child>} */
    var owned = owner._children;
    /** @const {?Array<CleanupFn>} */
    var cleanups = owner._cleanups;
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
    owner._cleanups =
        owner._children =
        owner._recovers = null;
}

/**
 * @protected
 * @override
 * @this {Root}
 * @param {number} time
 * @returns {void}
 */
Root.prototype._dispose = function (time) {
    disposeOwner(this, time);
};

/**
 * @protected
 * @this {Root}
 * @param {Child} child 
 * @returns {void}
 */
Root.prototype._addChild = function (child) {
    this._opt |= Opts.Own;
    if (this._children === null) {
        this._children = [child];
    } else {
        this._children[this._children.length] = child;
    }
};

/**
 * @protected
 * @this {Root}
 * @param {CleanupFn} cleanupFn
 * @returns {void}
 */
Root.prototype._addCleanup = function (cleanupFn) {
    if (this._cleanups === null) {
        this._cleanups = [cleanupFn];
    } else {
        this._cleanups[this._cleanups.length] = cleanupFn;
    }
};

/**
 * @protected
 * @this {Root}
 * @param {RecoverFn} recoverFn
 * @returns {void}
 */
Root.prototype._addRecover = function (recoverFn) {
    if (this._recovers === null) {
        this._recovers = [recoverFn];
    } else {
        this._recovers[this._recovers.length] = recoverFn;
    }
};

/**
 * @protected
 * @template T
 * @constructor
 * @implements {Child}
 */
function Reactive() { }

/* __EXCLUDE__ */

/**
 * @type {T}
 * @nocollapse
 * @throws {Error}
 */
Reactive.prototype.val;

/**
 * @type {T}
 * @readonly
 */
Reactive.prototype.peek;

/**
 * @protected
 * @type {number}
 */
Reactive.prototype._opt;

/**
 * @protected
 * @param {number} time
 * @returns {void}
 */
Reactive.prototype._dispose;

/**
 * @protected
 * @type {?Receive}
 */
Reactive.prototype._owner;

/**
 * @protected
 * @param {number} time
 * @returns {void}
 */
Reactive.prototype._recDispose;

/**
 * @protected
 * @param {Receive} Own
 * @param {number} time
 * @returns {void}
 */
Reactive.prototype._recMayDispose;

/**
 * @protected
 * @param {number} time
 * @returns {void}
 */
Reactive.prototype._update;

/* __EXCLUDE__ */

/**
 * @protected
 * @param {number} stage
 * @param {number} time 
 * @returns {void}
 */
Reactive.prototype._clearMayUpdate = NOOP;

/**
* 
* @param {*} ctor 
* @returns {boolean}
*/
function isReactive(ctor) {
    return ctor instanceof Reactive;
}

/**
 * @protected
 * @param {Send} send
 */
function disposeSender(send) {
    send._opt = Opts.Disposed;
    /** @type {number} */
    var ln;
    /** @const {?Receive} */
    var node1 = send._node1;
    /** @const {?Array<Receive>} */
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
    send._owner =
        send._eq =
        send._nodes =
        send._nodeslots = null;
}

/**
 * @protected
 * @param {Send} send 
 * @param {number} slot
 */
function removeReceiver(send, slot) {
    if (send._opt !== Opts.Disposed) {
        if (slot === -1) {
            send._node1 = null;
            if ((send._opt & Opts.SendMany) === 0) {
                send._opt &= ~Opts.Send;
            }
        } else {
            /** @const {?Array<Receive>} */
            var nodes = send._nodes;
            /** @const {?Array<number>} */
            var nodeslots = send._nodeslots;
            /** @const {Receive} */
            var last = nodes.pop();
            /** @const {number} */
            var lastslot = nodeslots.pop();
            /** @const {number} */
            var ln = nodes.length;
            if (slot !== ln) {
                nodes[slot] = last;
                nodeslots[slot] = lastslot;
                if (lastslot === -1) {
                    last._source1slot = slot;
                } else {
                    last._sourceslots[lastslot] = slot;
                }
            }
            if (ln === 0) {
                send._opt &= ~(Opts.SendMany | (send._node1 === null ? Opts.Send : 0));
            }
        }
    }
}

/**
 * @protected
 * @param {Receive} receive 
 * @param {number} slot
 */
function removeSender(receive, slot) {
    if (receive._opt !== Opts.Disposed) {
        if (slot === -1) {
            receive._source1 = null;
        } else {
            /** @const {?Array<Send>|void} */
            var sources = receive._sources;
            /** @const {?Array<number>|void} */
            var sourceslots = receive._sourceslots;
            /** @const {Send} */
            var last = sources.pop();
            /** @const {number} */
            var lastslot = sourceslots.pop();
            /** @const {number} */
            var ln = sources.length;
            if (slot !== ln) {
                sources[slot] = last;
                sourceslots[slot] = lastslot;
                if (lastslot === -1) {
                    last._node1slot = slot;
                } else {
                    last._nodeslots[lastslot] = slot;
                }
            }
            if (ln === 0) {
                receive._opt &= ~Opts.ReceiveMany;
            }
        }
    }
}

/**
 * @protected
 * @param {Send} send
 * @param {number} time
 */
function sendUpdate(send, time) {
    /** @type {number} */
    var ln;
    /** @type {?Receive} */
    var node1 = send._node1;
    /** @const {?Array<Receive>} */
    var nodes = send._nodes;
    if (node1 !== null && node1._age !== time) {
        node1._recUpdate(time);
    }
    if (nodes !== null && (ln = nodes.length) > 0) {
        for (var /** number */ i = 0; i < ln; i++) {
            node1 = nodes[i];
            if (node1._age !== time) {
                node1._recUpdate(time);
            }
        }
    }
}

/**
 * @protected
 * @param {Send} send
 * @param {number} time
 */
function sendMayUpdate(send, time) {
    /** @type {?Receive} */
    var node1 = send._node1;
    /** @const {?Array<Receive>} */
    var nodes = send._nodes;
    if (node1 !== null && node1._age !== time && (node1._opt & Opts.MayUpdate) === 0) {
        node1._recMayUpdate(time);
    }
    /** @type {number} */
    var ln;
    if (nodes !== null && (ln = nodes.length) > 0) {
        for (var /** number */ i = 0; i < ln; i++) {
            node1 = nodes[i];
            if (node1._age !== time && (node1._opt & Opts.MayUpdate) === 0) {
                node1._recMayUpdate(time);
            }
        }
    }
}

/**
 * @protected
 * @param {Array<Child>} children 
 * @param {number} time
 */
function sendDispose(children, time) {
    /** @const {number} */
    var ln = children.length;
    for (var /** number */ i = 0; i < ln; i++) {
        /** @const {Child} */
        var child = children[i];
        if ((child._opt & Opts.DisposeFlags) === 0) {
            child._recDispose(time);
        }
    }
}

/**
 * @protected
 * @param {Receive} owner
 * @param {Array<Child>} children 
 * @param {number} time
 */
function sendMayDispose(owner, children, time) {
    /** @const {number} */
    var ln = children.length;
    for (var /** number */ i = 0; i < ln; i++) {
        /** @const {Child} */
        var child = children[i];
        if ((child._opt & (Opts.DisposeFlags | Opts.MayDispose)) === 0) {
            child._recMayDispose(owner, time);
        }
    }
}

/**
 * @struct
 * @template T,U
 * @protected
 * @constructor
 * @extends {Reactive<T>}
 * @implements {Send<T,U>}
 * @implements {DataSignal<T>}
 * @param {number} opt
 * @param {U} set
 * @param {T} value
 * @param {(function(T,T): boolean)|falsy=} eq
 */
function Data(opt, set, value, eq) {
    /**
     * @protected
     * @type {number}
     */
    this._opt = opt | (eq == false ? Opts.Respond : ((eq === void 0) ? 0 : Opts.Compare));
    /**
     * @protected
     * @type {T}
     */
    this._value = value;
    /**
     * @protected
     * @type {?Receive}
     */
    this._owner = null;
    /**
     * @protected
     * @type {function(T,T): boolean}
     */
    this._eq = /** @type {function(T,T): boolean} */(eq);
    /**
     * @protected
     * @type {?Receive}
     */
    this._node1 = null;
    /**
     * @protected
     * @type {number}
     */
    this._node1slot = -1;
    /**
     * @protected
     * @type {?Array<Receive>}
     */
    this._nodes = null;
    /**
     * @protected
     * @type {?Array<number>}
     */
    this._nodeslots = null;
    /**
     * @protected
     * @type {U}
     */
    this._set = set;
    /** @const {?Own} */
    var owner = SCOPE._owner;
    if (owner !== null) {
        owner._addChild(this);
    }
}

/**
 * @protected
 * @template T
 * @this {Child<T>}
 * @returns {T}
 */
function peekData() {
    if ((this._opt & (Opts.DisposeFlags | Opts.MayDispose) === Opts.MayDispose)) {
        this._owner._clearMayUpdate(STAGE, TIME);
    }
    return this._value;
}

/**
 * @template T
 * @this {Data<T>}
 * @returns {T}
 */
function getData() {
    if ((this._opt & Opts.DisposeFlags) === 0 && SCOPE._listen) {
        logRead(this, /** @type {Receive} */(SCOPE._owner));
    }
    return this._value;
}

extendReactive(Data, Reactive, [], peekData, getData);

/**
 * @template T
 * @this {Data<T>}
 * @param {T} value
 * @returns {void}
 */
function setData(value) {
    /** @const {number} */
    var opt = this._opt;
    set: if ((opt & Opts.DisposeFlags) === 0) {
        if (
            (opt & Opts.Respond) !== 0 || (
                ((opt & Opts.Compare) === 0) ?
                    value !== this._value :
                    !this._eq(value, this._value)
            )
        ) {
            /** @const {number} */
            var time = TIME;
            /** @const {number} */
            var stage = STAGE;
            if (stage === Stage.Computes && (opt & Opts.MayDispose) !== 0) {
                if ((opt & Opts.MayCleared) !== 0) {
                    // cyclical Ownship ??
                    throw new Error();
                }
                this._opt |= Opts.MayCleared;
                this._owner._clearMayUpdate(stage, time);
                this._opt &= ~(Opts.MayFlags);
                if ((this._opt & Opts.DisposeFlags) !== 0) {
                    break set;
                }
            }
            if (this._set !== NIL && value !== this._set) {
                panic("conflicting values");
            }
            this._set = value;
            if (stage === Stage.Idle) {
                reset();
                this._update(TIME + 1);
                exec();
            } else {
                this._opt |= Opts.Update;
                CHANGES._add(this);
            }
        }
    }
}

/**
 * @param {T} value
 * @this {Data<T>}
 * @throws {Error}
 * @returns {void}
 */
Data.prototype.set = setData;

/**
 * @protected
 * @override
 * @this {Data<T>}
 * @param {number} time
 */
Data.prototype._dispose = function (time) {
    disposeSender(this);
    this._set = null;
    this._value = void 0;
};

/**
 * @protected
 * @this {Data<T>}
 * @param {number} time
 * @returns {void}
 */
Data.prototype._recDispose = function (time) {
    this._opt = Opts.Dispose;
};

/**
 * @protected
 * @this {Data<T>}
 * @param {Receive} owner
 * @param {number} time
 * @returns {void}
 */
Data.prototype._recMayDispose = function (owner, time) {
    this._opt |= Opts.MayDispose;
    if (this._owner === null) {
        this._owner = owner;
    }
};

/**
 * @protected
 * @this {Data<T>}
 * @param {number} time
 * @returns {void}
 */
Data.prototype._update = function (time) {
    this._value = this._set;
    this._set = NIL;
    this._opt &= ~(Opts.Update | Opts.MayFlags);
    if ((this._opt & Opts.Send) !== 0) {
        sendUpdate(this, time);
    }
};

/**
 * @struct
 * @template T,U
 * @protected
 * @constructor
 * @extends {Data<T,(function(T,U): T)>}
 * @implements {Own}
 * @implements {Receive}
 * @implements {Signal<T>}
 * @param {function(T,U,Func): T} fn 
 * @param {T} value 
 * @param {number} opt
 * @param {U=} args
 * @param {Source=} src
 * @param {(function(T,T): boolean)|falsy=} eq
 */
function Computation(fn, value, opt, args, src, eq) {
    Data.call(this, opt, fn.length < 3 ? fn : evalDispose(this, fn), value, eq);
    /**
     * @protected
     * @type {?Array<Child>}
     */
    this._children = null;
    /**
     * @protected
     * @type {?Array<CleanupFn>}
     */
    this._cleanups = null;
    /**
     * @protected
     * @type {?Array<RecoverFn>}
     */
    this._recovers = null;
    /**
     * @protected
     * @type {number}
     */
    this._age = 0;
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
    /**
     * @protected
     * @type {?Array<Send>}
     */
    this._sources = null;
    /**
     * @protected
     * @type {?Array<number>}
     */
    this._sourceslots = null;
    /**
     * @protected
     * @type {U}
     */
    this._args = args;
    if ((opt & Opts.Defer) === 0) {
        this._init(src);
    } else {
        this._opt &= ~Opts.Defer;
        if (src !== void 0) {
            logSource(this, src);
        }
    }
};

/**
 * @template T 
 * @this {Computation<T>}
 * @returns {T}
 */
function peekComputation() {
    if ((this._opt & Opts.DisposeFlags) === 0 && (this._opt & (Opts.Update | Opts.MayDispose | Opts.MayUpdate)) !== 0) {
        this._clearMayUpdate(STAGE, TIME);
    }
    return this._value;
}

/**
 * @template T
 * @this {Computation<T>}
 * @returns {T}
 */
function getComputation() {
    /** @const {number} */
    var opt = this._opt;
    /** @const {number} */
    var stage = STAGE;
    if ((opt & Opts.DisposeFlags) === 0 && stage !== Stage.Idle) {
        if ((opt & (Opts.Update | Opts.MayUpdate | Opts.MayDispose)) !== 0) {
            this._clearMayUpdate(stage, TIME);
        }
        if ((this._opt & Opts.DisposeFlags) === 0 && SCOPE._listen) {
            logRead(this, /** @type {Receive} */(SCOPE._owner));
        }
    }
    return this._value;
}

extendReactive(Computation, Reactive, [Root], peekComputation, getComputation);

/**
 * @template T,U
 * @param {function(T,U,Func): T} fn 
 * @returns {function(T,U): T}
 */
function evalDispose(node, fn) {
    /** @type {Func} */
    var disposer = function () { dispose(node); };
    return function (seed, args) {
        return fn(seed, args, disposer);
    };
}

/**
 * @template T,U
 * @param {Func} src
 * @param {function(T,U,Func): T} fn 
 * @returns {function(T,U,Func): T}
 */
function evalSource(src, fn) {
    return fn.length < 3 ? function (seed, args) {
        src();
        SCOPE._listen = false;
        return /** @type {function(T,U): T} */(fn)(seed, args);
    } : function (seed, args, disposer) {
        src();
        SCOPE._listen = false;
        return fn(seed, args, disposer);
    };
}

/**
 * @param {Receive} node
 * @param {Source} sources 
 * @returns {void}
 */
function logSource(node, sources) {
    if (Array.isArray(sources)) {
        /** @const {number} */
        var ln = sources.length;
        for (var i = 0; i < ln; i++) {
            logRead(/** @type {Array<Send>} */(sources)[i], node);
        }
    } else {
        logRead(/** @type {Send} */(sources), node);
    }
    SCOPE._listen = false;
}

/* __EXCLUDE__ */

/**
 * @protected
 * @param {Child} child
 * @returns {void}
 */
Computation.prototype._addChild;

/**
 * @protected
 * @param {CleanupFn} cleanupFn 
 */
Computation.prototype._addCleanup;

/**
 * @protected
 * @param {RecoverFn} recoverFn 
 */
Computation.prototype._addRecover;

/* __EXCLUDE__ */

/**
 * 
 * @param {Receive} node 
 */
function disposeReceiver(node) {
    if (node._source1 !== null) {
        removeReceiver(node._source1, node._source1slot);
        node._source1 = null;
    }
    if ((node._opt & Opts.ReceiveMany) !== 0) {
        /** @type {number} */
        var ln;
        /** @const {?Array<Send>|void} */
        var sources = node._sources;
        if (sources !== null && (ln = sources.length) !== 0) {
            /** @const {?Array<number>|void} */
            var sourceslots = node._sourceslots;
            for (; ln-- !== 0;) {
                removeReceiver(sources.pop(), sourceslots.pop());
            }
        }
    }
    node._opt &= ~(Opts.Receive | Opts.ReceiveMany);
};

/**
 * @protected
 * @override
 * @this {Computation<T>}
 * @param {number} time
 * @returns {void}
 */
Computation.prototype._dispose = function (time) {
    disposeOwner(this, time);
    disposeSender(this);
    disposeReceiver(this);
    this._set =
        this._args =
        this._sources =
        this._sourceslots = /** @type {?} */(null);
    this._value = void 0;
};

/**
 * @protected
 * @override
 * @this {Computation<T>}
 * @param {number} time
 * @returns {void}
 */
Computation.prototype._recDispose = function (time) {
    /** @const {number} */
    var opt = this._opt;
    this._age = time;
    this._opt = (opt | Opts.Dispose) & ~Opts.Update;
    /*
     * If age is current, then this computation has already been
     * flagged for update and been enqueued in COMPUTES or RESPONDS.
     */
    if ((opt & (Opts.MayUpdate | Opts.Own)) === Opts.Own) {
        sendDispose(this._children, time);
    }
};

/**
 * @protected
 * @override
 * @this {Computation<T>}
 * @param {Receive} owner
 * @param {number} time
 * @returns {void}
 */
Computation.prototype._recMayDispose = function (owner, time) {
    /** @const {number} */
    var opt = this._opt;
    this._opt = (opt | Opts.MayDispose) & ~Opts.MayCleared;
    if (this._owner === null) {
        this._owner = owner;
    }
    if ((opt & (Opts.MayUpdate | Opts.Own)) === Opts.Own) {
        sendMayDispose(this, this._children, time);
    }
};

/**
 * @this {Computation<T>}
 * @param {Source=} src
 * @returns {void} 
 */
Computation.prototype._init = function (src) {
    /** @const {?Own} */
    var _owner = SCOPE._owner;
    /** @const {boolean} */
    var _listen = SCOPE._listen;
    /** @const {number} */
    var opt = this._opt;
    SCOPE._owner = this;
    SCOPE._listen = true;
    if (STAGE === Stage.Idle) {
        reset();
        STAGE = Stage.Started;
        try {
            if ((opt & Opts.Bound) !== 0) {
                logSource(this, /** @type {Source} */(src));
            }
            this._value = this._set(this._value, this._args);
            if (CHANGES._count !== 0 || DISPOSES._count !== 0) {
                start();
            }
        } finally {
            STAGE = Stage.Idle;
            SCOPE._owner = null;
            SCOPE._listen = false;
        }
    } else {
        if ((opt & Opts.Bound) !== 0) {
            logSource(this, /** @type {Source} */(src));
        }
        this._value = this._set(this._value, this._args);
    }
    SCOPE._owner = _owner;
    SCOPE._listen = _listen;
};

/**
 * @protected
 * @override
 * @this {Computation<T>}
 * @param {number} time
 * @returns {void}
 */
Computation.prototype._update = function (time) {
    /** @type {number} */
    var i;
    /** @type {number} */
    var ln;
    /** @const {?Own} */
    var owner = SCOPE._owner;
    /** @const {boolean} */
    var listen = SCOPE._listen;
    SCOPE._owner = null;
    SCOPE._listen = false;
    /** @type {number} */
    var opt = this._opt;
    /** @const {?Array<Child>} */
    var children = this._children;
    if ((opt & Opts.Own) !== 0) {
        for (i = 0, ln = children.length; i < ln; i++) {
            children[i]._dispose(time);
        }
        children.length = 0;
        this._opt &= ~Opts.Own;
    }
    /** @const {?Array<CleanupFn>} */
    var cleanups = this._cleanups;
    if (cleanups !== null && (ln = cleanups.length) !== 0) {
        for (i = 0; i < ln; i++) {
            cleanups[i](false);
        }
        cleanups.length = 0;
    }
    SCOPE._owner = this;
    if ((opt & Opts.Static) !== 0) {
        SCOPE._listen = false;
    } else {
        SCOPE._listen = true;
        disposeReceiver(this);
    }
    /** @const {T} */
    var value = this._value;
    this._opt |= Opts.Updated;
    this._value = this._set(value, this._args);
    if (
        (opt & (Opts.Send | Opts.Respond)) === Opts.Send && (
            (opt & Opts.Compare) === 0 ?
                value !== this._value :
                !this._eq(value, this._value)
        )
    ) {
        sendUpdate(this, time);
    }
    this._opt &= ~(Opts.UpdateFlags | Opts.MayFlags);
    SCOPE._owner = owner;
    SCOPE._listen = listen;
};

/**
 * @protected
 * @this {Computation<T>}
 * @param {number} time
 * @returns {void}
 */
Computation.prototype._recUpdate = function (time) {
    /** @const {number} */
    var opt = this._opt;
    this._age = time;
    this._opt |= Opts.Update;
    if ((opt & Opts.Own) !== 0) {
        sendDispose(this._children, time);
    }
    if ((opt & (Opts.Send | Opts.Respond)) === Opts.Send) {
        COMPUTES._add(this);
        if ((opt & Opts.MayUpdate) === 0) {
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
 * @this {Computation<T>}
 * @param {number} time
 * @returns {void}
 */
Computation.prototype._recMayUpdate = function (time) {
    /** @const {number} */
    var opt = this._opt;
    this._opt = (opt | Opts.MayUpdate) & ~Opts.MayCleared;
    if ((opt & (Opts.MayDispose | Opts.Own)) === Opts.Own) {
        sendMayDispose(this, this._children, time);
    }
    if ((opt & Opts.Send) !== 0) {
        sendMayUpdate(this, time);
    }
};

/**
 * @protected
 * @override
 * @throws {Error}
 * @this {Computation<T>}
 * @param {number} stage
 * @param {number} time
 * @returns {void} 
 */
Computation.prototype._clearMayUpdate = function (stage, time) {
    if ((this._opt & Opts.DisposeFlags) === 0) {
        if ((this._opt & Opts.MayCleared) !== 0) {
            panic("cyclic dependency");
        }
        this._opt |= Opts.MayCleared;
        if ((this._opt & Opts.MayDispose) !== 0) {
            this._owner._clearMayUpdate(stage, time);
            this._opt &= ~Opts.MayDispose;
        }
        if ((this._opt & (Opts.DisposeFlags | Opts.MayUpdate)) === Opts.MayUpdate) {
            check: {
                /** @type {?Send} */
                var source1 = this._source1;
                if (source1 !== null && (source1._opt & Opts.MayUpdate) !== 0) {
                    source1._clearMayUpdate(stage, time);
                    if (this._age === time) {
                        break check;
                    }
                }
                if ((this._opt & (Opts.ReceiveMany | Opts.MayUpdate)) === (Opts.ReceiveMany | Opts.MayUpdate)) {
                    /** @type {number} */
                    var ln;
                    /** @const {?Array<Send>} */
                    var sources = this._sources;
                    if (sources !== null && (ln = sources.length) > 0) {
                        for (var /** number */ i = 0; i < ln; i++) {
                            source1 = sources[i];
                            if ((source1._opt & Opts.MayUpdate) !== 0) {
                                source1._clearMayUpdate(stage, time);
                                if (this._age === time) {
                                    break check;
                                }
                            }
                        }
                    }
                }
            }
            this._opt &= ~Opts.MayUpdate;
        }
        this._opt &= ~Opts.MayCleared;
        if ((this._opt & Opts.Update) !== 0 && this._age === time) {
            if ((this._opt & Opts.Updated) !== 0) {
                panic("cyclic dependency");
            }
            this._update(time);
        }
    }
};

/* __EXCLUDE__ */

/**
 * @const 
 * @enum {number}
 */
export var Mut = {
    RemoveOne: 1,
    RemoveRange: 2,
    Remove: 3,
    InsertOne: 4,
    InsertRange: 8,
    Insert: 12,
    ReplaceOne: 16,
    ReplaceRange: 32,
    Replace: 48,
    Range: 42,
    Head: 64,
    Tail: 128,
    Sides: 192,
    Reverse: 256,
    Sort: 512,
    Resize: 1024,
    Clear: 2048,
    Custom: 4096,
};

/**
 * @const
 * @enum {number}
 */
export var ColIndex = {
    Init: -2,
    NoChange: 0,
    Source: 0,
    Changed: 1,
    Mut: 2,
    Args: 3
};

/**
 * @const
 * @enum {number}
 */
export var MutIndex = {
    Type: 0,
    Start: 1,
    End: 2,
    Args: 3,
};

/* __EXCLUDE__ */

/**
 * 
 * @param {number|void} i 
 * @param {number} length
 * @param {number} empty
 * @returns {number}
 */
function index(i, length, empty) {
    if (i == null) {
        i = empty;
    } else if (i < 0) {
        if (i < -length) {
            i = 0;
        } else {
            i += length;
        }
    } else if (i > length) {
        i = length;
    }
    return i;
}

/* __EXCLUDE__ */

/**
 * @interface
 */
function Indexed() { }

/**
 * @protected
 * @type {?Signal<number>}
 */
Indexed.prototype._length;

/**
 * @protected
 * @type {Array}
 */
Indexed.prototype._mut;

/* __EXCLUDE__ */

/**
 * @struct
 * @protected
 * @template T,U
 * @constructor
 * @extends {Data<Array<T>,U>}
 * @implements {Indexed}
 * @implements {IterableSignal<T>}
 */
function Collection() { }

Collection.prototype = new Reactive();

/**
 * 
 * @param {Function} ctor 
 * @param {Array<Function>} inherits 
 * @param {function(): *} peekVal 
 * @param {function(): *} getVal 
 */
function extendCollection(ctor, inherits, peekVal, getVal) {
    extendReactive(ctor, Collection, inherits, peekVal, getVal);
    Object.defineProperties(ctor.prototype, { length: { get: getLength } });
}

/**
 * 
 * @param {*} obj 
 * @returns {boolean}
 */
function isCollection(obj) {
    return obj instanceof Collection;
}

/**
 * @template T
 * @param {number} _ 
 * @param {Collection<T>} src
 * @returns {number}
 */
function readLength(_, src) {
    return src.peek.length;
}

/**
 * @template T
 * @this {Collection<T>}
 * @returns {Signal<number>}
 */
function getLength() {
    if (this._length === null) {
        this._length = new Computation(readLength, this.peek.length, Opts.Static | Opts.Bound | Opts.Defer, this, this);
    }
    return this._length;
}

/* __EXCLUDE__ */

/**
 * @readonly
 * @type {Signal<number>}  
 */
Collection.prototype.length;

/**
 * @protected
 * @type {?Signal<number>}
 */
Collection.prototype._length;

/**
 * @protected
 * @type {Array}
 */
Collection.prototype._mut;

/**
 * @protected
 * @type {Array}
 */
Collection.prototype._args;

/* __EXCLUDE__ */

/**
 * @public
 * @this {Collection<T>}
 * @returns {Array}
 */
Collection.prototype.mut = function () {
    if ((this._opt & (Opts.DisposeFlags)) === 0 && (this._opt & (Opts.Update | Opts.MayDispose | Opts.MayUpdate)) !== 0) {
        this._clearMayUpdate(STAGE, TIME);
    }
    return this._mut;
};

/**
 * @template T
 * @param {T|undefined} seed 
 * @param {Array} args 
 * @returns {T|undefined}
 */
function at(seed, args) {
    /** @const {Collection<T>} */
    var src = args[0];
    /** @const {Array<T>} */
    var srcArray = src.val;
    /** @const {number} */
    var index = args[1] ? args[2].val : args[2];
    return index >= 0 && index < srcArray.length ? srcArray[index] : void 0;
}

/**
 * @public
 * @this {Collection<T,?>}
 * @param {Signal<number>|number} index 
 * @returns {Signal<T|undefined>}
 */
Collection.prototype.at = function (index) {
    return new Computation(at, void 0, Opts.Static | Opts.Bound, [this, isReactive(index), index], this);
};

/**
 * @public
 * @this {Collection<T,?>}
 * @param {...(T|Array<T>|IterableSignal<T>)} items
 * @returns {IterableSignal<T>} 
 */
Collection.prototype.concat = function (items) {

};

/**
 * @public
 * @this {Collection<T,?>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<boolean>}
 */
Collection.prototype.every = function (callbackFn) { };

/**
 * @public
 * @this {Collection<T,?>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {IterableSignal<T>}
 */
Collection.prototype.filter = function (callbackFn) { };

/**
 * @public
 * @this {Collection<T,?>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<T|undefined>}
 */
Collection.prototype.find = function (callbackFn) { };

/**
 * @public
 * @this {Collection<T,?>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<number>}
 */
Collection.prototype.findIndex = function (callbackFn) { };

/**
 * @public
 * @this {Collection<T,?>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<T|undefined>}
 */
Collection.prototype.findLast = function (callbackFn) { };

/**
 * @public
 * @this {Collection<T,?>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<number>}
 */
Collection.prototype.findLastIndex = function (callbackFn) { };

/**
 * @public
 * @this {Collection<T,?>}
 * @param {function(T,number): void} callbackFn
 * @returns {void} 
 */
Collection.prototype.forEach = function (callbackFn) { };

/**
 * @public
 * @this {Collection<T,?>}
 * @param {Signal<T>|T} searchElement
 * @returns {Signal<boolean>}
 */
Collection.prototype.includes = function (searchElement) { };

/**
 * @public
 * @this {Collection<T,?>}
 * @param {Signal<T>|T} searchElement 
 * @param {Signal<number>|number=} fromIndex
 * @returns {Signal<number>}
 */
Collection.prototype.indexOf = function (searchElement, fromIndex) { };

/**
 * @template T
 * @param {Array<T>} array 
 * @param {T} item 
 * @param {number} start 
 * @param {number} end 
 * @param {number} dir
 * @returns {number} 
 */
function findByValue(array, item, start, end, dir) {
    for (; start !== end; start += dir) {
        if (array[start] === item) {
            return start;
        }
    }
    return -1;
}

/**
 * @template T
 * @param {Array<T>} array 
 * @param {function(T,number): boolean} fn 
 * @param {boolean} target 
 * @param {number} start 
 * @param {number} end 
 * @param {number} dir 
 * @returns {number}
 */
function findByCallback(array, fn, target, start, end, dir) {
    for (; start !== end; start += dir) {
        if (fn(array[start], start) === target) {
            return start;
        }
    }
    return -1;
}

/**
 * 
 * @param {string} _
 * @param {Array} args
 * @returns {string}
 */
function join(_, args) {
    return args[0].val.join(args[1] ? args[2].val : args[2]);
};

/**
 * @public
 * @this {Collection<T,?>}
 * @param {Signal<string>|string=} separator
 * @returns {Signal<string>}
 */
Collection.prototype.join = function (separator) {
    return new Computation(join, '', Opts.Static, [this, isReactive(separator), separator]);
};

/**
 * 
 * @template T
 * @param {number} _ 
 * @param {Array} args 
 * @returns {number}
 */
function lastIndexOf(_, args) {
    return /** @type {Collection<T>} */(args[0])._value.lastIndexOf(
        /** @type {T} */(args[1]),
        /** @type {number|void} */(args[2])
    );
}

/**
 * @public
 * @this {Collection<T,?>}
 * @param {Signal<T>|T} searchElement 
 * @param {Signal<number>|number=} fromIndex
 * @returns {Signal<number>}
 */
Collection.prototype.lastIndexOf = function (searchElement, fromIndex) {
    return new Computation(lastIndexOf, -2, Opts.Static | Opts.Bound, [this, searchElement, fromIndex], this);
};

/**
 * @public
 * @template U
 * @this {Collection<T,?>}
 * @param {function(T,!Signal<number>): U} callbackFn
 * @returns {IterableSignal<U>}
 */
Collection.prototype.map = function (callbackFn) { };

/**
 * @public
 * @template U
 * @this {Collection<T,?>}
 * @param {function((T|U),T,number): U} callbackFn 
 * @param {Signal<U>|U=} initialValue 
 * @returns {Signal<U>}
 */
Collection.prototype.reduce = function (callbackFn, initialValue) { };

/**
 * @public
 * @template U
 * @this {Collection<T,?>}
 * @param {function((T|U),T,number): U} callbackFn 
 * @param {Signal<U>|U=} initialValue 
 * @returns {Signal<U>}
 */
Collection.prototype.reduceRight = function (callbackFn, initialValue) { };

/**
 * @template T
 * @param {Array<T>} seed 
 * @param {Array} args
 * @returns {Array<T>}
 */
function copy(seed, args) {
    /** @const {Collection<T>} */
    var src = args[ColIndex.Source];
    /** @const {Array<T>} */
    var srcArray = src.val;
    /** @type {Array} */
    var mut = src.mut();
    /** @const {number} */
    var length = srcArray.length;
    applyMutation(seed, mut);
    if (seed.length !== length) {
        seed.length = length;
    }
    return seed;
}

/**
 * @template T
 * @param {Array<T>} seed
 * @param {Array} args [
 *  StartReactive: boolean,
 *  Start: Signal<number>|number,
 *  PrevStart: number,
 *  EndReactive: boolean,
 *  End: Signal<number>|number,
 *  PrevEnd: number,
 * ] 
 * @returns 
 */
function slice(seed, args) {
    // /** @const {Collection<T>} */
    // var src = args[ColIndex.Source];
    // /** @const {Array<T>} */
    // var srcArray = src.val;
    // /** @type {number} */
    // var length = srcArray.length;
    // /** @const {Array<Signal<number>|number>} */
    // var params = args[ColIndex.Args];
    // /** @const {Array} */
    // var srcMut = src.mut();
    // /** @const {number} */
    // var mutStart = srcMut[MutIndex.Start];
    // /** @const {number} */
    // var mutEnd = srcMut[MutIndex.End];
    // /** @const {number} */
    // var prevStart = /** @type {number} */(params[2]);
    // /** @const {number} */
    // var prevEnd = /** @type {number} */(params[5]);
    // /** @type {number}  */
    // var start = params[2] = index(params[0] ? /** @type {Signal<number>} */(params[1]).val : /** @type {number} */(params[1]), length, 0);
    // /** @type {number} */
    // var end = params[5] = index(params[3] ? /** @type {Signal<number>} */(params[4]).val : /** @type {number} */(params[4]), length, length - 1);
    // length = 1 + end - start;
    // /** @const {Array} */
    // var mut = this._mut;
    // if (end <= start) {
    //     /** @const {number} */
    //     var ln = seed.length;
    //     if (ln === 0) {
    //         args[ColIndex.Changed] = ColIndex.NoChange;
    //     }
    //     seed.length = 0;
    //     mutType = Mut.Clear;
    // } else if (prevStart !== -1) {
    //     if (!(mutEnd <= start || mutStart >= end)) {
    //         if (mutStart > start) {
    //             start = mutStart;
    //         }
    //         if (mutEnd < end) {
    //             end = mutEnd;
    //         }
    //     } else if (prevStart === start && prevEnd === end) {
    //         args[ColIndex.Changed] = ColIndex.NoChange;
    //         return seed;
    //     }
    // }
    // mut[MutIndex.Type] = Mut.ReplaceRange | (length !== seed.length ? Mut.Resize : 0);
    // mut[MutIndex.Start] = start;
    // mut[MutIndex.End] = end;
    // mut[MutIndex.Args] = srcArray;
    // for (prevStart = 0; start <= end; start++, prevStart++) {
    //     seed[prevStart] = srcArray[start];
    // }
    // if (seed.length !== length) {
    //     seed.length = length;
    // }
    return seed;
}

/**
 * @public
 * @this {Collection<T,?>}
 * @param {Signal<number>|number=} start
 * @param {Signal<number>|number=} end
 * @returns {IterableSignal<T>}
 */
Collection.prototype.slice = function (start, end) {
    /** @const {number} */
    var ln = arguments.length;
    if (ln === 0) {
        return new Enumerable(this, copy);
    }
    return new Enumerable(this, slice, [isReactive(start), start, -1, isReactive(end), end, -1]);
};

/**
 * @param {boolean} seed 
 * @param {Array} args [
 *  source: Collection,
 *  init: -2 | 0,
 *  index: number,
 *  callbackFn: function(T, number): boolean
 * ]
 * @returns {boolean}
 */
function some(seed, args) {
    /** @const {Collection} */
    var src = args[0];
    /** @const {Array} */
    var srcArray = src.val;
    /** @const {Array} */
    var mut = src.mut();
    /** @type {number} */
    var start = 0;
    if (args[1] === ColIndex.Init) {
        args[1] = 0;
    } else {
        start = mut[MutIndex.Start];
        /*
         * Either we found a match on the previous iteration and this cycle
         * only mutated indices after the match position, or we didn't find
         * any match last time and we have not inserted any new elements.
         */
        if (seed ? args[2] < start : (mut[MutIndex.Type] & Mut.Insert) === 0) {
            return seed;
        }
    }
    return (args[2] = findByCallback(srcArray, args[3], true, start, srcArray.length, 1)) !== -1;
}

/**
 * @public
 * @this {Collection<T,?>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<boolean>} 
 */
Collection.prototype.some = function (callbackFn) {
    return new Computation(some, false, Opts.Bound | Opts.Static, [this, ColIndex.Init, 0, callbackFn], this);
};

/**
 * @struct
 * @template T
 * @constructor
 * @extends {Data<T,nil>}
 * @implements {Indexed}
 * @implements {ArraySignal<T>}
 * @param {Array<T>=} value
 * @param {(function(Array<T>,Array<T>): boolean)|falsy=} eq
 */
function DataArray(value, eq) {
    value = value || [];
    Data.call(this, Opts.Respond, NIL, value, eq);
    /**
     * @protected
     * @type {Array}
     */
    this._mut = [Mut.ReplaceRange, 0, value.length - 1, 0];
    /**
     * @protected
     * @type {?Computation<number>}
     */
    this._length = null;
    /**
     * @protected
     * @type {Array}
     */
    this._smut = [];
}

extendCollection(DataArray, [Data], peekData, getData);

/* __EXCLUDE__ */

/**
 * @public
 * @readonly
 * @type {Signal<number>}
 */
DataArray.prototype.length;

/**
 * @public
 * @returns {Array}
 */
DataArray.prototype.mut;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {Signal<number>|number} index 
 * @returns {Signal<T|undefined>}
 */
DataArray.prototype.at;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {...(T|Array<T>|IterableSignal<T>)} items
 * @returns {IterableSignal<T>} 
 */
DataArray.prototype.concat;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<boolean>}
 */
DataArray.prototype.every;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {IterableSignal<T>}
 */
DataArray.prototype.filter;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<T|undefined>}
 */
DataArray.prototype.find;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<number>}
 */
DataArray.prototype.findIndex;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<T|undefined>}
 */
DataArray.prototype.findLast;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<number>}
 */
DataArray.prototype.findLastIndex;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): void} callbackFn
 * @returns {void} 
 */
DataArray.prototype.forEach;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {Signal<T>|T} searchElement
 * @returns {Signal<boolean>}
 */
DataArray.prototype.includes;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {Signal<T>|T} searchElement 
 * @param {Signal<number>|number=} fromIndex
 * @returns {Signal<number>}
 */
DataArray.prototype.indexOf;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {Signal<string>|string=} separator
 * @returns {Signal<string>}
 */
DataArray.prototype.join;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {Signal<T>|T} searchElement 
 * @param {Signal<number>|number=} fromIndex
 * @returns {Signal<number>}
 */
DataArray.prototype.lastIndexOf;

/**
 * @public
 * @template U
 * @this {IterableSignal<T>}
 * @param {function(T,!Signal<number>): U} callbackFn
 * @returns {IterableSignal<U>}
 */
DataArray.prototype.map;

/**
 * @public
 * @template U
 * @this {IterableSignal<T>}
 * @param {function((T|U),T,number): U} callbackFn 
 * @param {Signal<U>|U=} initialValue 
 * @returns {Signal<U>}
 */
DataArray.prototype.reduce;

/**
 * @public
 * @template U
 * @this {IterableSignal<T>}
 * @param {function((T|U),T,number): U} callbackFn
 * @param {Signal<U>|U=} initialValue 
 * @returns {Signal<U>}
 */
DataArray.prototype.reduceRight;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {Signal<number>|number=} start
 * @param {Signal<number>|number=} end
 * @returns {IterableSignal<T>}
 */
DataArray.prototype.slice;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<boolean>} 
 */
DataArray.prototype.some;

/* __EXCLUDE__ */

/**
 * @template T
 * @param {DataArray<T>} node
 * @param {number} mut 
 * @param {number} start
 * @param {number} end
 * @param {T|Array<T>|number|(function(T,T): number)=} args 
 * @returns {void}
 */
function mutate(node, mut, start, end, args) {
    if (node._set !== NIL) {
        panic("conflicting mutation");
    }
    var smut = node._smut;
    smut[MutIndex.Type] = mut;
    smut[MutIndex.Start] = start;
    smut[MutIndex.End] = end;
    smut[MutIndex.Args] = args;
    setData.call(node, MUT);
}

/**
 * @template T
 * @param {Array<T>} array 
 * @param {Array} mut 
 */
function applyMutation(array, mut) {
    /** @const {?} */
    var args = mut[MutIndex.Args];
    var type = mut[MutIndex.Type];
    switch (type) {
        case Mut.Clear:
            array.length = 0;
            break;
        case Mut.RemoveOne | Mut.Tail:
            array.length--;
            break;
        case Mut.RemoveRange | Mut.Tail:
            array.length -= args;
            break;
        case Mut.InsertOne | Mut.Tail:
            array[array.length] = args;
            break;
        case Mut.InsertRange | Mut.Tail:
            array.push.apply(array, args);
            break;
        case Mut.ReplaceOne:
            array[mut[MutIndex.Start]] = args;
            break;
        case Mut.ReplaceRange:
        case Mut.ReplaceRange | Mut.Resize:
            /** @type {number} */
            var start = mut[MutIndex.Start];
            /** @type {number} */
            var end = mut[MutIndex.End];
            for (var i = 0; start <= end; start++, i++) {
                array[start] = args[i];
            }
            if ((type & Mut.Resize) !== 0) {
                array.length = args.length;
            }
            break;
        case Mut.RemoveOne | Mut.Head:
            array.shift();
            break;
        case Mut.InsertOne | Mut.Head:
            array.unshift(args);
            break;
        case Mut.InsertRange | Mut.Head:
            array.unshift.apply(array, args);
            break;
        case Mut.Reverse:
            array.reverse();
            break;
        case Mut.Sort:
            array.sort(args);
            break;
        case Mut.Custom:
            // todo
            break;
        default:
            array.splice.apply(array, args);
    }
}

/**
 * @public
 * @override
 * @this {DataArray<T>}
 * @param {Array<T>|number} value 
 * @param {T=} item 
 * @returns {void}
 */
DataArray.prototype.set = function (value, item) {
    /** @const {number} */
    var ln = arguments.length;
    if (ln === 1) {
        /** @const {number} */
        var length = value.length;
        mutate(this, Mut.ReplaceRange | (length !== this._value.length ? Mut.Resize : 0), 0, length - 1, value);
    } else if (ln > 0) {
        mutate(this, Mut.ReplaceOne, /** @type {number} */(value), /** @type {number} */(value), item);
    }
};

/**
 * @protected
 * @override
 * @this {DataArray<T>}
 * @param {number} time
 * @returns {void}
 */
DataArray.prototype._update = function (time) {
    /** @const {Array} */
    var mut = this._mut;
    /** @const {Array} */
    var smut = this._smut;
    if (this._value !== smut[MutIndex.Args]) {
        applyMutation(this._value, smut);
    }
    mut[MutIndex.Args] = 0;
    this._smut = mut;
    this._mut = smut;
    this._set = NIL;
    this._opt &= ~(Opts.Update | Opts.MayFlags);
    if ((this._opt & Opts.Send) !== 0) {
        sendUpdate(this, time);
    }
};

/**
 * @public
 * @this {DataArray<T>}
 * @throws {Error}
 * @returns {void}
 */
DataArray.prototype.pop = function () {
    /** @const {number} */
    var length = this._value.length;
    if (length !== 0) {
        mutate(this, Mut.RemoveOne | Mut.Tail, length - 1, length - 1);
    }
};

/**
 * @public
 * @this {DataArray<T>}
 * @param {...T} elementN
 * @throws {Error}
 * @returns {void}
 */
DataArray.prototype.push = function (elementN) {
    /** @const {Arguments} */
    var args = arguments;
    /** @const {number} */
    var ln = args.length;
    /** @const {number} */
    var length = this._value.length;
    if (ln === 1) {
        mutate(this, Mut.InsertOne | Mut.Tail, length, length, elementN);
    } else if (ln > 0) {
        /** @type {number} */
        var i = 0;
        /** @const {Array<T|number>} */
        var params = new Array(ln);
        for (; i < ln; i++) {
            params[i] = args[i];
        }
        mutate(this, Mut.InsertRange | Mut.Tail, length, length + ln - 1, params);
    }
};

/**
 * @public
 * @this {DataArray<T>}
 * @throws {Error}
 * @returns {void}
 */
DataArray.prototype.reverse = function () {
    /** @const {number} */
    var length = this._value.length;
    if (length !== 0) {
        mutate(this, Mut.Reverse, 0, length - 1);
    }
};

/**
 * @public
 * @this {DataArray<T>}
 * @throws {Error}
 * @returns {void}
 */
DataArray.prototype.shift = function () {
    /** @const {number} */
    var length = this._value.length;
    if (length !== 0) {
        mutate(this, Mut.RemoveOne | Mut.Head, 0, 0);
    }
};

/**
 * @public
 * @this {DataArray<T>}
 * @param {function(T,T): number=} compareFn
 * @throws {Error}
 * @returns {void}
 */
DataArray.prototype.sort = function (compareFn) {
    /** @const {number} */
    var length = this._value.length;
    if (length !== 0) {
        mutate(this, Mut.Sort, 0, length - 1, compareFn);
    }
};

/**
 * @public
 * @this {DataArray<T>}
 * @param {number} start 
 * @param {number=} deleteCount 
 * @param {...T} items
 * @throws {Error}
 * @returns {void}
 */
DataArray.prototype.splice = function (start, deleteCount, items) {
    /** @const {Arguments} */
    var args = arguments;
    /** @const {number} */
    var ln = args.length;
    if (ln > 0) {
        /** @type {number} */
        var mut = 0;
        /** @const {number} */
        var length = this._value.length;
        /** @const {number} */
        var insertCount = ln > 2 ? ln - 2 : 0;
        /** @type {Array<T|Array<T>|number>} */
        var params;
        start = index(start, length, 0);
        if (start === length) {
            deleteCount = 0;
        } else if (ln < 2 || deleteCount >= length - start) {
            deleteCount = length - start;
        }
        if (insertCount === 0 && deleteCount === 0) {
            return;
        }
        if (deleteCount !== length || insertCount !== 0) {
            if (insertCount > 0 && deleteCount > 0) {
                if (insertCount > 1 && deleteCount > 1) {
                    mut |= Mut.ReplaceRange;
                } else {
                    mut |= Mut.ReplaceOne;
                }
                /** @const {number} */
                var diff = insertCount - deleteCount;
                if (diff >= 1) {
                    if (diff > 1) {
                        mut |= Mut.InsertRange;
                    } else {
                        mut |= Mut.InsertOne;
                    }
                } else if (diff <= -1) {
                    if (diff < -1) {
                        mut |= Mut.RemoveRange;
                    } else {
                        mut |= Mut.RemoveOne;
                    }
                }
            } else if (insertCount > 0) {
                if (insertCount > 1) {
                    mut |= Mut.InsertRange;
                } else {
                    mut |= Mut.InsertOne;
                }
            } else {
                if (deleteCount > 1) {
                    mut |= Mut.RemoveRange;
                } else {
                    mut |= Mut.RemoveOne;
                }
            }
            if (start === 0) {
                mut |= Mut.Head;
            } else if (start === length || deleteCount >= (length - start)) {
                mut |= Mut.Tail;
            }
            if (
                mut === Mut.ReplaceOne || (
                    (mut & (Mut.ReplaceOne | Mut.Range)) === 0 &&
                    ((mut & Mut.Sides) !== 0)
                )
            ) {
                if ((mut & (Mut.ReplaceOne | Mut.InsertOne)) !== 0) {
                    params = items;
                }
            } else {
                /** @type {number} */
                var i = 0;
                /** @type {number} */
                var j = (
                    mut === (Mut.InsertRange | Mut.Tail) ||
                    mut === (Mut.InsertRange | Mut.Head) ||
                    mut === Mut.ReplaceRange
                ) ? 2 : 0;
                params = new Array(ln - j);
                for (; j < ln; i++, j++) {
                    params[i] = args[j];
                }
            }
        }
        mutate(
            this,
            mut,
            start,
            start + (deleteCount > insertCount ? deleteCount : insertCount) - 1,
            params
        );
    }
};

/**
 * @public
 * @this {DataArray<T>}
 * @param {...T} elementN
 * @throws {Error} 
 * @returns {void}
 */
DataArray.prototype.unshift = function (elementN) {
    /** @const {Arguments} */
    var args = arguments;
    /** @const {number} */
    var ln = args.length;
    if (ln === 1) {
        mutate(this, Mut.InsertOne | Mut.Head, 0, 0, elementN);
    } else if (ln > 0) {
        /** @type {number} */
        var i = 0;
        /** @const {Array<T>} */
        var params = new Array(ln);
        for (; i < ln; i++) {
            params[i] = args[i];
        }
        mutate(this, Mut.InsertRange | Mut.Head, 0, ln - 1, params);
    }
};

/**
 * @struct
 * @public
 * @template T,U
 * @constructor
 * @extends {Computation<T,U>}
 * @implements {Receive}
 * @implements {Indexed}
 * @implements {IterableSignal<T>}
 * @param {Source} src
 * @param {function(Array<T>,U): Array<T>} fn
 * @param {U=} args
 */
function Enumerable(src, fn, args) {
    Computation.call(this, fn, [], Opts.Static | Opts.Defer, [src, ColIndex.Init, this._mut, args]);
    /**
     * @protected
     * @type {Array}
     */
    this._mut = [0, 0, 0, 0];
    /**
     * @protected
     * @type {?Computation<number>}
     */
    this._length = null;
    this._init(src);
}

extendCollection(Enumerable, [Computation], peekComputation, getComputation);

/* __EXCLUDE__ */

/**
 * @public
 * @readonly
 * @type {Signal<number>}
 */
Enumerable.prototype.length;

/**
 * @public
 * @returns {Array}
 */
Enumerable.prototype.mut;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {Signal<number>|number} index 
 * @returns {Signal<T|undefined>}
 */
Enumerable.prototype.at;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {...(T|Array<T>|IterableSignal<T>)} items
 * @returns {IterableSignal<T>} 
 */
Enumerable.prototype.concat;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<boolean>}
 */
Enumerable.prototype.every;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {IterableSignal<T>}
 */
Enumerable.prototype.filter;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<T|undefined>}
 */
Enumerable.prototype.find;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<number>}
 */
Enumerable.prototype.findIndex;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<T|undefined>}
 */
Enumerable.prototype.findLast;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<number>}
 */
Enumerable.prototype.findLastIndex;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): void} callbackFn
 * @returns {void} 
 */
Enumerable.prototype.forEach;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {Signal<T>|T} searchElement
 * @returns {Signal<boolean>}
 */
Enumerable.prototype.includes;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {Signal<T>|T} searchElement 
 * @param {Signal<number>|number=} fromIndex
 * @returns {Signal<number>}
 */
Enumerable.prototype.indexOf;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {Signal<string>|string=} separator
 * @returns {Signal<string>}
 */
Enumerable.prototype.join;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {Signal<T>|T} searchElement 
 * @param {Signal<number>|number=} fromIndex
 * @returns {Signal<number>}
 */
Enumerable.prototype.lastIndexOf;

/**
 * @public
 * @template U
 * @this {IterableSignal<T>}
 * @param {function(T,!Signal<number>): U} callbackFn
 * @returns {IterableSignal<U>}
 */
Enumerable.prototype.map;

/**
 * @public
 * @template U
 * @this {IterableSignal<T>}
 * @param {function((T|U),T,number): U} callbackFn 
 * @param {Signal<U>|U=} initialValue 
 * @returns {Signal<U>}
 */
Enumerable.prototype.reduce;

/**
 * @public
 * @template U
 * @this {IterableSignal<T>}
 * @param {function((T|U),T,number): U} callbackFn
 * @param {Signal<U>|U=} initialValue 
 * @returns {Signal<U>}
 */
Enumerable.prototype.reduceRight;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {Signal<number>|number=} start
 * @param {Signal<number>|number=} end
 * @returns {IterableSignal<T>}
 */
Enumerable.prototype.slice;

/**
 * @public
 * @this {IterableSignal<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<boolean>} 
 */
Enumerable.prototype.some;

/* __EXCLUDE__ */

/**
 * @protected
 * @param {Child} child
 * @returns {void}
 */
Enumerable.prototype._addChild = NOOP;

/**
 * @protected
 * @param {CleanupFn} cleanupFn 
 */
Enumerable.prototype._addCleanup = NOOP;

/**
 * @protected
 * @param {RecoverFn} recoverFn 
 */
Enumerable.prototype._addRecover = NOOP;

/**
 * @protected
 * @override
 * @this {Enumerable<T>}
 * @param {number} time 
 * @returns {void}
 */
Enumerable.prototype._update = function (time) {
    /** @const {?Own} */
    var owner = SCOPE._owner;
    /** @const {boolean} */
    var listen = SCOPE._listen;
    /** @const {Array} */
    var args = this._args;
    SCOPE._owner = null;
    SCOPE._listen = false;
    this._opt |= Opts.Updated;
    args[ColIndex.Changed] = ColIndex.Changed;
    this._value = this._set(this._value, args);
    if (args[ColIndex.Changed] === ColIndex.Changed) {
        sendUpdate(this, time);
    }
    this._opt &= ~(Opts.UpdateFlags | Opts.MayFlags);
    SCOPE._owner = owner;
    SCOPE._listen = listen;
};

export {
    root, val, peek, batch, stable,
    recover, cleanup, dispose,
    data, value, array,
    compute, $compute,
    computeWhen, $computeWhen,
    effect, $effect,
    effectWhen, $effectWhen,
    Root, Data, Computation,
    Collection, Enumerable, DataArray,
};

/* __SOURCE__ */