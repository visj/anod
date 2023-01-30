export interface DataSignal<T> {
    (): T;
    (val: T): T;
}

// Public interface
export function S<T>(fn: (v: T) => T, value: T): () => T {
    var node = new Computation(fn, value);

    return function computation() {
        return node.get();
    }
};

export function root<T>(fn: (dispose: () => void) => T): T {
    var owner = Owner,
        orphan = fn.length === 0,
        root = orphan ? null : new Root(),
        result: T = undefined!,
        disposer = orphan ? null : function _dispose() {
            if (Stage) {
                root!.update(0);
            } else {
                Disposes.add(root!);
            }
        };
    Owner = root;

    if (Stage === Stages.Idle) {
        try {
            result = fn(disposer!);
        } finally {
            Owner = owner;
        }
    } else {
        result = fn(disposer!);
        Owner = owner;
    }

    return result;
};

export function on<T>(ev: () => any, fn: (v?: T) => T, seed?: T, onchanges?: boolean) {
    if (Array.isArray(ev)) ev = callAll(ev);
    onchanges = !!onchanges;

    return S(on, seed);

    function on(value: T | undefined) {
        var running = Listener;
        ev();
        if (onchanges) onchanges = false;
        else {
            Listener = null;
            value = fn(value);
            Listener = running;
        }
        return value;
    }
};

function callAll(ss: (() => any)[]) {
    return function all() {
        for (var i = 0; i < ss.length; i++) ss[i]();
    }
}

export function effect<T>(fn: (v: T) => T, value?: T): void {
    new Computation(fn, value!);
}

export function data<T>(value: T): (value?: T) => T {
    var node = new Data(value);

    return function data(value?: T): T {
        if (arguments.length === 0) {
            return node.get();
        } else {
            return node.set(value!);
        }
    }
};

export function value<T>(current: T, eq?: (a: T, b: T) => boolean): DataSignal<T> {
    var node = data(current),
        age = -1;
    return function value(update?: T) {
        if (arguments.length === 0) {
            return node();
        } else {
            var same = eq ? eq(current, update!) : current === update;
            if (!same) {
                var time = Time;
                if (age === time)
                    throw new Error("conflicting values: " + update + " is not the same as " + current);
                age = time;
                current = update!;
                node(update!);
            }
            return update!;
        }
    }
};

export function freeze<T>(fn: () => T): T {
    var result: T = undefined!;

    if (Stage === Stages.Idle) {
        Stage = Stages.Started;
        reset();
        try {
            result = fn();
            event();
        } finally {
            Stage = Stages.Idle;
        }
    } else {
        result = fn();
    }

    return result;
};

export function sample<T>(fn: () => T): T {
    var result: T,
        listener = Listener;

    if (listener !== null) {
        Listener = null;
        result = fn();
        Listener = listener;
    } else {
        result = fn();
    }
    return result;
}

export function cleanup(fn: (final: boolean) => void): void {
    var owner = Owner;
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
    Stale = 1,
    Running = 2,
    Disposed = 4,
    Notified = 8,
    Changed = 16,
}

const enum Stages {
    Idle = 0,
    Started = 1,
    Disposes = 1,
    Changes = 2,
    Computes = 2,
    Updates = 4,
}

interface Signal {
    state: State;
    update(): void;
}

interface Scope {
    owned: Computation[] | null;
    cleanups: ((final: boolean) => void)[] | null;
}

interface Send extends Signal {
    node1: Receive | null;
    node1slot: number;
    nodes: Receive[] | null;
    nodeslots: number[] | null;
}

interface Receive extends Scope, Send {
    age: number;
    source1: Send | null;
    source1slot: number;
    sources: Send[] | null;
    sourceslots: number[] | null;
}

interface Data<T = any> extends Send {
    value: T;
    pending: T | {};

    get(): T;
    set(value: T): T;
}

interface DataConstructor {
    prototype: Data;
    new <T>(value: T): Data<T>;
}

export var Data = (function <T>(this: Data<T>, value: T) {
    this.state = State.None;
    this.value = value;
    this.pending = nil;
    this.node1 = null;
    this.node1slot = -1;
    this.nodes = null;
    this.nodeslots = null;
}) as Function as DataConstructor;

Data.prototype.get = function () {
    if (Listener !== null) {
        logRead(this, Listener);
    }
    return this.value;
}

