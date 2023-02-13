export interface Func<T = any> {
    readonly val: T;
}

export interface Signal<T = any> {
    val: T;
}

export type Val<T = any> = Func<T> | Signal<T>;

export const enum Opt {
    Defer = 8,
    Static = 16
}

class Nil { }

type nil = typeof Nil;

export type Cleanup = (final: boolean) => void;

export type Equals<T> = (a: T, b: T) => boolean;

export function nil(): nil;

export function owner(): Func | null;

export function listener(): Func | null;

export function dispose(val: Val): void;

export type SourceVal<T> = T extends Val<infer U> ? U : T extends [infer Head, ...infer Tail] ? [SourceVal<Head>, ...SourceVal<Tail>] : T extends readonly [infer Head, ...infer Tail] ? [SourceVal<Head>, ...SourceVal<Tail>] : T extends Array<infer U> ? Array<SourceVal<U>> : any;

export function bind<S extends Val | Val[] | readonly Val[], T>(src: S, fn: (src: SourceVal<S>, seed: T, prev: typeof NIL | SourceVal<S>) => T): (seed: T) => T;

export function effect<T>(fn: (seed: T) => T, seed?: T, opt?: Opt): void;

export function compute<T>(fn: (seed: T) => T, seed?: T, opt?: Opt): Func<T>;

export function root<T>(fn: () => T): Val<T>;

export function data<T>(value: T): Signal<T>;

export function value<T>(value: T, eq?: Equals<T>): Signal<T>;

export function freeze<T>(fn: () => T): T;

export function peek<T>(fn: Val<T> | Call<T>): T;

export function cleanup(fn: Cleanup): void;