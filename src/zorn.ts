type Val<T = any> = Func<T> | Signal<T>;

type Call<T> = () => T;

interface Func<T = any> {
    readonly val: T;
}

interface Signal<T = any> {
    val: T;
}

export { Val, Func, Signal, root, dispose, compute, effect, on, data, value, owner, listener, freeze, peek, cleanup, Data, Value, Computation };

function owner() {
    return OWNER;
}

function listener() {
    return LISTENER;
}

function dispose(val: Val) {
    var node = val as Send | Owner;
    if ((node.state & (State.Dispose | State.Disposed)) === 0) {
        if (STAGE === Stage.Idle) {
            node.dispose(TIME);
        } else {
            node.state |= State.Dispose;
            DISPOSES.add(node);
        }
    }
}

function bind<S extends Source | Source[], T>(src: S, fn: (src: SourceVal<S>, seed: T, prev?: SourceVal<S>) => T, seed?: T, state?: State): Func<T> {
    return new Computation(function(val: T) {

    }, seed, state);
}

function compute<T>(fn: (seed: T) => T, seed?: T, state?: State): Func<T> {
    return new Computation(fn, seed, state);
}

function effect<T>(fn: (seed: T) => T, seed?: T, state?: State): void {
    new Computation(fn, seed, state);
}

function root<T>(fn: () => T): Val<T> {
    var node = new Owner();
    var owner = OWNER;
    var listener = LISTENER;
    OWNER = node;
    LISTENER = null;
    if (STAGE === Stage.Idle) {
        try {
            node.value = fn();
        } finally {
            OWNER = owner;
            LISTENER = listener;
        }
    } else {
        node.value = fn();
        OWNER = owner;
        LISTENER = listener;
    }
    return node;
};

type Source<T = any> = Func<T> | Call<T>;

type SourceVal<T> =
    T extends Func<infer U> ? U :
    T extends [infer Head, ...infer Tail] ? [SourceVal<Head>, ...SourceVal<Tail>] :
    T extends readonly [infer Head, ...infer Tail] ? [SourceVal<Head>, ...SourceVal<Tail>] :
    T extends Array<infer U> ? Array<SourceVal<U>> : any;

function on<S1 extends Source, T>(
    src: [S1],
    fn: (
        src: [SourceVal<S1>],
        seed?: T,
        prev?: [SourceVal<S1>]
    ) => T,
    seed?: T,
    onchanges?: boolean
): Func<T>;

function on<S1 extends Source, S2 extends Source, T>(
    src: [S1, S2],
    fn: (
        src: [SourceVal<S1>, SourceVal<S2>],
        seed?: T,
        prev?: [SourceVal<S1>, SourceVal<S2>]
    ) => T,
    seed?: T,
    onchanges?: boolean
): Func<T>;

function on<S1 extends Source, S2 extends Source, S3 extends Source, T>(
    src: [S1, S2, S3],
    fn: (
        src: [SourceVal<S1>, SourceVal<S2>, SourceVal<S3>],
        seed?: T,
        prev?: [SourceVal<S1>, SourceVal<S2>, SourceVal<S3>]
    ) => T,
    seed?: T,
    onchanges?: boolean
): Func<T>;

function on<S1 extends Source, S2 extends Source, S3 extends Source, S4 extends Source, T>(
    src: [S1, S2, S3, S4],
    fn: (
        src: [SourceVal<S1>, SourceVal<S2>, SourceVal<S3>, SourceVal<S4>],
        seed?: T,
        prev?: [SourceVal<S1>, SourceVal<S2>, SourceVal<S3>, SourceVal<S4>]
    ) => T,
    seed?: T,
    onchanges?: boolean
): Func<T>;

function on<S extends Source | Source[] | readonly Source[], T>(
    src: S,
    fn: (src: SourceVal<S>, seed?: T, prev?: SourceVal<S>) => T,
    seed?: T,
    onchanges?: boolean
): Func<T>;

