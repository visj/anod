export const enum Flag {
    STALE = 1,
    PENDING = 2,
    SCHEDULED = 4,
    DISPOSED = 8,
    INIT = 16,
    SETUP = 32,
    LOADING = 64,
    ERROR = 128,
    DEFER = 256,
    STABLE = 512,
    SINGLE = 2048,
    DERIVED = 4096,
    WEAK = 8192,
    EQUAL = 16384,
    NOTEQUAL = 32768,
    ASYNC = 65536,
    BOUND = 131072,
    SUSPEND = 262144,
    CONTEXT = 524288,
    PROMISE = 1048576
}

export const enum Opt {
    DEFER = 256,
    STABLE = 512,
    SETUP = 32,
    WEAK = 8192
}

export type Resolve<T> =
    T extends Promise<infer U> ? U :
    T extends AsyncIterable<infer U> ? U :
    T extends AsyncIterator<infer U, any, any> ? U :
    T;

type Sender<T = any> = ISignal<T> | ICompute<T>;

// ─── Context interfaces (passed to compute/effect fns) ───────────────

/**
 * Base context for bound callbacks. Does NOT expose val() or defer()
 * because bound nodes have a fixed single dep — no dynamic tracking.
 */
export interface IContext {
    equal(equal?: boolean): void;
    stable(): void;
    error(): boolean;
    loading(): boolean;
    suspend<T>(promise: Promise<T>): Promise<T>;
    suspend<T>(task: ICompute<T>): T | Promise<T>;
    controller(): AbortController;
    pending(tasks: ICompute<any> | ICompute<any>[]): boolean;
}

/**
 * Full reader context for unbound callbacks. Extends IContext with
 * dependency tracking methods.
 */
export interface IReader extends IContext {
    val<R>(signal: Sender<R>): R;
    defer<R>(signal: Sender<R>): R;
    cleanup(fn: () => void): void;
    recover(fn: (error: any) => boolean): void;
}

// ─── Node interfaces ──────────────────────────────────────────────────

export interface ISignal<T> {
    peek(): T;
    set(value: T): void;
    dispose(): void;
}

export interface ICompute<T> extends ISignal<T> {
    error(): boolean;
    loading(): boolean;
}

export interface IGate<T> extends ISignal<T> {
    check(fn: (newVal: T, oldVal: T) => boolean): IGate<T>;
    guard(fn: (value: T) => boolean): IGate<T>;
}

export interface IEffect {
    dispose(): void;
    error(): boolean;
    loading(): boolean;
}

export interface IRoot {
    dispose(): void;
    recover(fn: (error: any) => boolean): void;
    cleanup(fn: () => void): void;
}

// ─── Owner interface (shared by IRoot, IEffect, and c) ────────────────

export interface IOwner {
    signal<T>(value: T): ISignal<T>;

    gate<T>(value: T): IGate<T>;

    // Unbound compute
    compute<U>(fn: (c: IReader) => U): ICompute<Resolve<U>>;
    compute<U>(fn: (c: IReader, prev: Resolve<U>) => U, seed: Resolve<U>): ICompute<Resolve<U>>;
    compute<U, W>(fn: (c: IReader, prev: Resolve<U>, args: W) => U, seed: Resolve<U>, opts?: number, args?: W): ICompute<Resolve<U>>;
    compute<U, W>(fn: (c: IReader, prev: Resolve<U> | undefined, args: W) => U, seed?: Resolve<U>, opts?: number, args?: W): ICompute<Resolve<U>>;
    // Bound compute
    compute<T, U>(dep: Sender<T>, fn: (val: T, c: IContext) => U): ICompute<Resolve<U>>;
    compute<T, U>(dep: Sender<T>, fn: (val: T, c: IContext, prev: Resolve<U>) => U, seed: Resolve<U>): ICompute<Resolve<U>>;
    compute<T, U, W>(dep: Sender<T>, fn: (val: T, c: IContext, prev: Resolve<U>, args: W) => U, seed: Resolve<U>, opts?: number, args?: W): ICompute<Resolve<U>>;

    // Unbound task
    task<U>(fn: (c: IReader, prev: Resolve<U>) => Promise<U>, seed?: Resolve<U>, opts?: number): ICompute<Resolve<U>>;
    task<U, W>(fn: (c: IReader, prev: Resolve<U>, args: W) => Promise<U>, seed?: Resolve<U>, opts?: number, args?: W): ICompute<Resolve<U>>;
    // Bound task
    task<T, U>(dep: Sender<T>, fn: (val: T, c: IContext, prev: Resolve<U>) => Promise<U>, seed?: Resolve<U>, opts?: number): ICompute<Resolve<U>>;

    // Unbound effect
    effect(fn: (c: IReader) => (() => void) | void, opts?: number): IEffect;
    effect<W>(fn: (c: IReader, args: W) => void | (() => void), opts?: number, args?: W): IEffect;
    // Bound effect
    effect<T>(dep: Sender<T>, fn: (val: T, c: IContext) => void | (() => void), opts?: number): IEffect;

    // Unbound spawn
    spawn(fn: (c: IReader) => Promise<(() => void) | void>, opts?: number): IEffect;
    spawn<W>(fn: (c: IReader, args: W) => Promise<(() => void) | void>, opts?: number, args?: W): IEffect;
    // Bound spawn
    spawn<T>(dep: Sender<T>, fn: (val: T, c: IContext) => Promise<(() => void) | void>, opts?: number): IEffect;

    root(fn: (r: IRoot & IOwner) => void | (() => void)): IRoot;
}

// ─── Concrete classes ─────────────────────────────────────────────────

export declare class Root implements IRoot, IOwner {
    dispose(): void;
    recover(fn: (error: any) => boolean): void;
    cleanup(fn: () => void): void;
    signal<T>(value: T): ISignal<T>;
    gate<T>(value: T): IGate<T>;
    compute: IOwner['compute'];
    task: IOwner['task'];
    effect: IOwner['effect'];
    spawn: IOwner['spawn'];
    root: IOwner['root'];
}

export declare class Signal<T> implements ISignal<T> {
    constructor(value: T);
    peek(): T;
    set(value: T): void;
    dispose(): void;
}

export declare class Gate<T> extends Signal<T> implements IGate<T> {
    constructor(value: T);
    check(fn: (newVal: T, oldVal: T) => boolean): this;
    guard(fn: (value: T) => boolean): this;
}

export declare class Compute<T = any> extends Signal<T> implements ICompute<T> {
    constructor(opts: number, fn: Function, dep1: any, seed?: T, args?: any);
    error(): boolean;
    loading(): boolean;
}

export declare class Effect implements IEffect {
    constructor(opts: number, fn: Function, dep1: any, owner: any, args?: any);
    dispose(): void;
    error(): boolean;
    loading(): boolean;
}

// ─── Top-level API ────────────────────────────────────────────────────

export declare const c: IOwner & {
    batch(fn: () => void): void;
};

export declare function batch(fn: () => void): void;
