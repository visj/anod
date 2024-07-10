export interface Reactive<T = any> {
    /**
     * 
     */
    val(): T;
    /**
     * 
     */
    peek(): T;
    /**
     * 
     */
    dispose(): void;
}

export interface Signal<T = any> extends Reactive<T> {
    /**
     * 
     * @param val 
     */
    update(val: T): void;
}
/**
 * 
 * @param fn 
 */
export declare function root<T>(fn: (dispose: () => void) => T): T;
/**
 * 
 * @param fn 
 */
export declare function batch(fn: () => void): void;
/**
 * 
 * @param fn 
 */
export declare function sample<T>(fn: () => T): T;
/**
 * 
 * @param fn 
 */
export declare function cleanup(fn: (final: boolean) => void): void;
/**
 * 
 * @param val 
 */
export declare function data<T>(val: T): Signal<T>;
/**
 * 
 * @param val 
 * @param eq 
 */
export declare function value<T>(val: T, eq?: ((a: T, b: T) => boolean) | null): Signal<T>;
/**
 * 
 * @param val 
 */
export declare function array<T>(val?: T[]): SignalArray<T>;
/**
 * 
 * @param fn 
 */
export declare function compute<T>(fn: () => T): Reactive<T>;
/**
 * 
 * @param fn 
 * @param seed 
 */
export declare function compute<T>(fn: (prev: T) => T, seed: T): Reactive<T>;
/**
 * 
 * @param fn 
 * @param seed 
 * @param args 
 * @param eq 
 */
export declare function compute<T, U>(fn : (prev: T, args: U) => T, seed: T, args: U, eq: ((a: T, b: T) => boolean) | null): Reactive<T>;
/**
 * 
 * @param fn 
 * @param seed 
 * @param args 
 * @param eq 
 */
export declare function compute<T, U>(fn: (prev: T, args: U) => T, seed?: T, args?: U, eq?: ((a: T, b: T) => boolean) | null): Reactive<T>;

export interface SignalIterator<T = any> extends Reactive<T[]> {
    
    length: () => number;

    at(index: number): Reactive<T>;

    concat(...items: (T | T[])[]): SignalIterator<T>;

    every(callbackFn: (element: T, index: number) => boolean): Reactive<boolean>;

    filter(callbackFn: (element: T, index: number) => boolean): SignalIterator<T>;

    find(callbackFn: (element: T, index: number) => boolean): Reactive<T | undefined>;

    findIndex(callbackFn: (element: T, index: number) => boolean): Reactive<number>;

    findLast(callbackFn: (element: T, index: number) => boolean): Reactive<T | undefined>;

    findLastIndex(callbackFn: (element: T, index: number) => boolean): Reactive<number>;

    forEach(callbackFn: (element: T, index: number) => void): void;

    includes(searchElement: T, fromIndex?: number): Reactive<boolean>;

    indexOf(searchElement: T, fromIndex?: number): Reactive<number>;

    join(separator?: string): Reactive<string>;

    lastIndexOf(searchElement: T, fromIndex?: number): Reactive<number>;

    map<U>(callbackFn: (element: T, index: Reactive<number>) => U): SignalIterator<U>;

    reduce(callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T): Reactive<T>;

    reduce(callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T, initialValue: T): Reactive<T>;

    reduce<U>(callbackFn: (previousValue: U, currentValue: T, currentIndex: number) => U, initialValue: U): Reactive<U>;

    reduceRight(callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T): Reactive<T>;

    reduceRight(callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T, initialValue: T): Reactive<T>;

    reduceRight<U>(callbackFn: (previousValue: U, currentValue: T, currentIndex: number) => U, initialValue: U): Reactive<U>;

    slice(start?: number, end?: number): SignalIterator<T>;

    some(callbackFn: (element: T, index: number) => boolean): Reactive<boolean>;
}

export interface SignalArray<T = any> extends SignalIterator<T> {

    pop(): void;

    push(...items: T[]): void;

    reverse(): void;

    shift(): void;

    splice(start: number, deleteCount?: number, ...items: T[]): void;

    sort(compareFn?: (a: T, b: T) => number): void;

    unshift(...items: T[]): void;
}