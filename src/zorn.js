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
 */
ReadSignal.prototype.peek;

/**
 * @interface
 * @template T
 * @extends {RootSignal}
 */
function Signal() { }

/**
 * @type {T}
 * @nocollapse
 * @throws {Error}
 */
Signal.prototype.val;

/**
 * @type {T} 
 __EXTERNS__
 * @nosideeffects 
 __EXTERNS__
 * @readonly
 */
Signal.prototype.peek;

/**
 * @interface
 * @template T
 * @extends {RootSignal}
 */
function SignalCollection() { }

/**
 * @readonly
 * @type {!Array<T>}
 */
SignalCollection.prototype.peek;

/**
 * @type {!ReadSignal<number>}
 */
SignalCollection.prototype.length;

/**
 * 
 * @param {number} index 
 * @returns {!ReadSignal<T|undefined>}
 */
SignalCollection.prototype.at = function (index) { };

/**
 * 
 * @param {...(T|!Array<T>)} items
 * @returns {!SignalEnumerable<T>} 
 */
SignalCollection.prototype.concat = function (items) { };

/**
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<boolean>}
 */
SignalCollection.prototype.every = function (callbackFn) { };

/**
 * @param {function(T,number): boolean} callbackFn
 * @returns {!SignalEnumerable<T>}
 */
SignalCollection.prototype.filter = function (callbackFn) { };

/**
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<T|undefined>}
 */
SignalCollection.prototype.find = function (callbackFn) { };

/**
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<number>}
 */
SignalCollection.prototype.findIndex = function (callbackFn) { };

/**
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<T|undefined>}
 */
SignalCollection.prototype.findLast = function (callbackFn) { };

/**
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<number>}
 */
SignalCollection.prototype.findLastIndex = function (callbackFn) { };

/**
 * @param {function(T,number): void} callbackFn
 * @returns {void} 
 */
SignalCollection.prototype.forEach = function (callbackFn) { };

/**
 * @param {T} searchElement
 * @returns {!ReadSignal<boolean>}
 */
SignalCollection.prototype.includes = function (searchElement) { };

/**
 * 
 * @param {T} searchElement 
 * @param {number=} fromIndex
 * @returns {!ReadSignal<number>}
 */
SignalCollection.prototype.indexOf = function (searchElement, fromIndex) { };

/**
 * 
 * @param {string=} separator
 * @returns {!ReadSignal<string>}
 */
SignalCollection.prototype.join = function (separator) { };

/**
 * 
 * @param {T} searchElement 
 * @param {number=} fromIndex
 * @returns {!ReadSignal<number>}
 */
SignalCollection.prototype.lastIndexOf = function (searchElement, fromIndex) { };

/**
 * @template U
 * @param {function(T,!ReadSignal<number>): U} callbackFn
 * @returns {!SignalEnumerable<U>}
 */
SignalCollection.prototype.map = function (callbackFn) { };

/**
 * @template U
 * @param {function((T|U),T,number): U} callbackFn 
 * @param {U=} initialValue 
 * @returns {!ReadSignal<U>}
 */
SignalCollection.prototype.reduce = function (callbackFn, initialValue) { };

/**
 * @template U
 * @param {function((T|U),T,number): U} callbackFn
 * @param {U=} initialValue 
 * @returns {!ReadSignal<U>}
 */
SignalCollection.prototype.reduceRight = function (callbackFn, initialValue) { };

/**
 * @param {number=} start
 * @param {number=} end
 * @returns {!SignalEnumerable<T>}
 */
SignalCollection.prototype.slice = function (start, end) { };

/**
 * 
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<boolean>} 
 */
SignalCollection.prototype.some = function (callbackFn) { };

/**
 * @interface
 * @template T
 * @extends {ReadSignal<!Array<T>>}
 * @extends {SignalCollection<T>}
 */
function SignalEnumerable() { }

/**
 * @readonly
 * @nocollapse
 * @type {!Array<T>}
 * @throws {Error}
 */
SignalEnumerable.prototype.val;

/**
 * @interface
 * @template T
 * @extends {Signal<!Array<T>>}
 * @extends {SignalCollection<T>}
 */
function SignalArray() { }

/**
 * @throws {Error}
 * @returns {void}
 */
SignalArray.prototype.pop = function () { };

/**
 * @throws {Error}
 * @param {...T} elementN
 * @returns {void}
 */
SignalArray.prototype.push = function (elementN) { };

/**
 * @throws {Error}
 * @returns {void}
 */
SignalArray.prototype.shift = function () { };

/**
 * @throws {Error}
 * @returns {void}
 */
