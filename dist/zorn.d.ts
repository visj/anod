type Val<T = any> = Func<T> | Signal<T>;
type Call<T> = () => T;
interface Func<T = any> {
    readonly val: T;
}
interface Signal<T = any> {
    val: T;
}
export { Val, Func, Signal, root, dispose, compute, effect, on, data, value, owner, listener, freeze, peek, cleanup, Data, Value, Computation };
declare function owner(): Owner<any> | null;
declare function listener(): Receive<any> | null;
declare function dispose(val: Val): void;
declare function compute<T>(fn: (seed: T) => T, seed?: T, state?: State): Func<T>;
declare function effect<T>(fn: (seed: T) => T, seed?: T, state?: State): void;
declare function root<T>(fn: () => T): Val<T>;
type Source<T = any> = Func<T> | Call<T>;
type SourceVal<T> = T extends Func<infer U> ? U : T extends [infer Head, ...infer Tail] ? [SourceVal<Head>, ...SourceVal<Tail>] : T extends readonly [infer Head, ...infer Tail] ? [SourceVal<Head>, ...SourceVal<Tail>] : T extends Array<infer U> ? Array<SourceVal<U>> : any;
declare function on<S1 extends Source, T>(src: [S1], fn: (src: [SourceVal<S1>], seed?: T, prev?: [SourceVal<S1>]) => T, seed?: T, onchanges?: boolean): Func<T>;
declare function on<S1 extends Source, S2 extends Source, T>(src: [S1, S2], fn: (src: [SourceVal<S1>, SourceVal<S2>], seed?: T, prev?: [SourceVal<S1>, SourceVal<S2>]) => T, seed?: T, onchanges?: boolean): Func<T>;
declare function on<S1 extends Source, S2 extends Source, S3 extends Source, T>(src: [S1, S2, S3], fn: (src: [SourceVal<S1>, SourceVal<S2>, SourceVal<S3>], seed?: T, prev?: [SourceVal<S1>, SourceVal<S2>, SourceVal<S3>]) => T, seed?: T, onchanges?: boolean): Func<T>;
declare function on<S1 extends Source, S2 extends Source, S3 extends Source, S4 extends Source, T>(src: [S1, S2, S3, S4], fn: (src: [SourceVal<S1>, SourceVal<S2>, SourceVal<S3>, SourceVal<S4>], seed?: T, prev?: [SourceVal<S1>, SourceVal<S2>, SourceVal<S3>, SourceVal<S4>]) => T, seed?: T, onchanges?: boolean): Func<T>;
declare function on<S extends Source | Source[] | readonly Source[], T>(src: S, fn: (src: SourceVal<S>, seed?: T, prev?: SourceVal<S>) => T, seed?: T, onchanges?: boolean): Func<T>;
declare function data<T>(value: T): Signal<T>;
declare function value<T>(value: T, eq?: (a: T, b: T) => boolean): Signal<T>;
declare function freeze<T>(fn: () => T): T;
declare function peek<T>(fn: Val<T> | Call<T>): T;
declare function cleanup(fn: Cleanup): void;
declare const enum State {
    None = 0,
    Defer = 8,
    Static = 16,
    Update = 32,
    Dispose = 64,
    Updated = 128,
    Disposed = 256,
    Compute = 512,
    Send = 1024
}
interface Respond {
    state: State;
    dispose(time: number): void;
}
declare class Respond {
}
declare class Send extends Respond {
}
interface Send<T = any> extends Respond {
    value: T;
    node1: Receive | null;
    node1slot: number;
    nodes: Receive[] | null;
    nodeslots: number[] | null;
    update(): void;
}
declare function Send<T = any>(this: Send<T>, owner: Owner | null, state?: State, value?: T): void;
type Cleanup = (final: boolean) => void;
declare class Owner<T = any> extends Respond {
}
interface Owner<T = any> extends Respond, Func<T> {
    value: T;
    owned: Send[] | null;
    cleanups: Cleanup[] | null;
}
declare function Owner<T>(this: Owner<T>): void;
declare class Receive<T = any> extends Send<T> {
}
interface Receive<T = any> extends Send<T>, Owner<T> {
    age: number;
    source1: Send | null;
    source1slot: number;
    sources: Send[] | null;
    sourceslots: number[] | null;
}
declare function Receive<T>(this: Receive<T>, owner: Owner | null, state?: State, value?: T): void;
interface Data<T = any> extends Send<T>, Signal<T> {
    pending: T | {};
}
declare class Data<T = any> extends Send<T> {
    constructor(value: T);
}
declare function Data<T>(this: Data<T>, value: T): void;
interface Value<T = any> extends Data<T> {
    eq: (a: T, b: T) => boolean;
}
declare class Value<T = any> extends Data<T> {
    eq: (a: T, b: T) => boolean;
    constructor(value: T, eq?: (a: T, b: T) => boolean);
}
declare function Value<T>(this: Value<T>, value: T, eq?: (a: T, b: T) => boolean): void;
declare class Computation<T = any> extends Receive<T> {
    readonly val: T;
    constructor(fn: (seed: T) => T, seed?: T, state?: State);
}
interface Computation<T = any> extends Receive<T>, Owner<T> {
    fn: ((v: T) => T);
}
declare function Computation<T>(this: Computation<T>, fn: (seed: T) => T, value: T, state?: State): void;
