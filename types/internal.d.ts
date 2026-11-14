/**
 * The full surface of anod, for libraries that build on its engine:
 * everything "anod" exports, plus the node constructors, flags, engine
 * state and the steps the factories take to start a node. "anod"
 * re-exports a selection of these.
 *
 * Nodes are ES5 constructors, so a derived type initializes itself with
 * the base constructor and inherits its prototype:
 *
 *     function Derived(opts, fn, dep1, owner, args) {
 *         Effect.call(this, opts, fn, dep1, owner, args);
 *     }
 *     Derived.prototype = Object.create(Effect.prototype);
 */

export type Resolve<T> =
	T extends Promise<infer U>
		? U
		: T extends AsyncIterable<infer U>
			? U
			: T extends AsyncIterator<infer U, any, any>
				? U
				: T;

/* Sender flags (bits 0-6) — readable on any Sender (Signal or Compute).
 * Bits 7+ on a plain Signal are free for extension, except FLAG_VISIT,
 * a scratch mark the engine sets and clears within one call. */
export declare const FLAG_STALE: number;
export declare const FLAG_PENDING: number;
export declare const FLAG_SCHEDULED: number;
export declare const FLAG_DISPOSED: number;
export declare const FLAG_ERROR: number;
export declare const FLAG_MUTABLE: number;
export declare const FLAG_WEAK: number;

/* Receiver flags (bits 7+) — only valid on Compute/Effect nodes. */
export declare const FLAG_INIT: number;
export declare const FLAG_SETUP: number;
export declare const FLAG_LOADING: number;
export declare const FLAG_DEFER: number;
export declare const FLAG_STABLE: number;
export declare const FLAG_EQUAL: number;
export declare const FLAG_ASYNC: number;
export declare const FLAG_BOUND: number;
export declare const FLAG_WAITER: number;
export declare const FLAG_CHANNEL: number;
export declare const FLAG_BLOCKED: number;
export declare const FLAG_SHIELD: number;
export declare const FLAG_SUSPEND: number;
export declare const FLAG_RELAY: number;
export declare const FLAG_SINGLE: number;
export declare const FLAG_EAGER: number;
export declare const FLAG_PURGE: number;
export declare const FLAG_PAUSED: number;
export declare const FLAG_OWNER: number;
export declare const FLAG_CALLBACK: number;
/** A scratch mark on any node, set and cleared within one engine call:
 *  cycle checks and the dedupe passes of an async settle. */
export declare const FLAG_VISIT: number;
export declare const FLAG_REFUSE: number;

/* The brands are private: `export {}` keeps the declarations below
 * that are not exported out of the module. */
export {};
declare const OPTION: unique symbol;
declare const EFFECT_OPTION: unique symbol;
declare const STATE: unique symbol;
declare const DEFECT_TYPE: unique symbol;

/**
 * A creation option: STABLE, EAGER, WEAK, DEFER or SETUP. Pass one in a
 * factory's `opts`; it is fixed once the node is created, and `is()`
 * reads it back.
 */
export type Option = number & { readonly [OPTION]: true };
/** The options an effect or spawn takes too: STABLE, DEFER and SETUP. */
export type EffectOption = Option & { readonly [EFFECT_OPTION]: true };
/** A node state, read with `is()`: DISPOSED, LOADING or ERROR. */
export type State = number & { readonly [STATE]: true };
/** The type of a Defect: REFUSE or PANIC. */
export type DefectType = number & { readonly [DEFECT_TYPE]: true };

export declare const REFUSE: DefectType;
export declare const PANIC: DefectType;

/**
 * An error in the signal graph, tagged REFUSE or PANIC. It holds
 * any value: pass an `Error` when you want a stack. The public package
 * exports it as a type only; fail a node through `c.refuse()`,
 * `c.panic()` and `c.fatal()`.
 */
export declare class Defect<T = unknown> {
	constructor(error: T, type: DefectType);
	type: DefectType;
	error: T;
}

/**
 * What a flush throws once it ends after one or more `c.fatal()` calls,
 * whose trees it has torn down: `errors` holds what each was given.
 */
