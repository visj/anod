/**
 * @const
 * @enum {number}
 */
var State = {
    Void: 0,
    Disposing: 1,
    WillUpdate: 2,
    Disposed: 4,
    MayUpdate: 8,
    MayDispose: 16,
    WillDispose: 32,
    Scope: 64,
    SendOne: 128,
    SendMany: 256,
    ReceiveOne: 512,
    ReceiveMany: 1024,
    Updating: 2048,
    MayCleared: 4096,
    Respond: 8192,
    Compare: 16384,
    Cleanup: 32768,
    Unstable: 65536
};
/**
 * @const
 * @enum {number}
 */
var Stage = {
    Idle: 0,
    Started: 1,
    Disposes: 2,
    Changes: 3,
    Computes: 4,
    Updates: 5,
};
/**
 * @enum {number}
 */
var Type = {
    Reactive: 1,
    Value: 2,
    Array: 3,
    Object: 4,
    Function: 5
};
/* __ENUMS__ */
export { State, Stage, Type };
/**
 * @template T
 * @param {function(Dispose): T} fn 
 * @returns {T}
 */
export function root(fn) {
    /** @type {Scope} */
    var node;
    /** @type {Dispose} */
    var disposer;
    var scope = CONTEXT._root;
    var owner = CONTEXT._owner;
    var listen = CONTEXT._listen;
    if (fn.length === 0) {
        node = scope;
    } else {
        node = new Root();
        if (scope !== null) {
            scope._addChild(node);
        }
        disposer = function () { node.dispose(); };
    }
    CONTEXT._listen = null;
    CONTEXT._root = CONTEXT._owner = node;
    try {
        return fn(disposer);
    } finally {
        CONTEXT._root = scope;
        CONTEXT._owner = owner;
        CONTEXT._listen = listen;
    }
}

/**
 * @template T
 * @param {function(): T} fn 
 * @returns {T}
 */
export function sample(fn) {
    var listen = CONTEXT._listen;
    CONTEXT._listen = null;
    var result = fn();
    CONTEXT._listen = listen;
    return result;
}

/**
 * @param {function(): void} fn 
 * @returns {void}
 */
export function batch(fn) {
    if (STAGE === Stage.Idle) {
        STAGE = Stage.Started;
        reset();
        fn();
        exec();
    } else {
        fn();
    }
}

/**
 * @param {Cleanup} fn
 * @returns {void} 
 */
export function cleanup(fn) {
    if (CONTEXT._owner !== null) {
        CONTEXT._owner._addCleanup(fn);
    }
}

export function stable() {
    if (CONTEXT._owner !== null) {
        CONTEXT._owner._state &= ~State.Unstable;
    }
}

/**
 * @template T
 * @param {T} value 
 * @returns {SignalValue<T>}
 */
export function data(value) {
    return new Data(value, null);
}

/**
 * @template T
 * @param {T} value 
 * @param {function(T,T): boolean=} eq
 * @returns {SignalValue<T>}
 */
export function value(value, eq) {
    return new Data(value, eq);
}

/**
 * @public
 * @template T, U
 * @param {function(T, U): T} fn 
 * @param {T=} seed
 * @param {SignalOptions<T, U>=} opts
 * @returns {Signal<T>}
 */
export function compute(fn, seed, opts) {
    return new Compute(fn, seed, opts)._init();
}

/**
 * @final
 * @struct
 * @package
 * @constructor
 */
