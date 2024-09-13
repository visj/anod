import { ReadonlySignal, ReadonlySignal, Options } from "./index";

type Value<T> = T | ReadonlySignal<T> | (() => T);

type IteratorOptions<T> = Partial<
  Pick<Options<T, never>, "source" | "unstable" | "compare" | "lazy">
>;

export interface SignalIterator<T = any> extends ReadonlySignal<ReadonlyArray<T>> {
  readonly length: () => number;

  at(index: Value<number>, opts?: IteratorOptions<T>): ReadonlySignal<T>;

  concat(
    items: T | T[] | Value<T> | Value<T[]>,
    opts?: IteratorOptions<T>
  ): SignalIterator<T>;

  every(
    callbackFn: (element: T, index: number) => boolean,
    opts?: IteratorOptions<T>
  ): ReadonlySignal<boolean>;

  filter(
    callbackFn: (element: T, index: number) => boolean,
    opts?: IteratorOptions<T>
  ): SignalIterator<T>;

  find(
    callbackFn: (element: T, index: number) => boolean,
    opts?: IteratorOptions<T>
  ): ReadonlySignal<T | undefined>;

  findIndex(
    callbackFn: (element: T, index: number) => boolean,
    opts?: IteratorOptions<T>
  ): ReadonlySignal<number>;

  findLast(
    callbackFn: (element: T, index: number) => boolean,
    opts?: IteratorOptions<T>
  ): ReadonlySignal<T | undefined>;

  findLastIndex(
    callbackFn: (element: T, index: number) => boolean,
    opts?: IteratorOptions<T>
  ): ReadonlySignal<number>;

  forEach(
    callbackFn: (element: T, index: number) => void,
    opts?: IteratorOptions<T>
  ): void;

  includes(
    searchElement: Value<T>,
    fromIndex?: Value<number>,
    opts?: IteratorOptions<T>
  ): ReadonlySignal<boolean>;

  indexOf(
    searchElement: Value<T>,
    fromIndex?: Value<number>,
    opts?: IteratorOptions<T>
  ): ReadonlySignal<number>;

  join(separator?: Value<string>, opts?: IteratorOptions<T>): ReadonlySignal<string>;

  lastIndexOf(
    searchElement: Value<T>,
    fromIndex?: Value<number>,
    opts?: IteratorOptions<T>
  ): ReadonlySignal<number>;

  map<U>(
    callbackFn: (element: T, index: ReadonlySignal<number>) => U,
    opts?: IteratorOptions<T>
  ): SignalIterator<U>;

  reduce(
    callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T
  ): ReadonlySignal<T>;

  reduce(
    callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T,
    initialValue: Value<T>,
    opts?: IteratorOptions<T>
  ): ReadonlySignal<T>;

  reduce<U>(
    callbackFn: (previousValue: U, currentValue: T, currentIndex: number) => U,
    initialValue: Value<U>,
    opts?: IteratorOptions<T>
  ): ReadonlySignal<U>;

  reduceRight(
    callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T
  ): ReadonlySignal<T>;

  reduceRight(
    callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T,
    initialValue: Value<T>,
    opts?: IteratorOptions<T>
  ): ReadonlySignal<T>;

  reduceRight<U>(
    callbackFn: (previousValue: U, currentValue: T, currentIndex: number) => U,
    initialValue: Value<U>,
    opts?: IteratorOptions<T>
  ): ReadonlySignal<U>;

  slice(
    start?: Value<number>,
    end?: Value<number>,
    opts?: IteratorOptions<T>
  ): SignalIterator<T>;

  some(
    callbackFn: (element: T, index: number) => boolean,
    opts?: IteratorOptions<T>
  ): ReadonlySignal<boolean>;
}

export const enum Mutation {
    None =  0,
    Custom = 1,
    Pop = 2,
    Push = 3,
    Shift = 4,
    Reverse = 5,
    Sort = 6,
    Splice = 7,
    Unshift = 8,
    Assign = 9,
    TypeMask = 15,
    Insert = 16,
    Remove = 32,
    Reorder = 64
}

export type Change<T> = {
  type: number,
  index: number,
  deletes: number,
  inserts: number,
  params: T | T[] | null
};

export interface SignalArray<T = any>
  extends SignalIterator<T>,
    ReadonlySignal<ReadonlyArray<T>> {
  /**
   *
   * @param callbackFn
   */
  modify(callbackFn: (array: T[], change: Change<T>) => T[]): void;
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
