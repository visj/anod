export interface Signal<T = any> {
    get val(): T;

    get peek(): T;
}

export interface DataSignal<T = any> extends Signal<T> {
    set(val: T): void;
}

type falsy = false | 0 | '' | null;

type Source = Signal | Signal[] | readonly Signal[];

export type DisposeFn = () => void;

export type RecoverFn = (err: any) => void;

export type CleanupFn = (final: boolean) => void;

export type CompareFn<T> = ((a: T, b: T) => boolean) | falsy;

export function root<T>(callback: (disposeFn: DisposeFn) => T): T;

export function data<T>(value: T): DataSignal<T>;

export function value<T>(value: T, eq?: CompareFn<T>): DataSignal<T>;

export function array<T = any>(items?: T[], eq?: CompareFn<T>): ArraySignal<T>;

export function compute<T>(callback: () => T): Signal<T>;

export function compute<T>(callback: (seed: T, dispose: DisposeFn) => T, seed: T, eq?: CompareFn<T>): Signal<T>;

export function compute<T, U>(callback: (seed: T, dispose: DisposeFn, args: U) => T, seed: T, eq: CompareFn<T>, args: U): Signal<T>;

export function compute<T, U>(callback: (seed: T, dispose: DisposeFn, args: U) => T, seed?: T, eq?: CompareFn<T>, args?: U): Signal<T>;

export function $compute<T>(callback: () => T): Signal<T>;

export function $compute<T>(callback: (seed: T, dispose: DisposeFn) => T, seed: T, eq?: CompareFn<T>): Signal<T>;

export function $compute<T, U>(callback: (seed: T, dispose: DisposeFn, args: U) => T, seed: T, eq: CompareFn<T>, args: U): Signal<T>;

export function $compute<T, U>(callback: (seed: T, dispose: DisposeFn, args: U) => T, seed?: T, eq?: CompareFn<T>, args?: U): Signal<T>;

export function computeWhen<T>(src: Source, callback: () => T): Signal<T>;

export function computeWhen<T>(src: Source, callback: (seed: T, dispose: DisposeFn) => T, seed: T, eq?: CompareFn<T>, defer?: boolean): Signal<T>;

export function computeWhen<T, U>(src: Source, callback: (seed: T, dispose: DisposeFn, args: U) => T, seed: T, eq: CompareFn<T>, defer: boolean, args: U): Signal<T>;

export function computeWhen<T, U>(src: Source, callback: (seed: T, dispose: DisposeFn, args: U) => T, seed?: T, eq?: CompareFn<T>, defer?: boolean, args?: U): Signal<T>;

export function effect<T>(callback: () => T): T;

export function effect<T>(callback: (seed: T, dispose: DisposeFn) => T, seed: T): T;

export function effect<T, U>(callback: (seed: T, dispose: DisposeFn, args: U) => T, seed: T, args: U): T;

export function effect<T, U>(callback: (seed: T, dispose: DisposeFn, args: U) => T, seed?: T, args?: U): T;

export function $effect<T>(callback: () => T): T;

export function $effect<T>(callback: (seed: T, dispose: DisposeFn) => T, seed: T): T;

export function $effect<T, U>(callback: (seed: T, dispose: DisposeFn, args: U) => T, seed: T, args: U): T;

export function $effect<T, U>(callback: (seed: T, dispose: DisposeFn, args: U) => T, seed?: T, args?: U): T;

export function effectWhen<T>(src: Source, callback: () => T): T;

export function effectWhen<T>(src: Source, callback: (seed: T, dispose: DisposeFn) => T, seed: T, defer?: boolean): T;

export function effectWhen<T, U>(src: Source, callback: (seed: T, dispose: DisposeFn, args: U) => T, seed: T, defer: boolean, args: U): T;

export function effectWhen<T, U>(src: Source, callback: (seed: T, dispose: DisposeFn, args: U) => T, seed?: T, defer?: boolean, args?: U): T;

export function cleanup(cleanupFn: CleanupFn): void;

export function recover(recoverFn: RecoverFn): void;

export function dispose(val: Signal): void;

export function peek<T>(callback: () => T): T;

export function batch(callback: () => void): void;

export function stable(): void;

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

export interface IterableSignal<T = any> extends Signal<T[]> {

    get length(): Signal<number>;

    mut(): Mutation<T>;

    at(index: number): Signal<T>;

    concat(...items: (T | T[])[]): IterableSignal<T>;

    every(callbackFn: (element: T, index: number) => boolean): Signal<boolean>;

    filter(callbackFn: (element: T, index: number) => boolean): IterableSignal<T>;

    find(callbackFn: (element: T, index: number) => boolean): Signal<T | undefined>;

    findIndex(callbackFn: (element: T, index: number) => boolean): Signal<number>;

    findLast(callbackFn: (element: T, index: number) => boolean): Signal<T | undefined>;

    findLastIndex(callbackFn: (element: T, index: number) => boolean): Signal<number>;

    forEach(callbackFn: (element: T, index: number) => void): void;

    includes(searchElement: T, fromIndex?: number): Signal<boolean>;

    indexOf(searchElement: T, fromIndex?: number): Signal<number>;

    join(separator?: string): Signal<string>;

    lastIndexOf(searchElement: T, fromIndex?: number): Signal<number>;

    map<U>(callbackFn: (element: T, index: Signal<number>) => U): IterableSignal<U>;

    reduce(callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T): Signal<T>;

    reduce(callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T, initialValue: T): Signal<T>;

    reduce<U>(callbackFn: (previousValue: U, currentValue: T, currentIndex: number) => U, initialValue: U): Signal<U>;

    reduceRight(callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T): Signal<T>;

    reduceRight(callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T, initialValue: T): Signal<T>;

    reduceRight<U>(callbackFn: (previousValue: U, currentValue: T, currentIndex: number) => U, initialValue: U): Signal<U>;

    slice(start?: number, end?: number): IterableSignal<T>;

    some(callbackFn: (element: T, index: number) => boolean): Signal<boolean>;
}

export interface ArraySignal<T = any> extends IterableSignal<T> {

    set(items: T[]): void;

    set(index: number, item: T): void;

    pop(): void;

    push(...items: T[]): void;

    reverse(): void;

    shift(): void;

    splice(start: number, deleteCount?: number, ...items: T[]): void;

    sort(compareFn?: (a: T, b: T) => number): void;

    unshift(...items: T[]): void;
}