Data.prototype.set = function <T>(value: T) {
    if (Stage === Stages.Idle) {
        if (this.node1 !== null || this.nodes !== null) {
            this.pending = value;
            this.state = State.Stale;
            reset();
            Changes.add(this);
            event();
        } else {
            this.value = value;
        }
    } else { // not batching, respond to change now
        if (this.pending !== nil) { // value has already been set once, check for conflicts
            if (value !== this.pending) {
                throw new Error("conflicting changes: " + value + " !== " + this.pending);
            }
        } else { // add to list of changes
            this.pending = value;
            this.state = State.Stale;
            Changes.add(this);
        }
    }
    return value!;
}

Data.prototype.update = function () {
    this.value = this.pending;
    this.pending = nil;
}

interface Root extends Signal, Scope { }

interface RootConstructor {
    prototype: Root;
    new(): Root;
}

export var Root = (function (this: Root) {
    this.state = State.None;
    this.owned = null;
    this.cleanups = null;
}) as Function as RootConstructor;

Root.prototype.update = function () {
    runCleanups(this, true);
}

interface Computation<T = any> extends Receive {
    fn: ((v: T) => T) | null;
    value: T;
    get(): T;
}

interface ComputationConstructor {
    prototype: Computation;
    new <T>(fn: (seed: T) => T, value: T): Computation<T>;
}

export var Computation = (function <T>(this: Computation<T>, fn: (seed: T) => T, value: T) {
    this.fn = fn;
    this.age = 0;
    this.state = State.None;
    this.node1 = null;
    this.node1slot = -1;
    this.nodes = null;
    this.nodeslots = null;
    this.source1 = null;
    this.source1slot = 0;
    this.sources = null;
    this.sourceslots = null;
    this.owned = null;
    this.cleanups = null;

    var owner = Owner,
        listener = Listener;

    Owner = Listener = this;

    if (Stage === Stages.Idle) {
        reset();
        Stage = Stages.Started;
        try {
            this.value = this.fn!(value);
            if (Changes.count > 0 || Disposes.count > 0) {
                exec();
            }
        } finally {
            Owner = Listener = null;
            Stage = Stages.Idle;
        }
    } else {
        this.value = this.fn!(this.value);
    }

    if (owner !== null) {
        if (owner.owned === null) {
            owner.owned = [this];
        } else {
            owner.owned.push(this);
        }
    }
    Owner = owner;
    Listener = listener;
}) as Function as ComputationConstructor;

Computation.prototype.get = function () {
    if (Listener !== null) {
        if (this.age === Time) {
            if ((this.state & State.Running) !== 0) {
                throw new Error("circular dependency");
            } else if ((this.state & State.Stale) !== 0) {
                this.update();
            }
        }
        logRead(this, Listener);
    }

    return this.value;
}

Computation.prototype.update = function () {
    var owner = Owner,
        listener = Listener;

    Owner = Listener = this;

    this.state |= State.Running;
    cleanupReceiver(this, false);
    this.value = this.fn!(this.value);
    this.state &= ~(State.Stale | State.Running);

    Owner = owner;
    Listener = listener;
}

interface Queue {
    items: Array<Signal | null>;
    count: number;

    add(item: Signal): void;
    run(): void;
}

interface QueueConstructor {
    prototype: Queue;
    new(): Queue;
}

var Queue = (function (this: Queue) {
    this.items = [];
    this.count = 0;
}) as Function as QueueConstructor;

Queue.prototype.add = function (item: Signal) {
    this.items[this.count++] = item;
}

Queue.prototype.run = function () {
    var items = this.items;
    for (var i = 0; i < this.count; ++i) {
        items[i]!.update();
        items[i] = null;
    }
    this.count = 0;
}

// Constants
var nil = {};
var Time = 0;
var Stage = Stages.Idle;
var Changes = new Queue();
var Computes = new Queue();
var Updates = new Queue();
var Disposes = new Queue();
var Owner = null as Root | null;
var Listener = null as Computation | null;

function reset() {
    Changes.count = Computes.count = Updates.count = Disposes.count = 0;
}

// Functions
function logRead(from: Send, to: Receive) {
    var fromslot: number,
        toslot = to.source1 === null ? -1 : to.sources === null ? 0 : to.sources.length;

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
    // b/c we might be under a top level S.root(), have to preserve current root
    var owner = Owner;
    try {
        exec();
    } finally {
        Owner = owner;
        Listener = null;
        Stage = Stages.Idle;
    }
}

