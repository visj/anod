// list.d.ts
import { ListParam, IList, IReadonlySignal, ICompute, ICollection, IEffect, ISignal } from "@anod/signal";

export interface ICollection<T> extends IReadonlySignal<T[]>{
    // --- Derived Methods (Returns ICollection) ---
    at(index: ListParam<number>): ICollection<T | undefined>;
    concat(...items: ListParam<any>[]): ICollection<T[]>;
    entries(): ICompute<IterableIterator<[number, T]>>;
    every(cb: (value: T, index: number) => boolean, opts?: number): ICompute<boolean>;
    filter(cb: (value: T, index: number, array: T[]) => boolean, opts?: number): ICollection<T[]>;
    find(cb: (value: T, index: number) => boolean, opts?: number): ICompute<T | undefined>;
    findIndex(cb: (value: T, index: number) => boolean, opts?: number): ICompute<number>;
    findLast(cb: (value: T, index: number, array: T[]) => boolean, opts?: number): ICollection<T | undefined>;
    findLastIndex(cb: (value: T, index: number, array: T[]) => boolean, opts?: number): ICompute<number>;
    flat(depth?: ListParam<number>): ICollection<any[]>;
    flatMap<U>(cb: (value: T, index: number, array: T[]) => U[], opts?: number): ICollection<U[]>;
    forEach(cb: (value: T, index: number) => void | (() => void), opts?: number): IEffect;
    includes(searchElement: any, fromIndex?: ListParam<number>): ICompute<boolean>;
    indexOf(searchElement: any, fromIndex?: ListParam<number>): ICompute<number>;
    join(separator?: ListParam<string>): ICompute<string>;
    keys(): ICompute<IterableIterator<number>>;
    map<U>(cb: (value: T, index: number, array: T[]) => U, opts?: number): ICollection<U[]>;
    reduce<U>(cb: (accumulator: U, currentValue: T, currentIndex: number, array: T[]) => U, initialValue?: ListParam<U>, opts?: number): ICompute<U>;
    reduceRight<U>(cb: (accumulator: U, currentValue: T, currentIndex: number, array: T[]) => U, initialValue?: ListParam<U>, opts?: number): ICompute<U>;
    slice(start?: ListParam<number>, end?: ListParam<number>): ICollection<T[]>;
    some(cb: (value: T, index: number, array: T[]) => boolean, opts?: number): ICompute<boolean>;
    values(): ICompute<IterableIterator<T>>;
}

export interface IList<T> extends ICollection<T>, ISignal<T[]> {
    // --- Mutator Methods (Returns void) ---
    push(...items: T[]): void;
    pop(): void;
    shift(): void;
    unshift(...items: T[]): void;
    reverse(): void;
    sort(compareFn?: (a: T, b: T) => number): void;
    splice(start: number, deleteCount?: number, ...items: T[]): void;
    fill(value: T, start?: number, end?: number): void;
    copyWithin(target: number, start: number, end?: number): void;
}

export declare function list<T>(value: T[]): IList<T>;