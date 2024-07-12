import {
    Reactive,
    Data,
    CONTEXT,
    Compute,
    State,
    Type,
    extend,
    inherit,
    type,
    VOID,
    start,
    stage,
    STAGE,
    Stage,
    reset,
    stable,
    CHANGES,
    DISPOSES,
    addReceiver,
    sendWillUpdate,
    cleanupReceiver
} from "./core.js";

/**
 * @template T
 * @param {Array<T>=} val 
 * @returns {SignalArray<T>}
 */
export function array(val) {
    return new DataArray(val || []);
}

/**
 * @struct
 * @constructor
 * @template T, U, V
 * @param {U} arg1 
 * @param {V} arg2 
 */
function Params(arg1, arg2) {
    /**
     * @package
     * @type {Array<T>}
     */
    this._val = null;
    /**
     * @const
     * @package
     * @type {U}
     */
    this._arg1 = arg1;
    /**
     * @const
     * @package
     * @type {number}
     */
    this._type1 = type(arg1);
    /**
     * @const
     * @package
     * @type {V}
     */
    this._arg2 = arg2;
    /**
     * @const
     * @type {number}
     */
    this._type2 = type(arg2);
    /**
     * @package
     * @type {boolean}
     */
    this._reactive =
        this._type1 === Type.Reactive ||
        this._type1 === Type.Function ||
        this._type2 === Type.Reactive ||
        this._type2 === Type.Function;
    /**
     * @package
     * @type {boolean}
     */
    this._record = this._reactive;
    /**
     * @package
     * @type {*}
     */
    this._state = void 0;
}

/**
 * @struct
 * @constructor
 * @template T, U, V
 * @param {function(T, Params<U, V>): T} fn
 * @param {T} value
 * @param {SignalOptions<T, U>=} opts
 * @extends {Compute<T, U>}
 */
function ComputeIterator(fn, value, opts) {
    Compute.call(this, fn, value, opts);
}

extend(ComputeIterator, Compute);

/**
 * @package
 * @param {Send} source
 * @returns {ComputeIterator<T>} 
 */
ComputeIterator.prototype._iterate = function (source) {
    var owner = CONTEXT._owner;
    var listen = CONTEXT._listen;
    if (owner !== null) {
        owner._addChild(this);
    }
    addReceiver(source, this);
    var args = this._args;
    CONTEXT._owner = CONTEXT._listen = null;
    args._val = this._source1.val();
    if (args._reactive) {
        CONTEXT._listen = this;
    }
    if (STAGE === Stage.Idle) {
        reset();
        stage(Stage.Started);
        try {
            this._value = this._next(this._value, args);
            if (CHANGES._count > 0 || DISPOSES._count > 0) {
                start();
            }
        } finally {
            stage(Stage.Idle);
        }
    } else {
        this._value = this._next(this._value, args);
        CONTEXT._owner = owner;
        CONTEXT._listen = listen;
    }
    return this;
};


/**
 * @package
 * @override
 * @param {number} time
 * @returns {void}
 */
ComputeIterator.prototype._update = function (time) {
    var owner = CONTEXT._owner;
    var listen = CONTEXT._listen;
    var args = this._args;
    var prev = this._value;
    CONTEXT._owner = CONTEXT._listen = null;
    args._val = this._source1.val();
    if (args._reactive) {
        if (this._state & State.Unstable) {
            cleanupReceiver(this);
            args._record = true;
        }
        if (args._record) {
            CONTEXT._listen = this;
        }
    }
    this._state |= State.Updating;
    this._value = this._next(prev, args);
    this._state &= ~(
        State.Updating |
        State.WillUpdate |
        State.MayUpdate |
        State.MayDispose |
        State.MayCleared
    );
    if (
        (this._state & (State.Unstable | State.ReceiveMany)) === 0 && 
        args._reactive && !args._record
    ) {
        args._reactive = false;
    }
    if (
        (this._state & (State.SendOne | State.SendMany)) &&
        prev !== this._value
    ) {
        sendWillUpdate(this, time);
    }
    CONTEXT._owner = owner;
    CONTEXT._listen = listen;
};

