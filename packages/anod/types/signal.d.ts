declare const ANOD: unique symbol;

declare const enum TypeFlag {
    MASK = 7,
    SEND = 8,
    RECEIVE = 16,
    OWNER = 32
}

export declare const enum Type {
    ROOT = 1 | TypeFlag.OWNER,
    SIGNAL = 2 | TypeFlag.SEND,
    COMPUTE = 3 | TypeFlag.SEND | TypeFlag.RECEIVE,
    EFFECT = 4 | TypeFlag.RECEIVE | TypeFlag.OWNER
}

export const enum Flag {
    STALE = 8,
    PENDING = 16,
    RUNNING = 32,
    DISPOSED = 64,
    LOADING = 128,
    ERROR = 256,
    RECOVER = 512,
    BOUND = 1024,
    COMPSUB = 2048,
    SCOPE = 4096,
    EQUAL = 8192,
    LIST = 16384
}

export const enum Opt {
    DEFER = 1,
    STABLE = 2,
    SETUP = 4
}

export type Resolve<T> =
    T extends Promise<infer U> ? U :
    T extends AsyncIterable<infer U> ? U :
    T extends AsyncIterator<infer U, any, any> ? U :
    T;

export interface Anod<TYPE extends number> {
    readonly t: TYPE;
    readonly [ANOD]: never;
}

export interface IDispose<TYPE extends number> extends Anod<TYPE> {
    dispose(): void;
}

export interface IReceiver { }

export interface IReader extends IReceiver {
    read<R>(signal: IReadonlySignal<R, Type.COMPUTE | Type.SIGNAL>): R;
    equal(equal?: boolean): void;
    async(type: number): void;
    stable(): void;
    error(): boolean;
    loading(): boolean;
    cleanup(fn: () => void): void;
    recover(fn: (error: any) => boolean): void;
}

export interface IReadonlySignal<T, TYPE extends number = number> extends IDispose<TYPE> {
    val(): T;

    derive<U>(
        fn: (c: IReader, src: T, prev: Resolve<U>) => U,
        seed: Resolve<U>
    ): ICompute<Resolve<U>>;

    derive<U, W>(
        fn: (c: IReader, src: T, prev: Resolve<U>, args: W) => U,
        seed: Resolve<U>,
        opts?: number,
        args?: W
    ): ICompute<Resolve<U>>;

    derive<U, W>(
        fn: (c: IReader, src: T, prev: Resolve<U> | undefined, args: W) => U,
        seed?: Resolve<U>,
        opts?: number,
        args?: W
    ): ICompute<Resolve<U>>;
}

export interface IAwaitable {
    error(): boolean;
    loading(): boolean;
}

export interface IRoot extends IDispose<Type.ROOT> {
    recover(fn: (error: any) => boolean): void;
}

export interface ISignal<T> extends IReadonlySignal<T, Type.SIGNAL> {
    set(value: T): void;
}

export interface ICompute<T> extends IReadonlySignal<T, Type.COMPUTE>, IAwaitable { }

export interface IEffect extends IDispose<Type.EFFECT> { }

export declare function root(fn: () => void): IRoot;

export declare function signal<T>(value: T): ISignal<T>;

export declare function compute<U>(
    fn: (c: IReader) => U
): ICompute<Resolve<U>>;

export declare function compute<U>(
    fn: (c: IReader, prev: Resolve<U>) => U,
    seed: Resolve<U>
): ICompute<Resolve<U>>;

export declare function compute<U, W>(
    fn: (c: IReader, prev: Resolve<U>, args: W) => U,
    seed: Resolve<U>,
    opts?: number,
    args?: W
): ICompute<Resolve<U>>;

export declare function compute<U, W>(
    fn: (c: IReader, prev: Resolve<U> | undefined, args: W) => U,
    seed?: Resolve<U>,
    opts?: number,
    args?: W
): ICompute<Resolve<U>>;

export declare function effect(
    fn: (c: IReader) => (() => void) | void,
    opts?: number
): IEffect;

