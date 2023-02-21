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
function ReadSignal() { }

/**
 * @type {T}
 * @readonly
 * @nocollapse
 * @throws {Error}
 */
ReadSignal.prototype.val;

/**
 * @type {T}
 * @readonly
 * __EXTERNS__
 * @nosideeffects
 * __EXTERNS__
 */
ReadSignal.prototype.peek;

/**
 * @interface
 * @template T
 * @extends {ReadSignal<T>}
 */
function Signal() { }

/**
 * @param {T} value
 * @returns {void}
 * @throws {Error}
 */
Signal.prototype.set = function (value) { };

/**
 * @public
 * @interface
 * @template T
 * @extends {ReadSignal<T>}
 */
function SignalCollection() { }

/**
 * @public
 * @returns {!Array<T|!Array<T>|number|(function(T,T): number)|void>}
 */
SignalCollection.prototype.mut = function() { };

/**
 * @public
 * @readonly
 * @type {!ReadSignal<number>}
 */
SignalCollection.prototype.length;

/**
 * @public
 * @this {!SignalCollection<T>}
 * @param {number} index 
 * @returns {!ReadSignal<T|undefined>}
 */
SignalCollection.prototype.at = function (index) { };

/**
 * @public
 * @this {!SignalCollection<T>}
 * @param {...(T|!Array<T>)} items
 * @returns {!SignalCollection<T>} 
 */
SignalCollection.prototype.concat = function (items) { };

/**
 * @public
 * @this {!SignalCollection<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<boolean>}
 */
SignalCollection.prototype.every = function (callbackFn) { };

/**
 * @public
 * @this {!SignalCollection<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {!SignalCollection<T>}
 */
SignalCollection.prototype.filter = function (callbackFn) { };

/**
 * @public
 * @this {!SignalCollection<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<T|undefined>}
 */
SignalCollection.prototype.find = function (callbackFn) { };

/**
 * @public
 * @this {!SignalCollection<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<number>}
 */
SignalCollection.prototype.findIndex = function (callbackFn) { };

/**
 * @public
 * @this {!SignalCollection<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<T|undefined>}
 */
SignalCollection.prototype.findLast = function (callbackFn) { };

/**
 * @public
 * @this {!SignalCollection<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<number>}
 */
SignalCollection.prototype.findLastIndex = function (callbackFn) { };

/**
 * @public
 * @this {!SignalCollection<T>}
 * @param {function(T,number): void} callbackFn
 * @returns {void} 
 */
SignalCollection.prototype.forEach = function (callbackFn) { };

/**
 * @public
 * @this {!SignalCollection<T>}
 * @param {T} searchElement
 * @returns {!ReadSignal<boolean>}
 */
SignalCollection.prototype.includes = function (searchElement) { };

/**
 * @public
 * @this {!SignalCollection<T>}
 * @param {T} searchElement 
 * @param {number=} fromIndex
 * @returns {!ReadSignal<number>}
 */
SignalCollection.prototype.indexOf = function (searchElement, fromIndex) { };

/**
 * @public
 * @this {!SignalCollection<T>}
 * @param {string=} separator
 * @returns {!ReadSignal<string>}
 */
SignalCollection.prototype.join = function (separator) { };

/**
 * @public
 * @this {!SignalCollection<T>}
 * @param {T} searchElement 
 * @param {number=} fromIndex
 * @returns {!ReadSignal<number>}
 */
SignalCollection.prototype.lastIndexOf = function (searchElement, fromIndex) { };

/**
 * @public
 * @template U
 * @this {!SignalCollection<T>}
 * @param {function(T,!ReadSignal<number>): U} callbackFn
 * @returns {!SignalCollection<U>}
 */
SignalCollection.prototype.map = function (callbackFn) { };

/**
 * @public
 * @template U
 * @this {!SignalCollection<T>}
 * @param {function((T|U),T,number): U} callbackFn 
 * @param {U=} initialValue 
 * @returns {!ReadSignal<U>}
 */
SignalCollection.prototype.reduce = function (callbackFn, initialValue) { };

/**
 * @public
 * @template U
 * @this {!SignalCollection<T>}
 * @param {function((T|U),T,number): U} callbackFn
 * @param {U=} initialValue 
 * @returns {!ReadSignal<U>}
 */
SignalCollection.prototype.reduceRight = function (callbackFn, initialValue) { };

/**
 * @public
 * @this {!SignalCollection<T>}
 * @param {number=} start
 * @param {number=} end
 * @returns {!SignalCollection<T>}
 */
SignalCollection.prototype.slice = function (start, end) { };

/**
 * @public
 * @this {!SignalCollection<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<boolean>} 
 */
SignalCollection.prototype.some = function (callbackFn) { };

/**
 * @interface
 * @template T
 * @extends {SignalCollection<T>}
 */
function SignalArray() { }

/**
 * @param {!Array<T>|number} value 
 * @param {T=} item 
 * @returns {void}
 * @throws {Error}
 */
SignalArray.prototype.set = function (value, item) { };

/**
 * @returns {void}
 * @throws {Error}
 */
SignalArray.prototype.pop = function () { };

/**
 * @param {...T} elementN
 * @returns {void}
 * @throws {Error}
 */
SignalArray.prototype.push = function (elementN) { };

/**
 * @returns {void}
 * @throws {Error}
 */
SignalArray.prototype.shift = function () { };

/**
 * @returns {void}
 * @throws {Error}
 */
SignalArray.prototype.reverse = function () { };

/**
 * 
 * @param {function(T,T): number=} compareFn
 * @returns {void}
 * @throws {Error}
 */