function Queue() {
    /**
     * @const
     * @package
     * @type {Array<Module | null>}
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
 * @param {Module} item
 * @returns {void}
 */
Queue.prototype._add = function (item) {
    this._items[this._count++] = item;
};

/**
 * @package
 * @returns {void}
 */
Queue.prototype._dispose = function () {
    for (var i = 0; i < this._count; i++) {
        this._items[i]._dispose();
        this._items[i] = null;
    }
    this._count = 0;
};

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Queue.prototype._update = function (time) {
    for (var i = 0; i < this._count; i++) {
        var item = this._items[i];
        if (item._state & State.WillUpdate) {
            item._update(time);
        }
        this._items[i] = null;
    }
    this._count = 0;
};
/**
 * @const
 * @type {undefined}
 */
export var _ = void 0;
/**
 * @const
 * @type {Object}
 */
export var VOID = {};
/**
 * @type {number}
 */
export var TIME = 1;
/**
 * @type {number}
 */
export var STAGE = Stage.Idle;
/**
 * @const
 * @type {Queue}
 */
export var DISPOSES = new Queue();
/**
 * @const
 * @type {Queue}
 */
export var CHANGES = new Queue();
/**
 * @const
 * @type {Queue}
 */
export var COMPUTES = new Queue();
/**
 * @const
 * @type {Queue}
 */
export var UPDATES = new Queue();
/**
 * @const
 * @type {Context}
 */
export var CONTEXT = {
    _root: null,
    _owner: null,
    _listen: null
};

/**
 * 
 * @param {*} val
 * @returns {number}
 */
export function type(val) {
    switch (typeof val) {
        case "function":
            return Type.Function;
        case "object":
            if (val !== null) {
                if (val instanceof Reactive) {
                    return Type.Reactive;
                }
                if (val instanceof Array) {
                    return Type.Array;
                }
                if (!(
                    val instanceof Date ||
                    val instanceof RegExp ||
                    val instanceof Error
                )) {
                    return Type.Object;
                }
            }
        // fallthrough
    }
    return Type.Value;
}

/**
 * 
 * @param {Function} SubClass 
 * @param {Function} SuperClass 
 */
export function extend(SubClass, SuperClass) {
    /**
     * @struct
     * @constructor
     */
    function Construct() { }
    Construct.prototype = SuperClass.prototype;
    SubClass.prototype = new Construct();
    SubClass.prototype.constructor = SubClass;
}

/**
 * 
 * @param {Function} SubClass 
 * @param {Function} SuperClass 
 */
export function inherit(SubClass, SuperClass) {
    for (var method in SuperClass.prototype) {
        SubClass.prototype[method] = SuperClass.prototype[method];
    }
}

/**
 * @throws {Error}
 * @param {string=} msg 
 * @returns {void}
 */
export function panic(msg) {
    throw new Error(msg);
}

/**
 * 
 * @param {number} val
 * @returns {void}
 */
export function stage(val) {
    STAGE = val;
}

/**
 * @returns {void}
 */
export function reset() {
    DISPOSES._count =
        CHANGES._count =
        COMPUTES._count =
        UPDATES._count = 0;
}

/**
 * @param {Send} from 
 * @param {Receive} to
 * @returns {void}
 */
export function addReceiver(from, to) {
    var fromslot = -1;
    var toslot = to._source1 === null ? -1 : to._sources === null ? 0 : to._sources.length;
    if (from._node1 === null) {
        from._node1 = to;
        from._node1slot = toslot;
        from._state |= State.SendOne;
    } else if (from._nodes === null) {
        fromslot = 0;
        from._nodes = [to];
        from._nodeslots = [toslot];
        from._state |= State.SendMany;
    } else {
        fromslot = from._nodes.length;
        from._nodes[fromslot] = to;
        from._nodeslots[fromslot] = toslot;
        from._state |= State.SendMany;
    }
    if (to._source1 === null) {
        to._source1 = from;
        to._source1slot = fromslot;
        to._state |= State.ReceiveOne;
    } else if (to._sources === null) {
        to._sources = [from];
        to._sourceslots = [fromslot];
        to._state |= State.ReceiveMany;
    } else {
        to._sources[toslot] = from;
        to._sourceslots[toslot] = fromslot;
        to._state |= State.ReceiveMany;
    }
}

/**
 * @returns {void}
 */
export function exec() {
    var owner = CONTEXT._owner;
    var listen = CONTEXT._listen;
    try {
        start();
    } finally {
        STAGE = Stage.Idle;
        CONTEXT._owner = owner;
        CONTEXT._listen = listen;
    }
}

/**
 * @returns {void}
 */
export function start() {
    var time = 0;
    var cycle = 0;
    var disposes = DISPOSES;
    var changes = CHANGES;
    var computes = COMPUTES;
    var updates = UPDATES;
    while (
        changes._count !== 0 ||
        computes._count !== 0 ||
        updates._count !== 0 ||
        disposes._count !== 0
    ) {
        time = ++TIME;
        if (disposes._count !== 0) {
            STAGE = Stage.Disposes;
            disposes._dispose();
        }
        if (changes._count !== 0) {
            STAGE = Stage.Changes;
            changes._update(time);
        }
        if (computes._count !== 0) {
            STAGE = Stage.Computes;
            computes._update(time);
        }
        if (updates._count !== 0) {
            STAGE = Stage.Updates;
            updates._update(time);
        }
        if (cycle++ > 1e5) {
            panic("cycle detected");
        }
    }
}

/**
 * @this {Module}
 * @returns {void}
 */
export function recordWillDispose() {
    if ((this._state & (State.WillDispose | State.Disposing | State.Disposed)) === 0) {
        if (STAGE === Stage.Idle) {
            this._dispose();
        } else {
            this._state |= State.WillDispose;
            DISPOSES._add(this);
        }
    }
}

/**
 * @param {Scope} scope
 * @returns {void}
 */
export function disposeScope(scope) {
    var ln = 0;
    var state = scope._state;
    if (state & State.Scope) {
        var children = scope._children;
        for (ln = children.length; ln--;) {
            children[ln]._dispose();
        }
        scope._children = null;
    }
    if (state & State.Cleanup) {
        var cleanups = scope._cleanups;
        for (ln = cleanups.length; ln--;) {
            cleanups[ln](true);
        }
        scope._cleanups = null;
    }
}

/**
 * @this {Scope}
 * @param {Module} child
 * @returns {void}
 */
export function addChild(child) {
    this._state |= State.Scope;
    if (this._children === null) {
        this._children = [child];
    } else {
        this._children[this._children.length] = child;
    }
}

/**
 * @this {Scope}
 * @param {Cleanup} fn
 * @returns {void}
 */
export function addCleanup(fn) {
    this._state |= State.Cleanup;
    if (this._cleanups === null) {
        this._cleanups = [fn];
    } else {
        this._cleanups[this._cleanups.length] = fn;
    }
};

/**
 * @struct
 * @template T
 * @constructor
 * @extends {Module<T>}
 */
export function Reactive() { }

/**
 * @public
 * @returns {T}
 */
Reactive.prototype.val = function () {
    if (
        CONTEXT._listen !== null &&
        (this._state & (State.WillDispose | State.Disposing | State.Disposed)) === 0
    ) {
        addReceiver(this, CONTEXT._listen);
    }
    return this._value;
};

/**
 * @public
 * @returns {T}
 */
Reactive.prototype.peek = function () {
    return this._value;
}

/**
 * @public
 * @returns {void}
 */
Reactive.prototype.dispose = recordWillDispose;

/**
 * @struct
 * @constructor
 * @extends {Reactive}
 * @implements {RootInterface}
 */
export function Root() {
    /**
     * @package
     * @type {number}
     */
    this._state = 0;
    /**
     * @package
     * @type {Array<Module> | null}
     */
    this._children = [];
    /**
     * @package
     * @type {Array<Cleanup> | null}
     */
    this._cleanups = null;
}

/**
 * @override
 * @returns {void}
 */
Root.prototype.dispose = recordWillDispose;

/**
 * @package
 * @override
 * @param {Module} child 
 * @returns {void}
 */
Root.prototype._addChild = addChild;

/**
 * @package
 * @override
 * @param {Cleanup} fn
 * @returns {void}
 */
Root.prototype._addCleanup = addCleanup;

/**
 * @package
 * @override
 * @returns {void}
 */
Root.prototype._dispose = function () {
    if (this._state !== State.Disposed) {
        disposeScope(this);
        this._state = State.Disposed;
    }
};

/**
 * @param {Send} send
 * @returns {void}
 */
function disposeSender(send) {
    var state = send._state;
    if (state & State.SendOne) {
        removeSender(send._node1, send._node1slot);
        send._node1 = null;
    }
    if (state & State.SendMany) {
        var ln = send._nodes.length;
        while (ln-- > 0) {
            removeSender(send._nodes[ln], send._nodeslots[ln]);
        }
    }
    send._compare =
        send._nodes =
        send._nodeslots = null;
}

/**
 * @param {Send} send 
 * @param {number} slot
 * @returns {void}
 */
function removeReceiver(send, slot) {
    if (send._state !== State.Disposed) {
        if (slot === -1) {
            send._node1 = null;
            send._state &= ~State.SendOne;
        } else {
            var nodes = send._nodes;
            var nodeslots = send._nodeslots;
            var last = nodes.pop();
            var lastslot = nodeslots.pop();
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
                send._state &= ~State.SendMany;
            }
        }
    }
}

