export class RootSignal { }

export class ReadSignal<T = any> extends RootSignal {
    readonly val: T;
    readonly peek: T;
}

export class Signal<T = any> extends RootSignal {
    val: T;
    readonly peek: T;
}

export type RecoverFn = (err: any) => void;

export type CleanupFn = (final: boolean) => void;

export type Compare<T> = ((a: T, b: T) => boolean) | null;

export function root<T>(fn: (teardown: () => void) => T): T;

export function data<T>(value: T): Signal<T>;

export function value<T>(value: T, eq?: Compare<T>): Signal<T>;

export function compute<T>(fn: (seed: T) => T, seed?: T, eq?: Compare<T>): Readonly<Signal<T>>;

export function $compute<T>(fn: (seed: T) => T, seed?: T, eq?: Compare<T>): Readonly<Signal<T>>;

export function effect<T>(fn: (seed: T) => T, seed?: T): Readonly<Signal<T>>;

export function $effect<T>(fn: (seed: T) => T, seed?: T): Readonly<Signal<T>>;

export function peek<T>(fn: () => T): T;

export function batch(fn: () => void): void;

export function stable(): void;

export function cleanup(fn: CleanupFn): void;

export function recover(fn: RecoverFn): void;

export function dispose(val: RootSignal): void;

export function array<T>(items?: T[]): SignalArray<T>;

export class SignalCollection<T = any> extends RootSignal {
    readonly peek: T[];

    every(callbackFn: (element: T, index: ReadSignal<number>) => boolean): ReadSignal<boolean>;

    filter(callbackFn: (element: T, index: ReadSignal<number>) => boolean): SignalEnumerable<T>;

    find(callbackFn: (element: T, index: ReadSignal<number>) => boolean): ReadSignal<T | undefined>;

    findIndex(callbackFn: (element: T, index: ReadSignal<number>) => boolean): ReadSignal<number>;

    findLast(callbackFn: (element: T, index: ReadSignal<number>) => boolean): ReadSignal<T | undefined>;

    findLastIndex(callbackFn: (element: T, index: ReadSignal<number>) => boolean): ReadSignal<number>;

    forEach(callbackFn: (element: T, index: ReadSignal<number>) => void): void;

    includes(searchElement: T, fromIndex?: number): ReadSignal<boolean>;

    indexOf(searchElement: T, fromIndex?: number): ReadSignal<number>;

    join(separator?: string): ReadSignal<string>;

    lastIndexOf(searchElement: T, fromIndex?: number): ReadSignal<number>;

    map<U>(callbackFn: (element: T, index: ReadSignal<number>) => U): SignalEnumerable<U>;

    reduce(callbackFn: (previousValue: T, currentValue: T, currentIndex: ReadSignal<number>) => T): ReadSignal<T>;

    reduce(callbackFn: (previousValue: T, currentValue: T, currentIndex: ReadSignal<number>) => T, initialValue: T): ReadSignal<T>;

    reduce<U>(callbackFn: (previousValue: U, currentValue: T, currentIndex: ReadSignal<number>) => U, initialValue: U): ReadSignal<U>;

    reduceRight(callbackFn: (previousValue: T, currentValue: T, currentIndex: ReadSignal<number>) => T): ReadSignal<T>;

    reduceRight(callbackFn: (previousValue: T, currentValue: T, currentIndex: ReadSignal<number>) => T, initialValue: T): ReadSignal<T>;

    reduceRight<U>(callbackFn: (previousValue: U, currentValue: T, currentIndex: ReadSignal<number>) => U, initialValue: U): ReadSignal<U>;

    reverse(): SignalEnumerable<T>;

    slice(start?: number, end?: number): SignalEnumerable<T>;

    some(callbackFn: (element: T, index: ReadSignal<number>) => boolean): ReadSignal<boolean>;
}

export class SignalEnumerable<T = any> extends SignalCollection<T> {
    readonly val: T[];
}

export class SignalArray<T = any> extends SignalCollection<T> {
    val: T[];

    get length(): ReadSignal<number>;
    
    set length(val: number);

    concat(...items: (T | T[])[]): SignalArray<T>;

    pop(): void;

    push(...items: T[]): void;

    shift(): void;

    splice(start: number, deleteCount?: number, ...items: T[]): void;
    
    sort(compareFn?: (a: T, b: T) => number): void;
    
    unshift(...items: T[]): void;
}