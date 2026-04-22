import {
  Signal, Compute, Effect, Sender,
  ComputeContext, EffectContext
} from "@fyren/core";

export type ListParam<T> = T | Sender<T>;

export interface Collection<T> extends Compute<readonly T[]> {
  at(index: ListParam<number>): Compute<T | undefined>;
  concat(...items: ListParam<any>[]): Collection<T>;
  entries(): Compute<IterableIterator<[number, T]>>;
  every(cb: (value: T, index: number, array: T[], c: ComputeContext) => boolean, opts?: number): Compute<boolean>;
  filter(cb: (value: T, index: number, array: T[], c: ComputeContext) => boolean, opts?: number): Collection<T>;
  find(cb: (value: T, index: number, array: T[], c: ComputeContext) => boolean, opts?: number): Compute<T | undefined>;
  findIndex(cb: (value: T, index: number, array: T[], c: ComputeContext) => boolean, opts?: number): Compute<number>;
  findLast(cb: (value: T, index: number, array: T[], c: ComputeContext) => boolean, opts?: number): Compute<T | undefined>;
  findLastIndex(cb: (value: T, index: number, array: T[], c: ComputeContext) => boolean, opts?: number): Compute<number>;
  flat(depth?: ListParam<number>): Collection<any>;
  flatMap<U>(cb: (value: T, index: number, array: T[], c: ComputeContext) => U[], opts?: number): Collection<U>;
  forEach(cb: (value: T, index: number, array: T[], c: EffectContext) => void | (() => void), opts?: number): Effect;
  includes(searchElement: any, fromIndex?: ListParam<number>): Compute<boolean>;
  indexOf(searchElement: any, fromIndex?: ListParam<number>): Compute<number>;
  join(separator?: ListParam<string>): Compute<string>;
  keys(): Compute<IterableIterator<number>>;
  map<U>(cb: (value: T, index: number, array: T[], c: ComputeContext) => U, opts?: number): Collection<U>;
  reduce<U>(cb: (accumulator: U, currentValue: T, currentIndex: number, array: T[], c: ComputeContext) => U, initialValue?: ListParam<U>, opts?: number): Compute<U>;
  reduceRight<U>(cb: (accumulator: U, currentValue: T, currentIndex: number, array: T[], c: ComputeContext) => U, initialValue?: ListParam<U>, opts?: number): Compute<U>;
  slice(start?: ListParam<number>, end?: ListParam<number>): Collection<T>;
  some(cb: (value: T, index: number, array: T[], c: ComputeContext) => boolean, opts?: number): Compute<boolean>;
  values(): Compute<IterableIterator<T>>;
}

export interface List<T> extends Collection<T>, Signal<readonly T[]> {
  push(...items: T[]): void;
  pop(): void;
  shift(): void;
  unshift(...items: T[]): void;
  reverse(): void;
  sort(compareFn?: (a: T, b: T) => number): void;
  splice(start: number, deleteCount?: number, ...items: T[]): void;
  fill(value: T, start?: number, end?: number): void;
  copyWithin(target: number, start: number, end?: number): void;
}

export declare function list<T>(value: T[]): List<T>;
