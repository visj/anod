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
  stable?: boolean;
}

/**
 *
 * @param fn
 */
export declare function root<T>(fn: () => T): DisposableSignal;
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
  eq?: ((a: T, b: T) => boolean) | null
): Signal<T>;
/**
 *
 * @param fn
 */
export declare function compute<T>(fn: () => T): ReadonlySignal<T>;

/**
 *
 * @param fn
 * @param opts
 */
export declare function compute<T>(
  fn: () => T,
  opts: SignalOptions<T>,
): ReadonlySignal<T>;

/**
 *
 * @param fn
 */
export declare function effect<T>(fn: () => T): DisposableSignal;
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
