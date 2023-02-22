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

export const enum Mutation {
    Head = 32,
    Tail = 64,
    Range = 128,
    Remove = 256,
    Insert = 512,
    Reorder = 1024,
    Type = 31,
    /**
     * 1 | Insert | Reorder
     */
    Set = 1537,
    /**
     * 2 | Remove | Insert
     */
    SetAt = 770,
    /**
     * 3 | Tail | Remove
     */
    Pop = 67,
    /**
     * 4 | Tail | Range | Remove
     */
    PopRange = 196,
    /**
     * 5 | Tail | Insert
     */
    Push = 69,
    /**
     * 6 | Tail | Range | Insert
     */
    PushRange = 198,
    /**
     * 7 | Head | Remove
     */
    Shift = 295,
    /**
     * 8 | Head | Range | Remove
     */
    ShiftRange = 424,
    /**
     * 9 | Head | Insert
     */
    Unshift = 553,
    /**
     * 10 | Head | Range | Insert
     */
    UnshiftRange = 682,
    /**
     * 11 | Remove
     */
    RemoveAt = 267,
    /**
     * 12 | Range | Remove
     */
    RemoveRange = 396,
    /**
     * 13 | Insert
     */
    InsertAt = 525,
    /**
     * 14 | Range | Insert
     */
    InsertRange = 654,
    /**
     * 15 | Range | Remove | Insert
     */
    Replace = 911,
    /**
     * 16 | Tail | Range | Remove | Insert
     */
    ReplaceInsert = 976,
    /**
     * 17 | Reorder
     */
    Reverse = 1041,
    /**
     * 18 | Reorder
     */
    Sort = 1042,
    /**
     * User defined mutation
     */
    Custom = 19,
}

type MutType<M extends Mutation, T> = readonly [mut: M, start: number, end: number, args: T];

type MutSet<T> = MutType<Mutation.Set, T[]>;

type MutSetAt<T> = MutType<Mutation.SetAt, [number, T]>;

type MutPop = MutType<Mutation.Pop, undefined>;

type MutPopRange = MutType<Mutation.PopRange, number>;

type MutPush<T> = MutType<Mutation.Push, T>;

type MutPushRange<T> = MutType<Mutation.PushRange, T[]>;

type MutShift = MutType<Mutation.Shift, undefined>;

type MutShiftRange = MutType<Mutation.ShiftRange, number>;

type MutUnshift<T> = MutType<Mutation.Unshift, T>;

type MutUnshiftRange<T> = MutType<Mutation.UnshiftRange, T[]>;

type MutRemoveAt = MutType<Mutation.RemoveAt, number>;

type MutRemoveRange = MutType<Mutation.RemoveRange, [number, number]>;

type MutInsertAt<T> = MutType<Mutation.InsertAt, [number, 0, T]>;

type MutInsertRange<T> = MutType<Mutation.InsertRange, [number, 0, T[]]>;

type MutReplaceRange<T> = MutType<Mutation.Replace, [number, number, T[]]>;

type MutReplaceRangeInsert<T> = MutType<Mutation.ReplaceInsert, [number, number, T[]]>;

type MutReverse = MutType<Mutation.Reverse, undefined>;

type MutSort<T> = MutType<Mutation.Sort, (a: T, b: T) => number>;

type Mut<T> = MutSet<T>
    | MutSetAt<T>
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
    | MutReplaceRangeInsert<T>
    | MutReverse
    | MutSort<T>
    | MutType<Mutation.Custom, unknown>;

export interface IterableSignal<T = any> extends Signal<T[]> {

    get length(): Signal<number>;

    mut(): Mut<T>;

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