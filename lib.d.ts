export interface Signal<T = unknown> {
	get(): T;
}

export interface Data<T = unknown> extends Signal<T> {
	/**
	 * 
	 */
	set(next: T): T;
}

export interface Value<T = unknown> extends Data<T> { }
/**
 * 
 */
export interface List<T = unknown> extends Data<T[]>, IEnumerable<T> {
	/**
	 * Inserts item at specific index
	 * @param index Index to insert
	 * @param item Item to insert
	 */
	insertAt(index: number, item: T): void;
	/**
	 * Inserts range starting at specified index
	 * @param index Index to start inserting
	 * @param items Items to insert
	 */
	insertRange(index: number, items: T[]): void;
	/**
	 * Moves an item from `from` to `to`
	 * @param from From index
	 * @param to To index
	 */
	move(from: number, to: number): void;
	/**
	 * Moves a range of items, starting at `from`,
	 * selecting `count` item, and inserts starting at `to`.
	 * @param from Index to start selecting items
	 * @param count Number of items to move
	 * @param to Index to start inserting items
	 */
	moveRange(from: number, count: number, to: number): void;
	/**
	 * Removes an element from the end of the array
	 */
	pop(): void;
	/**
	 * Adds an element at the end of the array
	 * @param item Item to be inserted
	 */
	push(item: T): void;
	/**
	 * Removes an item at specified index
	 * @param index Index at which to remove
	 */
	removeAt(index: number): void;
	/**
	 * Removes a range, starting at index
	 * @param index Index to start removing
	 * @param count Number of items to remove
	 */
	removeRange(index: number, count: number): void;
	/**
	 * Removes an item from beginning of array
	 */
	shift(): void;
	/**
	 * Swaps location between item located at
	 * index `indexA` and `indexB`
	 * @param indexA Index of first item to swap
	 * @param indexB Index of second item to swap
	 */
	swap(indexA: number, indexB: number): void;
	/**
	 * Adds an item to the beginning of the array
	 * @param item Item to add
	 */
	unshift(item: T): void;
}

export interface Computation<T = unknown> extends Signal<T> {

	dispose(): void;
}

/**
 * 
 */
