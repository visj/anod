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
 * @returns {!SignalEnumerable<T>}
 */
SignalCollection.prototype.reverse = function () { };

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
 * 
 * @throws {Error}
 * @param {function(T,T): number} compareFn
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
var DisposeFn;

/** @typedef {function(boolean): void} */
var CleanupFn;

/** @typedef {function(*): void} */
var RecoverFn;

/** @typedef {!ReadSignal|!Array<ReadSignal>} */
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
    Send: 256,
    Receive: 512,
    ReceiveMany: 1024,
    Respond: 2048,
    Bound: 4096,
    Defer: 8192,
    EvalSource: 16384,
    Unmount: 32768,
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
    None: 0,
    Set: 1,
    Push: 2,
    Unshift: 3,
    Pop: 4,
    Shift: 5,
    Splice: 6,
    Sort: 7,
};

/**
 * @protected
 * @interface
 * @extends {Dispose}
 */
function Child() { }

/**
 * @protected
 * @type {?Own}
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
 * @param {!Own} Own
 * @param {number} time
 * @returns {void}
 */
Child.prototype._recMayDispose = function (Own, time) { };

/**
 * @protected
 * @interface
 * @template T
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
 * @param {number} time
 * @returns {void}
 */
Send.prototype._update = function (time) { };

/**
 * @protected
 * @interface
 * @extends {Child}
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

/**
 * @protected
 * @param {number} time
 * @returns {void}
 */
Receive.prototype._clearMayDispose = function (time) { };

/**
 * @protected
 * @param {number} time
 * @returns {void} 
 */
Receive.prototype._clearMayUpdate = function (time) { };

/* __EXCLUDE__ */