/**
 * @param {Receive} receive 
 * @param {number} slot
 * @returns {void}
 */
function removeSender(receive, slot) {
    var state = receive._state;
    if (state !== State.Disposed) {
        if (slot === -1) {
            receive._source1 = null;
            receive._state &= ~State.ReceiveOne;
        } else {
            var sources = receive._sources;
            var sourceslots = receive._sourceslots;
            var last = sources.pop();
            var lastslot = sourceslots.pop();
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
                receive._state &= ~State.ReceiveMany;
            }
        }
    }
}

/**
 * @param {Send} send
 * @param {number} time
 * @returns {void}
 */
export function sendWillUpdate(send, time) {
    var state = send._state;
    var node1 = send._node1;
    if (state & State.SendOne) {
        if (node1._time < time) {
            node1._time = time;
            node1._state &= ~(
                State.Updating |
                State.WillUpdate |
                State.MayUpdate |
                State.MayDispose |
                State.MayCleared
            );
        }
        if ((node1._state & (State.WillUpdate | State.Disposing)) === 0) {
            node1._recordWillUpdate(time);
        }
    }
    if (state & State.SendMany) {
        var nodes = send._nodes;
        var ln = nodes.length;
        for (var i = 0; i < ln; i++) {
            node1 = nodes[i];
            if (node1._time < time) {
                node1._time = time;
                node1._state &= ~(
                    State.Updating |
                    State.WillUpdate |
                    State.MayUpdate |
                    State.MayDispose |
                    State.MayCleared
                );
            }
            if ((node1._state & (State.WillUpdate | State.Disposing)) === 0) {
                node1._recordWillUpdate(time);
            }
        }
    }
}

