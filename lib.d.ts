export class Scope<T = any> {
    readonly val: T;
}

export class Compute<T = any> {
    readonly val: T;
}

export class Signal<T = any> {
    val: T;
}

export type Source<T = any> = Compute<T> | Signal<T>;

class Nil { }

type nil = typeof Nil;

export type Cleanup = (final: boolean) => void;

export type Equals<T> = (a: T, b: T) => boolean;

export function nil(): nil;

export function val<T>(fn: () => T): Compute<T>;

export function owner(): Scope | null;

export function listener(): Compute | null;

export function dispose(val: Source): void;

export type SourceVal<T> = T extends Source<infer U> ? U : T extends [infer Head, ...infer Tail] ? [SourceVal<Head>, ...SourceVal<Tail>] : T extends readonly [infer Head, ...infer Tail] ? [SourceVal<Head>, ...SourceVal<Tail>] : T extends Array<infer U> ? Array<SourceVal<U>> : any;

export function when<S1 extends Source, T>(src1: [S1], fn: (src1: [SourceVal<S1>], seed: T, prev?: [SourceVal<S1>]) => T, defer?: boolean): (seed: T) => T;

export function when<S1 extends Source, S2 extends Source, T>(src1: [S1, S2], fn: (src1: [SourceVal<S1>, SourceVal<S2>], seed: T, prev?: [SourceVal<S1>, SourceVal<S2>]) => T, defer?: boolean): (seed: T) => T;

export function when<S1 extends Source, S2 extends Source, S3 extends Source, T>(src1: [S1, S2, S3], fn: (src1: [SourceVal<S1>, SourceVal<S2>, SourceVal<S3>], seed: T, prev?: [SourceVal<S1>, SourceVal<S2>, SourceVal<S3>]) => T, defer?: boolean): (seed: T) => T;

export function when<S1 extends Source, S2 extends Source, S3 extends Source, S4 extends Source, T>(src1: [S1, S2, S3, S4], fn: (src1: [SourceVal<S1>, SourceVal<S2>, SourceVal<S3>, SourceVal<S4>], seed: T, prev?: [SourceVal<S1>, SourceVal<S2>, SourceVal<S3>, SourceVal<S4>]) => T, defer?: boolean): (seed: T) => T;

export function when<S1 extends Source, S2 extends Source, S3 extends Source, S4 extends Source, S5 extends Source, T>(src1: [S1, S2, S3, S4, S5], fn: (src1: [SourceVal<S1>, SourceVal<S2>, SourceVal<S3>, SourceVal<S4>, SourceVal<S5>], seed: T, prev?: [SourceVal<S1>, SourceVal<S2>, SourceVal<S3>, SourceVal<S4>, SourceVal<S5>]) => T, defer?: boolean): (seed: T) => T;

export function when<S1 extends Source, S2 extends Source, S3 extends Source, S4 extends Source, S5 extends Source, S6 extends Source, T>(src1: [S1, S2, S3, S4, S5, S6], fn: (src1: [SourceVal<S1>, SourceVal<S2>, SourceVal<S3>, SourceVal<S4>, SourceVal<S5>, SourceVal<S6>], seed: T, prev?: [SourceVal<S1>, SourceVal<S2>, SourceVal<S3>, SourceVal<S4>, SourceVal<S5>, SourceVal<S6>]) => T, defer?: boolean): (seed: T) => T;

export function when<S1 extends Source, S2 extends Source, S3 extends Source, S4 extends Source, S5 extends Source, S6 extends Source, S7 extends Source, T>(src1: [S1, S2, S3, S4, S5, S6, S7], fn: (src1: [SourceVal<S1>, SourceVal<S2>, SourceVal<S3>, SourceVal<S4>, SourceVal<S5>, SourceVal<S6>, SourceVal<S7>], seed: T, prev?: [SourceVal<S1>, SourceVal<S2>, SourceVal<S3>, SourceVal<S4>, SourceVal<S5>, SourceVal<S6>, SourceVal<S7>]) => T, defer?: boolean): (seed: T) => T;

export function when<S1 extends Source, S2 extends Source, S3 extends Source, S4 extends Source, S5 extends Source, S6 extends Source, S7 extends Source, S8 extends Source, T>(src1: [S1, S2, S3, S4, S5, S6, S7, S8], fn: (src1: [SourceVal<S1>, SourceVal<S2>, SourceVal<S3>, SourceVal<S4>, SourceVal<S5>, SourceVal<S6>, SourceVal<S7>, SourceVal<S8>], seed: T, prev?: [SourceVal<S1>, SourceVal<S2>, SourceVal<S3>, SourceVal<S4>, SourceVal<S5>, SourceVal<S6>, SourceVal<S7>, SourceVal<S8>]) => T, defer?: boolean): (seed: T) => T;

export function when<S1 extends Source, S2 extends Source, S3 extends Source, S4 extends Source, S5 extends Source, S6 extends Source, S7 extends Source, S8 extends Source, S9 extends Source, T>(src1: [S1, S2, S3, S4, S5, S6, S7, S8, S9], fn: (src1: [SourceVal<S1>, SourceVal<S2>, SourceVal<S3>, SourceVal<S4>, SourceVal<S5>, SourceVal<S6>, SourceVal<S7>, SourceVal<S8>, SourceVal<S9>], seed: T, prev?: [SourceVal<S1>, SourceVal<S2>, SourceVal<S3>, SourceVal<S4>, SourceVal<S5>, SourceVal<S6>, SourceVal<S7>, SourceVal<S8>, SourceVal<S9>]) => T, defer?: boolean): (seed: T) => T;

export function when<S extends Source | Source[] | readonly Source[], T>(src: S, fn: (src: SourceVal<S>, seed: T, prev?: [SourceVal<S>]) => T, defer?: boolean): (seed: T) => T;

export function effect<T>(fn: (seed: T) => T, seed?: T): void;

export function $effect<T>(fn: (seed: T) => T, seed?: T): void;

export function compute<T>(fn: (seed: T) => T, seed?: T, eq?: false | Equals<T>): Compute<T>;

export function $compute<T>(fn: (seed: T) => T, seed?: T, eq?: false | Equals<T>): Compute<T>;

export function root<T>(fn: () => T): Source<T>;

export function data<T>(value: T): Signal<T>;

export function value<T>(value: T, eq?: Equals<T>): Signal<T>;

export function freeze<T>(fn: () => T): T;

export function peek<T>(fn: Source<T> | Call<T>): T;

export function cleanup(fn: Cleanup): void;