export type Resolve<T> =
  T extends Promise<infer U>
    ? U
    : T extends AsyncIterable<infer U>
      ? U
      : T extends AsyncIterator<infer U, any, any>
        ? U
        : T;

export declare const REFUSE: 1;
export declare const PANIC: 2;
export declare const FATAL: 3;

export interface Err<T = unknown> {
  type: typeof REFUSE | typeof PANIC | typeof FATAL;
  error: T;
}

export declare const OPT_DEFER: number;
export declare const OPT_STABLE: number;
export declare const OPT_SETUP: number;
export declare const OPT_WEAK: number;
export declare const OPT_EAGER: number;

export interface ReadonlySignal<T = any> {
  readonly disposed: boolean;
  get(): T;
  notify(): void;
  dispose(): void;
}

export interface Signal<T = any> extends ReadonlySignal<T> {
  loading: boolean;
  error: boolean;
  set(value: T | ((prev: T) => T)): boolean;
  set(value: T | ((prev: T) => T), fn: (c: ResourceContext, prev: T) => T | Promise<T>): boolean;
  post(value: T | ((prev: T) => T)): boolean;
  post(value: T | ((prev: T) => T), fn: (c: ResourceContext, prev: T) => T | Promise<T>): boolean;
}

export interface Compute<T = any> extends ReadonlySignal<T> {
  readonly loading: boolean;
  readonly error: boolean;
  weak(): void;
  eager(): void;
  stable(): void;
  cleanup(fn: () => void): void;
}

export interface Task<T = any> extends Compute<T> {}

export interface Root {
  readonly disposed: boolean;
  recover(fn: (error: Err) => boolean): void;
  cleanup(fn: () => void): void;
  dispose(): void;
}

export interface Effect extends Root {
  readonly loading: boolean;
  stable(): void;
}

export interface Spawn extends Effect {}

/** Context available inside resource asyncFn callbacks. */
/** Context available inside resource asyncFn callbacks. */
export interface ResourceContext {
  suspend<T>(promise: Promise<T>): Promise<T>;
  suspend(fn: (resolve: (value?: any) => void, reject: (error?: any) => void) => void): void;
}

export type Sender<T = any> = Signal<T> | Compute<T> | Task<T>;

/**
 * Base context available on all receiver callbacks.
 * Includes callback-based suspend, controller, defer, lock/unlock,
 * pending/rejected checks, and contextual set/post.
 */
export interface Context {
  stable(): void;
  cleanup(fn: () => void): void;
  set<T>(sender: Sender<T>, value: T | ((prev: T) => T)): void;
  set<T>(sender: Sender<T>, value: T | ((prev: T) => T), fn: (c: ResourceContext, prev: T) => T | Promise<T>): void;
  post<T>(sender: Sender<T>, value: T | ((prev: T) => T)): void;
  post<T>(sender: Sender<T>, value: T | ((prev: T) => T), fn: (c: ResourceContext, prev: T) => T | Promise<T>): void;
  pending(senders: Sender | Sender[]): boolean;
  rejected<T>(sender: Sender<T>): T | null;
  controller(): AbortController;
  defer<R>(signal: Sender<R>): R;
  lock(): void;
  unlock(): void;
}

/** Dependency tracking — adds val() for reading and subscribing. */
export interface Reader {
  val<T>(signal: Sender<T>): T;
}

/** Bound compute callback context. */
export interface ComputeContext extends Context {
  equal(equal?: boolean): void;
  refuse<E>(val: E): Err<E>;
  panic(val: unknown): never;
  suspend(fn: (resolve: (value?: any) => void, reject: (error?: any) => void) => void): void;
}

/** Unbound compute callback context. */
export interface ComputeReader extends ComputeContext, Reader {}

/** Root callback context — owned factories + lifecycle. */
export interface RootContext extends Clock {
  cleanup(fn: () => void): void;
  recover(fn: (error: Err) => boolean): void;
}

/** Bound effect callback context. */
export interface EffectContext extends RootContext, Context {
  panic(val: unknown): never;
  finalize(fn: () => void): void;
  suspend(fn: (resolve: (value?: any) => void, reject: (error?: any) => void) => void): void;
}

/** Unbound effect callback context. */
export interface EffectReader extends EffectContext, Reader {}

/** Bound task callback context. */
export interface TaskContext extends ComputeContext {
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
  suspend(fn: (resolve: (value?: any) => void, reject: (error?: any) => void) => void): void;
}

/** Unbound task callback context. */
export interface TaskReader extends TaskContext, Reader {}

/** Bound spawn callback context. */
export interface SpawnContext extends EffectContext {
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
  suspend(fn: (resolve: (value?: any) => void, reject: (error?: any) => void) => void): void;
}

/** Unbound spawn callback context. */
export interface SpawnReader extends SpawnContext, Reader {}

/** Base factory — unowned node creation. Root and Effect extend this. */
export interface Clock {
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

  resource<T>(value: T, relay?: boolean): Signal<T>;
}

export declare const c: Clock;
export declare function signal<T>(value: T): Signal<T>;
export declare function relay<T>(value: T): Signal<T>;
export declare function resource<T>(value: T, relay?: boolean): Signal<T>;
export declare function root(fn: (c: RootContext) => void): Root;
export declare function batch(fn: () => void): void;
export declare function flush(): void;