export declare class Fatal {
	private constructor();
	readonly errors: unknown[];
}

/**
 * Skips the node's first run: a compute runs when it is first read, a
 * bound effect when its dep first changes.
 */
export declare const DEFER: EffectOption;
/**
 * Tracks dependencies on the first run only. Later runs read through
 * `c.val()` without subscribing. A bound node is always stable.
 */
export declare const STABLE: EffectOption;
/** A bound node also tracks the `c.val()` reads of its first run. */
export declare const SETUP: EffectOption;
/** A compute releases its value and runs its cleanups once it loses its last subscriber. */
export declare const WEAK: Option;
/** A compute re-runs as soon as a dependency changes, instead of when it is read. */
export declare const EAGER: Option;

/** Every option flag, for masking the opts a caller passes in. */
export declare const OPTIONS: number;

/** The node has been disposed. */
export declare const DISPOSED: State;
/** The node waits on async work. */
export declare const LOADING: State;
/** The node's value is a Defect. */
export declare const ERROR: State;

/** Every bit `is()` answers for; the rest are internal. */
export declare const PUBLIC: number;

/** A thenable that never resolves, so an awaiting continuation never resumes. */
export declare const REGRET: { then(): void };
export declare const NOOP: () => void;
export declare const ILLEGAL_READ: string;

export interface ReadonlySignal<T = any> {
	get(): T;
	notify(): void;
	/** Whether the node has `flag` set: a creation option or a state. */
	is(flag: Option | State): boolean;
}

export interface Signal<T = any> extends ReadonlySignal<T> {
	set(value: T | ((prev: T) => T)): boolean;
}

export interface SignalConstructor {
	new <T>(value: T): Signal<T>;
	call<T>(self: Signal<T>, value: T): void;
	readonly prototype: Signal;
}

export declare var Signal: SignalConstructor;

/**
 * The signal from signal(value, false): every write notifies, and an
 * updater may return void to keep the current value.
 */
export interface MutableSignal<T = any> extends ReadonlySignal<T> {
	set(value: T | ((prev: T) => T | void)): boolean;
}

export interface Resource<T = any> extends Signal<T> {
	set(value: T): boolean;
	set(fn: (c: ResourceContext, current: T) => T | Promise<T>): boolean;
	set(
		value: T | ((prev: T) => T),
		fn: (c: ResourceContext, optimistic: T) => T | Promise<T>
	): boolean;
}

/** The signal behind resource() and signal(value, equal). */
export interface Cell<T = any> extends Resource<T> {}

export interface CellConstructor {
	new <T>(
		value: T,
		flag: number,
		equal: ((prev: T, next: T) => boolean) | null
	): Cell<T>;
	call<T>(
		self: Cell<T>,
		value: T,
		flag: number,
		equal: ((prev: T, next: T) => boolean) | null
	): void;
	readonly prototype: Cell;
}

export declare var Cell: CellConstructor;

export interface Compute<T = any> extends ReadonlySignal<T> {
	dispose(): void;
	cleanup(fn: () => void): void;
}

/** Pass `null` as `dep1` for an unbound compute, or a sender to bind it. */
export interface ComputeConstructor {
	new <U, W = undefined>(
		fn: (c: ComputeReader, prev: U | undefined, args: W) => U,
		opts: number,
		dep1: null,
		seed?: U,
		args?: W
	): Compute<U>;
	new <T, U, W = undefined>(
		fn: (val: T, c: ComputeContext, prev: U | undefined, args: W) => U,
		opts: number,
		dep1: ReadonlySignal<T>,
		seed?: U,
		args?: W
	): Compute<U>;
	call<U, W = undefined>(
		self: Compute<U>,
		fn: (c: ComputeReader, prev: U | undefined, args: W) => U,
		opts: number,
		dep1: null,
		seed?: U,
		args?: W
	): void;
	call<T, U, W = undefined>(
		self: Compute<U>,
		fn: (val: T, c: ComputeContext, prev: U | undefined, args: W) => U,
		opts: number,
		dep1: ReadonlySignal<T>,
		seed?: U,
		args?: W
	): void;
	readonly prototype: Compute;
}