SignalArray.prototype.sort = function (compareFn) { };

/**
 * 
 * @param {number} start 
 * @param {number=} deleteCount 
 * @param {...T} items
 * @returns {void}
 * @throws {Error}
 */
SignalArray.prototype.splice = function (start, deleteCount, items) { };

/**
 * 
 * @param {...T} elementN
 * @returns {void}
 * @throws {Error} 
 */
SignalArray.prototype.unshift = function (elementN) { };

/* __EXTERNS_FILE__ */

/* __SOURCE__ */

/** @typedef {function(): void} */
var Func;

/** @typedef {function(boolean): void} */
var CleanupFn;

/** @typedef {function(*): void} */
var RecoverFn;

/** @typedef {!Send|!Array<!Send>} */
var Source;

/** 
 * @interface
 */
function nil() { }

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
 * @param {!Child} child
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
 * @type {?Array<!Child>}
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
 * @const
 * @enum {number}
 */
export var Mutation = {
    Head: 32,
    Tail: 64,
    Range: 128,
    Remove: 256,
    Insert: 512,
    Reorder: 1024,
    Type: 31,
    None: 0,
    /**
     * 1 | Insert | Reorder
     */
    Set: 1 | 512 | 1024,
    /**
     * 2 | Remove | Insert
     */
    SetAt: 2 | 256 | 512,
    /**
     * 3 | Tail | Remove
     */
    Pop: 3 | 64,
    /**
     * 4 | Tail | Range | Remove
     */
    PopRange: 4 | 64 | 128,
    /**
     * 5 | Tail | Insert
     */
    Push: 5 | 64,
    /**
     * 6 | Tail | Range | Insert
     */
    PushRange: 6 | 64 | 128,
    /**
     * 7 | Head | Remove
     */
    Shift: 7 | 32 | 256,
    /**
     * 8 | Head | Range | Remove
     */
    ShiftRange: 8 | 32 | 128 | 256,
    /**
     * 9 | Head | Insert
     */
    Unshift: 9 | 32 | 512,
    /**
     * 10 | Head | Range | Insert
     */
    UnshiftRange: 10 | 32 | 128 | 512,
    /**
     * 11 | Remove
     */
    RemoveAt: 11 | 256,
    /**
     * 12 | Range | Remove
     */
    RemoveRange: 12 | 128 | 256,
    /**
     * 13 | Insert
     */
    InsertAt: 13 | 512,
    /**
     * 14 | Range | Insert
     */
    InsertRange: 14 | 128 | 512,
    /**
     * 15 | Range | Remove | Insert
     */
    ReplaceRange: 15 | 128 | 256 | 512,
    /**
     * 16 | Tail | Range | Remove | Insert
     */
    ReplaceRangeInsert: 16 | 64 | 128 | 256 | 512,
    /**
     * 17 | Reorder
     */
    Reverse: 17 | 1024,
    /**
     * 18 | Reorder
     */
    Sort: 18 | 1024,
    /**
     * User defined mutation
     */
    Custom: 19,
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
 * @param {!Receive} owner
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
 * @extends {ReadSignal<T>}
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
 * @interface
 * @template T,U
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
 * @type {?Array<!Send>|void}
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
    var _root = ROOT;
    /** @const {?Own} */
    var owner = OWNER;
    /** @const {boolean} */
    var listen = LISTEN;
    /** @const {boolean} */
    var orphan = fn.length === 0;
    /** @const {?Root} */
    var node = orphan ? _root : new Root();
    /** @const {Func|void} */
    var disposer = orphan ? void 0 : function () {
        dispose(/** @type {!Root} */(node));
    };
    ROOT = OWNER = node;
    LISTEN = false;
    try {
        return (
            orphan ?
               /** @type {function(): T} */(fn)() :
                fn(/** @type {Func} */(disposer))
        );
    } finally {
        ROOT = _root;
        OWNER = owner;
        LISTEN = listen;
    }
}

/**
 * @public
 * @template T
 * @param {T} value 
 * @returns {!Signal<T>}
 */
function data(value) {
    return new Data(Opts.Respond, NIL, value, null);
}

/**
 * @public
 * @template T
 * @param {T} value 
 * @param {(function(T,T): boolean)=} eq
 * @returns {!Signal<T>}
 */
function value(value, eq) {
    return new Data(Opts.Respond | (eq != null ? Opts.Compare : 0), NIL, value, eq);
}

/**
 * @public
 * @template T
 * @param {!Array<T>=} value 
 * @param {(function(!Array<T>,!Array<T>): boolean)=} eq
 * @returns {!SignalArray<T>}
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
 * @returns {!ReadSignal<T>}
 */
function compute(fn, seed, args, eq) {
    return new Computation(fn, seed, Opts.Static, args, eq);
}

/**
 * @public
 * @template T,U
 * @param {function(T,U,Func): T} fn 
 * @param {T=} seed 
 * @param {U=} args
 * @param {(function(T,T): boolean)|null=} eq
 * @returns {!ReadSignal<T>}
 */
function $compute(fn, seed, args, eq) {
    return new Computation(fn, seed, 0, args, eq);
}

/**
 * @public
 * @template T,U
 * @param {Source} src
 * @param {function(T,U,Func): T} fn 
 * @param {T=} seed 
 * @param {U=} args
 * @param {(function(T,T): boolean)|null=} eq
 * @returns {!ReadSignal<T>}
 */
function computeWhen(src, fn, seed, args, eq) {
    return new Computation(fn, seed, Opts.Static | Opts.Bound, args, eq, src);
}

