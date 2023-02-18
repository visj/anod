export class ReadSignal<T = any> extends RootSignal {
    get val(): T;

    get peek(): T;
}

export class Signal<T = any> extends ReadSignal<T> {
    set val(val: T): T;
}

export type RecoverFn = (err: any) => void;

export type CleanupFn = (final: boolean) => void;

export type Compare<T> = ((a: T, b: T) => boolean) | null;

export function root<T>(callback: (teardown: () => void) => T): T;

export function data<T>(value: T): Signal<T>;

export function value<T>(value: T, eq?: Compare<T>): Signal<T>;

export function array<T>(items?: T[], eq?: Compare<T>): SignalArray<T>;

export function compute<T>(callback: (seed: T) => T, seed?: T, compareFn?: Compare<T>): Readonly<Signal<T>>;

export function $compute<T>(callback: (seed: T) => T, seed?: T, compareFn?: Compare<T>): Readonly<Signal<T>>;

export function effect<T>(callback: (seed: T) => T, seed?: T): Readonly<Signal<T>>;

export function $effect<T>(callback: (seed: T) => T, seed?: T): Readonly<Signal<T>>;

export function cleanup(cleanupFn: CleanupFn): void;

export function recover(recoverFn: RecoverFn): void;

export function dispose(val: ReadSignal): void;

export function peek<T>(callback: () => T): T;

export function batch(callback: () => void): void;

export function stable(): void;

export class SignalCollection<T = any> extends ReadSignal<T[]> {

    get length(): ReadSignal<number>;

    concat(...items: (T | T[])[]): SignalCollection<T>;

    every(callbackFn: (element: T, index: number) => boolean): ReadSignal<boolean>;

    filter(callbackFn: (element: T, index: number) => boolean): SignalCollection<T>;

    find(callbackFn: (element: T, index: number) => boolean): ReadSignal<T | void>;

    findIndex(callbackFn: (element: T, index: number) => boolean): ReadSignal<number>;

    findLast(callbackFn: (element: T, index: number) => boolean): ReadSignal<T | void>;

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

    reverse(): SignalCollection<T>;

    slice(start?: number, end?: number): SignalCollection<T>;

    some(callbackFn: (element: T, index: number) => boolean): ReadSignal<boolean>;
}

export class SignalArray<T = any> extends SignalCollection<T>{

    set val(items: T[]): T[];

    set length(val: number): number;

    pop(): T | undefined;

    push(...items: T[]): number;

    shift(): T | undefined;

    splice(start: number, deleteCount?: number, ...items: T[]): T[];

    sort(compareFn?: (a: T, b: T) => number): this;

    unshift(...items: T[]): number;
}