export interface DisposableSignal {

  /**
   *
   */
  dispose(): void;
}

export interface ReadonlySignal<T = any> extends DisposableSignal {
  /**
   *
   */
  peek(): T;
  /**
   *
   */
  val(): T;
}

export interface Signal<T = any> extends ReadonlySignal<T> {
  /**
   *
   * @param val
   */
  set(val: T): void;
}

export declare var Root: {
  new <T = any>(callback: () => T): DisposableSignal;
  readonly prototype: DisposableSignal;
};

export declare var Effect: {
  new <T = any>(
    fn: () => void,
    opts?: SignalOptions<T>
  ): DisposableSignal;
  readonly prototype: DisposableSignal;
};

export declare var Compute: {
  new <T = any, U = any>(
    fn: (prev: T, args: U) => T,
    opts?: SignalOptions<T>
  ): ReadonlySignal<T>;
  readonly prototype: ReadonlySignal;
};

export declare var Data: {
  new <T = any>(
    val: T,
    eq?: ((a: T, b: T) => boolean) | null
  ): Signal<T>;
  readonly prototype: Signal;
};

export interface SignalOptions<T> {
  unstable?: boolean;
}

/**
 *
 * @param fn
 */
export declare function root<T>(fn: () => T): ReadonlySignal<T>;
/**
 *
 * @param val
 */
export declare function data<T>(val: T): Signal<T>;
/**
 *
 * @param val
 * @param eq
 */
export declare function value<T>(
  val: T,
  eq?: ((a: T, b: T) => boolean) | null,
): Signal<T>;
/**
 *
 * @param callback
 */
export declare function compute<T>(callback: () => T): ReadonlySignal<T>;
/**
 *
 * @param fn
 * @param seed
 */
export declare function compute<T>(
  fn: (prev: T) => T,
  seed: T,
): ReadonlySignal<T>;
/**
 *
 * @param fn
 * @param seed
 * @param opts
 */
export declare function compute<T, U>(
  fn: () => T,
  opts: SignalOptions<T>,
): ReadonlySignal<T>;

/**
 *
 * @param callback
 */
export declare function effect<T>(callback: () => T): DisposableSignal;
/**
 *
 * @param fn
 * @param seed
 */
export declare function effect<T>(
  fn: (prev: T) => T
): DisposableSignal;
/**
 *
 * @param fn
 * @param seed
 * @param opts
 */
export declare function effect(
  fn: () => void,
  opts: SignalOptions<void>,
): DisposableSignal;

/**
 *
 * @param fn
 */
export declare function batch(fn: () => void): void;
/**
 *
 * @param fn
 */
export declare function sample<T>(fn: () => T): T;
/**
 *
 * @param fn
 */
export declare function cleanup(fn: (final: boolean) => void): void;

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