/**
 * @param {Send} send
 * @param {number} time
 * @returns {void}
 */
function sendMayUpdate(send, time) {
    var state = send._state;
    var node1 = send._node1;
    if (state & State.SendOne) {
        if (node1._time < time) {
            node1._time = time;
            node1._state &= ~(
                State.Updating |
                State.WillUpdate |
                State.MayUpdate |
                State.MayDispose |
                State.MayCleared
            );
        }
        if ((node1._state & (State.MayUpdate | State.WillUpdate | State.Disposing)) === 0) {
            node1._recordMayUpdate(time);
        }
    }
    if (state & State.SendMany) {
        var nodes = send._nodes;
        var len = nodes.length;
        for (var i = 0; i < len; i++) {
            node1 = nodes[i];
            if (node1._time < time) {
                node1._time = time;
                node1._state &= ~(
                    State.Updating |
                    State.WillUpdate |
                    State.MayUpdate |
                    State.MayDispose |
                    State.MayCleared
                );
            }
            if ((node1._state & (State.MayUpdate | State.WillUpdate | State.Disposing)) === 0) {
                node1._recordMayUpdate(time);
            }
        }
    }
}

/**
 * @param {Receive} owner
 * @param {number} time
 * @returns {void}
 */
function sendMayDispose(owner, time) {
    var children = owner._children;
    for (var i = 0, ln = children.length; i < ln; i++) {
        var node = children[i];
        if (node._time < time) {
            node._time = time;
            node._state &= ~(
                State.Updating |
                State.WillUpdate |
                State.MayUpdate |
                State.MayDispose |
                State.MayCleared
            );
        }
        if (
            (node._state & (State.SendOne | State.SendMany)) &&
            (node._state & (State.ReceiveOne | State.ReceiveMany)) &&
            (node._state & (State.MayDispose | State.Disposing | State.Disposed)) === 0
        ) {
            node._owner = owner;
            node._recordMayDispose(time);
        }
    }
}

/**
 * @param {Array<Module>} nodes 
 * @returns {void}
 */
function sendDispose(nodes) {
    var ln = nodes.length;
    for (var i = 0; i < ln; i++) {
        var node = nodes[i];
        if ((node._state & (State.Disposing | State.Disposed)) === 0) {
            node._recordDispose();
        }
    }
}