function on<S extends Source | Source[] | readonly Source[], T>(
    src: S,
    fn: (src: SourceVal<S>, seed?: T, prev?: SourceVal<S>) => T,
    seed?: T,
    onchanges?: boolean
): Func<T> {
    return compute(singleSource(0, src as Source, fn, onchanges), seed) as any;
};

function singleSource<S, T>(type: JsType, src: Source<S>, fn: (src: S, seed?: T, prev?: S) => T, onchanges?: boolean) {
    var prev: S;
    return function (value: T) {
        var s = (src as Call<S>)();
        if (onchanges) {
            onchanges = false;
        } else {
            var running = LISTENER;
            LISTENER = null;
            value = fn(s, value, prev);
            LISTENER = running;
        }
        prev = s;
        return value;
    }
}

function data<T>(value: T): Signal<T> {
    return new Data(value);
};

function value<T>(value: T, eq?: (a: T, b: T) => boolean): Signal<T> {
    return new Value(value, eq);
};

function freeze<T>(fn: () => T): T {
    var result: T;

    if (STAGE === Stage.Idle) {
        reset();
        STAGE = Stage.Started;
        try {
            result = fn();
            event();
        } finally {
            STAGE = Stage.Idle;
        }
    } else {
        result = fn();
    }
    return result;
};

function peek<T>(fn: Val<T> | Call<T>): T {
    var listener = LISTENER;
    LISTENER = null;
    var result = isFunction(fn) ? fn() : fn.val;
    LISTENER = listener;
    return result;
}

function cleanup(fn: Cleanup): void {
    var owner = OWNER;
    if (owner !== null) {
        if (owner.cleanups === null) {
            owner.cleanups = [fn];
        } else {
            owner.cleanups.push(fn);
        }
    }
}

const enum State {
    None = 0,
    Defer = 8,
    Static = 16,
    Update = 32,
    Dispose = 64,
    Updated = 128,
    Disposed = 256,
    Compute = 512,
    Send = 1024,
}

const enum Stage {
    Idle = 0,
    Started = 1,
    Disposes = 1,
    Changes = 2,
    Computes = 2,
    Updates = 4,
}

interface Respond {
    state: State;
    dispose(time: number): void;
}

declare class Respond { }

declare class Send extends Respond { }

interface Send<T = any> extends Respond {
    value: T;
    node1: Receive | null;
    node1slot: number;
    nodes: Receive[] | null;
    nodeslots: number[] | null;
    update(): void;
}

function Send<T = any>(this: Send<T>, owner: Owner | null, state?: State, value?: T) {
    this.state = State.None | state!;
    this.value = value as T;
    this.node1 = null;
    this.node1slot = -1;
    this.nodes = null;
    this.nodeslots = null;
    if (owner !== null) {
        if (owner.owned === null) {
            owner.owned = [this];
        } else {
            owner.owned.push(this);
        }
    }
}

function sendUpdate<T>(node: Send<T>, time: number) {
    var node1 = node.node1;
    var nodes = node.nodes;
    if (node1 !== null) {
        receiveUpdate(node1, time)
    }
    if (nodes !== null) {
        var ln = nodes.length;
        for (var i = 0; i < ln; i++) {
            receiveUpdate(nodes[i], time);
        }
    }
}

function disposeSender<T>(node: Send<T>) {
    node.state = State.Disposed;
    node.value = void 0 as T;
    node.node1 = null;
    node.nodes = null;
    node.nodeslots = null;
    cleanupSender(node);
}

type Cleanup = (final: boolean) => void;

declare class Owner<T = any> extends Respond { }

interface Owner<T = any> extends Respond, Func<T> {
    value: T;
    owned: Send[] | null;
    cleanups: Cleanup[] | null;
}

function Owner<T>(this: Owner<T>) {
    this.state = State.None;
    this.value = void 0 as T;
    this.owned = null;
    this.cleanups = null;
}