export declare var Compute: ComputeConstructor;

export interface Task<T = any> extends Compute<T> {}

export interface Root {
	/** Whether the node has `flag` set: a creation option or a state. */
	is(flag: Option | State): boolean;
	/**
	 * A handler that returns has handled the error. One that throws passes
	 * what it throws on, to the next handler and up the owners.
	 */
	recover(fn: (error: Defect) => void): void;
	cleanup(fn: () => void): void;
	/**
	 * Disposes the root and everything it owns. A shielded effect under it
	 * (`c.shield()`) makes the disposal wait until its activation ends;
	 * `force` ends the shields and disposes now.
	 */
	dispose(force?: boolean): void;
	pause(): void;
	resume(): void;
}

export interface RootConstructor {
	new (): Root;
	call(self: Root): void;
	readonly prototype: Root;
}

export declare var Root: RootConstructor;

export interface Effect extends Root {}

/** Pass `null` as `dep1` for an unbound effect, or a sender to bind it. */
export interface EffectConstructor {
	new <W = undefined>(
		opts: number,
		fn: (c: EffectReader, args: W) => void,
		dep1: null,
		owner: Owner | null,
		args?: W
	): Effect;
	new <T, W = undefined>(
		opts: number,
		fn: (val: T, c: EffectContext, args: W) => void,
		dep1: ReadonlySignal<T>,
		owner: Owner | null,
		args?: W
	): Effect;
	call<W = undefined>(
		self: Effect,
		opts: number,
		fn: (c: EffectReader, args: W) => void,
		dep1: null,
		owner: Owner | null,
		args?: W
	): void;
	call<T, W = undefined>(
		self: Effect,
		opts: number,
		fn: (val: T, c: EffectContext, args: W) => void,
		dep1: ReadonlySignal<T>,
		owner: Owner | null,
		args?: W
	): void;
	readonly prototype: Effect;
}

export declare var Effect: EffectConstructor;

export interface Spawn extends Effect {}

/**
 * A slim sync effect: it runs its fn when its deps change, and nothing
 * else. It owns nothing and takes no cleanup, recover or finalize; the
 * root or effect that creates it disposes it and recovers its errors.
 */
export interface Action {
	/** Whether the node has `flag` set: a creation option or a state. */
	is(flag: Option | State): boolean;
	dispose(): void;
}

/** Pass `null` as `dep1` for an unbound action, or a sender to bind it. */
export interface ActionConstructor {
	new <W = undefined>(
		opts: number,
		fn: (c: ActionReader, args: W) => void,
		dep1: null,
		owner: Owner | null,
		args?: W
	): Action;
	new <T, W = undefined>(
		opts: number,
		fn: (val: T, c: ActionContext, args: W) => void,
		dep1: ReadonlySignal<T>,
		owner: Owner | null,
		args?: W
	): Action;
	call<W = undefined>(
		self: Action,
		opts: number,
		fn: (c: ActionReader, args: W) => void,
		dep1: null,
		owner: Owner | null,
		args?: W
	): void;
	call<T, W = undefined>(
		self: Action,
		opts: number,
		fn: (val: T, c: ActionContext, args: W) => void,
		dep1: ReadonlySignal<T>,
		owner: Owner | null,
		args?: W
	): void;
	readonly prototype: Action;
}

export declare var Action: ActionConstructor;

/** Async coordination state of a node, allocated on first use. */
export interface Channel {}

export interface ChannelConstructor {
	new (): Channel;
	call(self: Channel): void;
	readonly prototype: Channel;
}

export declare var Channel: ChannelConstructor;

/** Context available inside resource asyncFn callbacks. */
export interface ResourceContext {
	suspend<T>(promise: Promise<T>): Promise<T>;
	suspend(
		fn: (resolve: (value?: any) => void, reject: (error?: any) => void) => void
	): void;
	/** The current activation's sequence number; each async write bumps it. */
	version(): number;
}