SignalArray.prototype.reverse = function () { };

/**
 * 
 * @throws {Error}
 * @param {function(T,T): number=} compareFn
 * @returns {void}
 */
SignalArray.prototype.sort = function (compareFn) { };

/**
 * 
 * @throws {Error}
 * @param {number} start 
 * @param {number=} deleteCount 
 * @param {...T} items
 * @returns {void}
 */
SignalArray.prototype.splice = function (start, deleteCount, items) { };

/**
 * 
 * @throws {Error} 
 * @param {...T} elementN
 * @returns {void}
 */
SignalArray.prototype.unshift = function (elementN) { };

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
 * @interface
 * @extends {Own}
 */
function OwnOne() { };

/**
 * @protected
 * @type {?Array<!Child>}
 */
OwnOne.prototype._children;

/**
 * @protected
 * @type {?Array<CleanupFn>}
 */
OwnOne.prototype._cleanups;

/**
 * @protected
 * @type {?Array<RecoverFn>}
 */
OwnOne.prototype._recovers;

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
    Unmount: 65536,
    Compare: 131072,
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
    Set: 0,
    Length: 1,
    Pop: 2,
    Push: 4,
    PopRange: 3,
    PushRange: 5,
    Shift: 6,
    Unshift: 7,
    UnshiftRange: 8,
    Remove: 9,
    RemoveRange: 10,
    Insert: 11,
    InsertRange: 12,
    Replace: 13,
    ReplaceRange: 14,
    ReplaceInsert: 15,
    Reverse: 16,
    Sort: 17,
    Custom: 18,
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
 * 
 * @returns {void}
 */
Receive.prototype._unmount = function () { };

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
 * @param {function(T,Func,U): T} fn 
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
 * @param {function(T,Func,U): T} fn 
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
 * @param {function(T,Func,U): T} fn 
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
 * @param {function(T,Func,U): T} fn 
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
 * @param {function(T,Func,U): T} fn 
 * @param {T=} seed 
 * @param {boolean=} defer
 * @param {U=} args
 * @returns {T}
 */