/**
 * @struct
 * @template T
 * @constructor
 * @param {T} val
 * @param {null | (function(T,T): boolean)=} eq
 * @extends {Reactive<T>}
 * @implements {DataInterface<T>}
 */
export function Data(val, eq) {
    /**
     * @package
     * @type {number}
     */
    this._state = eq === void 0 ? State.Void : (
        eq === null ? State.Respond : State.Compare
    );
    /**
     * @package
     * @type {T}
     */
    this._value = val;
    /**
     * @package
     * @type {null | (function(T,T): boolean) | undefined}
     */
    this._compare = eq;
    /**
     * @package
     * @type {Receive | null}
     */
    this._node1 = null;
    /**
     * @package
     * @type {number}
     */
    this._node1slot = -1;
    /**
     * @package
     * @type {Array<Receive> | null}
     */
    this._nodes = null;
    /**
     * @package
     * @type {Array<number> | null}
     */
    this._nodeslots = null;
    /**
     * @package
     * @type {T | Object}
     */
    this._next = VOID;
    if (CONTEXT._owner !== null) {
        CONTEXT._owner._addChild(this);
    }
}

extend(Data, Reactive);

/**
 * @param {T} val
 * @returns {void}
 */
Data.prototype.update = function (val) {
    var state = this._state;
    if ((state & (State.WillDispose | State.Disposing | State.Disposed)) === 0) {
        if (
            (state & State.Respond) !== 0 || (
                (state & State.Compare) === 0 ?
                    val !== this._value :
                    !this._compare(val, this._value)
            )
        ) {
            if (STAGE === Stage.Idle) {
                reset();
                this._value = val;
                sendWillUpdate(this, TIME + 1);
                exec();
            } else {
                if (this._next !== VOID && val !== this._next) {
                    panic("conflicting values");
                }
                this._next = val;
                this._state |= State.WillUpdate;
                CHANGES._add(this);
            }
        }
    }
}

/**
 * @package
 * @returns {void}
 */
Data.prototype._dispose = function () {
    if (this._state !== State.Disposed) {
        disposeSender(this);
        this._value =
            this._next = null;
        this._state = State.Disposed;
    }
};

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Data.prototype._update = function (time) {
    this._value = this._next;
    this._next = VOID;
    this._state &= ~State.WillUpdate;
    sendWillUpdate(this, time);
};

/**
 * @package
 * @returns {void}
 */
Data.prototype._recordDispose = function () {
    this._state = State.Disposing;
};

/**
 * @param {Receive} node 
 * @returns {void}
 */
export function cleanupReceiver(node) {
    var state = node._state;
    if (state & State.ReceiveOne) {
        removeReceiver(node._source1, node._source1slot);
        node._source1 = null;
    }
    if (state & State.ReceiveMany) {
        var ln = node._sources.length;
        while (ln-- > 0) {
            removeReceiver(node._sources.pop(), node._sourceslots.pop());
        }
    }
    node._state &= ~(State.ReceiveOne | State.ReceiveMany);
};

/**
 * @struct
 * @template T,U
 * @constructor
 * @param {function(T, U): T} fn 
 * @param {T} value 
 * @param {SignalOptions<T, U>=} opts
 * @extends {Reactive<T>}
 * @implements {ComputeInterface<T>}
 */
