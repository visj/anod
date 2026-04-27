/**
 * Base for all disposable nodes.
 * @interface
 */
class Disposer {
	constructor() {
		/** @type {number} */
		this._flag = 0;
		/** @type {(function(): void) | Array<(function(): void)> | null} */
		this._cleanup = null;
	}
	/** @returns {void} */
	_dispose() { }
}

/**
 * Ownership boundary — Root and Effect.
 * @interface
 * @extends {Disposer}
 */
class Owner extends Disposer {
	constructor() {
		super();
		/** @type {Array<Receiver> | null} */
		this._owned = null;
		/** @type {number} */
		this._level = 0;
		/** @type {Owner | null} */
		this._owner = null;
		/** @type {(function(*): boolean) | Array<(function(*): boolean)> | null} */
		this._recover = null;
	}
}

/**
 * Value-producing node — Signal and Compute.
 * Includes properties accessed on Sender-typed params after flag guards.
 * @interface
 * @template T
 * @extends {Disposer}
 */
class Sender extends Disposer {
	constructor() {
		super();
		/** @type {T} */
		this._value = /** @type {T} */ (/** @type {*} */ (undefined));
		/** @type {number} */
		this._stamp = 0;
		/** @type {Receiver | null} */
		this._sub1 = null;
		/** @type {Array<Receiver> | null} */
		this._subs = null;
		/** @type {number} */
		this._tombstones = 0;
		/** @type {number} */
		this._mod = 0;
		/** @type {number} */
		this._ctime = 0;
		/** @type {(function(T, T): boolean) | null} */
		this._equal = null;
	}
	/** @returns {void} */
	_drop() { }
	/** @returns {void} */
	_purge() { }
	/**
	 * @param {T} value
	 * @returns {boolean}
	 */
	_changed(value) { return false; }
	/** @returns {void} */
	_refresh() { }
	/**
	 * @param {number} time
	 * @returns {void}
	 */
	_update(time) { }
}

/**
 * Value-consuming node — Compute and Effect.
 * Properties here exist on ALL receivers.
 * @interface
 * @extends {Disposer}
 */
class Receiver extends Disposer {
	constructor() {
		super();
		/** @type {Sender<*> | null} */
		this._dep1 = null;
		/** @type {Array<Sender<*>> | null} */
		this._deps = null;
		/** @type {number} */
		this._time = 0;
		/** @type {number} */
		this._stamp = 0;
		/** @type {Function | null} */
		this._fn = null;
		/** @type {* | null} */
		this._chan = null;
		/** @type {*} */
		this._args = undefined;
	}
	/**
	 * @param {number} time
	 * @returns {void}
	 */
	_update(time) { }
	/** @returns {void} */
	_receive() { }
	/**
	 * @param {Sender<*>} sender
	 * @param {number} stamp
	 * @returns {void}
	 */
	_read(sender, stamp) { }
	/**
	 * @param {Sender<*>} sender
	 * @param {boolean} safe
	 * @returns {*}
	 */
	_readAsync(sender, safe) { }
	/** @returns {*} */
	_channel() { }
	/**
	 * @param {*} value
	 * @returns {void}
	 */
	_settle(value) { }
	/**
	 * @param {*} err
	 * @returns {void}
	 */
	_error(err) { }
}

/**
 * Public read-only signal interface.
 * @interface
 * @template T
 */
class ReadonlySignal {
	/** @returns {T} */
	val() { return /** @type {T} */ (/** @type {*} */ (undefined)); }
	/** @returns {void} */
	dispose() { }
}

/**
 * Signal interface. Extends Sender with Cell-specific properties
 * (_time, _chan) and async settlement methods.
 * @interface
 * @template T
 * @extends {Sender<T>}
 */
class ISignal extends Sender {
	constructor() {
		super();
		/** @type {number} */
		this._time = 0;
		/** @type {* | null} */
		this._chan = null;
	}
	/**
	 * @param {*} value
	 * @returns {void}
	 */
	_settle(value) { }
	/**
	 * @param {*} err
	 * @returns {void}
	 */
	_error(err) { }
	/** @returns {*} */
	_channel() { }
	/**
	 * @param {T} value
	 * @returns {void}
	 */
	set(value) { }
}

/**
 * Compute interface — merges Sender and Receiver.
 * Extends Sender for value-producing side; manually declares
 * Receiver properties for value-consuming side (JS single inheritance).
 * @interface
 * @template T
 * @extends {Sender<T>}
 */
class ICompute extends Sender {
	constructor() {
		super();
		/* Receiver properties */
		/** @type {Sender<*> | null} */
		this._dep1 = null;
		/** @type {Array<Sender<*>> | null} */
		this._deps = null;
		/** @type {number} */
		this._time = 0;
		/** @type {Function | null} */
		this._fn = null;
		/** @type {* | null} */
		this._chan = null;
		/** @type {*} */
		this._args = undefined;
	}
	/* Receiver methods */
	/**
	 * @param {number} time
	 * @returns {void}
	 */
	_update(time) { }
	/** @returns {void} */
	_receive() { }
	/**
	 * @param {Sender<*>} sender
	 * @param {number} stamp
	 * @returns {void}
	 */
	_read(sender, stamp) { }
	/**
	 * @param {Sender<*>} sender
	 * @param {boolean} safe
	 * @returns {*}
	 */
	_readAsync(sender, safe) { }
	/** @returns {*} */
	_channel() { }
	/**
	 * @param {*} value
	 * @returns {void}
	 */
	_settle(value) { }
	/**
	 * @param {*} err
	 * @returns {void}
	 */
	_error(err) { }
	/* ICompute-specific */
	/** @returns {void} */
	_refresh() { }
	/**
	 * @param {Sender<*>} sender
	 * @returns {*}
	 */
	val(sender) { }
	/** @returns {boolean} */
	get error() { return false; }
	/** @returns {boolean} */
	get loading() { return false; }
}

/**
 * Effect interface — merges Owner and Receiver.
 * Extends Owner for ownership side; manually declares
 * Receiver properties for value-consuming side.
 * @interface
 * @extends {Owner}
 */
class IEffect extends Owner {
	constructor() {
		super();
		/* Receiver properties */
		/** @type {Sender<*> | null} */
		this._dep1 = null;
		/** @type {Array<Sender<*>> | null} */
		this._deps = null;
		/** @type {number} */
		this._time = 0;
		/** @type {number} */
		this._stamp = 0;
		/** @type {Function | null} */
		this._fn = null;
		/** @type {* | null} */
		this._chan = null;
		/** @type {*} */
		this._args = undefined;
		/* IEffect-specific */
		/** @type {(function(): void) | Array<(function(): void)> | null} */
		this._finalize = null;
	}
	/* Receiver methods */
	/**
	 * @param {number} time
	 * @returns {void}
	 */
	_update(time) { }
	/** @returns {void} */
	_receive() { }
	/**
	 * @param {Sender<*>} sender
	 * @param {number} stamp
	 * @returns {void}
	 */
	_read(sender, stamp) { }
	/**
	 * @param {Sender<*>} sender
	 * @param {boolean} safe
	 * @returns {*}
	 */
	_readAsync(sender, safe) { }
	/** @returns {*} */
	_channel() { }
	/**
	 * @param {*} value
	 * @returns {void}
	 */
	_settle(value) { }
	/**
	 * @param {*} err
	 * @returns {void}
	 */
	_error(err) { }
	/** @returns {void} */
	dispose() { }
	/** @returns {boolean} */
	get loading() { return false; }
}

export { Disposer, Owner, Sender, Receiver, ISignal, ICompute, IEffect };
