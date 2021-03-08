/**
 * 
 */
export interface IEnumerable<T> {
	/**
	 * @returns The underlying array value
	 */
	val(): T[];

	/**
	 * Determines whether all elements meet the condition of provided callback
	 * @example
	 * const d1 = array([1,2,3]);
	 * const c1 = d1.every(x => x !== 4);
	 * console.log(c1()); // prints "true"
	 * @param callback Predicate function to evaluate against each element
	 * @returns Tracing procedural function that reacts when switching between true and false
	 */
	every(callback: (currentValue: T, index?: number) => boolean): () => boolean;
	/**
	 * Returns an enumerable node with elements that meet the condition of provided callback
	 * @example
	 * const d1 = array([1,2,3])
	 * const c1 = d1.filter(x => x > 1);
	 * console.log(c1.val()); // prints "[2,3]"
	 * @param callback Predicate function to evaluate against each element
	 * @returns Enumerable node
	 */
	filter(callback: (currentValue: T, index?: number) => boolean): IEnumerable<T>;
	/**
	 * 
	 * @param calback 
	 */
	find(calback: (element: T, index?: number) => boolean): () => T;
	/**
	 * 
	 * @param callback 
	 */
	findIndex(callback: (element: T, index?: number) => boolean): () => number;
	/**
	 * 
	 * @param callback 
	 */
	forEach(callback: (currentValue: T, index?: number) => boolean): void;
	/**
	 * 
	 * @param valueToFind 
	 * @param fromIndex 
	 */
	includes(valueToFind: T, fromIndex?: number): () => boolean;
	/**
	 * 
	 * @param searchElement 
	 * @param fromIndex 
	 */
	indexOf(searchElement: T, fromIndex?: number): () => number;
	/**
	 * Creates and returns a string procedure by concatenating 
	 * all elements of the underlying enumerable. If the underlying 
	 * enumerable has not changed, `join` will not trigger dependent
	 * computation nodes.
	 * @example
	 * const d1 = array([1,2,3]);
	 * const c1 = d1.join(";");
	 * console.log(c1()); // prints "1;2;3"
	 * @param separator If omitted, array elements are separated with a comma (",")
	 */
	join(separator?: string): () => string;
	/**
	 * 
	 * @param searchElement 
	 * @param fromIndex 
	 */
	lastIndexOf(searchElement: T, fromIndex?: number): () => number;
	/**
	 * 
	 * @param fn 
	 */
	map<U>(fn: (currentValue: T, index?: number) => U): IEnumerable<U>;
	/**
	 * 
	 * @param callback 
	 * @param initialValue 
	 */
	reduce<U>(callback: (accumulator: U, currentValue: T, index?: number) => U, initialValue?: U): () => U;
	/**
	 * 
	 * @param callback 
	 * @param initialValue 
	 */
	reduceRight<U>(callback: (accumulator: U, currentValue: T, index?: number) => U, initialValue?: U): () => U;
	/**
	 * 
	 */
	reverse(): IEnumerable<T>;
	/**
	 * 
	 * @param start 
	 * @param end 
	 */
	slice(start?: number, end?: number): IEnumerable<T>;
	/**
	 * 
	 * @param callback 
	 */
	some(callback: (element: T, index?: number) => boolean): () => boolean;
	/**
	 * 
	 * @param compareFunction 
	 */
	sort(compareFunction?: (firstEl: T, secondEl: T) => number): IEnumerable<T>;
}

/**
 * 
 */
export interface DataArray<T> extends IEnumerable<T> {
	/**
	 * 
	 */
	val(): T[];
	/**
	 * 
	 * @param next 
	 */
	val(next: T[]): T[];

