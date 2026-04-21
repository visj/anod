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
  FIBER = 524288,
  EAGER = 1048576
}

export const enum Opt {
  DEFER = 256,
  STABLE = 512,
  SETUP = 32,
  WEAK = 8192
}

export type Resolve<T> =
  T extends Promise<infer U>
    ? U
    : T extends AsyncIterable<infer U>
      ? U
      : T extends AsyncIterator<infer U, any, any>
        ? U
        : T;

type Sender<T = any> = ISignal<T> | ICompute<T>;

// ─── Context interfaces (passed to callbacks) ───────────────────────

/**
 * Base context shared by all callback types. Provides scheduling
 * utilities available inside any reactive node's execution.
 */
interface IBaseContext {
  equal(equal?: boolean): void;
  stable(): void;
  cleanup(fn: () => void): void;
  peek<R>(signal: Sender<R>): R;
  suspend<T>(promise: Promise<T>): Promise<T>;
  suspend<T>(task: ICompute<T>): T | Promise<T>;
  suspend<T extends readonly ICompute<any>[]>(
    tasks: [...T]
  ): Promise<{ [K in keyof T]: T[K] extends ICompute<infer U> ? U : never }>;
  controller(): AbortController;
  pending(tasks: ICompute<any> | ICompute<any>[]): boolean;
}

/** Bound compute callback context. */
export interface IComputeContext extends IBaseContext {}

/** Unbound compute callback context — adds dependency tracking. */
export interface IComputeReader extends IBaseContext {
  val<R>(signal: Sender<R>): R;
  defer<R>(signal: Sender<R>): R;
}

/** Bound effect/spawn callback context — adds recover. */
export interface IEffectContext extends IBaseContext {
  recover(fn: (error: any) => boolean): void;
}

/** Unbound effect/spawn callback context — adds dep tracking + recover. */
export interface IEffectReader extends IBaseContext {
  val<R>(signal: Sender<R>): R;
  defer<R>(signal: Sender<R>): R;
  recover(fn: (error: any) => boolean): void;
}

/** Root callback context — factories + ownership. */
export interface IRootContext extends IFactory {
  dispose(): void;
  cleanup(fn: () => void): void;
  recover(fn: (error: any) => boolean): void;
}

// ─── Node interfaces ──────────────────────────────────────────────────

export interface ISignal<T> {
  get(): T;
  set(value: T): void;
  dispose(): void;
}

export interface ICompute<T> extends ISignal<T> {
  readonly error: Error | null;
  readonly loading: boolean;
  eager(): void;
  cleanup(fn: () => void): void;
}

export interface IGate<T> extends ISignal<T> {
  check(fn: (newVal: T, oldVal: T) => boolean): IGate<T>;
  guard(fn: (value: T) => boolean): IGate<T>;
}

export interface IEffect {
  dispose(): void;
  readonly error: Error | null;
  readonly loading: boolean;
}

export interface IRoot {
  dispose(): void;
  recover(fn: (error: any) => boolean): void;
  cleanup(fn: () => void): void;
}

// ─── Factory interface (factory methods) ───────────────────────────────

export interface IFactory {
  signal<T>(value: T): ISignal<T>;

  gate<T>(value: T): IGate<T>;

  // Unbound compute
  compute<U>(fn: (c: IComputeReader) => U): ICompute<Resolve<U>>;
  compute<U>(
    fn: (c: IComputeReader, prev: Resolve<U>) => U,
    seed: Resolve<U>
  ): ICompute<Resolve<U>>;
  compute<U, W>(
    fn: (c: IComputeReader, prev: Resolve<U>, args: W) => U,
    seed: Resolve<U>,
    opts?: number,
    args?: W
  ): ICompute<Resolve<U>>;
  compute<U, W>(
    fn: (c: IComputeReader, prev: Resolve<U> | undefined, args: W) => U,
    seed?: Resolve<U>,
    opts?: number,
    args?: W
  ): ICompute<Resolve<U>>;
  // Bound compute
  compute<T, U>(
    dep: Sender<T>,
    fn: (val: T, c: IComputeContext) => U
  ): ICompute<Resolve<U>>;
  compute<T, U>(
    dep: Sender<T>,
    fn: (val: T, c: IComputeContext, prev: Resolve<U>) => U,
    seed: Resolve<U>
  ): ICompute<Resolve<U>>;
  compute<T, U, W>(
    dep: Sender<T>,
    fn: (val: T, c: IComputeContext, prev: Resolve<U>, args: W) => U,
    seed: Resolve<U>,
    opts?: number,
    args?: W
  ): ICompute<Resolve<U>>;

  // Unbound task
  task<U>(
    fn: (c: IComputeReader, prev: Resolve<U>) => Promise<U>,
    seed?: Resolve<U>,
    opts?: number
  ): ICompute<Resolve<U>>;
  task<U, W>(
    fn: (c: IComputeReader, prev: Resolve<U>, args: W) => Promise<U>,
    seed?: Resolve<U>,
    opts?: number,
    args?: W
  ): ICompute<Resolve<U>>;
  // Bound task
  task<T, U>(
    dep: Sender<T>,
    fn: (val: T, c: IComputeContext, prev: Resolve<U>) => Promise<U>,
    seed?: Resolve<U>,
    opts?: number
  ): ICompute<Resolve<U>>;

  // Unbound effect
  effect(fn: (c: IEffectReader) => void, opts?: number): IEffect;
  effect<W>(
    fn: (c: IEffectReader, args: W) => void,
    opts?: number,
    args?: W
  ): IEffect;
  // Bound effect
  effect<T>(
    dep: Sender<T>,
    fn: (val: T, c: IEffectContext) => void,
    opts?: number
  ): IEffect;

  // Unbound spawn
  spawn(fn: (c: IEffectReader) => Promise<void>, opts?: number): IEffect;
  spawn<W>(
    fn: (c: IEffectReader, args: W) => Promise<void>,
    opts?: number,
    args?: W
  ): IEffect;
  // Bound spawn
  spawn<T>(
    dep: Sender<T>,
    fn: (val: T, c: IEffectContext) => Promise<void>,
    opts?: number
  ): IEffect;

  root(fn: (r: IRootContext) => void): IRoot;
}

// ─── Concrete classes ─────────────────────────────────────────────────

export declare class Clock implements IFactory {
  private constructor();
  signal: IFactory["signal"];
  gate: IFactory["gate"];
  compute: IFactory["compute"];
  task: IFactory["task"];
  effect: IFactory["effect"];
  spawn: IFactory["spawn"];
  root: IFactory["root"];
  batch(fn: () => void): void;
}

export declare class Root implements IRoot, IFactory {
  constructor();
  dispose(): void;
  signal: IFactory["signal"];
  gate: IFactory["gate"];
  compute: IFactory["compute"];
  task: IFactory["task"];
  effect: IFactory["effect"];
  spawn: IFactory["spawn"];
  root: IFactory["root"];
  recover(fn: (error: any) => boolean): void;
  cleanup(fn: () => void): void;
}

export declare class Signal<T> implements ISignal<T> {
  constructor(value: T);
  get(): T;
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
  readonly error: Error | null;
  readonly loading: boolean;
  cleanup(fn: () => void): void;
  eager(): void;
}

export declare class Effect implements IEffect {
  constructor(opts: number, fn: Function, dep1: any, owner: any, args?: any);
  dispose(): void;
  readonly error: Error | null;
  readonly loading: boolean;
}

// ─── Top-level API ────────────────────────────────────────────────────

export declare const c: Clock;