export type Sender<T = any> = Signal<T> | MutableSignal<T> | Resource<T> | Compute<T> | Task<T>;
/** What a contextual set() writes to: a signal or a resource. */
export type Writable<T = any> = Signal<T> | MutableSignal<T> | Resource<T>;
export type AsyncSender<T = any> = Resource<T> | Task<T>;
/**
 * What suspend() gives for one of its inputs: a sender's or a promise's
 * value, or a plain value as it is.
 */
export type Settled<T> = T extends AsyncSender<infer U>
	? U
	: T extends PromiseLike<infer U>
		? U
		: T;

declare const STEP: unique symbol;
/**
 * What a callback-form suspend returns, for the type checker only: at run
 * time it is undefined. Return it from the fn or a callback, and the task
 * is typed with the value the steps settle with.
 */
export interface Step<T> {
	readonly [STEP]: T;
}
/**
 * What a run settles with when a callback returns R: a step's value, what
 * a promise or async iterable gives, or R as it is.
 */
export type Outcome<R> = R extends Step<infer U> ? U : Resolve<R>;
export type Receiver = Compute | Effect | Action;
export type Owner = Root | Effect;
export type Disposer = Sender | Receiver | Root;

/**
 * Bound action callback context: contextual set, pending/rejected
 * checks and is(). The base of every other receiver context.
 */
export interface ActionContext {
	set<T>(sender: Writable<T>, value: T | ((prev: T) => T)): void;
	set<T>(
		sender: Resource<T>,
		value: T | ((prev: T) => T),
		fn: (c: ResourceContext, optimistic: T) => T | Promise<T>
	): void;
	pending(senders: ReadonlySignal | ReadonlySignal[]): boolean;
	rejected(sender: ReadonlySignal): Defect | null;
	/** Fails the run with a PANIC. A REFUSE becomes a PANIC with its error. */
	panic(val: unknown): never;
	/** Whether this node has `flag` set: a creation option or a state. */
	is(flag: Option | State): boolean;
}

/**
 * Base context available on compute, task, effect and spawn callbacks.
 * Adds cleanups, the activation's version, controller and defer.
 */
export interface Context extends ActionContext {
	cleanup(fn: () => void): void;
	version(): number;
	controller(): AbortController;
	defer<R>(sender: ReadonlySignal<R>): R;
}

/** Dependency tracking — adds val() for reading and subscribing. */
export interface Reader {
	val<T>(sender: ReadonlySignal<T>): T;
}

/** Bound compute callback context. */
export interface ComputeContext extends Context {
	equal(equal?: boolean): void;
	/**
	 * Fails the compute with a REFUSE without throwing: return what it
	 * returns. Given a Defect, it keeps it.
	 */
	refuse<E>(val: E): Defect<E>;
	suspend(
		fn: (resolve: (value?: any) => void, reject: (error?: any) => void) => void
	): void;
}

/** Unbound compute callback context. */
export interface ComputeReader extends ComputeContext, Reader {}

/** Root callback context — owned factories + lifecycle. */
export interface RootContext extends Factory {
	cleanup(fn: () => void): void;
	/**
	 * A handler that returns has handled the error. One that throws passes
	 * what it throws on, to the next handler and up the owners.
	 */
	recover(fn: (error: Defect) => void): void;
	/** Fails the run with a PANIC. A REFUSE becomes a PANIC with its error. */
	panic(val: unknown): never;
	/**
	 * Ends this owner's tree at once: no handler is asked, nothing in it
	 * runs again, and the flush disposes it and throws a `Fatal`. Given
	 * a Defect, it escalates its error.
	 */
	fatal(val: unknown): never;
	/** Whether this node has `flag` set: a creation option or a state. */
	is(flag: Option | State): boolean;
}

/** Bound effect callback context. */
export interface EffectContext extends RootContext, Context {
	finalize(fn: () => void): void;
	/**
	 * Lets the current activation run to completion: its re-run and
	 * disposal, and those of every owner above it, wait until it ends.
	 * Only `dispose(true)` ends it early.
	 */
	shield(): void;
	suspend(
		fn: (resolve: (value?: any) => void, reject: (error?: any) => void) => void
	): void;
}

/** Unbound effect callback context. */
export interface EffectReader extends EffectContext, Reader {}

/** Unbound action callback context. */
export interface ActionReader extends ActionContext, Reader {}

