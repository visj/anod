import { Signal, SignalValue, SignalOptions } from "./lib.core";

export interface SignalIterator<T = any> extends Signal<T[]> {
  readonly length: () => number;

  at(index: number): Signal<T>;

  concat(...items: (T | T[])[]): SignalIterator<T>;

  every(callbackFn: (element: T, index: number) => boolean): Signal<boolean>;

  filter(callbackFn: (element: T, index: number) => boolean): SignalIterator<T>;

  find(
    callbackFn: (element: T, index: number) => boolean,
  ): Signal<T | undefined>;

  findIndex(callbackFn: (element: T, index: number) => boolean): Signal<number>;

  findLast(
    callbackFn: (element: T, index: number) => boolean,
  ): Signal<T | undefined>;

  findLastIndex(
    callbackFn: (element: T, index: number) => boolean,
  ): Signal<number>;

  forEach(callbackFn: (element: T, index: number) => void): void;

  includes(searchElement: T, fromIndex?: number): Signal<boolean>;

  indexOf(searchElement: T, fromIndex?: number): Signal<number>;

  join(separator?: string): Signal<string>;

  lastIndexOf(searchElement: T, fromIndex?: number): Signal<number>;

  map<U>(
    callbackFn: (element: T, index: Signal<number>) => U,
  ): SignalIterator<U>;

  reduce(
    callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T,
  ): Signal<T>;

  reduce(
    callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T,
    initialValue: T,
  ): Signal<T>;

  reduce<U>(
    callbackFn: (previousValue: U, currentValue: T, currentIndex: number) => U,
    initialValue: U,
  ): Signal<U>;

  reduceRight(
    callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T,
  ): Signal<T>;

  reduceRight(
    callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T,
    initialValue: T,
  ): Signal<T>;

  reduceRight<U>(
    callbackFn: (previousValue: U, currentValue: T, currentIndex: number) => U,
    initialValue: U,
  ): Signal<U>;

  slice(start?: number, end?: number): SignalIterator<T>;

  some(callbackFn: (element: T, index: number) => boolean): Signal<boolean>;
}

export interface SignalArray<T = any>
  extends SignalIterator<T>,
    SignalValue<T[]> {
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
export declare function array<T>(val?: T[]): SignalArray<T>;
