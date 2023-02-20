export interface ReadSignal<T = any> {
    get val(): T;

    get peek(): T;
}

export interface Signal<T = any> extends ReadSignal<T> {
    set val(val: T): T;
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

export interface SignalCollection<T = any> extends ReadSignal<T[]> {

    get length(): ReadSignal<number>;

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
    
    set val(items: T[]): T[];

    set length(val: number): number;
    
    pop(): void;
    
    push(...items: T[]): void;
    
    reverse(): void;
    
    shift(): void;

    splice(start: number, deleteCount?: number, ...items: T[]): void;

    sort(compareFn?: (a: T, b: T) => number): void;
    
    unshift(...items: T[]): void;
}