/**
 * @public
 * @template T,U
 * @param {Func} src
 * @param {function(T,U,Func): T} fn 
 * @param {T=} seed 
 * @param {U=} args
 * @param {(function(T,T): boolean)|null=} eq
 * @returns {!ReadSignal<T>}
 */
function $computeWhen(src, fn, seed, args, eq) {
    return new Computation(evalSource(src, fn), seed, Opts.Bound, args, eq);
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
    return new Computation(
        fn,
        seed,
        Opts.Static | Opts.Bound | (defer ? Opts.Defer : 0),
        args,
        void 0,
        src
    )._value;
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
    return new Computation(
        evalSource(src, fn),
        seed,
        Opts.Bound | (defer ? Opts.Defer : 0),
        args
    )._value;
}

/**
 * @public
 * @param {!Dispose} node
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
 * @returns {void}
 */
function stable() {
    if (LISTEN) {
        OWNER._opt |= Opts.Static;
    }
}

/**
 * @public
 * @param {CleanupFn} fn
 * @returns {void} 
 */
function cleanup(fn) {
    /** @const {?Own} */
    var owner = OWNER;
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
    var owner = OWNER;
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
     * @type {!Array<?Dispose>}
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
 * @this {!Queue}
 * @param {!Dispose} item
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

/** @const {!nil} */
var NIL = /** @type {!nil} */({});
/** @const {!Array} */
var MUT = /** @type {!Array} */([]);
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
/** @type {?Root} */
var ROOT = null;
/** @type {?Own} */
var OWNER = null;
/** @type {boolean} */
var LISTEN = false;

/**
 * @noinline
 * @template T
 * @param {!Function} child
 * @param {!Array<!Function>=} inherits
 * @param {function(this: Reactive<T>): T=} peek
 * @param {function(this: Reactive<T>): T=} val
 * @param {function(this: Reactive<!Array<T>>): !ReadSignal<number>=} length
 */
function makeReactive(
    child,
    inherits,
    peek,
    val,
    length,
) {
    /**
     * @constructor
     */
    function ctor() { };
    /** @const @lends {Reactive.prototype} */
    var base = ctor.prototype = {};// new /** @type {?} */(Reactive)();
    if (inherits !== void 0) {
        for (var /** number */ i = 0; i < inherits.length; i++) {
            /** @const {!Object} */
            var proto = inherits[i].prototype;
            for (var /** string */ key in proto) {
                base[key] = proto[key];
            }
        }
    }
    if (peek !== void 0) {
        /** @const {!ObjectPropertyDescriptor} */
        var descr = { peek: { get: peek }, val: { get: val } };
        if (length !== void 0) {
            descr.length = { get: length };
        }
        Object.defineProperties(base, descr);
    }
    child.prototype = new ctor();
    child.constructor = child;
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
 */
function reset() {
    DISPOSES._count = CHANGES._count = COMPUTES._count = EFFECTS._count = 0;
}

/**
 * @protected
 * @param {!Send} from 
 * @param {!Receive|!Receive} to
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
     * @type {?Array<!Child>}
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
 * @param {!Own} owner
 * @param {number} time
 */
function disposeOwner(owner, time) {
    owner._opt = Opts.Disposed;
    /** @type {number} */
    var /** number */ i;
    /** @type {number} */
    var ln;
    /** @const {?Array<!Child>} */
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

makeReactive(Root);

/** @const */
var rootProto = Root.prototype;

/**
 * @protected
 * @override
 * @this {!Root}
 * @param {number} time
 * @returns {void}
 */
rootProto._dispose = function (time) {
    disposeOwner(this, time);
}

/**
 * @protected
 * @this {!Root}
 * @param {!Child} child 
 * @returns {void}
 */
rootProto._addChild = function (child) {
    this._opt |= Opts.Own;
    if (this._children === null) {
        this._children = [child];
    } else {
        this._children[this._children.length] = child;
    }
};

/**
 * @protected
 * @this {!Root}
 * @param {CleanupFn} cleanupFn
 * @returns {void}
 */
rootProto._addCleanup = function (cleanupFn) {
    if (this._cleanups === null) {
        this._cleanups = [cleanupFn];
    } else {
        this._cleanups[this._cleanups.length] = cleanupFn;
    }
};

/**
 * @protected
 * @this {!Root}
 * @param {RecoverFn} recoverFn
 * @returns {void}
 */
rootProto._addRecover = function (recoverFn) {
    if (this._recovers === null) {
        this._recovers = [recoverFn];
    } else {
        this._recovers[this._recovers.length] = recoverFn;
    }
};

/**
 * @protected
 * @param {!Send} send
 */
function disposeSender(send) {
    send._opt = Opts.Disposed;
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
    send._owner =
        send._eq =
        send._nodes =
        send._nodeslots = null;
}

/**
 * @protected
 * @param {!Send} send 
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
 * @param {!Receive} receive 
 * @param {number} slot
 */
function removeSender(receive, slot) {
    if (receive._opt !== Opts.Disposed) {
        if (slot === -1) {
            receive._source1 = null;
        } else {
            /** @const {?Array<!Send>|void} */
            var sources = receive._sources;
            /** @const {?Array<number>|void} */
            var sourceslots = receive._sourceslots;
            /** @const {!Send} */
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
 * @param {!Send} send
 * @param {number} time
 */
function sendMayUpdate(send, time) {
    /** @type {?Receive} */
    var node1 = send._node1;
    /** @const {?Array<!Receive>} */
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
 * @param {Array<!Child>} children 
 * @param {number} time
 */
function sendDispose(children, time) {
    /** @const {number} */
    var ln = children.length;
    for (var /** number */ i = 0; i < ln; i++) {
        /** @const {!Child} */
        var child = children[i];
        if ((child._opt & Opts.DisposeFlags) === 0) {
            child._recDispose(time);
        }
    }
}

/**
 * @protected
 * @param {!Receive} owner
 * @param {Array<!Child>} children 
 * @param {number} time
 */
function sendMayDispose(owner, children, time) {
    /** @const {number} */
    var ln = children.length;
    for (var /** number */ i = 0; i < ln; i++) {
        /** @const {!Child} */
        var child = children[i];
        if ((child._opt & (Opts.DisposeFlags | Opts.MayDispose)) === 0) {
            child._recMayDispose(owner, time);
        }
    }
}

/**
 * @protected
 * @abstract
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
 * @param {!Receive} Own
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
Reactive.prototype._clearMayUpdate = function (stage, time) { };

/**
 * @struct
 * @template T,U
 * @protected
 * @constructor
 * @extends {Reactive<T>}
 * @implements {Send<T,U>}
 * @implements {Signal<T>}
 * @param {number} opt
 * @param {U} set
 * @param {T} value
 * @param {(function(T,T): boolean)|null=} eq
 */
function Data(opt, set, value, eq) {
    /**
     * @protected
     * @type {number}
     */
    this._opt = opt;
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
     * @type {(function(T,T): boolean)|null|void}
     */
    this._eq = eq;
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
     * @type {?Array<!Receive>}
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
    var owner = OWNER;
    if (owner !== null) {
        owner._addChild(this);
    }
}

/**
 * @protected
 * @template T
 * @this {!Child<T>}
 * @returns {T}
 */
function peekData() {
    return this._value;
}

/**
 * @template T
 * @this {!Data<T>}
 * @returns {T}
 */
function getData() {
    if ((this._opt & Opts.DisposeFlags) === 0 && LISTEN) {
        logRead(this, /** @type {!Receive} */(OWNER));
    }
    return this._value;
}

makeReactive(Data, [], peekData, getData);

/** @const @lends {Data.prototype} */
var dataProto = Data.prototype;

/**
 * @template T
 * @this {!Data<T>}
 * @param {T} value
 * @returns {void}
 */
function setData(value) {
    /** @const {number} */
    var opt = this._opt;
    set: if ((opt & Opts.DisposeFlags) === 0) {
        if (
            this._eq === null || (
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
 * @this {!Data<T>}
 * @throws {Error}
 * @returns {void}
 */
dataProto.set = setData;

/**
 * @protected
 * @override
 * @this {!Data<T>}
 * @param {number} time
 */
dataProto._dispose = function (time) {
    disposeSender(this);
    this._set = null;
    this._value = void 0;
};

/**
 * @protected
 * @this {!Data<T>}
 * @param {number} time
 * @returns {void}
 */
dataProto._recDispose = function (time) {
    this._opt = Opts.Dispose;
};

/**
 * @protected
 * @this {!Data<T>}
 * @param {!Receive} owner
 * @param {number} time
 * @returns {void}
 */
dataProto._recMayDispose = function (owner, time) {
    this._opt |= Opts.MayDispose;
    if (this._owner === null) {
        this._owner = owner;
    }
};

/**
 * @protected
 * @this {!Data<T>}
 * @param {number} time
 * @returns {void}
 */
dataProto._update = function (time) {
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
 * @implements {ReadSignal<T>}
 * @param {function(T,U,Func): T} fn 
 * @param {T} value 
 * @param {number} opt
 * @param {U=} args
 * @param {(function(T,T): boolean)|null=} eq
 * @param {Source|Func=} src
 */
function Computation(fn, value, opt, args, eq, src) {
    Data.call(this, opt | (
        eq === null ? Opts.Respond :
            eq !== void 0 ? Opts.Compare : 0
    ), fn.length < 3 ? fn : evalDispose(this, fn), value, eq);
    /**
     * @protected
     * @type {?Array<!Child>}
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
     * @type {?Array<!Send>}
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
        startCompute(this, true, this, args, /** @type {Source} */(src));
    } else {
        this._opt &= ~Opts.Defer;
        initSource(this, /** @type {Source} */(src));
    }
};

/**
 * @param {!Child} node
 * @returns {void}
 */
function setCurrent(node) {
    /** @type {number} */
    var opt = node._opt;
    if ((opt & Opts.DisposeFlags) === 0 && STAGE !== Stage.Idle) {
        if ((opt & (Opts.Update | Opts.MayUpdate | Opts.MayDispose)) !== 0) {
            node._clearMayUpdate(STAGE, TIME);
        }
    }
}

/**
 * @template T 
 * @this {!Computation<T>}
 * @returns {T}
 */
function peekComputation() {
    setCurrent(this);
    return this._value;
}

/**
 * @template T
 * @this {!Computation<T>}
 * @returns {T}
 */
function getComputation() {
    /** @type {number} */
    var opt = this._opt;
    if ((opt & Opts.DisposeFlags) === 0 && STAGE !== Stage.Idle) {
        if ((opt & (Opts.Update | Opts.MayUpdate | Opts.MayDispose)) !== 0) {
            this._clearMayUpdate(STAGE, TIME);
        }
        if ((this._opt & Opts.DisposeFlags) === 0 && LISTEN) {
            logRead(this, /** @type {!Receive} */(OWNER));
        }
    }
    return this._value;
}

makeReactive(Computation, [Root], peekComputation, getComputation);

/** @const @lends {Computation.prototype} */
var computationProto = Computation.prototype;

/**
 * @template T,U
 * @param {Own} owner
 * @param {boolean} listen
 * @param {Receive<T,U>} node 
 * @param {U=} args
 * @param {Source=} src
 */
function startCompute(owner, listen, node, args, src) {
    /** @const {?Own} */
    var _owner = OWNER;
    /** @const {boolean} */
    var _listen = LISTEN;
    /** @const {number} */
    var opt = node._opt;
    OWNER = owner;
    LISTEN = listen;
    if (STAGE === Stage.Idle) {
        reset();
        STAGE = Stage.Started;
        try {
            if ((opt & Opts.Bound) !== 0) {
                initSource(node, /** @type {Source} */(src));
            }
            node._value = node._set(node._value, /** @type {U} */(args));
            if (CHANGES._count !== 0 || DISPOSES._count !== 0) {
                start();
            }
        } finally {
            STAGE = Stage.Idle;
            OWNER = null;
            LISTEN = false;
        }
    } else {
        if ((opt & Opts.Bound) !== 0) {
            initSource(this, /** @type {Source} */(src));
        }
        node._value = node._set(node._value, /** @type {U} */(args));
    }
    OWNER = _owner;
    LISTEN = _listen;
}

/**
 * @template T,U
 * @param {function(T,U,Func): T} fn 
 * @returns {function(T,U): T}
 */
function evalDispose(node, fn) {
    /**
     * @returns {void}
     */
    function disposer() {
        dispose(node);
    };
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
        LISTEN = false;
        return /** @type {function(T,U): T} */(fn)(seed, args);
    } : function (seed, args, disposer) {
        src();
        LISTEN = false;
        return fn(seed, args, disposer);
    };
}

/**
 * @param {!Receive} node
 * @param {Source|Func} sources 
 */
function initSource(node, sources) {
    if (Array.isArray(sources)) {
        /** @const {number} */
        var ln = sources.length;
        for (var i = 0; i < ln; i++) {
            logRead(/** @type {!Send} */(sources[i]), node);
        }
    } else {
        logRead(/** @type {!Send} */(sources), node);
    }
    LISTEN = false;
}

/* __EXCLUDE__ */

/**
 * @protected
 * @param {!Child} child
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
        /** @const {?Array<!Send>|void} */
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
 * @this {!Computation<T>}
 * @param {number} time
 * @returns {void}
 */
computationProto._dispose = function (time) {
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
 * @this {!Computation<T>}
 * @param {number} time
 * @returns {void}
 */
computationProto._recDispose = function (time) {
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
 * @this {!Computation<T>}
 * @param {!Receive} owner
 * @param {number} time
 * @returns {void}
 */
computationProto._recMayDispose = function (owner, time) {
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
 * @protected
 * @override
 * @this {!Computation<T>}
 * @param {number} time
 * @returns {void}
 */
computationProto._update = function (time) {
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
    /** @type {number} */
    var opt = this._opt;
    /** @const {?Array<!Child>} */
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
    OWNER = this;
    if ((opt & Opts.Static) !== 0) {
        LISTEN = false;
    } else {
        LISTEN = true;
        disposeReceiver(this);
    }
    /** @const {T} */
    var value = this._value;
    this._opt |= Opts.Updated;
    this._value = this._set(value, this._args);
    if (
        ((opt & (Opts.Send | Opts.Respond)) === Opts.Send) &&
        ((opt & Opts.Compare) === 0 ? value !== this._value : !this._eq(value, this._value))
    ) {
        sendUpdate(this, time);
    }
    this._opt &= ~(Opts.UpdateFlags | Opts.MayFlags);
    OWNER = owner;
    LISTEN = listen;
};

/**
 * @protected
 * @this {!Computation<T>}
 * @param {number} time
 * @returns {void}
 */
computationProto._recUpdate = function (time) {
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
 * @this {!Computation<T>}
 * @param {number} time
 * @returns {void}
 */
computationProto._recMayUpdate = function (time) {
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
 * @this {!Computation<T>}
 * @param {number} stage
 * @param {number} time
 * @returns {void} 
 */
computationProto._clearMayUpdate = function (stage, time) {
    if (stage === Stage.Computes) {
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
                    /** @const {?Array<!Send>} */
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
    }
    if ((this._opt & Opts.Update) !== 0 && this._age === time) {
        if ((this._opt & Opts.Updated) !== 0) {
            panic("cyclic dependency");
        }
        this._update(time);
    }
};

/**
 * @template T
 * @param {number} _ 
 * @param {!Collection<T>} src
 * @returns {number}
 */
function readLength(_, src) {
    return src.val.length;
}

/**
 * @template T
 * @this {!Collection<T>}
 * @returns {!ReadSignal<number>}
 */
function getLength() {
    if (this._length === null) {
        this._length = new Computation(readLength, this._value.length, Opts.Static | Opts.Bound | Opts.Defer, this, void 0, this);
    }
    return this._length;
}

/**
 * @struct
 * @protected
 * @template T,U
 * @constructor
 * @extends {Data<!Array<T>,U>}
 * @implements {SignalCollection<T>}
 */
function Collection() { }

makeReactive(Collection, [Data]);

/** @const @lends {Collection.prototype} */
var collectionProto = Collection.prototype;

/* __EXCLUDE__ */

/**
 * @readonly
 * @type {!ReadSignal<number>}  
 */
Collection.prototype.length;

/**
 * @type {?ReadSignal<number>}
 */
Collection.prototype._length;

/**
 * @protected
 * @type {!Array<T|!Array<T>|number|(function(T,T): number)|void>}
 */
Collection.prototype._mut;

/**
 * @const
 * @enum {number}
 */
export var Args = {
    Source: 0,
    Changed: 1,
    Mut: 2,
    MutArgs: 3,
    Params: 4
};

/**
 * This array holds state used for collection methods.
 * It has this structure:
 * [0] - {Array} The source value
 * [1] - {0 | 1} Value has changed
 * [2] - {Mutation} The mutation type
 * [3] - {Args} The mutation arguments
 * [...] - {...T} Function parameters
 * @type {!Array}
 * 
 */
Collection.prototype._args;

/* __EXCLUDE__ */

/**
 * @public
 * @this {!Collection<T>}
 * @returns {!Array<T|!Array<T>|number|(function(T,T): number)|void>}
 */
collectionProto.mut = function() {
    setCurrent(this);
    return [this._mut[0], this._mut[1]];
};

/**
 * @public
 * @this {!Collection<T,?>}
 * @param {number} index 
 * @returns {!ReadSignal<T|undefined>}
 */
collectionProto.at = function (index) {

};

/**
 * @public
 * @this {!Collection<T,?>}
 * @param {...(T|!Array<T>)} items
 * @returns {!SignalCollection<T>} 
 */
collectionProto.concat = function (items) {

};

/**
 * @public
 * @this {!Collection<T,?>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<boolean>}
 */
collectionProto.every = function (callbackFn) { };

/**
 * @public
 * @this {!Collection<T,?>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {!SignalCollection<T>}
 */
collectionProto.filter = function (callbackFn) { };

/**
 * @public
 * @this {!Collection<T,?>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<T|undefined>}
 */
collectionProto.find = function (callbackFn) { };

/**
 * @public
 * @this {!Collection<T,?>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<number>}
 */
collectionProto.findIndex = function (callbackFn) { };

/**
 * @public
 * @this {!Collection<T,?>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<T|undefined>}
 */
collectionProto.findLast = function (callbackFn) { };

/**
 * @public
 * @this {!Collection<T,?>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<number>}
 */
collectionProto.findLastIndex = function (callbackFn) { };

/**
 * @public
 * @this {!Collection<T,?>}
 * @param {function(T,number): void} callbackFn
 * @returns {void} 
 */
collectionProto.forEach = function (callbackFn) { };

/**
 * @public
 * @this {!Collection<T,?>}
 * @param {T} searchElement
 * @returns {!ReadSignal<boolean>}
 */
collectionProto.includes = function (searchElement) { };

/**
 * @public
 * @this {!Collection<T,?>}
 * @param {T} searchElement 
 * @param {number=} fromIndex
 * @returns {!ReadSignal<number>}
 */
collectionProto.indexOf = function (searchElement, fromIndex) { };

/**
 * 
 * @param {string} _
 * @param {Array} args
 * @returns {string}
 */
function join(_, args) {
    /** @const {!Collection} */
    var src = args[0];
    /** @const {string|void} */
    var separator = args[1];
    return src._value.join(separator);
};

/**
 * @template T
 * @param {Array<T>} array 
 * @param {number} start 
 * @param {number} end 
 * @param {number} dir 
 * @param {T} target 
 * @returns {number}
 */
function findItem(array, start, end, dir, target) {
    for (; start !== end; start += dir) {
        if (array[start] === target) {
            return start;
        }
    }
    return -1;
}

/**
 * @template T
 * @param {Array<T>} array 
 * @param {number} start 
 * @param {number} end 
 * @param {number} dir 
 * @param {function(T,number): boolean} callback 
 * @returns {number}
 */
function findCallback(array, start, end, dir, callback) {
    for (; start !== end; start += dir) {
        if (callback(array[start], start)) {
            return start;
        }
    }
    return -1;
}

/**
 * @public
 * @this {!Collection<T,?>}
 * @param {string=} separator
 * @returns {!ReadSignal<string>}
 */
collectionProto.join = function (separator) {
    return new Computation(join, '', Opts.Bound, [this, separator], void 0, this);
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
 * @this {!Collection<T,?>}
 * @param {T} searchElement 
 * @param {number=} fromIndex
 * @returns {!ReadSignal<number>}
 */
collectionProto.lastIndexOf = function (searchElement, fromIndex) {
    return new Computation(lastIndexOf, -1, Opts.Bound, [this, searchElement, fromIndex], void 0, this);
};

/**
 * @public
 * @template U
 * @this {!Collection<T,?>}
 * @param {function(T,!ReadSignal<number>): U} callbackFn
 * @returns {!SignalCollection<U>}
 */
collectionProto.map = function (callbackFn) { };

/**
 * @public
 * @template U
 * @this {!Collection<T,?>}
 * @param {function((T|U),T,number): U} callbackFn 
 * @param {U=} initialValue 
 * @returns {!ReadSignal<U>}
 */
collectionProto.reduce = function (callbackFn, initialValue) { };

/**
 * @public
 * @template U
 * @this {!Collection<T,?>}
 * @param {function((T|U),T,number): U} callbackFn 
 * @param {U=} initialValue 
 * @returns {!ReadSignal<U>}
 */
collectionProto.reduceRight = function (callbackFn, initialValue) { };

/**
 * @public
 * @template T
 * @param {Array<T>} seed 
 * @param {Array} args 
 * @returns 
 */
function slice(seed, args) {
    args[Args.Changed] = 1;
    /** @const @type {!Collection<T>} */
    var src = args[Args.Source];
    /** @const {!Array<number>} */
    var params = args[Args.Params];
    return src.val.slice(params[0], params[1]);
}

/**
 * @public
 * @this {!Collection<T,?>}
 * @param {number=} start
 * @param {number=} end
 * @returns {!SignalCollection<T>}
 */
collectionProto.slice = function (start, end) {
    return new Enumerable(this, slice, [start, end]);
};

/**
 * @public
 * @this {!Collection<T,?>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<boolean>} 
 */
collectionProto.some = function (callbackFn) { };

/**
 * @struct
 * @template T
 * @constructor
 * @extends {Collection<T,nil>}
 * @implements {SignalArray<T>}
 * @param {!Array<T>=} value
 * @param {(function(!Array<T>,!Array<T>): boolean)|null=} eq
 */
function DataArray(value, eq) {
    Data.call(this, Opts.Respond | (
        eq !== void 0 ? Opts.Compare : 0
    ), NIL, value != null ? value : [], eq === void 0 ? null : eq);
    /**
     * @protected
     * @type {?Computation<number>}
     */
    this._length = null;
    /**
     * @protected
     * @type {!Array<T|!Array<T>|number|(function(T,T): number)>}
     */
    this._mut = [];
    /**
     * @protected
     * @type {!Array<T|!Array<T>|number|(function(T,T): number)>}
     */
    this._smut = [];
    /**
     * @protected
     * @type {!Array}
     */
    this._args = [null, 0, 0];
}

makeReactive(DataArray, [Data, Collection], peekData, getData, getLength);

/** @const @lends {DataArray.prototype} */
var dataArrayProto = DataArray.prototype;

/**
 * @template T
 * @param {!DataArray<T>} node
 * @param {number} mut 
 * @param {T|!Array<T>|number|(function(T,T): number)=} mutArgs 
 * @returns {void}
 */
function mutate(node, mut, mutArgs) {
    if (node._set !== NIL) {
        panic("conflicting mutation");
    }
    node._smut[0] = mut;
    node._smut[1] = mutArgs;
    setData.call(node, MUT);
}

/**
 * @public
 * @override
 * @this {!DataArray<T>}
 * @param {!Array<T>|number} value 
 * @param {T=} item 
 * @returns {void}
 */
dataArrayProto.set = function (value, item) {
    /** @const {number} */
    var ln = arguments.length;
    if (ln === 1) {
        mutate(this, Mutation.Set, value);
    } else if (ln > 0) {
        mutate(this, Mutation.SetAt, [value, item]);
    }
};

/**
 * @protected
 * @override
 * @this {!DataArray<T>}
 * @param {number} time
 * @returns {void}
 */
dataArrayProto._update = function (time) {
    /** @const {!Array<T|!Array<T>|number|(function(T,T): number)|void>} */
    var smut = this._smut;
    /** @const {number} */
    var mut = smut[0];
    /** @const {T|!Array<T>|number|(function(T,T): number)|void} */
    var mutArgs = smut[1];
    /** @const @type {!Array<T>} */
    var array = this._value;
    switch (mut) {
        case Mutation.Set:
            this._value = mutArgs;
            break;
        case Mutation.SetAt:
            array[mutArgs[0]] = mutArgs[1];
            break;
        case Mutation.Pop:
            array.length--;
            break;
        case Mutation.PopRange:
            array.length -= mutArgs;
            break;
        case Mutation.Push:
            array[array.length] = mutArgs;
            break;
        case Mutation.PushRange:
            array.push.apply(array, mutArgs);
            break;
        case Mutation.Shift:
            array.shift();
            break;
        case Mutation.Unshift:
            array.unshift(mutArgs);
            break;
        case Mutation.UnshiftRange:
            array.unshift.apply(array, mutArgs);
            break;
        case Mutation.Reverse:
            array.reverse();
            break;
        case Mutation.Sort:
            array.sort(mutArgs);
            break;
        case Mutation.Custom:
            // todo
            break;
        default:
            array.splice.apply(array, mutArgs);
    }
    this._smut = this._mut;
    this._smut[1] = void 0;
    this._mut = smut;
    this._set = NIL;
    this._opt &= ~(Opts.Update | Opts.MayFlags);
    if ((this._opt & Opts.Send) !== 0) {
        sendUpdate(this, time);
    }
};

/**
 * @public
 * @this {!DataArray<T>}
 * @throws {Error}
 * @returns {void}
 */
dataArrayProto.pop = function () {
    if (this._value.length !== 0) {
        mutate(this, Mutation.Pop);
    }
};

/**
 * @public
 * @this {!DataArray<T>}
 * @param {...T} elementN
 * @throws {Error}
 * @returns {void}
 */
dataArrayProto.push = function (elementN) {
    /** @const {!Arguments} */
    var args = arguments;
    /** @const {number} */
    var ln = args.length;
    if (ln === 1) {
        mutate(this, Mutation.Push, elementN);
    } else if (ln > 0) {
        /** @type {number} */
        var i = 0;
        /** @const {!Array<T|number>} */
        var params = new Array(ln);
        for (; i < ln; i++) {
            params[i] = args[i];
        }
        mutate(this, Mutation.PushRange, params);
    }
};

/**
 * @public
 * @this {!DataArray<T>}
 * @throws {Error}
 * @returns {void}
 */
dataArrayProto.reverse = function () {
    if (this._value.length !== 0) {
        mutate(this, Mutation.Reverse);
    }
};

/**
 * @public
 * @this {!DataArray<T>}
 * @throws {Error}
 * @returns {void}
 */
dataArrayProto.shift = function () {
    if (this._value.length !== 0) {
        mutate(this, Mutation.Shift);
    }
};

/**
 * @public
 * @this {!DataArray<T>}
 * @param {function(T,T): number=} compareFn
 * @throws {Error}
 * @returns {void}
 */
dataArrayProto.sort = function (compareFn) {
    if (this._value.length !== 0) {
        mutate(this, Mutation.Sort, compareFn);
    }
};

/**
 * @public
 * @this {!DataArray<T>}
 * @param {number} start 
 * @param {number=} deleteCount 
 * @param {...T} items
 * @throws {Error}
 * @returns {void}
 */
dataArrayProto.splice = function (start, deleteCount, items) {
    /** @const {!Arguments} */
    var args = arguments;
    /** @const {number} */
    var ln = args.length;
    if (ln > 0) {
        /** @type {number} */
        var mut;
        /** @const {number} */
        var length = this._value.length;
        /** @type {!Array<number|T|!Array<T>>} */
        var params;
        if (start < 0) {
            if ((start += length) < 0) {
                start = 0;
            }
        } else if (start >= length) {
            if (ln < 3) {
                return;
            }
            start = length;
            deleteCount = 0;
        }
        if (deleteCount >= length - start) {
            deleteCount = length - start;
        }
        if ((0 | deleteCount) > 0) {
            if (ln > 2) {
                if (ln - 2 === deleteCount) {
                    if (deleteCount === 1) {
                        return mutate(this, Mutation.SetAt, [start, items]);
                    }
                    mut = Mutation.ReplaceRange;
                } else {
                    mut = Mutation.ReplaceRangeInsert;
                }
            } else {
                if (length === 0) {
                    return;
                }
                if (start === 0) {
                    if (deleteCount === 1) {
                        return mutate(this, Mutation.Shift);
                    }
                    mut = Mutation.ShiftRange;
                } else {
                    if (deleteCount === 1) {
                        mut = Mutation.RemoveAt;
                    } else {
                        mut = Mutation.RemoveRange;
                    }
                }
            }
        } else {
            if (ln < 3) {
                return;
            }
            if (ln === 3) {
                if (start === 0) {
                    return mutate(this, Mutation.Unshift, items);
                }
                mut = Mutation.InsertAt;
            } else {
                mut = Mutation.InsertRange;
            }
        }
        if ((mut & Mutation.Insert) !== 0) {
            if ((mut & Mutation.Range) !== 0) {
                params = [start, deleteCount];
                for (var i = 2; i < ln; i++) {
                    params[i] = args[i];
                }
            } else {
                params = [start, deleteCount, items];
            }
        } else {
            mutate(this, mut, [start, deleteCount]);
        }
        mutate(this, mut, params);
    }
};

/**
 * @public
 * @this {!DataArray<T>}
 * @param {...T} elementN
 * @throws {Error} 
 * @returns {void}
 */
dataArrayProto.unshift = function (elementN) {
    /** @const {number} */
    var ln = arguments.length;
    if (ln === 1) {
        mutate(this, Mutation.Unshift, elementN);
    } else if (ln > 0) {
        /** @type {number} */
        var i = 0;
        /** @const {!Array<T>} */
        var args = new Array(ln);
        for (; i < ln; i++) {
            args[i] = arguments[i];
        }
        mutate(this, Mutation.UnshiftRange, args);
    }
};

/**
 * @struct
 * @public
 * @template T,U
 * @constructor
 * @extends {Collection<T,(function(!Array<T>,!Array<U>): !Array<T>)>}
 * @implements {Receive}
 * @implements {SignalCollection<T>}
 * @param {Source} src
 * @param {function(!Array<T>,U): !Array<T>} fn
 * @param {!Array<U>} args
 */
function Enumerable(src, fn, args) {
    Data.call(this, Opts.Static | Opts.Bound, fn, []);
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
     * @type {!Array<T|!Array<T>|number|(function(T,T): number)|void>}
     */
    this._mut = [Mutation.None];
    /**
     * @protected
     * @type {!Array<U>}
     */
    this._args = [src, 1, Mutation.None, void 0, args];
    startCompute(null, false, this, this._args, src);
}

makeReactive(Enumerable, [Computation, Collection], peekComputation, getComputation, getLength);

/** @const @lends {Enumerable.prototype} */
var enumerableProto = Enumerable.prototype;

/* __EXCLUDE__ */

/**
 * @protected
 * @param {!Child} child
 * @returns {void}
 */
Enumerable.prototype._addChild;

/**
 * @protected
 * @param {CleanupFn} cleanupFn 
 */
Enumerable.prototype._addCleanup;

/**
 * @protected
 * @param {RecoverFn} recoverFn 
 */
Enumerable.prototype._addRecover;

/**
 * @protected
 * @this {!Enumerable<T>}
 * @param {number} time 
 */
Enumerable.prototype._recUpdate;

/**
 * @protected
 * @override
 * @param {number} time 
 */
Enumerable.prototype._recMayUpdate;

/* __EXCLUDE__ */

/**
 * @protected
 * @override
 * @this {!Enumerable<T>}
 * @param {number} time 
 * @returns {void}
 */
enumerableProto._update = function (time) {
    /** @const {?Own} */
    var owner = OWNER;
    /** @const {boolean} */
    var listen = LISTEN;
    /** @const {Array} */
    var args = this._args;
    OWNER = null;
    LISTEN = false;
    args[Args.Changed] = 0;
    args[Args.Mut] = this._mut[0];
    args[Args.MutArgs] = this._mut[1];
    this._opt |= Opts.Updated;
    this._value = this._set(this._value, args);
    if (args[Args.Changed] === 1) {
        sendUpdate(this, time);
    }
    this._opt &= ~(Opts.UpdateFlags | Opts.MayFlags);
    OWNER = owner;
    LISTEN = listen;
};

export {
    root, peek, batch, stable,
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