export type Resolve<T> =
  T extends Promise<infer U>
    ? U
    : T extends AsyncIterable<infer U>
      ? U
      : T extends AsyncIterator<infer U, any, any>
        ? U
        : T;

export type EqualityFn<T> = (prev: T, next: T) => boolean;

// ─── Error type constants ────────────────────────────────────────────

export declare const REFUSE: 1;
export declare const PANIC: 2;
export declare const FATAL: 3;

export interface FyrenError<T = unknown> {
  error: T;
  type: typeof REFUSE | typeof PANIC | typeof FATAL;
}

// ─── Option constants ──────────��──────────────────────────────────────

export declare const OPT_DEFER: number;
export declare const OPT_STABLE: number;
export declare const OPT_SETUP: number;
export declare const OPT_WEAK: number;

// ─── Node interfaces ────────────���───────────────────────────��─────────

export interface Signal<T = any> {
  readonly disposed: boolean;
  get(): T;
  set(value: T | ((prev: T) => T)): void;
  post(value: T | ((prev: T) => T)): void;
  dispose(): void;
}

export interface Compute<T = any> extends Signal<T> {
  readonly error: FyrenError | null;
  readonly disposed: boolean;
  weak(): void;
  eager(): void;
  stable(): void;
  cleanup(fn: () => void): void;
}

export interface Task<T = any> extends Signal<T> {
  readonly loading: boolean;
}

export interface Root {
  readonly disposed: boolean;
  recover(fn: (error: FyrenError) => boolean): void;
  cleanup(fn: () => void): void;
  dispose(): void;
}

export interface Effect extends Root {
  readonly error: FyrenError | null;
  stable(): void;
}

export interface Spawn {
  dispose(): void;
  readonly disposed: boolean;
  readonly error: FyrenError | null;
  readonly loading: boolean;
}

export type Sender<T = any> = Signal<T> | Compute<T> | Task<T>;

// ─── Context interfaces (passed to callbacks) ───────────────────────

/** Base context shared by all sync callback types. */
export interface Context {
  stable(): void;
  cleanup(fn: () => void): void;
  peek<R>(signal: Sender<R>): R;
}

/** Dependency tracking — adds val() for reading and subscribing. */
export interface Reader {
  val<R>(signal: Sender<R>): R;
}

/** Async context methods, available in task/spawn callbacks. */
export interface AsyncContext {
  suspend<T>(promise: Promise<T>): Promise<T>;
  suspend<T>(task: Task<T>): T | Promise<T>;
  suspend<T>(
    task: Task<T>,
    onResolve: (value: T) => void,
    onReject?: (error: any) => void
  ): void;
  suspend<T extends readonly Task<any>[]>(
    tasks: [...T]
  ): Promise<{ [K in keyof T]: T[K] extends Task<infer U> ? U : never }>;
  suspend<T extends readonly Task<any>[]>(
    tasks: [...T],
    onResolve: (values: { [K in keyof T]: T[K] extends Task<infer U> ? U : never }) => void,
    onReject?: (error: any) => void
  ): void;
  controller(): AbortController;
  pending(tasks: Task<any> | Task<any>[]): boolean;
  defer<R>(signal: Sender<R>): R;
  lock(): void;
  unlock(): void;
}

/** Bound compute callback context. */
export interface ComputeContext extends Context {
  equal(equal?: boolean): void;
  refuse<E>(val: E): FyrenError<E>;
  panic(val: unknown): never;
}

/** Unbound compute callback context. */
export interface ComputeReader extends ComputeContext, Reader {}

/** Root callback context — factories + ownership. */
export interface RootContext extends Factory {
  cleanup(fn: () => void): void;
  recover(fn: (error: FyrenError) => boolean): void;
}

/** Bound effect callback context. */
export interface EffectContext extends RootContext, Context {
  panic(val: unknown): never;
}

/** Unbound effect callback context. */
export interface EffectReader extends EffectContext, Reader {}

/** Bound task callback context. */
export interface TaskContext extends ComputeContext, AsyncContext {}

/** Unbound task callback context. */
export interface TaskReader extends TaskContext, Reader {}

/** Bound spawn callback context. */
export interface SpawnContext extends EffectContext, AsyncContext {}

/** Unbound spawn callback context. */
export interface SpawnReader extends SpawnContext, Reader {}

// ─── Factory interface ────────────────────────────────────────────────

export interface Factory {
  // Unbound compute
  compute<U>(fn: (c: ComputeReader) => U): Compute<Resolve<U>>;
  compute<U>(
    fn: (c: ComputeReader, prev: Resolve<U>) => U,
    seed: Resolve<U>
  ): Compute<Resolve<U>>;
  compute<U, W>(
    fn: (c: ComputeReader, prev: Resolve<U>, args: W) => U,
    seed: Resolve<U>,
    opts?: number,
    args?: W
  ): Compute<Resolve<U>>;
  compute<U, W>(
    fn: (c: ComputeReader, prev: Resolve<U> | undefined, args: W) => U,
    seed?: Resolve<U>,
    opts?: number,
    args?: W
  ): Compute<Resolve<U>>;
  // Bound compute
  compute<T, U>(
    dep: Sender<T>,
    fn: (val: T, c: ComputeContext) => U
  ): Compute<Resolve<U>>;
  compute<T, U>(
    dep: Sender<T>,
    fn: (val: T, c: ComputeContext, prev: Resolve<U>) => U,
    seed: Resolve<U>
  ): Compute<Resolve<U>>;
  compute<T, U, W>(
    dep: Sender<T>,
    fn: (val: T, c: ComputeContext, prev: Resolve<U>, args: W) => U,
    seed: Resolve<U>,
    opts?: number,
    args?: W
  ): Compute<Resolve<U>>;

  // Unbound task
  task<U>(
    fn: (c: TaskReader, prev: Resolve<U>) => Promise<U>,
    seed?: Resolve<U>,
    opts?: number
  ): Task<Resolve<U>>;
  task<U, W>(
    fn: (c: TaskReader, prev: Resolve<U>, args: W) => Promise<U>,
    seed?: Resolve<U>,
    opts?: number,
    args?: W
  ): Task<Resolve<U>>;
  // Bound task
  task<T, U>(
    dep: Sender<T>,
    fn: (val: T, c: TaskContext, prev: Resolve<U>) => Promise<U>,
    seed?: Resolve<U>,
    opts?: number
  ): Task<Resolve<U>>;

  // Unbound effect
  effect(fn: (c: EffectReader) => void, opts?: number): Effect;
  effect<W>(
    fn: (c: EffectReader, args: W) => void,
    opts?: number,
    args?: W
  ): Effect;
  // Bound effect
  effect<T>(
    dep: Sender<T>,
    fn: (val: T, c: EffectContext) => void,
    opts?: number
  ): Effect;

  // Unbound spawn
  spawn(fn: (c: SpawnReader) => Promise<void>, opts?: number): Spawn;
  spawn<W>(
    fn: (c: SpawnReader, args: W) => Promise<void>,
    opts?: number,
    args?: W
  ): Spawn;
  // Bound spawn
  spawn<T>(
    dep: Sender<T>,
    fn: (val: T, c: SpawnContext) => Promise<void>,
    opts?: number
  ): Spawn;

}

// ─── Top-level API ────────────────────────────────────────────────────

export declare function signal<T>(value: T, guard?: EqualityFn<T>): Signal<T>;
export declare function relay<T>(value: T): Signal<T>;
export declare function root(fn: (c: RootContext) => void): Root;
export declare function batch(fn: () => void): void;
export declare function flush(): void;