export declare function effect<W>(
    fn: (c: IReader, args: W) => void | (() => void),
    opts?: number,
    args?: W
): IEffect;

export declare function scope(
    fn: (c: IReader) => void | (() => void),
    opts?: number
): IEffect;

export declare function scope<W>(
    fn: (c: IReader, args: W) => void | (() => void),
    opts?: number,
    args?: W
): IEffect;

export declare function derive<U>(
    senders: IReadonlySignal<any>[],
    fn: (c: IReader, prev: Resolve<U>) => U,
    seed?: Resolve<U>,
    opts?: number,
): ICompute<Resolve<U>>;

export declare function derive<U, W>(
    senders: IReadonlySignal<any>[],
    fn: (c: IReader, prev: Resolve<U>, args: W) => U,
    seed?: Resolve<U>,
    opts?: number,
    args?: W,
): ICompute<Resolve<U>>;

export declare function watch(
    senders: IReadonlySignal<any>[],
    fn: (c: IReader) => void | (() => void),
    opts?: number,
): IEffect;

export declare function watch<W>(
    senders: IReadonlySignal<any>[],
    fn: (c: IReader, args: W) => void | (() => void),
    opts?: number,
    args?: W,
): IEffect;

export declare function batch(fn: () => void): void;

export declare function cleanup(fn: () => void): void;

export declare class Context {
    resume<T>(fn: () => T): T;
}

export declare class Root implements IDispose<Type.ROOT> {
    readonly [ANOD]: never;
    readonly t: Type.ROOT;
    dispose(): void;
    recover(fn: (error: any) => boolean): void;
}

export declare class Signal<T> implements ISignal<T> {
    readonly [ANOD]: never;
    readonly t: Type.SIGNAL;
    constructor(value: T, opts?: number);
    val(): T;
    derive<U>(
        fn: (c: IReader, src: T, prev: Resolve<U>) => U,
        seed: Resolve<U>
    ): ICompute<Resolve<U>>;

    derive<U, W>(
        fn: (c: IReader, src: T, prev: Resolve<U>, args: W) => U,
        seed: Resolve<U>,
        opts?: number,
        args?: W
    ): ICompute<Resolve<U>>;

    derive<U, W>(
        fn: (c: IReader, src: T, prev: Resolve<U> | undefined, args: W) => U,
        seed?: Resolve<U>,
        opts?: number,
        args?: W
    ): ICompute<Resolve<U>>;
    set(value: T): void;
    dispose(): void;
}

export declare class Compute<T, U = any, W = any> implements ICompute<T> {
    readonly [ANOD]: never;
    readonly t: Type.COMPUTE;

    constructor(opts: number, fn: (c: IReader, prev: T, args: W) => any, dep1: null, seed?: T, args?: W);
    constructor(opts: number, fn: (c: IReader, u: U, prev: T, args: W, mod: number) => any, dep1: IReadonlySignal<U>, seed?: T, args?: W);

    val(): T;
    derive<U>(
        fn: (c: IReader, src: T, prev: Resolve<U>) => U,
        seed: Resolve<U>
    ): ICompute<Resolve<U>>;

    derive<U, W>(
        fn: (c: IReader, src: T, prev: Resolve<U>, args: W) => U,
        seed: Resolve<U>,
        opts?: number,
        args?: W
    ): ICompute<Resolve<U>>;

    derive<U, W>(
        fn: (c: IReader, src: T, prev: Resolve<U> | undefined, args: W) => U,
        seed?: Resolve<U>,
        opts?: number,
        args?: W
    ): ICompute<Resolve<U>>;
    dispose(): void;
    error(): boolean;
    loading(): boolean;
}

export declare class Effect<U = any, W = any> implements IEffect {
    readonly [ANOD]: never;
    readonly t: Type.EFFECT;

    constructor(opts: number, fn: (c: IReader, args: W) => void | (() => void), dep1: null, args?: W);
    constructor(opts: number, fn: (c: IReader, u: U, args: W) => void | (() => void), dep1: IReadonlySignal<U>, args?: W);

    dispose(): void;
    error(): boolean;
    loading(): boolean;
}