/**
 * @const
 * @enum {number}
 */
var State = {
    Void: 0,
    WillDispose: 1,
    WillUpdate: 2,
    Disposed: 4,
    MayUpdate: 8,
    MayDispose: 16,
    Scope: 32,
    SendOne: 64,
    SendMany: 128,
    ReceiveOne: 256,
    ReceiveMany: 512,
    Updating: 1024,
    MayCleared: 2048,
    Respond: 4096,
    Compare: 8192,
    Cleanup: 16384,
    Dynamic: 32768
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
/* __ENUMS__ */
/**
 * @public
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
 * @public
 * @template T
 * @param {T} value 
 * @returns {Signal<T>}
 */
export function data(value) {
    return new Data(value, null);
}

/**
 * @public
 * @template T
 * @param {T} value 
 * @param {function(T,T): boolean=} eq
 * @returns {Signal<T>}
 */
export function value(value, eq) {
    return new Data(value, eq);
}

/**
 * @public
 * @template T,U
 * @param {function(T,U): T} fn 
 * @param {T=} seed 
 * @param {null | (function(T,T): boolean)=} eq
 * @param {U=} args
 * @returns {Reactive<T>}
 */
export function compute(fn, seed, eq, args) {
    return new Compute(fn, seed, State.Void, eq, args)._init();
}

/**
 * @public
 * @template T,U
 * @param {function(T,U): T} fn 
 * @param {T=} seed 
 * @param {null | (function(T,T): boolean)=} eq
 * @param {U=} args
 * @returns {Reactive<T>}
 */
export function $compute(fn, seed, eq, args) {
    return new Compute(fn, seed, State.Dynamic, eq, args)._init();
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
 * @public
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
 * @public
 * @param {Cleanup} fn
 * @returns {void} 
 */
export function cleanup(fn) {
    if (CONTEXT._owner !== null) {
        CONTEXT._owner._addCleanup(fn);
    }
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
    this._index = 0;
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
Queue.prototype._drain = function () {
    for (; this._index < this._count; this._index++) {
        this._items[this._index]._state &= ~(
            State.Updating |
            State.WillUpdate |
            State.MayUpdate |
            State.MayDispose |
            State.MayCleared
        );
        this._items[this._index] = null;
    }
    this._count = this._index = 0;
};

/**
 * @package
 * @returns {void}
 */
Queue.prototype._dispose = function () {
    for (; this._index < this._count; this._index++) {
        this._items[this._index]._dispose();
        this._items[this._index] = null;
    }
    this._count = this._index = 0;
};

/**
 * @package
 * @returns {void}
 */
Queue.prototype._update = function () {
    for (; this._index < this._count; this._index++) {
        var item = this._items[this._index];
        if (item._state & State.WillUpdate) {
            item._update();
        }
        item._state &= ~(
            State.Updating |
            State.WillUpdate |
            State.MayUpdate |
            State.MayDispose |
            State.MayCleared
        );
        this._items[this._index] = null;
    }
    this._count = this._index = 0;
};

/**
 * @const
 * @type {Object}
 */
var VOID = {};
/**
 * @type {number}
 */
var TIME = 1;
/**
 * @type {number}
 */
var STAGE = Stage.Idle;
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
 * @throws {Error}
 * @param {string=} msg 
 * @returns {void}
 */
function panic(msg) {
    throw new Error(msg);
}

/**
 * @returns {void}
 */
function reset() {
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
function addReceiver(from, to) {
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
function exec() {
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
function start() {
    var cycle = 0;
    var disposes = DISPOSES;
    var changes = CHANGES;
    var computes = COMPUTES;
    var updates = UPDATES;
    while (
        changes._count !== 0 ||
        disposes._count !== 0 ||
        computes._count !== 0 ||
        updates._count !== 0
    ) {
        TIME++;
        if (disposes._count !== 0) {
            STAGE = Stage.Disposes;
            disposes._dispose();
        }
        if (changes._count !== 0) {
            STAGE = Stage.Changes;
            changes._update();
        }
        if (computes._count !== 0) {
            STAGE = Stage.Computes;
            computes._update();
        }
        if (updates._count !== 0) {
            STAGE = Stage.Updates;
            updates._update();
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
function disposeModule() {
    if ((this._state & (State.WillDispose | State.Disposed)) === 0) {
        if (STAGE === Stage.Idle) {
            this._dispose();
        } else {
            DISPOSES._add(this);
        }
    }
}

/**
 * @param {Scope} scope
 * @returns {void}
 */
function disposeScope(scope) {
    var i = 0;
    var ln = 0;
    var state = scope._state;
    if (state & State.Scope) {
        var children = scope._children;
        for (ln = children.length; i < ln; i++) {
            children[i]._dispose();
        }
        scope._children = null;
    }
    if (state & State.Cleanup) {
        var cleanups = scope._cleanups;
        for (i = 0, ln = cleanups.length; i < ln; i++) {
            cleanups[i](true);
        }
        scope._cleanups = null;
    }
}

/**
 * @this {Scope}
 * @param {Module} child
 * @returns {void}
 */
function addChild(child) {
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
function addCleanup(fn) {
    this._state |= State.Cleanup;
    if (this._cleanups === null) {
        this._cleanups = [fn];
    } else {
        this._cleanups[this._cleanups.length] = fn;
    }
};

/**
 * @struct
 * @constructor
 * @extends {ModuleProto}
 * @implements {RootProto}
 */
function Root() {
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
 * @public
 * @override
 * @returns {void}
 */
Root.prototype.dispose = disposeModule;

/**
 * @package
 * @override
 * @returns {void}
 */
Root.prototype._dispose = function () {
    disposeScope(this);
    this._state = State.Disposed;
};

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
    send._equality =
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
function sendWillUpdate(send, time) {
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
        if ((node1._state & (State.WillUpdate | State.WillDispose)) === 0) {
            node1._recordWillUpdate();
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
            if ((node1._state & (State.WillUpdate | State.WillDispose)) === 0) {
                node1._recordWillUpdate();
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
        if ((node1._state & (State.MayUpdate | State.WillUpdate | State.WillDispose)) === 0) {
            node1._recordMayUpdate();
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
            if ((node1._state & (State.MayUpdate | State.WillUpdate | State.WillDispose)) === 0) {
                node1._recordMayUpdate();
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
            (node._state & (State.SendOne | State.SendMany)) !== 0 &&
            (node._state & (State.ReceiveOne | State.ReceiveMany)) !== 0 &&
            (node._state & (State.MayDispose | State.WillDispose | State.Disposed)) === 0
        ) {
            node._owner = owner;
            node._recordMayDispose();
        }
    }
}

/**
 * @param {Array<Module>} nodes 
 * @returns {void}
 */
function sendWillDispose(nodes) {
    var ln = nodes.length;
    for (var i = 0; i < ln; i++) {
        var node = nodes[i];
        if ((node._state & (State.WillDispose | State.Disposed)) === 0) {
            node._recordWillDispose();
        }
    }
}

/**
 * @struct
 * @template T
 * @constructor
 * @param {T} val
 * @param {null | (function(T,T): boolean)=} eq
 * @extends {ModuleProto}
 * @implements {DataProto<T>}
 */
function Data(val, eq) {
    /**
     * @package
     * @type {number}
     */
    this._state = eq === null ?
        State.Respond :
        eq !== void 0 ?
            State.Compare : State.Void;
    /**
     * @package
     * @type {T}
     */
    this._value = val;
    /**
     * @package
     * @type {null | (function(T,T): boolean) | undefined}
     */
    this._equality = eq;
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

/**
 * @public
 * @returns {void}
 */
Data.prototype.dispose = disposeModule;

/**
 * @public
 * @returns {T}
 */
Data.prototype.peek = function () {
    return this._value;
}

/**
 * @public
 * @returns {T}
 */
Data.prototype.val = function () {
    if (
        CONTEXT._listen !== null &&
        (this._state & (State.WillDispose | State.Disposed)) === 0
    ) {
        addReceiver(this, CONTEXT._listen);
    }
    return this._value;
}

/**
 * @param {T} val
 * @returns {void}
 */
Data.prototype.update = function (val) {
    var state = this._state;
    if ((state & (State.WillDispose | State.Disposed)) === 0) {
        if (
            (state & State.Respond) !== 0 || (
                (state & State.Compare) === 0 ?
                    val !== this._value :
                    !this._equality(val, this._value)
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
    disposeSender(this);
    this._value =
        this._next = null;
    this._state = State.Disposed;
};

/**
 * @package
 * @returns {void}
 */
Data.prototype._update = function () {
    this._value = this._next;
    this._next = VOID;
    sendWillUpdate(this, TIME);
};

/**
 * @package
 * @returns {void}
 */
Data.prototype._recordWillDispose = function () {
    this._state = State.WillDispose;
};

/**
 * @param {Receive} node 
 * @returns {void}
 */
function cleanupReceiver(node) {
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
 * @package
 * @template T,U
 * @constructor
 * @param {function(T,U): T} fn 
 * @param {T} value 
 * @param {number} state
 * @param {null | (function(T,T): boolean)=} eq
 * @param {U=} args
 * @extends {ModuleProto}
 * @implements {ComputeProto<T>}
 */
function Compute(fn, value, state, eq, args) {
    /**
      * @package
      * @type {number}
      */
    this._state = state | (eq === null ?
        State.Respond :
        eq !== void 0 ?
            State.Compare : State.Void);
    /**
     * @package
     * @type {T}
     */
    this._value = value;
    /**
     * @package
     * @type {null | (function(T,T): boolean) | undefined}
     */
    this._equality = eq;
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
    this._args = args;
};

/**
 * @public
 * @returns {void}
 */
Compute.prototype.dispose = disposeModule;

/**
 * @package
 * @param {Module} mod
 * @returns {void}
 */
Compute.prototype._addChild = addChild;

/**
 * @package
 * @param {Cleanup} fn
 * @returns {void}
 */
Compute.prototype._addCleanup = addCleanup;

/**
 * @public
 * @returns {T}
 */
Compute.prototype.val = function () {
    var state = this._state;
    if ((state & (State.WillDispose | State.Disposed)) === 0) {
        var time = TIME;
        var stage = STAGE;
        if (stage !== Stage.Idle && this._time === time) {
            if (state & State.WillUpdate) {
                if (state & State.MayDispose) {
                    this._clearMayUpdate(time);
                } else if (state & State.WillUpdate) {
                    this._update();
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
            (this._state & (State.WillDispose | State.Disposed)) === 0
        ) {
            addReceiver(this, CONTEXT._listen);
        }
    }
    return this._value;
};

/**
 * @public
 * @returns {T}
 */
Compute.prototype.peek = function () {
    if (
        STAGE !== Stage.Idle &&
        this._time === TIME &&
        (this._state & (State.WillDispose | State.Disposed)) === 0 &&
        (this._state & (State.WillUpdate | State.MayDispose | State.MayUpdate)) !== 0
    ) {
        this._clearMayUpdate(TIME);
    }
    return this._value;
};

/**
 * @package
 * @returns {void}
 */
Compute.prototype._dispose = function () {
    disposeScope(this);
    disposeSender(this);
    cleanupReceiver(this);
    this._value =
        this._next =
        this._args =
        this._sources =
        this._sourceslots = null;
    this._state = State.Disposed;
};

/**
 * @package
 * @returns {void}
 */
Compute.prototype._update = function () {
    var i = 0;
    var ln = 0;
    var owner = CONTEXT._owner;
    var listen = CONTEXT._listen;
    CONTEXT._owner = CONTEXT._listen = null;
    var state = this._state;
    if (state & State.Scope) {
        var children = this._children;
        for (ln = children.length; i < ln; i++) {
            children[i]._dispose();
        }
        children.length = 0;
        this._state &= ~State.Scope;
    }
    if (state & State.Cleanup) {
        var cleanups = this._cleanups;
        for (ln = cleanups.length, i = 0; i < ln; i++) {
            cleanups[i](false);
        }
        cleanups.length = 0;
        this._state &= ~State.Cleanup;
    }
    CONTEXT._owner = this;
    if (state & State.Dynamic) {
        cleanupReceiver(this);
        CONTEXT._listen = this;
    }
    var prev = this._value;
    this._state |= State.Updating;
    this._value = this._next(prev, this._args);
    if (
        (state & (State.SendOne | State.SendMany)) !== 0 &&
        (state & State.Respond) === 0 &&
        (
            (state & State.Compare) === 0 ?
                prev !== this._value :
                !this._equality(prev, this._value)
        )
    ) {
        sendWillUpdate(this, TIME);
    }
    CONTEXT._owner = owner;
    CONTEXT._listen = listen;
};

/**
 * @package
 * @returns {Reactive<T>} 
 */
Compute.prototype._init = function () {
    var owner = CONTEXT._owner;
    var listen = CONTEXT._listen;
    if (owner !== null) {
        owner._addChild(this);
    }
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
    CONTEXT._owner = owner;
    CONTEXT._listen = listen;
    return this;
};

/**
 * @package
 * @returns {void}
 */
Compute.prototype._recordWillDispose = function () {
    var state = this._state;
    this._state = (state | State.WillDispose) & ~State.WillUpdate;
    if ((state & (State.WillUpdate | State.Scope)) === State.Scope) {
        sendWillDispose(this._children);
    }
};

/**
 * @package
 * @returns {void}
 */
Compute.prototype._recordMayDispose = function () {
    this._state |= State.MayDispose;
    if ((this._state & (State.MayUpdate | State.Scope)) === State.Scope) {
        sendMayDispose(this, TIME);
    }
};

/**
 * @package
 * @returns {void}
 */
Compute.prototype._recordMayUpdate = function () {
    var state = this._state;
    this._state |= State.MayUpdate;
    if ((state & (State.MayDispose | State.Scope)) === State.Scope) {
        sendMayDispose(this, TIME);
    }
    if ((state & (State.SendOne | State.SendMany)) !== 0) {
        sendMayUpdate(this, TIME);
    }
};

/**
 * @package
 * @returns {void}
 */
Compute.prototype._recordWillUpdate = function () {
    var state = this._state;
    this._state |= State.WillUpdate;
    if (state & State.Scope) {
        sendWillDispose(this._children);
    }
    if (
        (state & (State.SendOne | State.SendMany)) !== 0 &&
        (state & State.Respond) === 0
    ) {
        COMPUTES._add(this);
        if ((state & State.MayUpdate) === 0) {
            sendMayUpdate(this, TIME);
        }
    } else {
        UPDATES._add(this);
        if ((state & (State.SendOne | State.SendMany)) !== 0) {
            sendWillUpdate(this, TIME);
        }
    }
};

/**
 * @package
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
    check: if ((this._state & (State.WillDispose | State.Disposed | State.MayUpdate)) === State.MayUpdate) {
        if (this._state & State.ReceiveOne) {
            var source1 = this._source1;
            if (source1._time === time && (source1._state & State.MayUpdate)) {
                this._source1._clearMayUpdate(time);
                if ((this._state & (State.WillDispose | State.WillUpdate)) !== 0) {
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
                    if ((this._state & (State.WillDispose | State.WillUpdate)) !== 0) {
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
        this._update();
    }
};