/** Bound task callback context. */
export interface TaskContext extends ComputeContext {
	suspend<T>(promise: PromiseLike<T>): Promise<T>;
	suspend<T>(sender: AsyncSender<T>): T | Promise<T>;
	/**
	 * Waits through callbacks. A suspend made in a callback is the run's
	 * next step, and a promise a callback returns is adopted. Return the
	 * step to type the run's value.
	 */
	suspend<T, R, E = never>(
		input: AsyncSender<T> | PromiseLike<T>,
		onResolve: (value: T) => R,
		onReject?: (error: any) => E
	): Step<Outcome<R> | Outcome<E>>;
	suspend<T extends readonly unknown[]>(
		inputs: [...T]
	): Promise<{ [K in keyof T]: Settled<T[K]> }>;
	suspend<T extends readonly unknown[], R, E = never>(
		inputs: [...T],
		onResolve: (values: { [K in keyof T]: Settled<T[K]> }) => R,
		onReject?: (error: any) => E
	): Step<Outcome<R> | Outcome<E>>;
	suspend<T = any>(
		fn: (resolve: (value?: T) => void, reject: (error?: any) => void) => void
	): Step<T>;
}

/** Unbound task callback context. */
export interface TaskReader extends TaskContext, Reader {}

/** Bound spawn callback context. */
export interface SpawnContext extends EffectContext {
	suspend<T>(promise: PromiseLike<T>): Promise<T>;
	suspend<T>(sender: AsyncSender<T>): T | Promise<T>;
	/**
	 * Waits through callbacks. A suspend made in a callback is the run's
	 * next step, and a promise a callback returns is adopted. Return the
	 * step to type the run's value.
	 */
	suspend<T, R, E = never>(
		input: AsyncSender<T> | PromiseLike<T>,
		onResolve: (value: T) => R,
		onReject?: (error: any) => E
	): Step<Outcome<R> | Outcome<E>>;
	suspend<T extends readonly unknown[]>(
		inputs: [...T]
	): Promise<{ [K in keyof T]: Settled<T[K]> }>;
	suspend<T extends readonly unknown[], R, E = never>(
		inputs: [...T],
		onResolve: (values: { [K in keyof T]: Settled<T[K]> }) => R,
		onReject?: (error: any) => E
	): Step<Outcome<R> | Outcome<E>>;
	suspend<T = any>(
		fn: (resolve: (value?: T) => void, reject: (error?: any) => void) => void
	): Step<T>;
}

/** Unbound spawn callback context. */
export interface SpawnReader extends SpawnContext, Reader {}

/** Base factory — unowned node creation. Root and Effect extend this. */
export interface Factory {
	// Unbound compute
	compute<U>(fn: (c: ComputeReader) => U): Compute<U>;
	compute<U>(fn: (c: ComputeReader, prev: U) => U, seed: U): Compute<U>;
	compute<U, W>(
		fn: (c: ComputeReader, prev: U, args: W) => U,
		seed: U,
		opts?: Option,
		args?: W
	): Compute<U>;
	compute<U, W>(
		fn: (c: ComputeReader, prev: U | undefined, args: W) => U,
		seed?: U,
		opts?: Option,
		args?: W
	): Compute<U>;
	// Bound compute
	compute<T, U>(
		dep: ReadonlySignal<T>,
		fn: (val: T, c: ComputeContext) => U
	): Compute<U>;
	compute<T, U>(
		dep: ReadonlySignal<T>,
		fn: (val: T, c: ComputeContext, prev: U) => U,
		seed: U
	): Compute<U>;
	compute<T, U, W>(
		dep: ReadonlySignal<T>,
		fn: (val: T, c: ComputeContext, prev: U, args: W) => U,
		seed: U,
		opts?: Option,
		args?: W
	): Compute<U>;

