export class Scope { }

export class Respond<T = any> extends Scope {
    val: T;
    readonly peek: T;
}

export type Recover = (err: any) => void;

export type Cleanup = (final: boolean) => void;

export type Compare<T> = false | ((a: T, b: T) => boolean);

export function peek<T>(fn: () => T): T;

export function batch<T>(fn: () => T): T;

export function stable(): void;

export function cleanup(fn: Cleanup): void;

export function recover(fn: Recover): void;

export function dispose(val: Scope): void;

export function root<T>(fn: () => T): Scope<T>;

export function val<T>(fn: () => T): Readonly<Respond<T>>;

export function signal<T>(value: T, eq?: Compare<T>): Respond<T>;

export function compute<T>(fn: (seed: T) => T, seed?: T, eq?: Compare<T>): Readonly<Respond<T>>;

export function $compute<T>(fn: (seed: T) => T, seed?: T, eq?: Compare<T>): Readonly<Respond<T>>;

export function effect<T>(fn: (seed: T) => T, seed?: T): Readonly<Respond<T>>;

export function $effect<T>(fn: (seed: T) => T, seed?: T): Readonly<Respond<T>>;