function disposeOwner(this: Owner, time: number) {
    this.state = State.Disposed;
    this.value = void 0;
    var i: number;
    var ln: number;
    var owned = this.owned;
    var cleanups = this.cleanups;
    if (owned !== null && (ln = owned.length) !== 0) {
        for (i = 0; i < ln; i++) {
            owned[i].dispose(time);
        }
    }
    this.owned = null;
    if (cleanups !== null && (ln = cleanups.length) !== 0) {
        for (i = 0; i < ln; i++) {
            cleanups[i](true);
        }
    }
    this.cleanups = null;
};

Object.defineProperty(Owner.prototype, "val", { get: function <T>(this: Owner<T>) { return this.value; } });

Owner.prototype.dispose = disposeOwner;

declare class Receive<T = any> extends Send<T> { }

interface Receive<T = any> extends Send<T>, Owner<T> {
    age: number;
    source1: Send | null;
    source1slot: number;
    sources: Send[] | null;
    sourceslots: number[] | null;
}

function receiveUpdate<T>(node: Receive<T>, time: number) {
    var ln: number;
    if (node.age < time) {
        if (node.owned !== null && (ln = node.owned.length) !== 0) {
            for (; ln-- !== 0;) {
                node.owned.pop()!.dispose(time);
            }
        }
        node.age = time;
        node.state |= State.Update;
        EFFECTS.add(node);
        if ((node.state & State.Send) !== 0) {
            sendUpdate(node, time);
        }
    }
}

function Receive<T>(this: Receive<T>, owner: Owner | null, state?: State, value?: T) {
    Send.call(this, owner, state, value);
    this.age = 0;
    this.source1 = null;
    this.source1slot = 0;
    this.sources = null;
    this.sourceslots = null;
}

interface Data<T = any> extends Send<T>, Signal<T> {
    pending: T | {};
}

declare class Data<T = any> extends Send<T> {

    constructor(value: T);
}

function Data<T>(this: Data<T>, value: T) {
    Send.call(this, OWNER, State.None, value);
    this.pending = NULL;
}

function getData<T>(this: Data<T>) {
    if ((this.state & (State.Dispose | State.Disposed)) === 0) {
        if (LISTENER !== null) {
            logRead(this, LISTENER);
        }
    }
    return this.value;
}

function setData<T>(this: Data<T>, value: T) {
    var state = this.state;
    if ((state & (State.Dispose | State.Disposed)) === 0) {
        if (STAGE === Stage.Idle) {
            if ((state & State.Send) !== 0) {
                reset();
                this.pending = value;
                this.state |= State.Update;
                CHANGES.add(this);
                event();
            } else {
                this.value = value;
            }
        } else {
            if (this.pending === NULL) {
                this.pending = value;
                this.state |= State.Update;
                CHANGES.add(this);
            } else if (value !== this.pending) {
                throw new Error("conflicting changes: " + value + " !== " + this.pending);
            }
        }
    }
    return value!;
}

function updateData<T>(this: Data<T>) {
    this.value = this.pending as T;
    this.pending = NULL;
    this.state &= ~State.Update;
    if ((this.state & State.Send) !== 0) {
        sendUpdate(this, TIME);
    }
}

function disposeData<T>(this: Data<T>) {
    disposeSender(this);
    this.pending = void 0 as T;
}

Object.defineProperty(Data.prototype, "val", { get: getData, set: setData });

Data.prototype.update = updateData;

Data.prototype.dispose = disposeData;

interface Value<T = any> extends Data<T> {
    eq: (a: T, b: T) => boolean;
}

declare class Value<T = any> extends Data<T> {
    eq: (a: T, b: T) => boolean;

    constructor(value: T, eq?: (a: T, b: T) => boolean);
}

function Value<T>(this: Value<T>, value: T, eq?: (a: T, b: T) => boolean) {
    Data.call(this, value);
    this.eq = eq || Equals;
}

function setValue<T>(this: Value<T>, value: T): T {
    if ((this.state & (State.Dispose | State.Disposed)) === 0 && !this.eq(this.value, value)) {
        setData.call(this, value);
    }
    return value;
}