/**
 * @template T, U, V
 * @param {function(T, Params<T,U,V>): T} fn 
 * @param {ReactiveIterator<T>} source
 * @param {U=} arg1
 * @param {boolean=} dynamic
 * @param {V=} arg2
 * @param {T=} seed
 * @returns {Signal<T>}
 */
function computeIterator(fn, source, arg1, dynamic, arg2, seed) {
    return new ComputeIterator(fn, seed, { args: new Params(arg1, arg2), dyn: dynamic })._iterate(source);
}

/**
 * @const
 * @type {Object}
 */
var REF = {};

/**
 * @template T
 * @param {number} type 
 * @param {T | Signal<T> | (function(): T)} args 
 * @returns {T}
 */
function read(type, args) {
    switch (type) {
        case Type.Reactive:
            return /** @type {Signal<T>} */(args).val();
        case Type.Function:
            return /** @type {function(): T} */(args)();
    }
    return /** @type {T} */(args);
}

/**
 * @struct
 * @template T
 * @constructor
 * @extends {Reactive<Array<T>>}
 * @implements {SignalIterator<T>}
 */
function ReactiveIterator() { }

extend(ReactiveIterator, Reactive);

/**
 * 
 * @param {ReactiveIterator} source 
 * @returns {function(): number}
 */
function getLength(source) {
    return function () { return source.val().length; };
}

/**
 * @type {function(): number}
 */
ReactiveIterator.prototype.length;

/**
 * @template T, U
 * @param {T | undefined} prev 
 * @param {Params<T, U>} params 
 * @returns {T | undefined}
 */
function atIterator(prev, params) {
    params._record = false;
    return params._val[read(params._type1, params._arg1)];
}

/**
 * @param {number | Signal<number> | (function(): number)} index 
 * @param {boolean=} dynamic
 * @returns {Signal<T | undefined>}
 */
ReactiveIterator.prototype.at = function (index, dynamic) {
    return computeIterator(atIterator, this, index, dynamic);
};

/**
 * @param {...(T | Array<T> | SignalIterator<T>)} items
 * @returns {SignalIterator<T>} 
 */
ReactiveIterator.prototype.concat = function (items) { };

/**
 * @template T
 * @param {boolean} prev 
 * @param {Params<T, (function(T,number): boolean)>} params 
 * @returns {boolean}
 */
