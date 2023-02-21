export interface ReadSignal<T = any> {
    get val(): T;

    get peek(): T;
}

export interface Signal<T = any> extends ReadSignal<T> {
    set(val: T): void;
}

type Source = ReadSignal | ReadSignal[] | readonly ReadSignal[];

export type DisposeFn = () => void;

export type RecoverFn = (err: any) => void;

export type CleanupFn = (final: boolean) => void;

export type CompareFn<T> = ((a: T, b: T) => boolean);

export function root<T>(callback: (disposeFn: DisposeFn) => T): T;

export function data<T>(value: T): Signal<T>;

export function value<T>(value: T, eq?: CompareFn<T> | null): Signal<T>;

export function array<T = any>(items?: T[], eq?: CompareFn<T> | null): SignalArray<T>;

export function compute<T>(callback: () => T): ReadSignal<T>;

export function compute<T>(callback: (seed: T, dispose: DisposeFn) => T, seed: T, eq?: CompareFn<T> | null): ReadSignal<T>;

export function compute<T,U>(callback: (seed: T, dispose: DisposeFn, args: U) => T, seed: T, eq: CompareFn<T> | null, args: U): ReadSignal<T>;

export function compute<T,U>(callback: (seed: T, dispose: DisposeFn, args: U) => T, seed?: T, eq?: CompareFn<T> | null, args?: U): ReadSignal<T>;

export function $compute<T>(callback: () => T): ReadSignal<T>;

export function $compute<T>(callback: (seed: T, dispose: DisposeFn) => T, seed: T, eq?: CompareFn<T> | null): ReadSignal<T>;

export function $compute<T,U>(callback: (seed: T, dispose: DisposeFn, args: U) => T, seed: T, eq: CompareFn<T> | null, args: U): ReadSignal<T>;

export function $compute<T,U>(callback: (seed: T, dispose: DisposeFn, args: U) => T, seed?: T, eq?: CompareFn<T> | null, args?: U): ReadSignal<T>;

export function computeWhen<T>(src: Source, callback: () => T): ReadSignal<T>;

export function computeWhen<T>(src: Source, callback: (seed: T, dispose: DisposeFn) => T, seed: T, eq?: CompareFn<T> | null, defer?: boolean): ReadSignal<T>;

export function computeWhen<T,U>(src: Source, callback: (seed: T, dispose: DisposeFn, args: U) => T, seed: T, eq: CompareFn<T> | null, defer: boolean, args: U): ReadSignal<T>;

export function computeWhen<T,U>(src: Source, callback: (seed: T, dispose: DisposeFn, args: U) => T, seed?: T, eq?: CompareFn<T> | null, defer?: boolean, args?: U): ReadSignal<T>;

export function effect<T>(callback: () => T): T;

export function effect<T>(callback: (seed: T, dispose: DisposeFn) => T, seed: T): T;

export function effect<T,U>(callback: (seed: T, dispose: DisposeFn, args: U) => T, seed: T, args: U): T;

export function effect<T,U>(callback: (seed: T, dispose: DisposeFn, args: U) => T, seed?: T, args?: U): T;

export function $effect<T>(callback: () => T): T;

export function $effect<T>(callback: (seed: T, dispose: DisposeFn) => T, seed: T): T;

export function $effect<T,U>(callback: (seed: T, dispose: DisposeFn, args: U) => T, seed: T, args: U): T;

export function $effect<T,U>(callback: (seed: T, dispose: DisposeFn, args: U) => T, seed?: T, args?: U): T;

export function effectWhen<T>(src: Source, callback: () => T): T;

export function effectWhen<T>(src: Source, callback: (seed: T, dispose: DisposeFn) => T, seed: T, defer?: boolean): T;

export function effectWhen<T,U>(src: Source, callback: (seed: T, dispose: DisposeFn, args: U) => T, seed: T, defer: boolean, args: U): T;

export function effectWhen<T,U>(src: Source, callback: (seed: T, dispose: DisposeFn, args: U) => T, seed?: T, defer?: boolean, args?: U): T;

export function cleanup(cleanupFn: CleanupFn): void;

export function recover(recoverFn: RecoverFn): void;