	/**
	 * 
	 * @param index 
	 * @param item 
	 */
	insertAt(index: number, item: T): void;
	/**
	 * 
	 * @param index 
	 * @param items 
	 */
	insertRange(index: number, items: T[]): void;
	/**
	 * 
	 * @param from 
	 * @param to 
	 */
	move(from: number, to: number): void;
	/**
	 * 
	 * @param from 
	 * @param count 
	 * @param to 
	 */
	moveRange(from: number, count: number, to: number): void;
	/**
	 * 
	 */
	pop(): void;
	/**
	 * 
	 * @param item 
	 */
	push(item: T): void;
	/**
	 * 
	 * @param index 
	 */
	removeAt(index: number): void;
	/**
	 * 
	 * @param index 
	 * @param count 
	 */
	removeRange(index: number, count: number): void;
	/**
	 * 
	 */
	shift(): void;
	/**
	 * 
	 * @param first 
	 * @param second 
	 */
	swap(first: number, second: number): void;
	/**
	 * 
	 * @param item 
	 */
	unshift(item: T): void;
}

/**
 * 
 */
export enum Flag {
	/**
	 * @public
	 */
	Wait = 1,
	/**
	 * @public
	 * 
	 */
	Trace = 2,
	/**
	 * @public
	 */
	Dynamic = 4,
	/**
	 * @public
	 */
	Static = 8,
}

/**
 * Creates a data signal that can be read by computation nodes.
 * When passed a new value, it always trigger dependent computation nodes.
 * @example
 * const d = data(1);
 * run(() => { console.log(d1()); });
 * d(2); // prints "2"
 * d(3); // prints "3"
 * @param val Initial value. If omitted, `undefined` is used as initial value.
 */
export function data<T>(val: T): (next?: T) => T;

/**
 * Creates a data signal that can be read by computation ndoes.
 * When passed a new value, it trigger dependent computation nodes if 
 * the new value is not equal to current value. 
 * @example
 * const d = value(1, (a,b) => a > b);
 * run(() => { console.log(d()); });
 * d(2); // does not print
 * d(0); // prints "0"
 * @param val Initial value. If omitted, `undefined` is used as initial value.
 * @param eq A custom equal function. If omitted, strict equality, i.e. `a === b` is used.
 */
export function value<T>(val: T, eq?: (a: T, b: T) => boolean): (next?: T) => T;

/**
 * Creates an array signal that can be read by computation nodes.
 * Unlike data signals, values are read and set by calling `.val(next?: T[])`.
 * @param val Initial value used by underlying data array.
 * @throws {Error} When val is a non array-like object
 */
export function array<T>(val: T[]): DataArray<T>;

/**
 * `on` creates a static computation node and returns a procedural function. 
 * It does so by constructing the initial dependency tree,
 * but unlike dynamic computation nodes does not recompute the dependency tree on each update cycle. 
 * This means that if the `src` signals are themselves conditional branches,
 * this will not by default be registered. This behavior can be overriden by passing in `Flag.Dynamic` in flags parameter.
 * If `Flag.Wait` is passed, the function is evaluated once any of `src` change, and until then, seed is used 
 * as initial value.
 * @example
 * const d1 = data(1);
 * const d2 = data(2);
 * const c1 = on(d1, () => { console.log(d2()); });
 * freeze(() => { d1(2); d2(3); }); // prints "3"
 * d2(4); // does not print
 * @example
 * const d1 = data(1);
 * const d2 = data(2);
 * const c1 = () => { return d1() > 1 ? d2() : null; };
 * const c2 = on(c1, () => { console.log("c2")}, void 0, Flag.Wait);
 * const c3 = on(c1, () => { console.log("c3"); }, void 0, Flag.Wait | Flag.Dynamic);
 * d1(2); // prints "c2", "c3"
 * d2(2); // prints "c3"
 * @param src Dependent signals
 * @param f Function to execute when `src` changes
 * @param seed Initial value passed to `f`
 * @param flags Flags to override. Possible values are `Flag.Wait` and `Flag.Dynamic`.
 */
export function on<T>(src: (() => any) | (() => any)[], f: (seed: T) => T, seed?: T, flags?: number): () => T;

/**
 * `fn` creates a dynamic computation node and returns a procedural function.
 * Any signal or procedure read while `f` is executed will be logged and added to the dependency tree.
 * This behavior can be overridden by passing `Flag.Static` as flags parameter. In this case, `fn` will 
 * construct the dependency tree based on the initial invocation of `f`, and thereafter not reconstruct the tree.
 * This can be useful if we are unsure which dependencies will be logged, but know that once logged, the dependencies 
 * themselves do not change.
 * @param f Function to execute
 * @param seed Initial value passed to `f`
 * @param flags Flags to override. Possible value is `Flag.Static`.
 */
