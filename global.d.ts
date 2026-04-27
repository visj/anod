/**
 * Shims for Special Types in the Closure Type System.
 * These follow the exact structural definitions used by the Closure Compiler.
 */
declare global {
  /**
   * IObject describes the "[]" operator (computed property accessor).
   * It restricts the key and value types for map-like objects.
   * @template KEY, VALUE
   */
  type IObject<KEY extends string | number, VALUE> = {
    [key in KEY]: VALUE;
  }

  /**
   * IArrayLike extends IObject such that the key is always a number.
   * It includes a length property, improving upon simple {length: number} types.
   * @template VALUE
   */
  interface IArrayLike<VALUE> extends IObject<number, VALUE> {
    length: number;
  }

  /**
   * IThenable describes Promise-like objects.
   * It allows the result type to be known and handles Promise unwrapping.
   * @template T
   */
  interface IThenable<T> {
    /**
     * @param {function(T): (RESULT|IThenable<RESULT>)=} onFulfilled
     * @param {function(*): (RESULT|IThenable<RESULT>)=} onRejected
     * @template RESULT
     */
    then<RESULT>(
      onFulfilled?: ((value: T) => RESULT | IThenable<RESULT>) | null,
      onRejected?: ((reason: any) => RESULT | IThenable<RESULT>) | null
    ): IThenable<RESULT>;
  }
}

// Essential for global augmentation in a TypeScript environment
export {};