function exec() {
    var cycle = 0,
        changes = Changes,
        computes = Computes,
        updates = Updates,
        disposes = Disposes;
    do {
        Time++;
        disposes.run();
        changes.run();
        computes.run();
        updates.run();
        if (cycle++ > 1e5) {
            throw new Error("Cycle overflow");
        }
    } while (changes.count > 0 || disposes.count > 0);
    Stage = Stages.Idle;
}

/*
    Clock.stage = Stage.Disposes;
        for (i = 0; i < disposed.count; i++) {
            disposed.items[i]!.dispose();
            disposed.items[i] = null;
        }
        disposed.count = 0;
        for (i = 0; i < changed.count; i++) {
            node = changed.items[i]! as Item;
            changed.items[i] = null;
            node.update();
            if (node.state & State.Changed) {
                staleSource(node);
            }
        }
        changed.count = 0;

        while (RunningDisposes.count !== 0 || RunningUpdates.count !== 0) {
            for (i = 0; i < RunningDisposes.count; i++) {
                node = RunningDisposes.items[i]! as Item;
                RunningDisposes.items[i] = null;
                node.age = time;
                node.state = State.Current;
                node.dispose();
                if (node.owned !== null) {
                    for (j = 0; j < node.owned.length; j++) {
                        RunningDisposes.add(node.owned[j]!);
                    }
                    node.owned = null;
                }
            }
            RunningDisposes.count = 0;
            for (i = 0; i < RunningUpdates.count; i++) {
                data = RunningUpdates.items[i]! as Item;
                RunningUpdates.items[i] = null;
                if (data.state & State.Stale) {
                    data.update();
                    if (!(data.state & State.Notified)) {
                        node = data.node1!;
                        if (node !== null && node.age < time) {
                            PendingUpdates.add(node);
                        }
                        node = data.nodes;
                        if (node !== null) {
                            for (j = 0; j < node.length; j++) {
                                child = node[j]!;
                                if (child !== null && child.age < time) {
                                    PendingUpdates.add(child);
                                }
                            }
                        }
                    }
                }
            }
            RunningUpdates.count = 0;
            for (i = 0; i < PendingUpdates.count; i++) {
                data = PendingUpdates.items[i]! as Item;
                PendingUpdates.items[i] = null;
                if (data.age < time) {
                    data.age = time;
                    data.state |= State.Stale | State.Notified;
                    RunningUpdates.add(data);
                    if (data.owned !== null) {
                        for (j = 0; j < data.owned.length; j++) {
                            child = data.owned[j];
                            RunningDisposes.add(child);
                        }
                    }
                    node = data.node1;
                    if (node !== null && node.age < time) {
                        PendingUpdates.add(node);
                    }
                    node = data.nodes;
                    if (node !== null) {
                        for (j = 0; j < node.length; j++) {
                            child = node[j]!;
                            if (child !== null && child.age < time) {
                                PendingUpdates.add(child);
                            }
                        }
                    }
                }
            }
            PendingUpdates.count = 0;
        }
*/

function sendStaleSource(source: Send, time: number) {
    if (source.node1 !== null) {
        receiveStaleSource(source.node1, time);
    }
    var nodes = source.nodes;
    if (nodes !== null) {
        var i = 0,
            ln = nodes.length;
        for (; i < ln; i++) {
            receiveStaleSource(nodes[i], time);
        }
    }
}

function cleanupRoot(node: Root, final: boolean) {
    var i = 0,
        ln = 0,
        owned = node.owned,
        cleanups = node.cleanups;
    if (owned !== null) {
        ln = owned.length;
        for (; i < ln; i++) {
            cleanupReceiver(owned[i], true);
        }
        node.owned = null;
    }
    if (cleanups !== null) {
        ln = cleanups.length;
        for (; i < ln; i++) {
            cleanups[i](final);
        }
        node.cleanups = null;
    }
}

function cleanupReceiver(node: Receive, final: boolean) {
    var ln = 0,
        source1 = node.source1,
        sources = node.sources,
        sourceslots = node.sourceslots!;
    cleanupRoot(node, final);
    if (source1 !== null) {
        cleanupSender(source1, node.source1slot);
        node.source1 = null;
    }
    if (sources !== null) {
        ln = sources.length;
        for (; ln--;) {
            cleanupSender(sources.pop()!, sourceslots.pop()!);
        }
    }
}

function cleanupSender(source: Send, slot: number) {
    var nodes = source.nodes!,
        nodeslots = source.nodeslots!,
        last: Receive,
        lastslot: number;
    if (slot === -1) {
        source.node1 = null;
    } else {
        last = nodes.pop()!;
        lastslot = nodeslots.pop()!;
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