Object.defineProperty(Value.prototype, "val", { get: getData, set: setValue });

Value.prototype.update = updateData;

Value.prototype.dispose = function <T>(this: Value<T>) {
    this.eq = null!;
    disposeData.call(this);
}

declare class Computation<T = any> extends Receive<T> {

    public readonly val: T;

    public constructor(fn: (seed: T) => T, seed?: T, state?: State);
}

interface Computation<T = any> extends Receive<T>, Owner<T> {
    fn: ((v: T) => T);
}

function Computation<T>(
    this: Computation<T>,
    fn: (seed: T) => T,
    value: T,
    state?: State,
) {
    var owner = OWNER;
    var listener = LISTENER;
    Receive.call(this, owner, state);
    this.fn = fn;
    this.owned = null;
    this.cleanups = null;

    OWNER = LISTENER = this;

    if (STAGE === Stage.Idle) {
        reset();
        STAGE = Stage.Started;
        try {
            this.value = fn(value);
            if (CHANGES.count > 0 || DISPOSES.count > 0) {
                start();
            }
        } finally {
            STAGE = Stage.Idle;
            OWNER = LISTENER = null;
        }
    } else {
        this.value = fn(value);
    }
    OWNER = owner;
    LISTENER = listener;
}

Object.defineProperty(Computation.prototype, "val", {
    get: function <T>(this: Computation<T>) {
        var state = this.state;
        if ((state & (State.Dispose | State.Disposed)) === 0 && STAGE !== Stage.Idle) {
            if (this.age === TIME) {
                if ((state & State.Updated) !== 0) {
                    throw new Error("circular dependency");
                }
                this.update();
            }
            if (LISTENER !== null) {
                logRead(this, LISTENER);
            }
        }
        return this.value;
    }
});

Computation.prototype.update = function <T>(this: Computation<T>) {
    if ((this.state & State.Update) !== 0) {
        var owner = OWNER;
        var listener = LISTENER;
        OWNER = LISTENER = null;
        if (this.cleanups !== null) {
            var ln = this.cleanups.length;
            for (; ln-- !== 0;) {
                this.cleanups.pop()!(false);
            }
        }
        if ((this.state & State.Static) === 0) {
            cleanupReceiver(this);
        }
        OWNER = this;
        LISTENER = (this.state & State.Static) !== 0 ? null : this;
        this.state |= State.Updated;
        this.value = this.fn!(this.value);
        this.state &= ~(State.Update | State.Updated);

        OWNER = owner;
        LISTENER = listener;
    }
};

Computation.prototype.dispose = function <T>(this: Computation<T>, time: number) {
    this.fn = null!;
    this.age = time;
    disposeOwner.call(this, time);
    disposeSender(this);
    cleanupReceiver(this);
}

declare class Queue<T> {
    mode: Stage;
    items: Array<T | null>;
    count: number;

    constructor(mode: Stage);

    add(item: T): void;
    run(time: number): void;
}

function Queue<T>(this: Queue<T>, mode: Stage) {
    this.mode = mode;
    this.items = [];
    this.count = 0;
}

Queue.prototype.add = function <T>(this: Queue<T>, item: T) {
    this.items[this.count++] = item;
}

Queue.prototype.run = function (this: Queue<Send>, time: number) {
    STAGE = this.mode;
    for (var i = 0; i < this.count; ++i) {
        var item = this.items[i]!;
        if ((item.state & State.Update) !== 0) {
            item.update();
        } else if ((item.state & State.Dispose) !== 0) {
            item.dispose(time)
        }
        this.items[i] = null;
    }
    this.count = 0;
}

// Constants
var NULL = {};
var TIME = 0;
var STAGE = Stage.Idle;
var DISPOSES = new Queue<Send | Owner>(Stage.Disposes);
var CHANGES = new Queue<Send>(Stage.Changes);
var COMPUTES = new Queue<Send>(Stage.Computes);
var EFFECTS = new Queue<Send>(Stage.Updates);
var OWNER = null as Owner | null;
var LISTENER = null as Receive | null;

