export interface Signal<T>{
	(): T;
	(next: T): T;
}

export interface Procedure<T> {
	(): T;
}

export interface Enumerable<T> {
	val(): T[];

	every(callback: (currentValue: T, index?: Procedure<number>) => boolean): Procedure<boolean>;
	filter(callback: (currentValue: T, index?: Procedure<number>) => boolean): Enumerable<T>;
	find(calback: (element: T, index?: Procedure<number>) => boolean): Procedure<T|undefined>;
	findIndex(callback: (element: T, index?: Procedure<number>) => boolean): Procedure<number|undefined>;
	forEach(callback: (currentValue: T, index?: Procedure<number>) => boolean): void;
	includes(valueToFind: T): Procedure<boolean>;
	indexOf(searchElement: T, fromIndex?: number): Procedure<number>;
	join(separator?: string): Procedure<string>;
	lastIndexOf(searchElement: T, fromIndex?: number): Procedure<number>;
	map<U>(fn: (currentValue: T, index?: Procedure<number>) => U): Enumerable<U>;
	orderBy(compareFunction?: (firstEl: T, secondEl: T) => number): Enumerable<T>;
	reduce<U>(fn: (accumulator: U, currentValue: T, index?: Procedure<number>) => U, initialValue?: U): Procedure<U>;
	reduceRight<U>(fn: (accumulator: U, currentValue: T, index?: Procedure<number>) => U, initialValue?: U): Procedure<U>;
	reverse(): Enumerable<T>;
	slice(start?: number, end?: number): Enumerable<T>;
	some(callback: (element: T, index?: Procedure<number>) => boolean): Procedure<boolean>;
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
	sort(compareFunction?: (firstEl: T, secondEl: T) => number): Enumerable<T>;
	unshift(item: T): void;
}

export const enum Flag {
	OnChanges = 1,
	OnModified = 2,
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