function effectWhen(src, fn, seed, defer, args) {
    return new Computation(fn, seed, Opts.Static | Opts.Bound | (defer ? Opts.Defer : 0), args, void 0, src)._value;
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
    return new Computation(evalSource(src, fn), seed, Opts.Bound | (defer ? Opts.Defer : 0), args, void 0)._value;
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
 * 
 * @param {number} time 
 */
Queue.prototype._update = function (time) {
    STAGE = this._stage;
    /** @type {number} */
    var error = 0;
    for (var /** number */ i = 0; i < this._count; i++) {
        /** @const {?Dispose} */
        var item = this._items[i];
        if ((item._opt & Opts.Update) !== 0) {
            try {
                item._update(time);
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

/**
 * @protected
 * @returns {number}
 * @this {!Queue}
 * @param {number} time
 */
Queue.prototype._dispose = function (time) {
    STAGE = this._stage;
    /** @type {number} */
    var error = 0;
    for (var /** number */ i = 0; i < this._count; i++) {
        /** @const {?Dispose} */
        var item = this._items[i];
        if ((item._opt & (Opts.Dispose | Opts.Unmount)) !== 0) {
            try {
                if ((item._opt & Opts.Dispose) !== 0) {
                    item._dispose(time);
                } else {
                    item._unmount();
                }
            } catch (err) {
                error = 1;
            } finally {
                item._opt = Opts.Disposed;
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
var MUT = /** @type {!Array<?>} */([]);
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
 * @param {?} child
 * @param {!Array<!Function>} inherits
 * @param {function(this: Reactive<T>): T=} peekVal
 * @param {function(this: Reactive<T>): T=} getVal
 * @param {function(this: Reactive<T>, T): void=} setVal
 * @param {function(this: Reactive<!Array<T>>): !ReadSignal<number>=} getLength
 * @param {function(this: Reactive<!Array<T>>, number): void=} setLength
 */
function makeReactive(
    child,
    inherits,
    peekVal,
    getVal,
    setVal,
    getLength,
    setLength
) {
    /**
     * @constructor
     * @extends {Reactive}
     */
    function ctor() { };
    /** @const {Reactive} */
    var base = ctor.prototype = {};// new /** @type {?} */(Reactive)();
    for (var /** number */ i = 0; i < inherits.length; i++) {
        /** @const {!Object} */
        var proto = inherits[i].prototype;
        for (var /** string */ key in proto) {
            base[key] = proto[key];
        }
    }
    if (peekVal !== void 0) {
        /** @const {!ObjectPropertyDescriptor} */
        var descr = { peek: { get: peekVal }, val: { get: getVal, set: setVal } };
        if (getLength !== void 0) {
            descr.length = { get: getLength, set: setLength };
        }
        Object.defineProperties(base, descr);
    }
    child.prototype = new ctor();
    child.constructor = child;
}

/**
 * @protected
 * @template T
 * @this {!Child<T>}
 * @returns {T}
 */
function peekVal() {
    return this._value;
}

/**
 * 
 * @param {!Dispose} node 
 */
function unmount(node) {
    /** @const {number} */
    var opt = node._opt;
    if ((opt & Opts.DisposeFlags) === 0) {
        if (STAGE === Stage.Idle) {
            node._unmount();
        } else {
            // Schedule unmount for next batch
            node._opt = (opt | Opts.Unmount) & ~Opts.Receive;
            DISPOSES._add(node);
        }
    }
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
            errors += disposes._dispose(time);
        }
        if (changes._count !== 0) {
            errors += changes._update(time);
        }
        if (computes._count !== 0) {
            errors += computes._update(time);
        }
        if (effects._count !== 0) {
            errors += effects._update(time);
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
 * @struct
 * @protected
 * @constructor
 * @implements {OwnOne}
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
 * @param {!OwnOne} owner
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

/**
 * @protected
 * @override
 * @this {!Root}
 * @param {number} time
 * @returns {void}
 */
Root.prototype._dispose = function (time) {
    disposeOwner(this, time);
}

/**
 * @protected
 * @param {!Child} child 
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
        /** @type {boolean} */
        var orphan;
        if (slot === -1) {
            receive._source1 = null;
            orphan = (receive._opt & Opts.ReceiveMany) === 0;
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
                if (receive._source1 === null) {
                    orphan = true;
                } else {
                    receive._opt &= ~Opts.ReceiveMany;
                }
            }
        }
        if (orphan) {
            unmount(receive);
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
Reactive.prototype._clearMayUpdate = function(stage, time) { };

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

/**
 * @template T
 * @this {!Data<T>}
 * @param {T} value
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
                throw new Error("Zorn: Conflict");
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

makeReactive(Data, [], peekVal, getData, setData);

/**
 * @protected
 * @override
 * @this {!Data<T>}
 * @param {number} time
 */
Data.prototype._dispose = function (time) {
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
Data.prototype._recDispose = function (time) {
    this._opt = Opts.Dispose;
};

/**
 * @protected
 * @this {!Data<T>}
 * @param {!Receive} owner
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
 * @implements {OwnOne}
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

makeReactive(Computation, [Root, Data], peekVal, getComputation);

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
    var disposer = function () {
        dispose(node);
    };
    return function (seed, args) {
        return fn(seed, args, disposer);
    }
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
    }
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
Computation.prototype._dispose = function (time) {
    disposeOwner(this, time);
    disposeSender(this);
    disposeReceiver(this);
    this._unmount();
    this._value = void 0;
};

/**
 * @protected
 * @override
 * @this {!Computation<T>}
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
 * @this {!Computation<T>}
 * @param {!Receive} owner
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
    if ((this._opt & Opts.Receive) !== 0) {
        this._opt &= ~Opts.Unmount;
    }
    OWNER = owner;
    LISTEN = listen;
};

/**
 * @protected
 * @this {!Computation<T>}
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
 * @this {!Computation<T>}
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
    if (stage === Stage.Computes) {
        if ((this._opt & Opts.MayCleared) !== 0) {
            throw new Error("cyclic dependency");
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
            throw new Error("cyclic dependency");
        }
        this._update(time);
    }
};

/**
 * @protected
 * @returns {void}
 */
Computation.prototype._unmount = function () {
    disposeSender(this);
    this._set =
        this._sources =
        this._sourceslots = /** @type {?} */(null);
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
 * @abstract
 * @template T,U
 * @constructor
 * @extends {Data<!Array<T>,U>}
 */
function Collection() { }

makeReactive(Collection, [Data]);

/* __EXCLUDE__ */

/**
 * @type {!ReadSignal<number>}  
 */
Collection.prototype.length;

/**
 * @type {?ReadSignal<number>}
 */
Collection.prototype._length;

/**
 * @const
 * @enum {number}
 */
export var Args = {
    Source: 0,
    Changed: 1,
    Mutation: 2,
    MutationArgs: 3,
    FunctionArgs: 4
};

/**
 * This array holds state used for collection methods.
 * It has this structure:
 * [0] - {Collection} The Collection source
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
 * 
 * @param {number} index 
 * @returns {!ReadSignal<T|undefined>}
 */
Collection.prototype.at = function (index) {

};

/**
 * 
 * @param {...(T|!Array<T>)} items
 * @returns {!SignalEnumerable<T>} 
 */
Collection.prototype.concat = function (items) {

};

/**
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<boolean>}
 */
Collection.prototype.every = function (callbackFn) { };

/**
 * @param {function(T,number): boolean} callbackFn
 * @returns {!SignalEnumerable<T>}
 */
Collection.prototype.filter = function (callbackFn) { };

/**
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<T|undefined>}
 */
Collection.prototype.find = function (callbackFn) { };

/**
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<number>}
 */
Collection.prototype.findIndex = function (callbackFn) { };

/**
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<T|undefined>}
 */
Collection.prototype.findLast = function (callbackFn) { };

/**
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<number>}
 */
Collection.prototype.findLastIndex = function (callbackFn) { };

/**
 * @param {function(T,number): void} callbackFn
 * @returns {void} 
 */
Collection.prototype.forEach = function (callbackFn) { };

/**
 * @param {T} searchElement
 * @returns {!ReadSignal<boolean>}
 */
Collection.prototype.includes = function (searchElement) { };

/**
 * 
 * @param {T} searchElement 
 * @param {number=} fromIndex
 * @returns {!ReadSignal<number>}
 */
Collection.prototype.indexOf = function (searchElement, fromIndex) { };

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
 * 
 * @param {string=} separator
 * @returns {!ReadSignal<string>}
 */
Collection.prototype.join = function (separator) {
    return new Computation(join, '', Opts.Bound, [this, separator], void 0, this);
};

/**
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
 * 
 * @param {T} searchElement 
 * @param {number=} fromIndex
 * @returns {!ReadSignal<number>}
 */
Collection.prototype.lastIndexOf = function (searchElement, fromIndex) {
    return new Computation(lastIndexOf, -1, Opts.Bound, [this, searchElement, fromIndex], void 0, this);
};

/**
 * @template U
 * @param {function(T,!ReadSignal<number>): U} callbackFn
 * @returns {!SignalEnumerable<U>}
 */
Collection.prototype.map = function (callbackFn) { };

/**
 * @template U
 * @param {function((T|U),T,number): U} callbackFn 
 * @param {U=} initialValue 
 * @returns {!ReadSignal<U>}
 */
Collection.prototype.reduce = function (callbackFn, initialValue) { };

/**
 * @template U
 * @param {function((T|U),T,number): U} callbackFn 
 * @param {U=} initialValue 
 * @returns {!ReadSignal<U>}
 */
Collection.prototype.reduceRight = function (callbackFn, initialValue) { };

/**
 * @template T
 * @param {Array<T>} seed 
 * @param {Array} args 
 * @returns 
 */
function slice(seed, args) {
    args[1] = 1;
    /** @const @type {Collection<T>} */
    var src = args[0];
    /** @type {number} */
    var start = args[3];
    /** @type {number} */
    var end = args[4];
    return src._value.slice(
        /** @type {number|void} */(args[3]),
        /** @type {number|void} */(args[4])
    );
}

/**
 * @param {number=} start
 * @param {number=} end
 * @returns {!SignalEnumerable<T>}
 */
Collection.prototype.slice = function (start, end) {
    return new Enumerable(this, slice, [this, 0, 0, start, end]);
};

/**
 * 
 * @param {function(T,number): boolean} callbackFn
 * @returns {!ReadSignal<boolean>} 
 */
Collection.prototype.some = function (callbackFn) { };

/**
 * @struct
 * @protected
 * @template T
 * @constructor
 * @extends {Collection<T,?>}
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
     * @type {!Array}
     */
    this._args = [null, 0, 0];
}

/**
 * @template T
 * @this {!DataArray<T>}
 * @param {number} value 
 * @returns {void}
 */
function setLength(value) {
    mutate(this, Mutation.Length, value);
}

makeReactive(DataArray, [Data, Collection], peekVal, getData, setData, getLength, setLength);

/**
 * @protected
 * @override
 * @this {!DataArray<T>}
 * @param {number} time
 */
DataArray.prototype._update = function (time) {
    /** @const {!Array} */
    var args = this._args;
    /** @const {number} */
    var mut = args[Args.Mutation];
    if (mut === Mutation.Set) {
        this._value = this._set;
    } else {
        /** @const {T|!Array<T>|number|void} */
        var mutArgs = args[Args.MutationArgs];
        /** @const @type {!Array<T>} */
        var current = this._value;
        /** @const {number} */
        var ln = current.length;
        switch (mut) {
            case Mutation.Length:
                current.length = mutArgs;
                break;
            case Mutation.Replace:
                current[mutArgs[0]] = mutArgs[1];
                break;
            case Mutation.Pop:
            case Mutation.PopRange:
                current.length -= mutArgs;
                break;
            case Mutation.Push:
                current[ln] = mutArgs;
                break;
            case Mutation.PushRange:
                current.push.apply(current, mutArgs);
                break;
            case Mutation.Shift:
                current.shift();
                break;
            case Mutation.Unshift:
                current.unshift(mutArgs);
                break;
            case Mutation.Reverse:
                current.reverse();
                break;
            case Mutation.Sort:
                current.sort(mutArgs);
                break;
            case Mutation.Custom:
                // todo
                break;
            default:
                current.splice.apply(current, mutArgs);
        }
    }
    this._set = NIL;
    this._opt &= ~(Opts.Update | Opts.MayFlags);
    if ((this._opt & Opts.Send) !== 0) {
        sendUpdate(this, time);
    }
};

/**
 * @template T
 * @throws {Error}
 * @param {!DataArray<T>} node 
 * @param {number} mutation 
 * @param {T|Array<T>|number=} args 
 * @returns {void}
 */
function mutate(node, mutation, args) {
    if (node._set !== NIL) {
        throw new Error('conflicting mutation');
    }
    node._args[Args.Mutation] = mutation;
    node._args[Args.MutationArgs] = args;
    setData.call(node, MUT);
}

/**
 * @public
 * @this {!DataArray<T>}
 * @throws {Error}
 * @returns {void}
 */
DataArray.prototype.pop = function () {
    if (this._value.length !== 0 || STAGE !== Stage.Idle) {
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
DataArray.prototype.push = function (elementN) {
    /** @const {number} */
    var ln = arguments.length;
    if (ln === 1) {
        mutate(this, Mutation.Push, elementN);
    } else {
        /** @type {number} */
        var i = 0;
        /** @type {!Array<T|number>} */
        var args = new Array(ln);
        for (; i < ln; i++) {
            args[i] = arguments[i];
        }
        mutate(this, Mutation.PushRange, args);
    }
};

/**
 * @this {!DataArray<T>}
 * @throws {Error}
 * @returns {void}
 */
DataArray.prototype.reverse = function () {
    if (this._value.length !== 0 || STAGE !== Stage.Idle) {
        mutate(this, Mutation.Reverse);
    }
};

/**
 * @public
 * @this {!DataArray<T>}
 * @throws {Error}
 * @returns {void}
 */
DataArray.prototype.shift = function () {
    if (this._value.length !== 0 || STAGE !== Stage.Idle) {
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
DataArray.prototype.sort = function (compareFn) {
    if (this._value.length !== 0 || STAGE !== Stage.Idle) {
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
DataArray.prototype.splice = function (start, deleteCount, items) {
    /** @const {number} */
    var ln = arguments.length;

};

/**
 * @public
 * @this {!DataArray<T>}
 * @param {...T} elementN
 * @throws {Error} 
 * @returns {void}
 */
DataArray.prototype.unshift = function (elementN) {
    /** @const {number} */
    var ln = arguments.length;
    if (ln === 1) {
        mutate(this, Mutation.Unshift, elementN);
    } else {
        var args = new Array(ln);
        for (var i = 0; i < ln; i++) {
            args[i] = arguments[i];
        }
        mutate(this, Mutation.UnshiftRange, [0, 0, args]);
    }
};

/**
 * @struct
 * @protected
 * @template T,U
 * @constructor
 * @extends {Collection<T,(function(!Array<T>,!Array<U>): !Array<T>)>}
 * @implements {Receive}
 * @implements {ReadSignal<!Array<T>>}
 * @implements {SignalEnumerable<T>}
 * @param {!Send<!Array>} src
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
     * @type {!Array<U>}
     */
    this._args = args;
    startCompute(null, false, this, args, src);
}

makeReactive(Enumerable, [Computation, Collection], peekVal, getComputation, void 0, getLength);

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
 * @returns {void}
 */
Enumerable.prototype._unmount = function () {

};

/**
 * @protected
 * @override
 * @this {!Enumerable<T>}
 * @param {number} time 
 * @returns {void}
 */
Enumerable.prototype._update = function (time) {
    /** @const {?Own} */
    var owner = OWNER;
    /** @const {boolean} */
    var listen = LISTEN;
    /** @const {Array} */
    var args = this._args;
    OWNER = null;
    LISTEN = false;
    args[Args.Changed] = 0;
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
    effectWhen, $effectWhen
};

/* __SOURCE__ */