/**
 * @public
 * @template T
 * @param {function(DisposeFn): T} fn 
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
    /** @const {DisposeFn|void} */
    var disposer = orphan ? void 0 : function () {
        dispose(/** @type {!Root} */(node));
    };
    ROOT = OWNER = node;
    LISTEN = false;
    try {
        return (
            orphan ?
               /** @type {function(): T} */(fn)() :
                fn(/** @type {DisposeFn} */(disposer))
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
 * @param {function(T,DisposeFn,U): T} fn 
 * @param {T=} seed 
 * @param {(function(T,T): boolean)|null=} eq
 * @param {U=} args
 * @returns {!ReadSignal<T>}
 */
function compute(fn, seed, eq, args) {
    return new Computation(fn, seed, Opts.Static, eq, args);
}

/**
 * @public
 * @template T,U
 * @param {function(T,DisposeFn,U): T} fn 
 * @param {T=} seed 
 * @param {(function(T,T): boolean)|null=} eq
 * @param {U=} args
 * @returns {!ReadSignal<T>}
 */
function $compute(fn, seed, eq, args) {
    return new Computation(fn, seed, 0, eq, args);
}

/**
 * @public
 * @template T,U
 * @param {!ReadSignal|!Array<!ReadSignal>} src
 * @param {function(T,DisposeFn,U,?): T} fn 
 * @param {T=} seed 
 * @param {(function(T,T): boolean)|null=} eq
 * @param {U=} args
 * @returns {!ReadSignal<T>}
 */
function computeWhen(src, fn, seed, eq, args) {
    return new Computation(fn, seed, Opts.Static | Opts.Bound, eq, args, src);
}

/**
 * @public
 * @template T,U
 * @param {function(T,DisposeFn): T} fn 
 * @param {T=} seed 
 * @param {U=} args
 * @returns {T}
 */
function effect(fn, seed, args) {
    return new Computation(fn, seed, Opts.Static, void 0, args)._value;
}

/**
 * @public
 * @template T,U
 * @param {function(T,DisposeFn): T} fn 
 * @param {T=} seed 
 * @param {U=} args
 * @returns {T}
 */
function $effect(fn, seed, args) {
    return new Computation(fn, seed, 0, void 0, args)._value;
}

/**
 * @public
 * @template T,U
 * @param {!ReadSignal|!Array<!ReadSignal>} src
 * @param {function(T,DisposeFn,U,?): T} fn 
 * @param {T=} seed 
 * @param {boolean=} defer
 * @param {U=} args
 * @returns {!ReadSignal<T>}
 */
function effectWhen(src, fn, seed, defer, args) {
    return new Computation(fn, seed, Opts.Static | Opts.Bound | (defer ? Opts.Defer : 0), void 0, args, src)._value;
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
 * @param {CleanupFn} fn 
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
 * @noinline
 * @param {Function} child
 * @param {Function} parent1
 * @param {Function=} parent2
 */
function extend(child, parent1, parent2) {
    /**
     * @constructor
     * @extends {Reactive}
     */
    function ctor() { };
    /** @type {Object} */
    var proto = ctor.prototype = new Reactive();
    for (var key in parent1.prototype) {
        proto[key] = parent1.prototype[key];
    }
    if (parent2 !== void 0) {
        for (var key in parent2.prototype) {
            proto[key] = parent2.prototype[key];
        }
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
function getValue() {
    return this._value;
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
 * @protected
 * @param {!Receive} receive 
 * @param {number} slot
 */
function removeSender(receive, slot) {
    /** @const {number} */
    var opt = receive._opt;
    if (opt !== Opts.Disposed) {
        /** @type {boolean} */
        var orphan;
        if (slot === -1) {
            receive._source1 = null;
            orphan = (
                (opt & Opts.ReceiveMany) === 0 ||
                receive._sources === null ||
                receive._sources.length === 0
            );
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
            orphan = ln === 1 && receive._source1 === null;
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
 * @param {!Array<!Child>} children 
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
 * @param {!Own} owner
 * @param {!Array<!Child>} children 
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
 * @constructor
 */
function Reactive() { }

/**
 * @struct
 * @template T,U
 * @protected
 * @constructor
 * @extends {Reactive}
 * @implements {Send<T>}
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
     * @type {?Own}
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

extend(Data, Reactive);

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
 * @param {!Own} owner
 * @param {number} time
 * @returns {void}
 */
Data.prototype._recMayDispose = function (owner, time) {
    this._opt |= Opts.MayDispose;
    if (this._owner === null) {
        this._owner = owner;
    }
};

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
 * @returns {T}
 */
function setData(value) {
    /** @const {number} */
    var opt = this._opt;
    set: if ((opt & Opts.DisposeFlags) === 0) {
        if ((
            this._eq === null || (
                ((opt & Opts.Compare) === 0) ?
                    value !== this._value :
                    !this._eq(value, this._value)
            )
        ) && (STAGE !== Stage.Idle || (opt & Opts.Send) !== 0)) {
            /** @const {number} */
            var time = TIME;
            if ((opt & Opts.MayDispose) !== 0) {
                if ((opt & Opts.MayCleared) !== 0) {
                    // cyclical Ownship ??
                    throw new Error();
                }
                this._opt |= Opts.MayCleared;
                this._owner._clearMayDispose(time);
                this._opt &= ~(Opts.MayFlags);
                if ((this._opt & Opts.DisposeFlags) !== 0) {
                    break set;
                }
            }
            if (this._set !== NIL && value !== this._set) {
                throw new Error("Zorn: Conflict");
            }
            this._set = value;
            if (STAGE === Stage.Idle) {
                reset();
                this._update(TIME + 1);
                exec();
            } else {
                this._opt |= Opts.Update;
                CHANGES._add(this);
            }
        } else {
            this._value = value;
        }
    }
    return value;
}

setValProto(Data, getData, getValue, setData);

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
 * @override
 * @this {!Data<T>}
 * @param {!Own} owner 
 * @param {number} time 
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
 * @extends {Data<T,(function(T,DisposeFn,U,?): T)>}
 * @implements {OwnOne}
 * @implements {Receive}
 * @implements {ReadSignal<T>}
 * @param {function(T,DisposeFn,U,?): T} fn 
 * @param {T} value 
 * @param {number} opt
 * @param {(function(T,T): boolean)|null=} eq
 * @param {U=} args
 * @param {Source=} src
 */
function Computation(fn, value, opt, eq, args, src) {
    Data.call(this, opt | (
        eq === null ? Opts.Respond :
            eq !== void 0 ? Opts.Compare : 0
    ), fn, value, eq);
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
    /** @const {number} */
    var fnLength = fn.length;
    /** @type {DisposeFn} */
    var disposer;
    if (fnLength > 1) {
        /** @const {!Computation<T>} */
        var self = this;
        disposer = function () {
            dispose(self);
        }
    }
    /**
     * @protected
     * @type {DisposeFn}
     */
    this._disposer = disposer;
    /**
     * @protected
     * @type {U}
     */
    this._args = args;
    /** @const {?Own} */
    var owner = OWNER;
    /** @const {boolean} */
    var listen = LISTEN;
    if ((opt & Opts.Defer) === 0) {
        OWNER = this;
        LISTEN = true;
        /** @type {?} */
        var sourceVal;
        if (STAGE === Stage.Idle) {
            reset();
            STAGE = Stage.Started;
            try {
                if ((opt & Opts.Bound) !== 0) {
                    sourceVal = initSource(this, opt, fnLength, /** @type {Source} */(src));
                }
                this._value = fn(value, disposer, args, sourceVal);
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
                sourceVal = initSource(this, opt, fnLength, /** @type {Source} */(src));
            }
            this._value = fn(value, disposer, args, sourceVal);
        }
    }
    OWNER = owner;
    LISTEN = listen;
};

extend(Computation, Root, Data);

/**
 * 
 * @param {!Computation} node 
 * @param {number} opt 
 * @param {number} fnLength 
 * @param {Source} src 
 * @returns {?}
 */
function initSource(node, opt, fnLength, src) {
    /** @type {?} */
    var sourceVal;
    if (fnLength > 3) {
        opt = node._opt |= Opts.EvalSource;
    }
    if (Array.isArray(src)) {
        sourceVal = readSource(opt | Opts.ReceiveMany, null, src);
    } else {
        sourceVal = readSource(opt, src);
    }
    LISTEN = false;
    return sourceVal;
}

/**
 * @template T
 * @param {number} opt 
 * @param {?ReadSignal<T>=} node1 
 * @param {?Array<ReadSignal>=} nodes 
 * @returns {T|Array<?>|void}
 */
function readSource(opt, node1, nodes) {
    /** @type {T|Array<?>} */
    var sourceVal;
    if ((opt & Opts.ReceiveMany) === 0) {
        sourceVal = node1.val;
    } else {
        /** @type {number} */
        var i;
        /** @type {number} */
        var ln;
        if ((opt & Opts.EvalSource) === 0) {
            for (i = 0, ln = nodes.length; i < ln; i++) {
                sourceVal = nodes[i].val;
            }
        } else {
            /** @type {number} */
            var j = 0;
            sourceVal = [];
            if ((opt & Opts.Update) !== 0) {
                sourceVal[j++] = node1.val;
            }
            for (i = 0, ln = nodes.length; i < ln; i++) {
                sourceVal[j++] = nodes[i].val;
            }
        }
    }
    if ((opt & Opts.EvalSource) !== 0) {
        return sourceVal;
    }
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
 * @template T
 * @this {!Computation<T>}
 * @returns {T}
 */
function getComputation() {
    /** @type {number} */
    var opt = this._opt;
    if ((opt & Opts.DisposeFlags) === 0 && STAGE !== Stage.Idle) {
        /** @const {number} */
        var time = TIME;
        if (STAGE === Stage.Computes && (opt & Opts.MayDispose | Opts.MayUpdate) !== 0 && this._age !== time) {
            if ((opt & Opts.MayCleared) !== 0) {
                // cyclic dependency
                throw new Error("cyclic pending dependency");
            }
            this._opt |= Opts.MayCleared;
            this._clearMayDispose(time);
            opt = this._opt &= ~Opts.MayFlags;
        }
        if ((opt & Opts.Update) !== 0 && this._age === time) {
            if ((opt & Opts.Updated) !== 0) {
                throw new Error("cyclic dependency");
            }
            this._update(time);
        }
        if ((this._opt & (Opts.DisposeFlags)) === 0 && LISTEN) {
            logRead(this, /** @type {!Receive} */(OWNER));
        }
    }
    return this._value;
}

setValProto(Computation, getComputation, getValue);

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
};

/**
 * @protected
 * @override
 * @this {!Computation<T>}
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
    if (this._children !== null && (opt & Opts.MayUpdate) === 0) {
        sendDispose(this._children, time);
    }
};

/**
 * @protected
 * @override
 * @this {!Computation<T>}
 * @param {!Own} owner
 * @param {number} time
 */
Computation.prototype._recMayDispose = function (owner, time) {
    /** @const {number} */
    var opt = this._opt;
    this._opt = (opt | Opts.MayDispose) & ~Opts.MayCleared;
    if (this._owner === null) {
        this._owner = owner;
    }
    if (this._children !== null && (opt & Opts.MayUpdate) === 0) {
        sendMayDispose(this, this._children, time);
    }
};

/**
 * @this {!Receive}
 * @param {number} time 
 */
function clearMayDispose(time) {
    /** @type {number} */
    var opt = this._opt;
    if ((opt & Opts.MayDispose) !== 0) {
        this._owner._clearMayDispose(time);
        opt = this._opt &= ~Opts.MayDispose;
    }
    if ((opt & (Opts.DisposeFlags | Opts.MayUpdate)) === Opts.MayUpdate) {
        /** @type {?Send} */
        var source1 = this._source1;
        if (
            source1 !== null &&
            (source1._opt & Opts.Respond) === 0 &&
            (source1._opt & (Opts.Update | Opts.MayUpdate)) !== 0
        ) {
            source1._clearMayUpdate(time);
        }
        opt = this._opt;
        this._opt &= ~Opts.MayUpdate;
    }
    return (opt & (Opts.DisposeFlags | Opts.MayUpdate)) === Opts.MayUpdate;
}

/**
 * @protected
 * @param {number} time 
 * @returns {void}
 */
Computation.prototype._clearMayDispose = function (time) {
    if (clearMayDispose.call(this, time)) {
        /** @type {number} */
        var ln;
        /** @const {?Array<!Send>} */
        var sources = this._sources;
        if (sources !== null && (ln = sources.length) > 0) {
            for (var /** number */ i = 0; i < ln; i++) {
                var source1 = sources[i];
                if (
                    (source1._opt & Opts.Respond) === 0 &&
                    (source1._opt & (Opts.Update | Opts.MayUpdate)) !== 0
                ) {
                    source1._clearMayUpdate(time);
                    if (this._age === time) {
                        break;
                    }
                }
            }
        }
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
    if (children !== null && (ln = children.length) !== 0) {
        for (i = 0; i < ln; i++) {
            children[i]._dispose(time);
        }
        children.length = 0;
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
    /** @type {?} */
    var sourceVal;
    if ((opt & Opts.Static) === 0) {
        LISTEN = true;
        this._opt &= ~Opts.Receive;
        disposeReceiver(this);
    } else {
        LISTEN = false;
        if ((opt & Opts.Bound) !== 0) {
            sourceVal = readSource(opt, this._source1, this._sources);
        }
    }
    /** @const {T} */
    var value = this._value;
    this._opt |= Opts.Updated;
    this._value = this._set(value, this._disposer, this._args, sourceVal);
    if (
        ((opt & (Opts.Send | Opts.Respond)) === Opts.Send) &&
        ((opt & Opts.Compare) === 0 ? value !== this._value : !this._eq(value, this._value))
    ) {
        sendUpdate(this, time);
    }
    opt = this._opt &= ~(Opts.UpdateFlags | Opts.MayFlags);
    if ((opt & Opts.Receive) === 0) {
        this._unmount();
    } else {
        this._opt &= ~Opts.Unmount;
    }
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
    if (this._children !== null) {
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
 */
Computation.prototype._recMayUpdate = function (time) {
    /** @const {number} */
    var opt = this._opt;
    this._opt = (opt | Opts.MayUpdate) & ~Opts.MayCleared;
    if (this._children !== null && (opt & Opts.MayDispose) === 0) {
        sendMayDispose(this, this._children, time);
    }
    if ((opt & Opts.Send) !== 0) {
        sendMayUpdate(this, time);
    }
};

/**
 * @protected
 * @override
 * @param {number} time
 * @returns {void} 
 */
Computation.prototype._clearMayUpdate = function (time) {
    this._clearMayDispose(time);
    if ((this._opt & Opts.Update) !== 0 && this._age === time) {
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
        this._disposer =
        this._sources =
        this._sourceslots = /** @type {?} */(null);
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
        to._opt |= Opts.ReceiveMany;
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
 * @abstract
 * @template T,U
 * @constructor
 * @extends {Data<!Array<T>,U>}
 */
function Collection() { }

extend(Collection, Data);

/* __EXCLUDE__ */

/**
 * @type {!ReadSignal<number>}  
 */
Collection.prototype.length;

/* __EXCLUDE__ */

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
 * @param {string=} separator
 * @returns {!ReadSignal<string>}
 */
Collection.prototype.join = function (separator) {

};

/**
 * 
 * @param {T} searchElement 
 * @param {number=} fromIndex
 * @returns {!ReadSignal<number>}
 */
Collection.prototype.lastIndexOf = function (searchElement, fromIndex) { };

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
 * @returns {!SignalEnumerable<T>}
 */
Collection.prototype.reverse = function () { };

/**
 * @param {number=} start
 * @param {number=} end
 * @returns {!SignalEnumerable<T>}
 */
Collection.prototype.slice = function (start, end) { };

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
     * @type {number}
     */
    this._mutation = 0;
}

extend(DataArray, Data, Collection);

setValProto(DataArray, getData, getValue, setData);

/**
 * @protected
 * @override
 * @this {!DataArray<T>}
 * @param {number} time
 */
DataArray.prototype._update = function (time) {
    switch (this._mutation) {
        case Mutation.Set:
            break;
    }
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

/**
 * @struct
 * @protected
 * @template T,U
 * @constructor
 * @extends {Collection<T,(function(T,!ReadSignal<number>): U)>}
 * @implements {Own}
 * @implements {Receive}
 * @implements {ReadSignal<!Array<T>>}
 * @param {!Send<!Array>} src
 * @param {function(T,!ReadSignal<number>): U} fn
 */
function Enumerable(src, fn) {
    Data.call(this, 0, fn, [], null);
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
    logRead(src, this);
}

extend(Enumerable, Computation, Collection);

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
 * @returns {void}
 */
Enumerable.prototype._clearMayDispose;

/**
 * @protected
 * @param {number} time
 * @returns {void} 
 */
Enumerable.prototype._clearMayUpdate;

/**
 * @protected
 * @override
 * @this {!Enumerable<T>}
 * @param {number} time 
 */
Enumerable.prototype._dispose;

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

setValProto(Enumerable, getComputation, getValue);

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
 */
Enumerable.prototype._update = function (time) {

};

export {
    root, peek, batch, stable,
    recover, cleanup, dispose,
    data, value, array,
    compute, $compute, computeWhen,
    effect, $effect, effectWhen
};

/* __SOURCE__ */