function everyIterator(prev, params) {
    var result = true;
    var current = params._val;
    var callback = params._arg1;
    var len = current.length;
    if (len > 0) {
        var i = 0;
        if (params._record) {
            result = callback(current[i], i++);
            params._record = false;
            CONTEXT._listen = null;
        }
        while (result && i < len) {
            result = callback(current[i], i++);
        }
    }
    return result;
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @param {boolean=} dynamic
 * @returns {Signal<boolean>}
 */
ReactiveIterator.prototype.every = function (callbackFn, dynamic) {
    return computeIterator(everyIterator, this, callbackFn, dynamic);
};

function filterIterator(prev, params) {

}

/**
 * @param {function(T,number): boolean} callbackFn
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.filter = function (callbackFn) { };

/**
 * @template T
 * @param {T | undefined} prev 
 * @param {Params<T, (function(T, number): boolean)>} params 
 * @returns {T | undefined}
 */
function findIterator(prev, params) {
    var i = 0;
    var found = false;
    var current = params._val;
    var callback = params._arg1;
    var len = current.length;
    if (len > 0) {
        if (params._record) {
            found = callback(current[i], i++);
            params._record = false;
            CONTEXT._listen = null;
        }
        while (!found && i < len) {
            found = callback(current[i], i++);
        }
    }
    return found ? current[i] : void 0;
}

/**
 * @param {function(T, number): boolean} callbackFn
 * @param {boolean=} dynamic
 * @returns {Signal<T | undefined>}
 */
ReactiveIterator.prototype.find = function (callbackFn, dynamic) {
    return computeIterator(findIterator, this, callbackFn, dynamic);
};

/**
 * @template T
 * @param {T | undefined} prev 
 * @param {Params<T, (function(T, number): boolean)>} source 
 * @returns {T | undefined}
 */
function findIndexIterator(prev, source) {
    return source._val.findIndex(source._arg1);
}

/**
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<number>}
 */
ReactiveIterator.prototype.findIndex = function (callbackFn) {
    return computeIterator(findIndexIterator, this, callbackFn);
};

/**
 * @template T
 * @param {T | undefined} prev 
 * @param {Params<T, (function(T, number): boolean)>} source 
 * @returns {T | undefined}
 */
function findLastIterator(prev, source) {
    return source._val.findLast(source._arg1);
}

/**
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<T | undefined>}
 */
ReactiveIterator.prototype.findLast = function (callbackFn) {
    return computeIterator(findLastIterator, this, callbackFn);
};

/**
 * @template T
 * @param {T | undefined} prev 
 * @param {Params<T, (function(T, number): boolean)>} source 
 * @returns {T | undefined}
 */
function findLastIndexIterator(prev, source) {
    return source._val.findLastIndex(source._arg1);
}

/**
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<number>}
 */
ReactiveIterator.prototype.findLastIndex = function (callbackFn) {
    return computeIterator(findLastIndexIterator, this, callbackFn);
};

/**
 * @template T
 * @param {void} prev 
 * @param {Params<T, (function(T, number): void)>} source 
 */
function forEachIterator(prev, source) {
    var callback = source._arg1;
    var current = source._val;
    for (var i = 0; i < current.length; i++) {
        source._arg1(current[i], i);
    }
}

/**
 * @param {function(T,number): void} callbackFn
 * @returns {void} 
 */
ReactiveIterator.prototype.forEach = function (callbackFn) {
    computeIterator(forEachIterator, this, callbackFn);
};

/**
 * @param {boolean} prev 
 * @param {Params} source 
 * @returns {boolean}
 */
function includesIterator(prev, source) {
    return source._val.includes(read(source._type1, source._arg2));
}

/**
 * @param {T | Signal<T> | (function(): T)} searchElement
 * @returns {Signal<boolean>}
 */
ReactiveIterator.prototype.includes = function (searchElement) {
    return computeIterator(includesIterator, this, searchElement);
};

/**
 * @param {number} prev 
 * @param {Params} source 
 * @returns {number}
 */
function indexOfIterator(prev, source) {
    return source._val.indexOf(
        read(source._type1, source._arg1),
        read(source._type2, source._arg2)
    );
}

/**
 * @param {T | Signal<T> | (function(): T)} searchElement 
 * @param {number | Signal<number> | (function(): number)=} fromIndex
 * @param {boolean=} dynamic
 * @returns {Signal<number>}
 */
ReactiveIterator.prototype.indexOf = function (searchElement, fromIndex, dynamic) {
    return computeIterator(indexOfIterator, this, searchElement, dynamic, fromIndex);
};

/**
 * @param {string} prev 
 * @param {Params} source
 * @returns {string}
 */
function joinIterator(prev, source) {
    return source._val.join(read(source._type1, source._arg1));
}

/**
 * @param {string | Signal<string> | (function(): string)=} separator
 * @returns {Signal<string>}
 */
ReactiveIterator.prototype.join = function (separator) {
    return computeIterator(joinIterator, this, separator);
};

/**
 * @param {number} prev 
 * @param {Params} source 
 * @returns {number}
 */
function lastIndexOfIterator(prev, source) {
    return source._val.lastIndexOf(
        read(source._type1, source._arg1),
        read(source._type2, source._arg2)
    );
}

/**
 * @param {T | Signal<T> | (function(): T)} searchElement 
 * @param {number | Signal<number> | (function(): number)=} fromIndex
 * @param {boolean=} dynamic
 * @returns {Signal<number>}
 */
ReactiveIterator.prototype.lastIndexOf = function (searchElement, fromIndex, dynamic) {
    return computeIterator(lastIndexOfIterator, this, searchElement, dynamic, fromIndex);
};

/**
 * @template U
 * @param {function(T,Signal<number>): U} callbackFn
 * @returns {SignalIterator<U>}
 */
ReactiveIterator.prototype.map = function (callbackFn) { };

/**
 * @template T
 * @param {T} prev 
 * @param {Params} source
 * @returns {T}
 */
function reduceIterator(prev, source) {
    return source._val.reduce(
        read(source._type1, source._arg1),
        read(source._type2, source._arg2)
    );
}

/**
 * @template U, V
 * @param {function((T | U),T,number): V} callbackFn 
 * @param {U | Signal<U> | (function(): U)=} initialValue 
 * @returns {Signal<V>}
 */
ReactiveIterator.prototype.reduce = function (callbackFn, initialValue) {
    return computeIterator(reduceIterator, this, callbackFn, initialValue);
};

/**
 * @template T
 * @param {T} prev 
 * @param {Params} source
 * @returns {T}
 */
function reduceRightIterator(prev, source) {
    return source._val.reduceRight(
        read(source._type1, source._arg1),
        read(source._type2, source._arg2)
    );
}

/**
 * @template U
 * @param {function((T|U),T,number): U} callbackFn
 * @param {Signal<U>|U=} initialValue 
 * @returns {Signal<U>}
 */
ReactiveIterator.prototype.reduceRight = function (callbackFn, initialValue) {
    return computeIterator(reduceRightIterator, this, callbackFn, initialValue);
};

/**
 * @param {number | Signal<number> | (function(): number)=} start
 * @param {number | Signal<number> | (function(): number)=} end
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.slice = function (start, end) {

};

/**
 * @template T
 * @param {boolean} prev 
 * @param {Params<T, (function(T, number): boolean)>} source
 * @returns {boolean}
 */
function someIterator(prev, source) {
    return source._val.some(read(source._type1, source._arg1));
}

/**
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<boolean>} 
 */
ReactiveIterator.prototype.some = function (callbackFn) {
    return computeIterator(someIterator, this, callbackFn);
};

/**
 * @struct
 * @template T
 * @constructor
 * @extends {ReactiveIterator<T>}
 * @implements {ComputeArrayInterface<T>}
 */
export function ComputeArray() {
    // Compute.call(/** @type {?} */(this));
    /**
     * @public
     * @type {function(): number}
     */
    this.length = getLength(this);
}

extend(ComputeArray, ReactiveIterator);
inherit(ComputeArray, Compute);

/**
 * @struct
 * @template T
 * @constructor
 * @param {Array<T>} val
 * @extends {ReactiveIterator<T>}
 * @implements {DataArrayInterface<T>}
 */
export function DataArray(val) {
    Data.call(/** @type {?} */(this), val);
    /**
     * @public
     * @type {function(): number}
     */
    this.length = getLength(this);
    /**
     * @package
     * @type {number}
     */
    this._mutation = -1;
}

extend(DataArray, ReactiveIterator);
inherit(DataArray, Data);

/**
 * @public
 * @override
 * @param {Array<T>} val 
 * @returns {void}
 */
DataArray.prototype.update = function (val) {
    this._mutate(1, val);
};

/**
 * @package
 * @param {number} mutation 
 * @param {*=} param 
 * @returns {void}
 */
DataArray.prototype._mutate = function (mutation, param) {
    this._mutation = mutation;
    // this._next = param !== void 0 ? param : REF;
};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.pop = function () { };

/**
 * @public
 * @param {...T} elementN
 * @returns {void}
 */
DataArray.prototype.push = function (elementN) { };

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.shift = function () { };

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.reverse = function () { };

/**
 * @public
 * @param {function(T,T): number=} compareFn
 * @returns {void}
 */
DataArray.prototype.sort = function (compareFn) { };

/**
 * @public
 * @param {number} start 
 * @param {number=} deleteCount 
 * @param {...T} items
 * @returns {void}
 */
DataArray.prototype.splice = function (start, deleteCount, items) { };

/**
 * @public
 * @param {...T} elementN
 * @returns {void}
 */
DataArray.prototype.unshift = function (elementN) { };