export interface IEnumerable<T> extends Signal<T[]> {
	/**
	 * 
	 */
	mut(): Changeset<T>;
	/**
	 * 
	 */
	roots(): Array<Computation>;
	/**
	 * Determines whether all elements meet the condition of provided callback.
	 * It does not propagate changes unless the computed value changes.
	 * @example
	 * const d1 = array([1,2,3]);
	 * const c1 = d1.every(x => x !== 4);
	 * const c2 = on(c1, () => { console.log("called"); });
	 * d1.pop(); // does not print
	 * d1.push(4); // prints "called"
	 * @param callback Predicate function to evaluate against each element
	 */
	every(callback: (currentValue: T, index?: number) => boolean): () => boolean;
	/**
	 * Returns an IEnumerable filtered for elements that meet the condition of provided callback
	 * @example
	 * const d1 = array([1,2,3])
	 * const c1 = d1.filter(x => x > 1);
	 * console.log(c1.val()); // prints "[2,3]"
	 * @param callback Predicate function to evaluate against each element
	 */
	filter(callback: (currentValue: T, index?: number) => boolean): IEnumerable<T>;
	/**
	 * Searches the *first* element in the array that meet the condition, otherwise undefined
	 * @param calback Predicate function to evaluate against each element
	 * @returns 
	 */
	find(calback: (element: T, index?: number) => boolean): () => T;
	/**
	 * Searches the *first* index that meet the condition, otherwise -1
	 * @param callback Predicate function to evaluate against each element
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

export interface Enumerable<T = unknown> extends Computation<T>, IEnumerable<T> { }


/**
 * 
 */
export const enum Flag {
	/**
	 * Used to flag that a procedure should not
	 * be invoced until next computation cycle. 
	 * @see {on}
	 */
	Wait = 1,
	/**
	 * Used to flag that a procedure should
	 * only propagate changes when the computed
	 * value changes from previous round.
	 * @see {fn}
	 * @see {on}
	 */
	Trace = 2,
	/**
	 * Used to flag that a procedure uses
	 * dynamic dependency tracking. This means that
	 * each time the node is updated, the dependency 
	 * tree is truncated and rebuild. This behavior
	 * is default for `fn` and `run`, but can be overriden
	 * for `on` and `bind` in case they have conditional
	 * dependency trees.
	 * @see {fn}
	 * @see {on}
	 */
	Dynamic = 4,
	/**
	 * Used to flag that a procedure uses
	 * static dependency tracking. This means that 
	 * the dependency tree is computed once and then
	 * never rebuilt. This behavior is default for 
	 * `on` and `bind`, but can be overriden for `fn`
	 * and `run` in case we know that any dependency
	 * read during first invocation will stay static 
	 * during the lifetime of the computation node.
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
export function array<T>(val: T[]): List<T>;

/**
 * `on` creates a computation node with a static dependency tree.
 * This function will be more performant than `tie`, and it is advisable to 
 * use it unless requiring reading the resulting computation node. 
 * @see tie
 * @param src Dependent signals
 * @param f Function to execute when `src` changes
 * @param seed Initial value passed to `f`
 * @param flags Flags to override. Possible values are `Flag.Wait` and `Flag.Dynamic`.
 */
export function on<T>(src: (() => any) | (() => any)[], f: (seed: T) => T, seed?: T, flags?: number, dispose?: () => void): () => T;

/**
 * `fn` creates a dynamic computation node.
 * This function will be more performant than `run`, and it is advisable to 
 * use it unless requiring reading the resulting computation node. 
 * @param f Function to execute
 * @param seed Initial value passed to `f`
 * @param flags Flags to override. Possible value is `Flag.Static`.
 */
export function fn<T>(f: (seed: T) => T, seed?: T, flags?: number, dispose?: () => void): () => T;

/**
 * `tie` creates a static computation node and returns a procedural function. 
 * It does so by constructing the initial dependency tree,
 * but unlike dynamic computation nodes does not recompute the dependency tree on each update cycle. 
 * This means that if the `src` signals are themselves conditional branches,
 * this will not by default be registered. This behavior can be overriden by passing in `Flag.Dynamic` in flags parameter.
 * If `Flag.Wait` is passed, the function is evaluated once any of `src` change, and until then, seed is used 
 * as initial value.
 * @example
 * const d1 = data(1);
 * const d2 = data(2);
 * const c1 = tie(d1, () => { console.log(d2()); });
 * freeze(() => { d1(2); d2(3); }); // prints "3"
 * d2(4); // does not print
 * @example
 * const d1 = data(1);
 * const d2 = data(2);
 * const c1 = () => { return d1() > 1 ? d2() : null; };
 * const c2 = tie(c1, () => { console.log("c2")}, void 0, Flag.Wait);
 * const c3 = tie(c1, () => { console.log("c3"); }, void 0, Flag.Wait | Flag.Dynamic);
 * d1(2); // prints "c2", "c3"
 * d2(2); // prints "c3"
 * @param src Dependent signals
 * @param f Function to execute when `src` changes
 * @param seed Initial value passed to `f`
 * @param flags Flags to override. Possible values are `Flag.Wait` and `Flag.Dynamic`.
 */
export function tie<T>(src: (() => any) | (() => any)[], f: (seed: T) => T, seed?: T, flags?: number, dispose?: () => void): void;

/**
 * `run` creates a dynamic computation node and returns a procedural function.
 * 
 * @see fn
 * @param f Function to execute
 * @param seed Initial value passed to `f`
 * @param flags Flags to override. Possible value is `Flag.Static`.
 */
export function run<T>(f: (seed: T) => T, seed?: T, flags?: number, dispose?: () => void): void;

/**
 * `cleanup` accepts a function that is run each time a computation
 * node is updated. When the node is about to be disposed, `final`
 * in callback function switches to true.
 * @example
 * root(() => {
 * 	let d1 = data(0);
 * 	let d2 = data(0);
 * 	on(d1, () => {
 * 		on(d2, () => {
 * 			cleanup(final => { console.log(final); });
 * 		});
 * 	});
 * 	d2(); // prints "false"
 * 	d1(); // prints "true"
 * });
 * @param f Callback to run during update
 */
export function cleanup(f: () => void): void;

/**
 * `freeze` allows batching updates so that setting multiple
 * data signals only trigger a single update cycle.
 * @example
 * root(() => {
 * 	let d1 = data(0);
 * 	let d2 = data(0);
 * 	fn(() => { console.log(d1(), d2()); });
 * 	freeze(() => {
 * 		d1(1);
 * 		d2(2);
 * 	}); // prints "1,2"
 * });
 * @param f Callback to execute before running updates
 */
export function freeze<T>(f: () => T): T;

/**
 * 
 * @param node 
 * @param f 
 */
export function fuse(node: Computation, f: () => any): void;

/**
 * 
 * @param f 
 */
export function root<T>(f: () => T): Computation<T>;

/**
 * `sample` runs provided callback without creating a dependency 
 * on any signals read during invocation.
 * @param f
 */
export function sample<T>(f: () => T): T;


export const Data: DataConstructor;
export const Value: ValueConstructor;
export const List: ListConstructor;
export const Computation: ComputationConstructor;
export const Enumerable: EnumerableConstructor;

export interface DataProto<T = unknown> extends Data<T> {
	readonly val: T;
	readonly log: Log<Computation>;
	readonly flag: number;
	readonly pval: {} | T;

	update(): void;
}

export interface DataConstructor {
	new <T>(): Data<T>;
	readonly prototype: DataProto<unknown>;
}

export interface ValueProto<T = unknown> extends DataProto<T> {
	readonly eq?: (a: T, b: T) => boolean;

}

export interface ValueConstructor {
	new <T>(): Value<T>;
	readonly prototype: ValueProto<unknown>;
}

export interface ListProto<T> extends List<T>, DataProto<T> {
	readonly cs: Changeset<T> | Changeset<T>[];
	readonly pcs: Changeset<T> | Changeset<T>[];

	update(): void;
}

export interface ListConstructor {
	new <T>(): ListProto<T>;
	readonly prototype: ListProto<unknown>;
}

export interface ComputationProto<T = unknown> extends Computation<T> {
	readonly val: T;
	readonly log: Log<Computation>;
	readonly flag: number;
	readonly fn: (seed: T) => T;
	readonly age: number;
	readonly src: Log<Signal>;
	readonly owner: Computation;
	readonly traces: number[];
	readonly owned: Computation[];
	readonly cleanups: ((final: boolean) => void)[];

	update(): void;
}

export interface ComputationConstructor {
	new <T>(): Computation<T>;
	setup: <T>(node: Computation<T>, f: (seed: T) => T, seed?: T, flags?: Flag) => Computation<T>;
	readonly prototype: Computation<unknown>;
}

export interface EnumerableProto<T = unknown> extends Enumerable<T>, ComputationProto<T> {
	readonly cs: Changeset<T> | Changeset<T>[];
	readonly pcs: Changeset<T> | Changeset<T>[];
}

export interface EnumerableConstructor {
	new <T>(): Enumerable<T>;
	setup<T>(node: Enumerable<T>, source: IEnumerable, f: (seed: T) => T): Enumerable<T>;
	readonly prototype: Enumerable<unknown>;
}

export const enum Modification {
	Indexed = 256,
	Ranged = 512,
	Insert = 1024,
	Delete = 2048,
	Reorder = 4096,
}

export const enum Mutation {
	InsertAt = 1 | Modification.Indexed | Modification.Insertion,
	INsertRange = 2 | Modification.Indexed | Modification.Ranged | Modification.Insertion,
	Pop = 4 | Modification.Deletion,
	Push = 8 | Modification.Insertion,
	RemoveAt = 16 | Modification.Indexed | Modification.Deletion,
	RemoveRange = 32 | Modification.Indexed | Modification.Ranged | Modification.Deletion,
	Shift = 64 | Modification.Deletion,
	Unshift = 128 | Modification.Insertion,
	TypeFlag = 255,
}

export const Void: {};
export const Owner: Computation;
export const Listener: Computation;

/**
 * 
 */
export interface Log<T> {
	readonly node1: T;
	readonly slot1: number;
	readonly nodes: T[];
	readonly slots: number[];
}

/**
 * 
 */
export interface Changeset<T> {
	readonly type: number;
	readonly index?: number;
	readonly count?: number;
	readonly value?: T | T[];
}
