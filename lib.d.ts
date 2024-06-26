export interface Reactive<T = any> {
    val(): T;
    peek(): T;
    dispose(): void;
}

export interface Signal<T = any> extends Reactive<T> {
    update(val: T): void;
}

export type Cleanup = (final: boolean) => void;

export type Equality<T> = (a: T, b: T) => boolean;

export declare function root<T>(fn: (dispose: () => void) => T): T;

export declare function batch(fn: () => void): void;

export declare function sample<T>(fn: () => T): T;

export declare function cleanup(fn: Cleanup): void;

export declare function data<T>(val: T): Signal<T>;

export declare function value<T>(val: T, eq?: Equality<T> | null): Signal<T>;

export declare function compute<T>(fn: () => T): Reactive<T>;
export declare function compute<T>(fn: (seed: T) => T, seed: T): Reactive<T>;
export declare function compute<T, U>(fn : (seed: T, args: U) => T, seed: T, args: U, eq: Equality<T> | null): Reactive<T>;
export declare function compute<T, U>(fn: (seed: T, args: U) => T, seed?: T, args?: U, eq?: Equality<T> | null): Reactive<T>;

export declare function $compute<T>(fn: () => T): Reactive<T>;
export declare function $compute<T>(fn: (seed: T) => T, seed: T): Reactive<T>;
export declare function $compute<T, U>(fn : (seed: T, args: U) => T, seed: T, args: U, eq: Equality<T> | null): Reactive<T>;
export declare function $compute<T, U>(fn: (seed: T, args: U) => T, seed?: T, args?: U, eq?: Equality<T> | null): Reactive<T>;

export const enum Mut {
    Clear = 0,
    RemoveOne = 1,
    RemoveRange = 2,
    Remove = 3,
    InsertOne = 4,
    InsertRange = 8,
    Insert = 12,
    ReplaceOne = 16,
    ReplaceRange = 32,
    Replace = 48,
    Range = 42,
    Head = 64,
    Tail = 128,
    Sides = 192,
    Reverse = 256,
    Sort = 512,
    Assign = 1023,
    Custom = 1024,
}

type MutTuple<M extends Mut, T> = readonly [mut: M, start: number, end: number, args: T];

type MutSet<T> = MutTuple<Mut.Assign, T[]>;

type MutReplace<T> = MutTuple<Mut.Replace, [number, T]>;

type MutPop = MutTuple<Mut.RemoveOne | Mut.Tail, undefined>;

type MutPopRange = MutTuple<Mut.RemoveRange | Mut.Tail, number>;

type MutPush<T> = MutTuple<Mut.InsertOne | Mut.Tail, T>;

type MutPushRange<T> = MutTuple<Mut.InsertRange | Mut.Tail, T[]>;

type MutShift = MutTuple<Mut.RemoveOne | Mut.Head, undefined>;

type MutShiftRange = MutTuple<Mut.RemoveRange | Mut.Head, number>;

type MutUnshift<T> = MutTuple<Mut.InsertOne | Mut.Head, T>;

type MutUnshiftRange<T> = MutTuple<Mut.InsertRange | Mut.Head, T[]>;

type MutRemoveAt = MutTuple<Mut.Remove, number>;

type MutRemoveRange = MutTuple<Mut.RemoveRange, [number, number]>;

type MutInsertAt<T> = MutTuple<Mut.Insert, [number, 0, T]>;

type MutInsertRange<T> = MutTuple<Mut.InsertRange, [number, 0, T[]]>;

type MutReplaceRange<T> = MutTuple<Mut.Replace, [number, number, T[]]>;

type MutReverse = MutTuple<Mut.Reverse, undefined>;

type MutSort<T> = MutTuple<Mut.Sort, (a: T, b: T) => number>;

type MutClear = MutTuple<Mut.Clear, undefined>;

type Mutation<T> = MutSet<T>
    | MutReplace<T>
    | MutPop
    | MutPopRange
    | MutPush<T>
    | MutPushRange<T>
    | MutShift
    | MutShiftRange
    | MutUnshift<T>
    | MutUnshiftRange<T>
    | MutRemoveAt
    | MutRemoveRange
    | MutInsertAt<T>
    | MutInsertRange<T>
    | MutReplaceRange<T>
    | MutReverse
    | MutSort<T>
    | MutTuple<Mut.Custom, unknown>
    | MutClear;

export interface Enumerable<T = any> extends Reactive<T[]> {

    mut(): Mutation<T>;
    
    length(): Reactive<number>;

    at(index: number): Reactive<T>;

    concat(...items: (T | T[])[]): Enumerable<T>;

    every(callbackFn: (element: T, index: number) => boolean): Reactive<boolean>;

    filter(callbackFn: (element: T, index: number) => boolean): Enumerable<T>;

    find(callbackFn: (element: T, index: number) => boolean): Reactive<T | undefined>;

    findIndex(callbackFn: (element: T, index: number) => boolean): Reactive<number>;

    findLast(callbackFn: (element: T, index: number) => boolean): Reactive<T | undefined>;

    findLastIndex(callbackFn: (element: T, index: number) => boolean): Reactive<number>;

    forEach(callbackFn: (element: T, index: number) => void): void;

    includes(searchElement: T, fromIndex?: number): Reactive<boolean>;

    indexOf(searchElement: T, fromIndex?: number): Reactive<number>;

    join(separator?: string): Reactive<string>;

    lastIndexOf(searchElement: T, fromIndex?: number): Reactive<number>;

    map<U>(callbackFn: (element: T, index: Reactive<number>) => U): Enumerable<U>;

    reduce(callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T): Reactive<T>;

    reduce(callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T, initialValue: T): Reactive<T>;

    reduce<U>(callbackFn: (previousValue: U, currentValue: T, currentIndex: number) => U, initialValue: U): Reactive<U>;

    reduceRight(callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T): Reactive<T>;

    reduceRight(callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T, initialValue: T): Reactive<T>;

    reduceRight<U>(callbackFn: (previousValue: U, currentValue: T, currentIndex: number) => U, initialValue: U): Reactive<U>;

    slice(start?: number, end?: number): Enumerable<T>;

    some(callbackFn: (element: T, index: number) => boolean): Reactive<boolean>;
}

export interface ReactiveArray<T = any> extends Enumerable<T> {

    pop(): void;

    push(...items: T[]): void;

    reverse(): void;

    shift(): void;

    splice(start: number, deleteCount?: number, ...items: T[]): void;

    sort(compareFn?: (a: T, b: T) => number): void;

    unshift(...items: T[]): void;
}