export interface Signal<T = any> {
    val(): T;

    peek(): T;
}

export interface DataSignal<T = any> extends Signal<T> {
    set(val: T): void;
}

type unset = void | undefined;

type Source = Signal | Signal[] | readonly Signal[];

type isArray<T> = T extends any[] ? true : T extends readonly any[] ? true : false;

export type Value<T> = T | Signal<T>;

export type Func<T = any> = (...args: any[]) => T;

export type Dispose = () => void;

export type Recover = (err: unknown) => void;

export type Cleanup = (final: boolean) => void;

export type Equal<T> = false | ((a: T, b: T) => boolean);

export function root<T>(fn: (dispose: Dispose) => T): T;

export function data<T>(value: T): DataSignal<T>;

export function value<T>(value: T, eq?: Equal<T>): DataSignal<T>;

export function array<T = unknown>(items?: T[], eq?: Equal<T>): ArraySignal<T>;

export function compute<T>(callback: () => T): Signal<T>;

export function compute<T>(callback: (seed: T) => T, seed: T): Signal<T>;

export function compute<T, U>(callback: (seed: T, args: U) => T, seed: T, args: U, eq?: Equal<T>): Signal<T>;

export function compute<T, U>(callback: (seed?: T, args?: U) => T, seed?: T, args?: U, eq?: Equal<T>): Signal<T>;

export function $compute<T>(callback: () => T): Signal<T>;

export function $compute<T>(callback: (seed: T) => T, seed: T): Signal<T>;

export function $compute<T, U>(callback: (seed: T, args: U) => T, seed: T, args: U, eq?: Equal<T>): Signal<T>;

export function $compute<T, U>(callback: (seed?: T, args?: U) => T, seed?: T, args?: U, eq?: Equal<T>): Signal<T>;

export function computeWhen<T>(src: Source, callback: () => T): Signal<T>;

export function computeWhen<T>(src: Source, callback: (seed: T) => T, seed: T, defer?: false): Signal<T>;

export function computeWhen<T, U>(src: Source, callback: (seed: T, args: U) => T, seed: T, defer: false | unset, args: U, eq?: Equal<T>): Signal<T>;

export function computeWhen<T, U>(src: Source, callback: (seed: T, args: U) => T, seed?: T, defer?: boolean, args?: U, eq?: Equal<T>): Signal<T>;

export function effect<T>(callback: () => T): T;

export function effect<T>(callback: (seed: T) => T, seed: T): T;

export function effect<T, U>(callback: (seed: T, args: U) => T, seed: T, args: U): T;

export function effect<T, U>(callback: (seed: T, args: U) => T, seed?: T, args?: U): T;

export function $effect<T>(callback: () => T): T;

export function $effect<T>(callback: (seed: T) => T, seed: T): T;

export function $effect<T, U>(callback: (seed: T, args: U) => T, seed: T, args: U): T;

export function $effect<T, U>(callback: (seed: T, args: U) => T, seed?: T, args?: U): T;

export function effectWhen<T>(src: Source, callback: () => T): T;

export function effectWhen<T>(src: Source, callback: (seed: T) => T, seed: T, defer?: false): T;

export function effectWhen<T, U>(src: Source, callback: (seed: T, args: U) => T, seed: T, defer: false | unset, args: U): T;

export function effectWhen<T, U>(src: Source, callback: (seed: T, args: U) => T, seed?: T, defer?: false, args?: U): T;

export function stable(): void;

export function peek<T>(callback: Func<T>): T;

export function batch(callback: Func): void;

export function cleanup(callback: Cleanup): void;

export function recover(callback: Recover): void;

export function dispose(val: Signal): void;

export const enum Mut {
    Custom = -1,
    ArgCount = 1,
    ArgParam = 2,
    ArgArray = 4,
    ArgSplice = 8,
    RemoveOne = 16,
    RemoveRange = 32,
    InsertOne = 64,
    InsertRange = 128,
    ReplaceOne = 256,
    ReplaceRange = 512,
    Head = 1024,
    Tail = 2048,
    Assign = 4096,
    Sort = 8192,
    Reverse = 16384,
}