export function fn<T>(f: (seed: T) => T, seed?: T, flags?: number): () => T;

/**
 * `bind` creates a static computation node. Unless the resulting procedure
 * is bound elsewhere, it is recommended to use `bind` over `on` for performance reasons.
 * For a more in depth description of `bind` functionality, see examples provided in `on`.
 * @see on
 * @param src Dependent signals
 * @param f Function to execute when `src` changes
 * @param seed Initial value passed to `f`
 * @param flags Flags to override. Possible values are `Flag.Wait` and `Flag.Dynamic`.
 */
export function bind<T>(src: (() => any) | (() => any)[], f: (seed: T) => T, seed?: T, flags?: number): void;

/**
 * `run` creates a dynamic computation node. Unless the resulting procedure 
 * is bound elsewhere, it is recommended to use `run` over `fn` for performance reasons.
 * For a more in depth description of `run` functionality, see examples provided in `fn`.
 * @see fn
 * @param f Function to execute
 * @param seed Initial value passed to `f`
 * @param flags Flags to override. Possible value is `Flag.Static`.
 */
export function run<T>(f: (seed: T) => T, seed?: T, flags?: number): void;

/**
 * `cleanup` 
 * @param f 
 */
export function cleanup(f: (final: boolean) => void): void;

/**
 * 
 * @param f 
 */
export function freeze<T>(f: () => T): T;

/**
 * 
 * @param f 
 */
export function root<T>(f: (dispose?: () => void) => T): T;

/**
 * 
 * @param fn 
 */
export function sample<T>(fn: () => T): T;

/**
 * 
 */
export interface Log<T> {
	readonly _node1: T;
	readonly _slot1: number;
	readonly _nodes: T[];
	readonly _slots: number[];
}

/**
 * 
 */
export interface ChangeSet<T> {
	readonly type: number;
	readonly index?: number;
	readonly count?: number;
	readonly value?: T | T[];
}

export interface SignalProto<T> {
	readonly _val: T;
	readonly _log: Log<ComputationProto>;
	readonly _flag: number;
}

export interface DataProto<T> extends SignalProto<T> {
	readonly _pval: Object | T;
}

export interface DataConstructor {
	new<T>(): DataProto<T>;
	readonly prototype: DataProto<unknown>;
}

export interface ValueProto<T> extends DataProto<T> {
	readonly _eq?: (a: T, b: T) => boolean;
}

export interface ValueConstructor {
	new<T>(): ValueProto<T>;
	readonly prototype: ValueProto<unknown>;
}

export interface ComputationProto<T> extends SignalProto<T> {
	readonly _fn: (seed: T) => T;
	readonly _age: number;
	readonly _src: Log<SignalProto>;
	readonly _owner: ComputationProto;
	readonly _traces: number[];
	readonly _owned: ComputationProto[];
	readonly _cleanups: ((final: boolean) => void)[];
}

export interface ComputationConstructor {
	new<T>(): ComputationProto<T>;
	readonly prototype: ComputationProto<unknown>;
}

export interface DataArrayProto<T> extends DataArray<T> {
	readonly _age: number;
	readonly _mut: ChangeSet<T> | ChangeSet<T>[];
	readonly _pmut: ChangeSet<T> | ChangeSet<T>[];
}

export interface DataArrayConstructor {
	new<T>(): DataArrayProto<T>;
	readonly prototype: DataArrayProto<unknown>;
}

export interface DataEnumerableProto<T> extends ComputationProto<T>, IEnumerable<T> { }

export interface DataEnumerableConstructor {
	new<T>(): DataEnumerableProto<T>;
	readonly prototype: DataEnumerableProto<unknown>;
}

export const Data: DataConstructor;
export const Value: ValueConstructor;
export const Computation: ComputationConstructor;
export const DataArray: DataArrayConstructor;
export const DataEnumerable: DataEnumerableConstructor;

