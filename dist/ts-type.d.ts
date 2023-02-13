declare var _toString: () => string;
declare const enum JsType {
    Null = 0,
    Undefined = 1,
    Boolean = 2,
    Number = 3,
    String = 4,
    Object = 5,
    Function = 6,
    Array = 7,
    Date = 8,
    RegExp = 9,
    Error = 10,
    Arguments = 11,
    NaN = 12,
    Infinity = 13,
    Map = 14,
    Set = 15,
    WeakMap = 16,
    WeakSet = 17,
    Symbol = 18,
    BigInt = 19,
    StringTag = 20
}
declare function getType(value: any): JsType;
