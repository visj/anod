export interface Procedure<T> {
	(): T;
}

export interface Signal<T> extends Procedure<T>{
	(next: T): T;
}

export interface Enumerable<T> {
	val(): T[];

	every(callback: (currentValue: T, index?: number) => boolean): Procedure<boolean>;
	filter(callback: (currentValue: T, index?: number) => boolean): Enumerable<T>;
	find(calback: (element: T, index?: number) => boolean): Procedure<T>;
	findIndex(callback: (element: T, index?: number) => boolean): Procedure<number>;
	forEach(callback: (currentValue: T, index?: number) => boolean): void;
	includes(valueToFind: T, fromIndex?: number): Procedure<boolean>;
	indexOf(searchElement: T, fromIndex?: number): Procedure<number>;
	join(separator?: string): Procedure<string>;
	lastIndexOf(searchElement: T, fromIndex?: number): Procedure<number>;
	map<U>(fn: (currentValue: T, index?: number) => U): Enumerable<U>;
	reduce<U>(callback: (accumulator: U, currentValue: T, index?: number) => U, initialValue?: U): Procedure<U>;
	reduceRight<U>(callback: (accumulator: U, currentValue: T, index?: number) => U, initialValue?: U): Procedure<U>;
	reverse(): Enumerable<T>;
	slice(start?: number, end?: number): Enumerable<T>;
	some(callback: (element: T, index?: number) => boolean): Procedure<boolean>;
	sort(compareFunction?: (firstEl: T, secondEl: T) => number): Enumerable<T>;
}

export interface SignalArray<T> extends Enumerable<T> {
	val(): T[];
	val(next: T[]): T[];

	insertAt(index: number, item: T): void;
	insertRange(index: number, items: T[]): void;
	pop(): void;
	push(item: T): void;
	removeAt(index: number): void;
	removeRange(index: number, count: number): void;
	shift(): void;
	unshift(item: T): void;
}

export enum Flag {
	OnChange = 1,
	OnUpdate = 2,
}

export function array<T>(val: T[]): SignalArray<T>;

export function data<T>(val: T): Signal<T>;

export function value<T>(val: T, eq?: (a: T, b: T) => boolean): Signal<T>;

export function cleanup(f: () => void): void;

export function freeze<T>(f: () => T): T;

export function fn<T>(f: (seed: T) => T, seed?: T, flags?: number): Procedure<T>;

export function on<T>(src: Procedure<unknown> | Procedure<unknown>[], f: (seed: T) => T, seed?: T, flags?: number): Procedure<T>;

export function root<T>(f: (dispose?: () => void) => T): T;

export function sample<T>(fn: Procedure<T>): T;

export interface ChangeSet<T> {
	readonly type: number;
	readonly index: number;
	readonly count: number;
	readonly value: T | T[];
}

export interface SignalPrototype<T> {
	readonly _flag: number;
	readonly _val: T;
	readonly _node1: ComputationPrototype<unknown>;
	readonly _slot1: number;
	readonly _nodes: ComputationPrototype<unknown>[];
	readonly _slots: number[];
}

export interface ComputationPrototype<T> extends SignalPrototype<T> {
	readonly _fn: (seed: T) => T;
	readonly _age: number;
	readonly _source1: SignalPrototype<unknown>;
	readonly _source1slot: number;
	readonly _sources: SignalPrototype<unknown>[];
	readonly _sourceslots: number[];
}

export interface ComputationConstructor {
	new<T>(): ComputationPrototype<T>;
	readonly prototype: ComputationPrototype<unknown>;
}

export interface DataPrototype<T> extends SignalPrototype<T> {
	readonly _pval: Object | T;

}

export interface DataConstructor {
	new<T>(): DataPrototype<T>;
	readonly prototype: DataPrototype<unknown>;
}

export interface ValuePrototype<T> extends DataPrototype<T> {
	readonly _eq?: (a: T, b: T) => boolean;
}

export interface ValueConstructor {
	new<T>(): ValuePrototype<T>;
	readonly prototype: ValuePrototype<unknown>;
}

export interface EnumerablePrototype<T> extends Enumerable<T> {
	
}

export interface EnumerableConstructor {
	readonly prototype: EnumerablePrototype<unknown>;
}

export interface DataArrayPrototype<T> extends SignalArray<T> {
	readonly _age: number;
	readonly _mut: ChangeSet<T> | ChangeSet<T>[];
	readonly _pmut: ChangeSet<T> | ChangeSet<T>[];
}

export interface DataArrayConstructor {
	new<T>(): DataArrayPrototype<T>;
	readonly prototype: DataArrayPrototype<unknown>;
}

export const Computation: ComputationConstructor;
export const Data: DataConstructor;
export const Value: ValueConstructor;
export const Enumerable: EnumerableConstructor;
export const DataArray: DataArrayConstructor;

