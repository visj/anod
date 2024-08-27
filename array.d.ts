import { Signal, SignalData, OptionsWithSource } from "./index";

type Reactive<T> = T | Signal<T> | (() => T);

type IteratorOptions = Partial<Pick<OptionsWithSource<never, never>, 'source' | 'unstable'>>;

export interface SignalIterator<T = any> extends Signal<ReadonlyArray<T>> {
  readonly length: () => number;

  at(index: Reactive<number>, opts?: IteratorOptions): Signal<T>;

  concat(items: T | T[] | Reactive<T> | Reactive<T[]>, opts?: IteratorOptions): SignalIterator<T>;

  every(callbackFn: (element: T, index: number) => boolean, opts?: IteratorOptions): Signal<boolean>;

  filter(callbackFn: (element: T, index: number) => boolean, opts?: IteratorOptions): SignalIterator<T>;

  find(
    callbackFn: (element: T, index: number) => boolean, opts?: IteratorOptions
  ): Signal<T | undefined>;

  findIndex(callbackFn: (element: T, index: number) => boolean, opts?: IteratorOptions): Signal<number>;

  findLast(
    callbackFn: (element: T, index: number) => boolean, opts?: IteratorOptions
  ): Signal<T | undefined>;

  findLastIndex(
    callbackFn: (element: T, index: number) => boolean, opts?: IteratorOptions
  ): Signal<number>;

  forEach(callbackFn: (element: T, index: number) => void, opts?: IteratorOptions): void;

  includes(searchElement: Reactive<T>, fromIndex?: Reactive<number>, opts?: IteratorOptions): Signal<boolean>;

  indexOf(searchElement: Reactive<T>, fromIndex?: Reactive<number>, opts?: IteratorOptions): Signal<number>;

  join(separator?: Reactive<string>, opts?: IteratorOptions): Signal<string>;

  lastIndexOf(searchElement: Reactive<T>, fromIndex?: Reactive<number>, opts?: IteratorOptions): Signal<number>;

  map<U>(
    callbackFn: (element: T, index: Signal<number>) => U, opts?: IteratorOptions
  ): SignalIterator<U>;

  reduce(
    callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T
  ): Signal<T>;

  reduce(
    callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T,
    initialValue: T,
    opts?: IteratorOptions
  ): Signal<T>;

  reduce<U>(
    callbackFn: (previousValue: U, currentValue: T, currentIndex: number) => U,
    initialValue: U,
    opts?: IteratorOptions
  ): Signal<U>;

  reduceRight(
    callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T,
  ): Signal<T>;

  reduceRight(
    callbackFn: (previousValue: T, currentValue: T, currentIndex: number) => T,
    initialValue: T,
    opts?: IteratorOptions
  ): Signal<T>;

  reduceRight<U>(
    callbackFn: (previousValue: U, currentValue: T, currentIndex: number) => U,
    initialValue: U,
    opts?: IteratorOptions
  ): Signal<U>;

  slice(start?: Reactive<number>, end?: Reactive<number>, opts?: IteratorOptions): SignalIterator<T>;

  some(callbackFn: (element: T, index: number) => boolean, opts?: IteratorOptions): Signal<boolean>;
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