	// Unbound task
	task<U>(
		fn: (c: TaskReader, prev: Resolve<U>) => Promise<U> | Step<U>,
		seed?: Resolve<U>,
		opts?: Option
	): Task<Resolve<U>>;
	task<U, W>(
		fn: (c: TaskReader, prev: Resolve<U>, args: W) => Promise<U> | Step<U>,
		seed?: Resolve<U>,
		opts?: Option,
		args?: W
	): Task<Resolve<U>>;
	/** A callback-form fn that doesn't return its step: name U. */
	task<U>(
		fn: (c: TaskReader, prev: U) => void,
		seed?: U,
		opts?: Option
	): Task<U>;
	task<U, W>(
		fn: (c: TaskReader, prev: U, args: W) => void,
		seed?: U,
		opts?: Option,
		args?: W
	): Task<U>;
	// Bound task
	task<T, U>(
		dep: ReadonlySignal<T>,
		fn: (val: T, c: TaskContext, prev: Resolve<U>) => Promise<U> | Step<U>,
		seed?: Resolve<U>,
		opts?: Option
	): Task<Resolve<U>>;
	task<T, U>(
		dep: ReadonlySignal<T>,
		fn: (val: T, c: TaskContext, prev: U) => void,
		seed?: U,
		opts?: Option
	): Task<U>;

	// Unbound effect
	effect(fn: (c: EffectReader) => void, opts?: EffectOption): Effect;
	effect<W>(
		fn: (c: EffectReader, args: W) => void,
		opts?: EffectOption,
		args?: W
	): Effect;
	// Bound effect
	effect<T>(
		dep: ReadonlySignal<T>,
		fn: (val: T, c: EffectContext) => void,
		opts?: EffectOption
	): Effect;

	// Unbound spawn
	spawn(
		fn: (c: SpawnReader) => Promise<void> | Step<unknown> | void,
		opts?: EffectOption
	): Spawn;
	spawn<W>(
		fn: (c: SpawnReader, args: W) => Promise<void> | Step<unknown> | void,
		opts?: EffectOption,
		args?: W
	): Spawn;
	// Bound spawn
	spawn<T>(
		dep: ReadonlySignal<T>,
		fn: (val: T, c: SpawnContext) => Promise<void> | Step<unknown> | void,
		opts?: EffectOption
	): Spawn;

	// Unbound action
	action(fn: (c: ActionReader) => void, opts?: EffectOption): Action;
	action<W>(
		fn: (c: ActionReader, args: W) => void,
		opts?: EffectOption,
		args?: W
	): Action;
	// Bound action
	action<T>(
		dep: ReadonlySignal<T>,
		fn: (val: T, c: ActionContext) => void,
		opts?: EffectOption
	): Action;
	action<T, W>(
		dep: ReadonlySignal<T>,
		fn: (val: T, c: ActionContext, args: W) => void,
		opts?: EffectOption,
		args?: W
	): Action;
}

/** Unowned factory — nodes created through it live until GC or dispose. */
export interface Clock extends Factory {}

export interface ClockConstructor {
	new (): Clock;
	call(self: Clock): void;
	readonly prototype: Clock;
}

export declare var Clock: ClockConstructor;

/** The global context: creates unowned nodes. */
export declare const c: Factory;

/* What the factories do once a node is constructed: connect() a bound
 * node to its dep, addOwned() it to an owning root or effect, then run it
 * with startCompute() or startEffect() (an action too). An effect also
 * takes its owner's level + 1. root() is startRoot() on
 * a new Root. */
export declare function connect(send: Sender, receiver: Receiver): void;
export declare function addOwned(owner: Owner, child: Receiver): void;
export declare function startRoot(root: Root, fn: (c: RootContext) => void): void;
export declare function startCompute(node: Compute): void;
export declare function startEffect(node: Effect | Action): void;

export declare function signal<T>(value: T): Signal<T>;
export declare function signal<T>(
	value: T,
	equals: false
): MutableSignal<T>;
export declare function signal<T>(
	value: T,
	equals: (prev: T, next: T) => boolean
): Signal<T>;
export declare function resource<T>(value: T): Resource<T>;
export declare function resource<T>(
	value: T,
	equals?: false | ((prev: T, next: T) => boolean)
): Resource<T>;
export declare function root(fn: (c: RootContext) => void): Root;
export declare function batch(fn: () => void): void;
export declare function flush(): void;