export function Compute(fn, value, opts) {
    /**
     * @package
     * @type {number}
     */
    this._state = (
        opts === void 0
    ) ? State.Void : (
        (
            (
                opts.compare === void 0
            ) ? State.Void : (
                opts.compare === null
            ) ? State.Respond : State.Compare
        ) |
        (
            opts.unstable ? State.Unstable : State.Void
        )
    );
    /**
     * @package
     * @type {T}
     */
    this._value = value;
    /**
     * @package
     * @type {null | (function(T,T): boolean) | undefined}
     */
    this._compare = opts ? opts.compare : void 0;
    /**
     * @package
     * @type {Receive | null}
     */
    this._node1 = null;
    /**
     * @package
     * @type {number}
     */
    this._node1slot = -1;
    /**
     * @package
     * @type {Array<Receive> | null}
     */
    this._nodes = null;
    /**
     * @package
     * @type {Array<number> | null}
     */
    this._nodeslots = null;
    /**
     * @package
     * @type {null | (function(T,U): T)}
     */
    this._next = fn;
    /**
     * @package
     * @type {Array<Module> | null}
     */
    this._children = null;
    /**
     * @package
     * @type {Array<Cleanup> | null}
     */
    this._cleanups = null;
    /**
     * @package
     * @type {Receive | null}
     */
    this._owner = null;
    /**
     * @package
     * @type {number}
     */
    this._time = 0;
    /**
     * @package
     * @type {Send | null}
     */
    this._source1 = null;
    /**
     * @package
     * @type {number}
     */
    this._source1slot = 0;
    /**
     * @package
     * @type {Array<Send> | null}
     */
    this._sources = null;
    /**
     * @package
     * @type {Array<number> | null}
     */
    this._sourceslots = null;
    /**
     * @package
     * @type {U}
     */
    this._args = opts ? opts.args : void 0;
};

extend(Compute, Reactive);
inherit(Compute, Root);

/**
 * @public
 * @override
 * @returns {T}
 */
Compute.prototype.val = function () {
    var state = this._state;
    if ((state & (State.Disposing | State.Disposed)) === 0) {
        var time = TIME;
        var stage = STAGE;
        if (stage !== Stage.Idle && this._time === time) {
            if (state & State.WillUpdate) {
                if (state & State.MayDispose) {
                    this._clearMayUpdate(time);
                } else if (state & State.WillUpdate) {
                    this._update(time);
                }
            } else if (
                stage === Stage.Computes &&
                (state & (State.MayDispose | State.MayUpdate))
            ) {
                this._clearMayUpdate(time);
            }
        }
        if (
            CONTEXT._listen !== null &&
            (this._state & (State.WillDispose | State.Disposing | State.Disposed)) === 0
        ) {
            addReceiver(this, CONTEXT._listen);
        }
    }
    return this._value;
};

/**
 * @public
 * @override
 * @returns {T}
 */
Compute.prototype.peek = function () {
    if (
        (this._state & (State.Disposing | State.Disposed)) === 0 &&
        (this._state & (State.WillUpdate | State.MayDispose | State.MayUpdate)) &&
        STAGE !== Stage.Idle &&
        this._time === TIME
    ) {
        this._clearMayUpdate(TIME);
    }
    return this._value;
};

/**
 * @package
 * @override
 * @returns {void}
 */
Compute.prototype._dispose = function () {
    if (this._state !== State.Disposed) {
        disposeScope(this);
        disposeSender(this);
        cleanupReceiver(this);
        this._value =
            this._next =
            this._args =
            this._sources =
            this._sourceslots = null;
        this._state = State.Disposed;
    }
};

/**
 * @package
 * @override
 * @param {number} time
 * @returns {void}
 */
Compute.prototype._update = function (time) {
    var i = 0;
    var ln = 0;
    var owner = CONTEXT._owner;
    var listen = CONTEXT._listen;
    CONTEXT._owner = CONTEXT._listen = null;
    var state = this._state;
    if (state & State.Scope) {
        var children = this._children;
        for (ln = children.length; ln--;) {
            children.pop()._dispose();
        }
        this._state &= ~State.Scope;
    }
    if (state & State.Cleanup) {
        var cleanups = this._cleanups;
        for (ln = cleanups.length; ln--;) {
            cleanups.pop()(false);
        }
        this._state &= ~State.Cleanup;
    }
    CONTEXT._owner = this;
    if (state & State.Unstable) {
        cleanupReceiver(this);
        CONTEXT._listen = this;
    }
    var prev = this._value;
    this._state |= State.Updating;
    this._value = this._next(prev, this._args);
    this._state &= ~(
        State.Updating |
        State.WillUpdate |
        State.MayUpdate |
        State.MayDispose |
        State.MayCleared
    );
    if (
        ((state & State.Respond) === 0) &&
        (state & (State.SendOne | State.SendMany)) &&
        (
            (state & State.Compare) === 0 ?
                prev !== this._value :
                !this._compare(prev, this._value)
        )

    ) {
        sendWillUpdate(this, time);
    }
    CONTEXT._owner = owner;
    CONTEXT._listen = listen;
};

