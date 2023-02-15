function nil() {
    return NIL;
}
function owner() {
    return OWNER;
}
function root(fn) {
    var node = new Owner();
    var owner = OWNER;
    var listen = LISTEN;
    OWNER = node;
    LISTEN = false;
    if (STAGE === 0) {
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
function compute(fn, seed, eq) {
    return new Computation(fn, seed, 1, eq);
}
function $compute(fn, seed, eq) {
    return new Computation(fn, seed, 0, eq);
}
function when(src, fn, defer) {
    var ln;
    var srcVal;
    var isArray = Array.isArray(src);
    if (isArray) {
        ln = src.length;
        srcVal = new Array(ln);
    }
    return function (seed) {
        if (isArray) {
            for (var i = 0; i < ln; i++) {
                srcVal[i] = src[i].val;
            }
        } else {
            srcVal = src.val;
        }
        if (defer) {
            defer = false;
        } else {
            seed = peek(fn, srcVal, seed);
        }
        return seed;
    };
}
function val(fn) {
    return new Val(fn);
}
function data(value) {
    return new Data(value);
}
function value(value, eq) {
    return new Value(value, eq);
}
function dispose(node) {
    var state = node._state;
    if ((state & 6) === 0) {
        if (STAGE === 0) {
            node._dispose();
        } else {
            node._state = (state & ~16) | 4;
            DISPOSES._add(node);
        }
    }
}
function peek(fn, arg1, arg2) {
    var listen = LISTEN;
    LISTEN = false;
    var result = fn(arg1, arg2);
    LISTEN = listen;
    return result;
}
function freeze(fn) {
    var result;
    if (STAGE === 0) {
        reset();
        STAGE = 1;
        try {
            result = fn();
            exec();
        } finally {
            STAGE = 0;
        }
    } else {
        result = fn();
    }
    return result;
}
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
function setValProto(obj, getVal, peekVal, setVal) {
    Object.defineProperties(obj, { val: { get: getVal, set: setVal }, peek: { get: peekVal } });
}
function getValue() {
    return this._value;
}
function Val(fn) {
    this._fn = fn;
}
function getVal() {
    return this._fn();
}
function peekVal() {
    return peek(this._fn);
}
setValProto(Val.prototype, getVal, peekVal);
function Send(owner, state, value) {
    this._state = 0 | state;
    this._value = value;
    this._node1 = null;
    this._node1slot = -1;
    this._nodes = null;
    this._nodeslots = null;
    if (owner !== null) {
        if (owner._owned === null) {
            owner._owned = [this];
        } else {
            owner._owned.push(this);
        }
    }
}
function sendUpdate() {
    var ln;
    var node1 = this._node1;
    var nodes = this._nodes;
    if (node1 !== null) {
        node1._recUpdate();
    }
    if (nodes !== null && (ln = nodes.length) > 0) {
        for (var i = 0; i < ln; i++) {
            nodes[i]._recUpdate();
        }
    }
}
function disposeSender(node) {
    node._state = 2;
    node._value = void 0;
    node._node1 = null;
    node._nodes = null;
    node._nodeslots = null;
    cleanupSender(node);
}
function Receive(owner, state, value) {
    Send.call(this, owner, state, value);
    this._source1 = null;
    this._source1slot = 0;
    this._sources = null;
    this._sourceslots = null;
}
function Owner() {
    this._state = 0;
    this._owned = null;
    this._cleanups = null;
    this._recovers = null;
}
function disposeOwner() {
    this._state = 2;
    var i;
    var ln;
    var owned = this._owned;
    var cleanups = this._cleanups;
    if (owned !== null && (ln = owned.length) !== 0) {
        for (i = 0; i < ln; i++) {
            owned[i]._dispose();
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
Owner.prototype._update = function () { };
Owner.prototype._dispose = disposeOwner;
function Data(value) {
    Send.call(this, OWNER, 0, value);
    this._pending = NIL;
}
function getData() {
    if ((this._state & 6) === 0) {
        if (LISTEN) {
            logRead(this, (OWNER));
        }
    }
    return this._value;
}
function setData(value) {
    var state = this._state;
    if ((state & 6) === 0) {
        if (STAGE === 0) {
            if ((state & 32) !== 0) {
                reset();
                this._value = value;
                this._send();
                exec();
            } else {
                this._value = value;
            }
        } else {
            if (this._pending === NIL) {
                this._pending = value;
                this._state |= 16;
                CHANGES._add(this);
            } else if (value !== this._pending) {
                throw new Error("Zorn: Conflict");
            }
        }
    }
    return value;
}
function updateData() {
    this._value = this._pending;
    this._pending = NIL;
    this._state &= ~16;
    if ((this._state & 32) !== 0) {
        this._send();
    }
}
function disposeData() {
    disposeSender(this);
    this._pending = void 0;
}
setValProto(Data.prototype, getData, getValue, setData);
Data.prototype._update = updateData;
Data.prototype._dispose = disposeData;
Data.prototype._send = sendUpdate;
function Value(value, eq) {
    Data.call(this, value);
    this._eq = eq;
}
function setValue(value) {
    if ((this._state & 6) === 0) {
        if (this._eq === void 0 ? value !== this._value : !this._eq(value, this._value)) {
            setData.call(this, value);
        }
    }
    return value;
}
setValProto(Value.prototype, getData, getValue, setValue);
Value.prototype._update = updateData;
Value.prototype._dispose = function () {
    this._eq = null;
    disposeData.call(this);
};
Value.prototype._send = sendUpdate;
function Computation(fn, value, state, eq) {
    var owner = OWNER;
    var listen = LISTEN;
    Receive.call(this, owner, state);
    this._owned = null;
    this._cleanups = null;
    this._recovers = null;
    this._fn = fn;
    this._eq = void 0;
    if (eq === false) {
        this._state |= 128;
    } else if (eq !== void 0) {
        this._eq = eq;
    }
    OWNER = this;
    LISTEN = true;
    if (STAGE === 0) {
        reset();
        STAGE = 1;
        try {
            this._value = fn(value);
            if (CHANGES._count !== 0 || DISPOSES._count !== 0) {
                start();
            }
        } finally {
            STAGE = 0;
            OWNER = null;
            LISTEN = false;
        }
    } else {
        this._value = fn(value);
    }
    OWNER = owner;
    LISTEN = listen;
};
function getComputation() {
    var state = this._state;
    if ((state & 6) === 0 && STAGE !== 0) {
        if ((state & 16) !== 0) {
            if ((state & 8) !== 0) {
                throw new Error();
            }
            this._update();
        }
        if (LISTEN) {
            logRead(this, (OWNER));
        }
    }
    return this._value;
}
setValProto(Computation.prototype, getComputation, getValue);
Computation.prototype._update = function () {
    var i;
    var ln;
    var owner = OWNER;
    var listen = LISTEN;
    OWNER = null;
    LISTEN = false;
    var state = this._state;
    var cleanups = this._cleanups;
    if (cleanups !== null && (ln = cleanups.length) !== 0) {
        for (i = 0; i < ln; i++) {
            cleanups[i](false);
        }
        cleanups.length = 0;
    }
    OWNER = this;
    LISTEN = (state & 1) === 0
    if (LISTEN) {
        cleanupReceiver(this);
    }
    this._state |= 8;
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
    this._state &= ~24;
    OWNER = owner;
    LISTEN = listen;
};
Computation.prototype._dispose = function () {
    this._fn = null;
    this._value = void 0;
    disposeOwner.call(this);
    disposeSender(this);
    cleanupReceiver(this);
};
Computation.prototype._send = sendUpdate;
Computation.prototype._recUpdate = function () {
    var state = this._state;
    if ((state & 6) === 0 && (state & 16) === 0) {
        this._state |= 16;
        if ((state & (128 | 32)) === 32) {
            PENDINGS._add(this);
        } else {
            UPDATES._add(this);
        }
        var owned = this._owned;
        if (owned !== null) {
            for (var ln = owned.length; ln-- !== 0;) {
                owned.pop()._recDispose();
            }
        }
        if ((state & 32) !== 0) {
            this._send();
        }
    }
};
Computation.prototype._recDispose = function () {
    this._state = 4;
    DISPOSES._add(this);
    var owned = this._owned;
    if (owned !== null) {
        for (var ln = owned.length; ln-- !== 0;) {
            owned.pop()._recDispose();
        }
    }
}
function Queue(stage) {
    this._stage = stage;
    this._items = [];
    this._count = 0;
}
Queue.prototype._add = function (item) {
    this._items[this._count++] = item;
};
Queue.prototype._run = function () {
    STAGE = this._stage;
    var error = 0;
    for (var i = 0; i < this._count; i++) {
        var item = this._items[i];
        var state = item._state;
        if ((state & (16 | 4)) !== 0) {
            try {
                if ((state & 16) !== 0) {
                    item._update();
                } else {
                    item._dispose();
                }
            } catch (err) {
                error = 1;
                if ((state & 16) !== 0) {
                    item._value = err;
                    item._state |= 64;
                }
                item._state &= ~24;
            }
        }
        this._items[i] = null;
    }
    this._count = 0;
    return error;
};
var NIL = ({});
var STAGE = 0;
var DISPOSES = new Queue(2);
var CHANGES = new Queue(3);
var PENDINGS = new Queue(4);
var UPDATES = new Queue(5);
var OWNER = null;
var LISTEN = false;
function reset() {
    DISPOSES._count = CHANGES._count = PENDINGS._count = UPDATES._count = 0;
}
function logRead(from, to) {
    from._state |= 32;
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
function exec() {
    var owner = OWNER;
    try {
        start();
    } finally {
        STAGE = 0;
        OWNER = owner;
        LISTEN = false;
    }
}
function start() {
    var cycle = 0;
    var errors = 0;
    var disposes = DISPOSES;
    var changes = CHANGES;
    var pendings = PENDINGS;
    var updates = UPDATES;
    do {
        if (disposes._count !== 0) {
            errors += disposes._run();
        }
        if (changes._count !== 0) {
            errors += changes._run();
        }
        if (disposes._count !== 0) {
            errors += disposes._run();
        }
        if (pendings._count !== 0) {
            errors += pendings._run();
        }
        if (updates._count !== 0) {
            errors += updates._run();
        }
        if (errors !== 0) {
            throw new Error("Zorn: Error");
        }
        if (cycle++ > 1e5) {
            throw new Error("Zorn: Cycle");
        }
    } while (changes._count !== 0 || disposes._count !== 0 || pendings._count !== 0 || updates._count !== 0);
}
function cleanupReceiver(node) {
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
function forgetReceiver(send, slot) {
    if ((send._state & 6) === 0) {
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
function cleanupSender(send) {
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
function forgetSender(receive, slot) {
    if ((receive._state & 6) === 0) {
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
    root, dispose, val, owner,
    compute, $compute, when, peek,
    data, value, nil, freeze, recover,
    cleanup, Data, Value, Computation
};