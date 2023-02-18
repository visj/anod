export class Dispose { }

export class Signal<T = any> extends Dispose {
    val: T;
    readonly peek: T;
}

export type Recover = (err: any) => void;

export type Cleanup = (final: boolean) => void;

export type Compare<T> = false | ((a: T, b: T) => boolean);

export function peek<T>(fn: () => T): T;

export function batch(fn: () => void): void;

export function stable(): void;

export function cleanup(fn: Cleanup): void;

export function recover(fn: Recover): void;

export function dispose(val: Dispose): void;

export function root<T>(fn: (teardown: () => void) => T): T;

export function data<T>(value: T): Signal<T>;

export function value<T>(value: T, eq?: Compare<T>): Signal<T>;

export function compute<T>(fn: (seed: T) => T, seed?: T, eq?: Compare<T>): Readonly<Signal<T>>;

export function $compute<T>(fn: (seed: T) => T, seed?: T, eq?: Compare<T>): Readonly<Signal<T>>;

export function respond<T>(fn: (seed: T) => T, seed?: T): Readonly<Signal<T>>;

export function $respond<T>(fn: (seed: T) => T, seed?: T): Readonly<Signal<T>>;

export function effect<T>(fn: (seed: T) => T, seed?: T): Readonly<Signal<T>>;

export function $effect<T>(fn: (seed: T) => T, seed?: T): Readonly<Signal<T>>;