export function dispose(val: ReadSignal): void;

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
    ReplaceRange = 911,
    /**
     * 16 | Tail | Range | Remove | Insert
     */
    ReplaceRangeInsert = 976,
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

type MutArg<M extends Mutation, T> = [M, T];

type MutSet<T> = MutArg<Mutation.Set, T[]>;

type MutSetAt<T> = MutArg<Mutation.SetAt, [number, T]>;

type MutPop = MutArg<Mutation.Pop, undefined>;

type MutPopRange = MutArg<Mutation.PopRange, number>;

type MutPush<T> = MutArg<Mutation.Push, T>;

type MutPushRange<T> = MutArg<Mutation.PushRange, T[]>;

type MutShift = MutArg<Mutation.Shift, undefined>;

type MutShiftRange = MutArg<Mutation.ShiftRange, number>;

type MutUnshift<T> = MutArg<Mutation.Unshift, T>;

type MutUnshiftRange<T> = MutArg<Mutation.UnshiftRange, T[]>;

type MutRemoveAt = MutArg<Mutation.RemoveAt, number>;

type MutRemoveRange = MutArg<Mutation.RemoveRange, [number, number]>;

type MutInsertAt<T> = MutArg<Mutation.InsertAt, [number, 0, T]>;

type MutInsertRange<T> = MutArg<Mutation.InsertRange, [number, 0, T[]]>;

type MutReplaceRange<T> = MutArg<Mutation.ReplaceRange, [number, number, T[]]>;

type MutReplaceRangeInsert<T> = MutArg<Mutation.ReplaceRangeInsert, [number, number, T[]]>;

type MutReverse = MutArg<Mutation.Reverse, undefined>;

type MutSort<T> = MutArg<Mutation.Sort, (a: T, b: T) => number>;

type Mut<T> = MutSet<T> | MutSetAt<T> | MutPop | MutPopRange | MutPush<T> | MutPushRange<T> | MutShift | MutShiftRange | MutUnshift<T> | MutUnshiftRange<T> | MutRemoveAt | MutRemoveRange | MutInsertAt<T> | MutInsertRange<T> | MutReplaceRange<T> | MutReplaceRangeInsert<T>;

export interface SignalCollection<T = any> extends ReadSignal<T[]> {

    get length(): ReadSignal<number>;

    mut(): Mut<T>;

    at(index: number): ReadSignal<T>;

    concat(...items: (T | T[])[]): SignalCollection<T>;

    every(callbackFn: (element: T, index: number) => boolean): ReadSignal<boolean>;

    filter(callbackFn: (element: T, index: number) => boolean): SignalCollection<T>;

    find(callbackFn: (element: T, index: number) => boolean): ReadSignal<T | undefined>;

    findIndex(callbackFn: (element: T, index: number) => boolean): ReadSignal<number>;

    findLast(callbackFn: (element: T, index: number) => boolean): ReadSignal<T | undefined>;

    findLastIndex(callbackFn: (element: T, index: number) => boolean): ReadSignal<number>;

    forEach(callbackFn: (element: T, index: number) => void): void;

    includes(searchElement: T, fromIndex?: number): ReadSignal<boolean>;

    indexOf(searchElement: T, fromIndex?: number): ReadSignal<number>;

    join(separator?: string): ReadSignal<string>;

    lastIndexOf(searchElement: T, fromIndex?: number): ReadSignal<number>;

    map<U>(callbackFn: (element: T, index: ReadSignal<number>) => U): SignalCollection<U>;

    reduce(callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T): ReadSignal<T>;

    reduce(callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T, initialValue: T): ReadSignal<T>;

    reduce<U>(callbackFn: (previousValue: U, currentValue: T, currentIndex: number) => U, initialValue: U): ReadSignal<U>;

    reduceRight(callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T): ReadSignal<T>;

    reduceRight(callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T, initialValue: T): ReadSignal<T>;

    reduceRight<U>(callbackFn: (previousValue: U, currentValue: T, currentIndex: number) => U, initialValue: U): ReadSignal<U>;

    slice(start?: number, end?: number): SignalCollection<T>;
    
    some(callbackFn: (element: T, index: number) => boolean): ReadSignal<boolean>;
}

export interface SignalArray<T = any> extends SignalCollection<T>{

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