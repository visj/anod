export interface Signal<T = any> {
  /**
   *
   */
  val(): T;
  /**
   *
   */
  peek(): T;
  /**
   *
   */
  dispose(): void;
}

export interface SignalValue<T = any> extends Signal<T> {
  /**
   *
   * @param val
   */
  update(val: T): void;
}

export interface SignalOptions<T, U> {
  args?: U;
  unstable?: boolean;
  compare?: ((a: T, b: T) => boolean) | null;
}
/**
 *
 * @param fn
 */
export declare function root<T>(fn: (dispose: () => void) => T): T;
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
/**
 *
 * @param val
 */
export declare function data<T>(val: T): SignalValue<T>;
/**
 *
 * @param val
 * @param equality
 */
export declare function value<T>(
  val: T,
  equality?: ((a: T, b: T) => boolean) | null,
): SignalValue<T>;
/**
 *
 * @param callback
 */
export declare function compute<T>(callback: () => T): Signal<T>;
/**
 *
 * @param callback
 * @param seed
 */
export declare function compute<T>(
  callback: (prev: T) => T,
  seed: T,
): Signal<T>;
/**
 *
 * @param callback
 * @param seed
 * @param opts
 */
export declare function compute<T, U>(
  callback: (prev: T, args: U) => T,
  seed: T,
  opts: SignalOptions<T, U>,
): Signal<T>;
