import { ReadonlySignal } from "./index";

type Value<T> = T | ReadonlySignal<T> | (() => T);

export interface SignalIterator<T = any> extends ReadonlySignal<ReadonlyArray<T>> {
  length(): number;

  at(index: Value<number>): ReadonlySignal<T>;

  concat(...items: Array<T | Value<T>>): SignalIterator<T>;

  every(callbackFn: (element: T, index: number) => boolean): ReadonlySignal<boolean>;

  filter(callbackFn: (element: T, index: number) => boolean): SignalIterator<T>;

  find(callbackFn: (element: T, index: number) => boolean): ReadonlySignal<T | undefined>;

  findIndex(callbackFn: (element: T, index: number) => boolean): ReadonlySignal<number>;

  findLast(callbackFn: (element: T, index: number) => boolean): ReadonlySignal<T | undefined>;

  findLastIndex(callbackFn: (element: T, index: number) => boolean): ReadonlySignal<number>;

  forEach(callbackFn: (element: T, index: number) => void): void;

  includes(searchElement: Value<T>, fromIndex?: Value<number>): ReadonlySignal<boolean>;

  indexOf(searchElement: Value<T>, fromIndex?: Value<number>): ReadonlySignal<number>;

  join(separator?: Value<string>): ReadonlySignal<string>;

  lastIndexOf(searchElement: Value<T>, fromIndex?: Value<number>): ReadonlySignal<number>;

  map<U>(callbackFn: (element: T, index: ReadonlySignal<number>) => U): SignalIterator<U>;

  reduce(callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T): ReadonlySignal<T>;

  reduce(
    callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T,
    initialValue: Value<T>
  ): ReadonlySignal<T>;

  reduce<U>(
    callbackFn: (previousValue: U, currentValue: T, currentIndex: number) => U,
    initialValue: Value<U>
  ): ReadonlySignal<U>;

  reduceRight(callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T): ReadonlySignal<T>;

  reduceRight(
    callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T,
    initialValue: Value<T>
  ): ReadonlySignal<T>;

  reduceRight<U>(
    callbackFn: (previousValue: U, currentValue: T, currentIndex: number) => U,
    initialValue: Value<U>
  ): ReadonlySignal<U>;

  slice(start?: Value<number>, end?: Value<number>): SignalIterator<T>;

  some(callbackFn: (element: T, index: number) => boolean): ReadonlySignal<boolean>;
}

export interface SignalArray<T = any> extends SignalIterator<T>, ReadonlySignal<ReadonlyArray<T>> {
  set(val: T[]): void;
  /**
   *
   * @param callbackFn
   */
  modify(callbackFn: (array: T[]) => T[]): void;
  /**
   *
   */
  pop(): void;
  /**
   *
   */
  push(...items: T[]): void;
  /**
   *
   */
  reverse(): void;
  /**
   *
   */
  shift(): void;
  /**
   *
   */
  splice(start: number, deleteCount?: number, ...items: T[]): void;
  /**
   *
   */
  sort(compareFn?: (a: T, b: T) => number): void;
  /**
   *
   */
  unshift(...items: T[]): void;
}

/**
 *
 * @param val
 */
export declare function array<T = any>(val?: T[]): SignalArray<T>;
