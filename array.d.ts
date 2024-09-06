import { Signal, SignalData, Options } from "./index";

type Value<T> = T | Signal<T> | (() => T);

type IteratorOptions<T> = Partial<
  Pick<Options<T, never>, "source" | "unstable" | "compare" | "lazy">
>;

export interface SignalIterator<T = any> extends Signal<ReadonlyArray<T>> {
  readonly length: () => number;

  at(index: Value<number>, opts?: IteratorOptions<T>): Signal<T>;

  concat(
    items: T | T[] | Value<T> | Value<T[]>,
    opts?: IteratorOptions<T>
  ): SignalIterator<T>;

  every(
    callbackFn: (element: T, index: number) => boolean,
    opts?: IteratorOptions<T>
  ): Signal<boolean>;

  filter(
    callbackFn: (element: T, index: number) => boolean,
    opts?: IteratorOptions<T>
  ): SignalIterator<T>;

  find(
    callbackFn: (element: T, index: number) => boolean,
    opts?: IteratorOptions<T>
  ): Signal<T | undefined>;

  findIndex(
    callbackFn: (element: T, index: number) => boolean,
    opts?: IteratorOptions<T>
  ): Signal<number>;

  findLast(
    callbackFn: (element: T, index: number) => boolean,
    opts?: IteratorOptions<T>
  ): Signal<T | undefined>;

  findLastIndex(
    callbackFn: (element: T, index: number) => boolean,
    opts?: IteratorOptions<T>
  ): Signal<number>;

  forEach(
    callbackFn: (element: T, index: number) => void,
    opts?: IteratorOptions<T>
  ): void;

  includes(
    searchElement: Value<T>,
    fromIndex?: Value<number>,
    opts?: IteratorOptions<T>
  ): Signal<boolean>;

  indexOf(
    searchElement: Value<T>,
    fromIndex?: Value<number>,
    opts?: IteratorOptions<T>
  ): Signal<number>;

  join(separator?: Value<string>, opts?: IteratorOptions<T>): Signal<string>;

  lastIndexOf(
    searchElement: Value<T>,
    fromIndex?: Value<number>,
    opts?: IteratorOptions<T>
  ): Signal<number>;

  map<U>(
    callbackFn: (element: T, index: Signal<number>) => U,
    opts?: IteratorOptions<T>
  ): SignalIterator<U>;

  reduce(
    callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T
  ): Signal<T>;

  reduce(
    callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T,
    initialValue: Value<T>,
    opts?: IteratorOptions<T>
  ): Signal<T>;

  reduce<U>(
    callbackFn: (previousValue: U, currentValue: T, currentIndex: number) => U,
    initialValue: Value<U>,
    opts?: IteratorOptions<T>
  ): Signal<U>;

  reduceRight(
    callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T
  ): Signal<T>;

  reduceRight(
    callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T,
    initialValue: Value<T>,
    opts?: IteratorOptions<T>
  ): Signal<T>;

  reduceRight<U>(
    callbackFn: (previousValue: U, currentValue: T, currentIndex: number) => U,
    initialValue: Value<U>,
    opts?: IteratorOptions<T>
  ): Signal<U>;

  slice(
    start?: Value<number>,
    end?: Value<number>,
    opts?: IteratorOptions<T>
  ): SignalIterator<T>;

  some(
    callbackFn: (element: T, index: number) => boolean,
    opts?: IteratorOptions<T>
  ): Signal<boolean>;
}

export interface SignalArray<T = any>
  extends SignalIterator<T>,
    SignalData<ReadonlyArray<T>> {
  /**
   *
   * @param callbackFn
   */
  modify(callbackFn: (prev: T[]) => T[]): void;
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
