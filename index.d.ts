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

export declare var Compute: {
  new <T = any, U = any>(
    callback: (prev: T, args: U) => T,
    seed: T,
    opts: SignalOptions<T, U>
  ): Signal<T>;
  readonly prototype: Signal;
};

export interface SignalData<T = any> extends Signal<T> {
  /**
   *
   * @param val
   */
  update(val: T): void;
}

export declare var Data: {
  new<T = any>(
    val: T,
    equality?: ((a: T, b: T) => boolean) | null
  ): SignalData<T>;
  readonly prototype: SignalData;
};

export interface OptionsBase<T, U> {
  args?: U;
  lazy?: boolean;
  unstable?: boolean;
  compare?: ((a: T, b: T) => boolean) | null;
}

export interface Options<T, U> extends OptionsBase<T, U> {
  defer?: boolean;
  sample?: boolean;
  source: Signal | Array<Signal> | (() => void);
}

export type SignalOptions<T, U> = OptionsBase<T, U> | Options<T, U>;

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
export declare function data<T>(val: T): SignalData<T>;
/**
 *
 * @param val
 * @param equality
 */
export declare function value<T>(
  val: T,
  equality?: ((a: T, b: T) => boolean) | null,
): SignalData<T>;
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
