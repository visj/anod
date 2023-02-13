(function () {
    'use strict';

    var Opt = ({
        Defer: 8 ,
        Static: 16
    });
    function nil() {
        return NIL;
    }
    function owner() {
        return OWNER;
    }
    function listener() {
        return LISTENER;
    }
    function dispose(node) {
        if ((node._state & (64  | 256 )) === 0) {
            if (STAGE === 0 ) {
                node._dispose(TIME);
            }
            else {
                node._state |= 64 ;
                DISPOSES.add(node);
            }
        }
    }
    function bind(src, fn) {
        var prev = NIL;
        var ln;
        var next;
        var defer;
        var holder;
        var isArray = Array.isArray(src);
        if (isArray) {
            ln = (src).length;
            prev = new Array(ln);
            next = new Array(ln);
        }
        return function (seed) {
            if (defer === void 0) {
                LISTENER = (OWNER);
                LISTENER._state |= 16 ;
                defer = (LISTENER._state & 8 ) !== 0;
            }
            if (isArray) {
                for (var i = 0; i < ln; i++) {
                    next[i] = (src)[i].val;
                }
            } else {
                next = (src).val;
            }
            LISTENER = null;
            if (defer) {
                defer = false;
            } else {
                seed = fn(next, seed, prev);
            }
            holder = next;
            next = prev;
            prev = holder;
            return seed;
        };
    }
    function compute(fn, seed, opt) {
        return new Computation(fn, seed, opt);
    }
    function effect(fn, seed, opt) {
        new Computation(fn, seed, opt);
    }
    function root(fn) {
        var node = new Owner();
        var owner = OWNER;
        var listener = LISTENER;
        OWNER = node;
        LISTENER = null;
        if (STAGE === 0 ) {
            try {
                node._value = fn();
            }
            finally {
                OWNER = owner;
                LISTENER = listener;
            }
        }
        else {
            node._value = fn();
            OWNER = owner;
            LISTENER = listener;
        }
        return node;
    }
    function data(value) {
        return new Data(value);
    }
    function value(value, eq) {
        return new Value(value, eq);
    }
    function freeze(fn) {
        var result;
        if (STAGE === 0 ) {
            reset();
            STAGE = 1 ;
            try {
                result = fn();
                exec();
            }
            finally {
                STAGE = 0 ;
            }
        }
        else {
            result = fn();
        }
        return result;
    }
    function peek(fn) {
        var listener = LISTENER;
        LISTENER = null;
        var result = isFunction(fn) ? (fn)() : (fn).val;
        LISTENER = listener;
        return result;
    }
    function cleanup(fn) {
        var owner = OWNER;
        if (owner !== null) {
            if (owner._cleanups === null) {
                owner._cleanups = [fn];
            }
            else {
                owner._cleanups.push(fn);
            }
        }
    }
    function setVal(obj, config) {
        Object.defineProperty(obj, "val", config);
    }
    function Send(owner, state, value) {
        this._state = 0  | state;
        this._value = value;
        this._node1 = null;
        this._node1slot = -1;
        this._nodes = null;
        this._nodeslots = null;
        if (owner !== null) {
            if (owner._owned === null) {
                owner._owned = [this];
            }
            else {
                owner._owned.push(this);
            }
        }
    }
    function sendUpdate(node, time) {
        var node1 = node._node1;
        var nodes = node._nodes;
        if (node1 !== null) {
            receiveUpdate(node1, time);
        }
        if (nodes !== null) {
            var ln = nodes.length;
            for (var i = 0; i < ln; i++) {
                receiveUpdate(nodes[i], time);
            }
        }
    }
    function disposeSender(node) {
        node._state = 256 ;
        node._value = void 0;
        node._node1 = null;
        node._nodes = null;
        node._nodeslots = null;
        cleanupSender(node);
    }
    function Owner() {
        this._state = 0 ;
        this._value = (void 0);
        this._owned = null;
        this._cleanups = null;
    }
    function disposeOwner(time) {
        this._state = 256 ;
        this._value = (void 0);
        var i;
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
    setVal(Owner.prototype, {
        get: function () {
            return this._value;
        }
    });
    Owner.prototype._update = NoOp;
    Owner.prototype._dispose = disposeOwner;
    function receiveUpdate(node, time) {
        var  ln;
        if (node._age < time) {
            if (node._owned !== null && (ln = node._owned.length) !== 0) {
                for (; ln-- !== 0;) {
                    node._owned.pop()._dispose(time);
                }
            }
            node._age = time;
            node._state |= 32 ;
            EFFECTS.add(node);
            if ((node._state & 1024 ) !== 0) {
                sendUpdate(node, time);
            }
        }
    }
    function Receive(owner, state, value) {
        Send.call(this, owner, state, value);
        this._age = 0;
        this._source1 = null;
        this._source1slot = 0;
        this._sources = null;
        this._sourceslots = null;
        this._owned = null;
        this._cleanups = null;
    }
    function Data(value) {
        Send.call(this, OWNER, 0 , value);
        this._pending = NIL;
    }
    function getData() {
        if ((this._state & (64  | 256 )) === 0) {
            if (LISTENER !== null) {
                logRead(this, LISTENER);
            }
        }
        return this._value;
    }
    function setData(value) {
        var state = this._state;
        if ((state & (64  | 256 )) === 0) {
            if (STAGE === 0 ) {
                if ((state & 1024 ) !== 0) {
                    reset();
                    this._pending = value;
                    this._state |= 32 ;
                    CHANGES.add(this);
                    exec();
                }
                else {
                    this._value = value;
                }
            }
            else {
                if (this._pending === NIL) {
                    this._pending = value;
                    this._state |= 32 ;
                    CHANGES.add(this);
                }
                else if (value !== this._pending) {
                    throw new Error("conflicting changes: " + value + " !== " + this._pending);
                }
            }
        }
        return value;
    }
    function updateData() {
        this._value = this._pending;
        this._pending = NIL;
        this._state &= ~32 ;
        if ((this._state & 1024 ) !== 0) {
            sendUpdate(this, TIME);
        }
    }
    function disposeData() {
        disposeSender(this);
        this._pending = void 0;
    }
    setVal(Data.prototype, { get: getData, set: setData });
    Data.prototype._update = updateData;
    Data.prototype._dispose = disposeData;
    function Value(value, eq) {
        Data.call(this, value);
        this.eq = eq || Equals;
    }
    function setValue(value) {
        if ((this._state & (64  | 256 )) === 0 && !this.eq(this._value, value)) {
            setData.call(this, value);
        }
        return value;
    }
    setVal(Value.prototype, { get: getData, set: setValue });
    Value.prototype._update = updateData;
    Value.prototype._dispose = function () {
        this.eq = null;
        disposeData.call(this);
    };
    function Computation(fn, value, state) {
        var owner = OWNER;
        var listener = LISTENER;
        Receive.call(this, owner, state);
        this._fn = fn;
        OWNER = LISTENER = this;
        if (STAGE === 0 ) {
            reset();
            STAGE = 1 ;
            try {
                this._value = fn(value);
                if (CHANGES._count > 0 || DISPOSES._count > 0) {
                    start();
                }
            }
            finally {
                STAGE = 0 ;
                OWNER = LISTENER = null;
            }
        }
        else {
            this._value = fn(value);
        }
        OWNER = owner;
        LISTENER = listener;
    }setVal(Computation.prototype, {
        get: function () {
            var state = this._state;
            if ((state & (64  | 256 )) === 0 && STAGE !== 0 ) {
                if (this._age === TIME) {
                    if ((state & 128 ) !== 0) {
                        throw new Error("circular dependency");
                    }
                    this._update();
                }
                if (LISTENER !== null) {
                    logRead(this, LISTENER);
                }
            }
            return this._value;
        }
    });
    Computation.prototype._update = function () {
        if ((this._state & 32 ) !== 0) {
            var owner = OWNER;
            var listener = LISTENER;
            OWNER = LISTENER = null;
            if (this._cleanups !== null) {
                var ln = this._cleanups.length;
                for (; ln-- !== 0;) {
                    this._cleanups.pop()(false);
                }
            }
            if ((this._state & 16 ) === 0) {
                cleanupReceiver(this);
            }
            OWNER = this;
            LISTENER = (this._state & 16 ) !== 0 ? null : this;
            this._state |= 128 ;
            this._value = this._fn(this._value);
            this._state &= ~(32  | 128 );
            OWNER = owner;
            LISTENER = listener;
        }
    };
    Computation.prototype._dispose = function (time) {
        this._fn = null;
        this._age = time;
        disposeOwner.call(this, time);
        disposeSender(this);
        cleanupReceiver(this);
    };
    function Queue(mode) {
        this._mode = mode;
        this._items = [];
        this._count = 0;
    }
    Queue.prototype.add = function (item) {
        this._items[this._count++] = item;
    };
    Queue.prototype.run = function (time) {
        STAGE = this._mode;
        for (var i = 0; i < this._count; ++i) {
            var item = (this._items[i]);
            if ((item._state & 32 ) !== 0) {
                item._update();
            } else if ((item._state & 64 ) !== 0) {
                item._dispose(time);
            }
            this._items[i] = null;
        }
        this._count = 0;
    };
    var NIL = ({});
    var TIME = 0;
    var STAGE = 0 ;
    var DISPOSES = new Queue(1 );
    var CHANGES = new Queue(2 );
    var COMPUTES = new Queue(2 );
    var EFFECTS = new Queue(4 );
    var OWNER = null;
    var LISTENER = null;
    function Equals(a, b) {
        return a === b;
    }
    function NoOp() { }
    function isFunction(fn) {
        return typeof fn === "function";
    }
    function reset() {
        DISPOSES._count = CHANGES._count = COMPUTES._count = EFFECTS._count = 0;
    }
    function logRead(from, to) {
        from._state |= 1024 ;
        var fromslot;
        var toslot = to._source1 === null ? -1 : to._sources === null ? 0 : to._sources.length;
        if (from._node1 === null) {
            from._node1 = to;
            from._node1slot = toslot;
            fromslot = -1;
        }
        else if (from._nodes === null) {
            from._nodes = [to];
            from._nodeslots = [toslot];
            fromslot = 0;
        }
        else {
            fromslot = from._nodes.length;
            from._nodes.push(to);
            from._nodeslots.push(toslot);
        }
        if (to._source1 === null) {
            to._source1 = from;
            to._source1slot = fromslot;
        }
        else if (to._sources === null) {
            to._sources = [from];
            to._sourceslots = [fromslot];
        }
        else {
            to._sources.push(from);
            to._sourceslots.push(fromslot);
        }
    }
    function exec() {
        var owner = OWNER;
        try {
            start();
        }
        finally {
            STAGE = 0 ;
            OWNER = owner;
            LISTENER = null;
        }
    }
    function start() {
        var time, cycle = 0, disposes = DISPOSES, changes = CHANGES, computes = COMPUTES, effects = EFFECTS;
        do {
            time = ++TIME;
            disposes.run(time);
            changes.run(time);
            computes.run(time);
            effects.run(time);
            if (cycle++ > 1e5) {
                throw new Error("Cycle overflow");
            }
        } while (changes._count > 0 || disposes._count > 0 || computes._count !== 0 || effects._count !== 0);
    }
    function cleanupReceiver(node) {
        if (node._source1 !== null) {
            forgetReceiver(node._source1, node._source1slot);
            node._source1 = null;
        }
        var sources = node._sources;
        if (sources !== null) {
            var ln = sources.length;
            var sourceslots = node._sourceslots;
            for (; ln-- !== 0;) {
                forgetReceiver(sources.pop(), sourceslots.pop());
            }
        }
    }
    function forgetReceiver(source, slot) {
        if ((source._state & (64  | 256 )) === 0) {
            if (slot === -1) {
                source._node1 = null;
            }
            else {
                var nodes = source._nodes;
                var nodeslots = source._nodeslots;
                var last = nodes.pop();
                var lastslot = nodeslots.pop();
                if (slot !== nodes.length) {
                    nodes[slot] = last;
                    nodeslots[slot] = lastslot;
                    if (lastslot === -1) {
                        last._source1slot = slot;
                    }
                    else {
                        last._sourceslots[lastslot] = slot;
                    }
                }
            }
        }
    }
    function cleanupSender(send) {
        if (send._node1 !== null) {
            forgetSender(send._node1, send._node1slot);
            send._node1 = null;
        }
        var nodes = send._nodes;
        if (nodes !== null) {
            var ln = nodes.length;
            var nodeslots = send._nodeslots;
            for (; ln-- !== 0;) {
                forgetSender(nodes.pop(), nodeslots.pop());
            }
        }
    }
    function forgetSender(node, slot) {
        if ((node._state & (64  | 256 )) === 0) {
            if (slot === -1) {
                node._source1 = null;
            }
            else {
                var sources = node._sources;
                var sourceslots = node._sourceslots;
                var last = sources.pop();
                var lastslot = sourceslots.pop();
                if (slot !== sources.length) {
                    sources[slot] = last;
                    sourceslots[slot] = lastslot;
                    if (lastslot === -1) {
                        last._node1slot = slot;
                    }
                    else {
                        last._nodeslots[lastslot] = slot;
                    }
                }
            }
        }
    }
	window.Zorn = { Opt: Opt, root: root, dispose: dispose, compute: compute, effect: effect, bind: bind, data: data, value: value, nil: nil, owner: owner, listener: listener, freeze: freeze, peek: peek, cleanup: cleanup, Data: Data, Value: Value, Computation: Computation };

})();