export namespace MutType {
    export const Pop: Mut.RemoveOne | Mut.Tail | Mut.ArgParam;
    export const PopRange: Mut.RemoveRange | Mut.Tail | Mut.ArgArray;
    export const Push: Mut.InsertOne | Mut.Tail | Mut.ArgParam;
    export const PushRange: Mut.InsertRange | Mut.Tail | Mut.ArgArray;
}

type MutParam<M extends Mut, T> =
    M extends Mut.ArgCount ? number :
    M extends Mut.ArgParam ? T :
    M extends Mut.ArgArray ? readonly T[] :
    M extends Mut.ArgSplice ? readonly [number, number, ...T[]] : never;

type MutStruct<M extends Mut, T = never> = Readonly<{
    mut: readonly [
        mut: M,
        index: number,
        params: MutParam<M, T>,
        deleteCount: number,
        insertCount: number,
        replaceCount: number,
    ],
    args: MutParam<M, T>
}>;

type Mutation<T> =
    MutStruct<typeof MutType.Pop> |
    MutStruct<typeof MutType.PopRange> |
    MutStruct<typeof MutType.Push, T> |
    MutStruct<typeof MutType.PushRange, T>;

export type Compare<T> = (a: T, b: T) => number;

export interface IterableSignal<T = unknown> extends Signal<T[]> {

    mut(): Mutation<T>;

    length(): Signal<number>;

    at(index: Value<number>): Signal<T>;

    concat(...items: (Value<T> | T[] | IterableSignal<T>)[]): IterableSignal<T>;

    every(callback: (element: T, index: number) => boolean): Signal<boolean>;

    filter(callback: (element: T, index: number) => boolean): IterableSignal<T>;

    find(callback: (element: T, index: number) => boolean): Signal<T | undefined>;

    findIndex(callback: (element: T, index: number) => boolean): Signal<number>;

    findLast(callback: (element: T, index: number) => boolean): Signal<T | undefined>;

    findLastIndex(callback: (element: T, index: number) => boolean): Signal<number>;

    forEach(callback: (element: T, index: number) => void): void;

    includes(searchElement: Value<T>, fromIndex?: Value<number>): Signal<boolean>;

    indexOf(searchElement: Value<T>, fromIndex?: Value<number>): Signal<number>;

    join(separator?: Value<string>): Signal<string>;

    lastIndexOf(searchElement: Value<T>, fromIndex?: Value<number>): Signal<number>;

    map<U>(callback: (element: T, index: Signal<number>) => U): IterableSignal<U>;

    reduce(callback: (previousValue: T, currentValue: T, currentIndex: number) => T): Signal<T>;

    reduce(callback: (previousValue: T, currentValue: T, currentIndex: number) => T, initialValue: Value<T>): Signal<T>;

    reduce<U>(callback: (previousValue: U, currentValue: T, currentIndex: number) => U, initialValue: Value<U>): Signal<U>;

    reduceRight(callback: (previousValue: T, currentValue: T, currentIndex: number) => T): Signal<T>;

    reduceRight(callback: (previousValue: T, currentValue: T, currentIndex: number) => T, initialValue: Value<T>): Signal<T>;

    reduceRight<U>(callback: (previousValue: U, currentValue: T, currentIndex: number) => U, initialValue: Value<U>): Signal<U>;

    slice(start?: Value<number>, end?: Value<number>): IterableSignal<T>;

    some(callback: (element: T, index: number) => boolean): Signal<boolean>;
}

export interface ArraySignal<T = unknown> extends IterableSignal<T> {

    set(items: T[]): void;

    set(index: number, item: T): void;

    pop(): void;

    push(...items: T[]): void;

    reverse(): void;

    shift(): void;

    splice(start: number, deleteCount?: number, ...items: T[]): void;

    sort(compare?: Compare<T>): void;

    unshift(...items: T[]): void;
}