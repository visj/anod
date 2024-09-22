export interface Context {
  _idle: boolean,
  _owner: RootSignal | null,
  _listen: ReadonlySignal | null
}

export declare var CONTEXT: Context;

export interface RootSignal {

  /**
   *
   */
  dispose(): void;
}

export interface ReadonlySignal<T = any> extends RootSignal {
  /**
   *
   */
    peek(): T;
  /**
   *
   */
  val(): T;
}

export declare var Root: {
  new <T = any>(callback: () => T): RootSignal;
  readonly prototype: RootSignal;
};

export declare var Effect: {
  new <T = any>(
    fn: () => void,
    opts?: SignalOptions<T>
  ): RootSignal;
  readonly prototype: RootSignal;
};

export declare var Compute: {
  new <T = any, U = any>(
    fn: (prev: T, args: U) => T,
    opts?: SignalOptions<T>
  ): ReadonlySignal<T>;
  readonly prototype: ReadonlySignal;
};

export interface Signal<T = any> extends ReadonlySignal<T> {
  /**
   *
   * @param val
   */
  set(val: T): void;
}

export declare var Data: {
  new<T = any>(
    val: T,
    equality?: ((a: T, b: T) => boolean) | null
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
export declare function effect<T>(callback: () => T): RootSignal;
/**
 *
 * @param fn
 * @param seed
 */
export declare function effect<T>(
  fn: (prev: T) => T
): RootSignal;
/**
 *
 * @param fn
 * @param seed
 * @param opts
 */
export declare function effect(
  fn: () => void,
  opts: SignalOptions<void>,
): RootSignal;

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
