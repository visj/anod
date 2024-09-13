export interface RootSignal<T = any> {
  /**
   *
   */
  peek(): T;
  /**
   *
   */
  dispose(): void;
}

export interface ReadonlySignal<T = any> extends RootSignal<T> {
  /**
   *
   */
  val(): T;
}

export declare var Root: {
  new <T = any>(callback: () => T): RootSignal<T>;
  readonly prototype: RootSignal;
};

export declare var Compute: {
  new <T = any, U = any>(
    callback: (prev: T, args: U) => T,
    seed: T,
    opts: SignalOptions<T, U>
  ): ReadonlySignal<T>;
  readonly prototype: ReadonlySignal;
};

export interface Signal<T = any> extends ReadonlySignal<T> {
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
  ): Signal<T>;
  readonly prototype: Signal;
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
  source: ReadonlySignal | Array<ReadonlySignal> | (() => void);
}

export type SignalOptions<T, U> = OptionsBase<T, U> | Options<T, U>;

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
 * @param equality
 */
export declare function value<T>(
  val: T,
  equality?: ((a: T, b: T) => boolean) | null,
): Signal<T>;
/**
 *
 * @param callback
 */
export declare function compute<T>(callback: () => T): ReadonlySignal<T>;
/**
 *
 * @param callback
 * @param seed
 */
export declare function compute<T>(
  callback: (prev: T) => T,
  seed: T,
): ReadonlySignal<T>;
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
): ReadonlySignal<T>;

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