/**
 * @package
 * @returns {Compute<T>} 
 */
Compute.prototype._init = function () {
    var owner = CONTEXT._owner;
    var listen = CONTEXT._listen;
    CONTEXT._owner = CONTEXT._listen = this;
    if (STAGE === Stage.Idle) {
        reset();
        STAGE = Stage.Started;
        try {
            this._value = this._next(this._value, this._args);
            if (CHANGES._count > 0 || DISPOSES._count > 0) {
                start();
            }
        } finally {
            STAGE = Stage.Idle;
            CONTEXT._owner = CONTEXT._listen = null;
        }
    } else {
        this._value = this._next(this._value, this._args);
    }
    if (owner !== null) {
        owner._addChild(this);
    }
    CONTEXT._owner = owner;
    CONTEXT._listen = listen;
    return this;
};

/**
 * @package
 * @override
 * @returns {void}
 */
Compute.prototype._recordDispose = function () {
    var state = this._state;
    this._state = (state | State.Disposing) & ~(State.WillUpdate | State.MayDispose | State.MayUpdate);
    if ((state & (State.WillUpdate | State.Scope)) === State.Scope) {
        sendDispose(this._children);
    }
};

/**
 * @package
 * @override
 * @param {number} time
 * @returns {void}
 */
Compute.prototype._recordMayDispose = function (time) {
    this._state |= State.MayDispose;
    if ((this._state & (State.MayUpdate | State.Scope)) === State.Scope) {
        sendMayDispose(this, time);
    }
};

/**
 * @package
 * @override
 * @param {number} time
 * @returns {void}
 */
Compute.prototype._recordMayUpdate = function (time) {
    this._state |= State.MayUpdate;
    if ((this._state & (State.MayDispose | State.Scope)) === State.Scope) {
        sendMayDispose(this, time);
    }
    if (this._state & (State.SendOne | State.SendMany)) {
        sendMayUpdate(this, time);
    }
};

/**
 * @package
 * @override
 * @param {number} time
 * @returns {void}
 */
Compute.prototype._recordWillUpdate = function (time) {
    var state = this._state;
    this._state |= State.WillUpdate;
    if (state & State.Scope) {
        sendDispose(this._children);
    }
    if (
        (state & State.Respond) === 0 &&
        (state & (State.SendOne | State.SendMany))
    ) {
        COMPUTES._add(this);
        if ((state & State.MayUpdate) === 0) {
            sendMayUpdate(this, time);
        }
    } else {
        UPDATES._add(this);
        if (state & (State.SendOne | State.SendMany)) {
            sendWillUpdate(this, time);
        }
    }
};

/**
 * @package
 * @override
 * @param {number} time
 * @returns {void} 
 */
Compute.prototype._clearMayUpdate = function (time) {
    if ((this._state & State.MayCleared) !== 0) {
        panic("cyclic dependency");
    }
    this._state |= State.MayCleared;
    if ((this._state & State.MayDispose) !== 0) {
        this._owner._clearMayUpdate(time);
        this._owner = null;
    }
    check: if ((this._state & (State.Disposing | State.Disposed | State.MayUpdate)) === State.MayUpdate) {
        if (this._state & State.ReceiveOne) {
            var source1 = this._source1;
            if (source1._time === time && (source1._state & State.MayUpdate)) {
                this._source1._clearMayUpdate(time);
                if ((this._state & (State.Disposing | State.WillUpdate)) !== 0) {
                    break check;
                }
            }
        }
        if (this._state & State.ReceiveMany) {
            var sources = this._sources;
            var ln = sources.length;
            for (var i = 0; i < ln; i++) {
                source1 = sources[i];
                if (source1._time === time && (source1._state & State.MayUpdate)) {
                    source1._clearMayUpdate(time);
                    if ((this._state & (State.Disposing | State.WillUpdate)) !== 0) {
                        break check;
                    }
                }
            }
        }
    }
    this._state &= ~(State.MayDispose | State.MayUpdate | State.MayCleared);
    if ((this._state & State.WillUpdate) !== 0) {
        if ((this._state & State.Updating) !== 0) {
            panic("cyclic dependency");
        }
        this._update(time);
    }
};