var _toString = Object.prototype.toString;

const enum JsType {
    Null,
    Undefined,
    Boolean,
    Number,
    String,
    Object,
    Function,
    Array,
    Date,
    RegExp,
    Error,
    Arguments,
    NaN,
    Infinity,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Symbol,
    BigInt,
    StringTag,
}

function getType(value: any): JsType {
    switch (typeof value) {
        case "undefined":
            return JsType.Undefined;
        case "number":
            return isNaN(value) ? JsType.NaN : isFinite(value) ? JsType.Number : JsType.Infinity;
        case "string":
            return JsType.String;
        case "boolean":
            return JsType.Boolean;
        case "function":
            return JsType.Function;
        case "object":
            if (value === null) {
                return JsType.Null;
            }
            switch (_toString.call(value).slice(8, -1)) {
                case "Array":
                    return JsType.Array;
                case "Object":
                    return JsType.Object;
                case "Date":
                    return JsType.Date;
                case "RegExp":
                    return JsType.RegExp;
                case "Error":
                    return JsType.Error;
                case "Arguments":
                    return JsType.Arguments;
                case "Map":
                    return JsType.Map;
                case "Set":
                    return JsType.Set;
                case "WeakMap":
                    return JsType.WeakMap;
                case "WeakSet":
                    return JsType.WeakSet;
                default:
                    return JsType.StringTag;
            }
        case "symbol":
            return JsType.Symbol;
        case "bigint":
            return JsType.BigInt;
    }
}