function Equals<T>(a: T, b: T) {
    return a === b;
}

function isFunction(fn: any): fn is (...args: any[]) => any {
    return typeof fn === "function";
}

function reset() {
    DISPOSES.count = CHANGES.count = COMPUTES.count = EFFECTS.count = 0;
}


// Functions
function logRead(from: Send, to: Receive) {
    from.state |= State.Send;
    var fromslot: number;
    var toslot = to.source1 === null ? -1 : to.sources === null ? 0 : to.sources.length;

    if (from.node1 === null) {
        from.node1 = to;
        from.node1slot = toslot;
        fromslot = -1;
    } else if (from.nodes === null) {
        from.nodes = [to];
        from.nodeslots = [toslot];
        fromslot = 0;
    } else {
        fromslot = from.nodes.length;
        from.nodes.push(to);
        from.nodeslots!.push(toslot);
    }
    if (to.source1 === null) {
        to.source1 = from;
        to.source1slot = fromslot;
    } else if (to.sources === null) {
        to.sources = [from];
        to.sourceslots = [fromslot];
    } else {
        to.sources.push(from);
        to.sourceslots!.push(fromslot);
    }
}

function event() {
    var owner = OWNER;
    try {
        start();
    } finally {
        STAGE = Stage.Idle;
        OWNER = owner;
        LISTENER = null;
    }
}

function start() {
    var time,
        cycle = 0,
        disposes = DISPOSES,
        changes = CHANGES,
        computes = COMPUTES,
        effects = EFFECTS;
    do {
        time = ++TIME;
        disposes.run(time);
        changes.run(time);
        computes.run(time);
        effects.run(time);
        if (cycle++ > 1e5) {
            throw new Error("Cycle overflow");
        }
    } while (changes.count > 0 || disposes.count > 0 || computes.count !== 0 || effects.count !== 0);
}

function cleanupReceiver(node: Receive) {
    if (node.source1 !== null) {
        forgetReceiver(node.source1, node.source1slot);
        node.source1 = null;
    }
    var sources = node.sources;
    if (sources !== null) {
        var ln = sources.length;
        var sourceslots = node.sourceslots!;
        for (; ln-- !== 0;) {
            forgetReceiver(sources.pop()!, sourceslots.pop()!);
        }
    }
}

function forgetReceiver(source: Send, slot: number) {
    if ((source.state & (State.Dispose | State.Disposed)) === 0) {
        if (slot === -1) {
            source.node1 = null;
        } else {
            var nodes = source.nodes!;
            var nodeslots = source.nodeslots!;
            var last = nodes.pop()!;
            var lastslot = nodeslots.pop()!;
            if (slot !== nodes.length) {
                nodes[slot] = last;
                nodeslots[slot] = lastslot;
                if (lastslot === -1) {
                    last.source1slot = slot;
                } else {
                    last.sourceslots![lastslot] = slot;
                }
            }
        }
    }
}

function cleanupSender(send: Send) {
    if (send.node1 !== null) {
        forgetSender(send.node1, send.node1slot);
        send.node1 = null;
    }
    var nodes = send.nodes;
    if (nodes !== null) {
        var ln = nodes.length;
        var nodeslots = send.nodeslots!;
        for (; ln-- !== 0;) {
            forgetSender(nodes.pop()!, nodeslots.pop()!);
        }
    }
}

function forgetSender(node: Receive, slot: number) {
    if ((node.state & (State.Dispose | State.Disposed)) === 0) {
        if (slot === -1) {
            node.source1 = null;
        } else {
            var sources = node.sources!;
            var sourceslots = node.sourceslots!;
            var last = sources.pop()!;
            var lastslot = sourceslots.pop()!;
            if (slot !== sources.length) {
                sources[slot] = last;
                sourceslots[slot] = lastslot;
                if (lastslot === -1) {
                    last.node1slot = slot;
                } else {
                    last.nodeslots![lastslot] = slot;
                }
            }
        }
    }
}