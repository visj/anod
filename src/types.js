/**
 * Base for all disposable nodes.
 * @interface
 */
class Disposer {
	constructor() {
		/** @type {number} */
		this._flag;
	}
	/** @returns {void} */
	_dispose() { }
}

/**
 * @interface
 * @template T
 * @extends {Disposer}
 */
class AsyncDisposer {
	constructor() {
		/**
		 * @type {number}
		 */
		this._time;
	}
	/**
	 * @param {T} value
	 * @returns {void}
	 */
	_settle(value) { }
	/**
	 * @param {?} err
	 * @returns {void}
	 */
	_error(err) { }
}

/**
 * @interface
 */
class Resolver {
	constructor() {
		/** @type {Array<AsyncReceiver | Function> | null} */
		this._waiters = null;
	}
}

/**
 * Async coordination context for task/spawn nodes.
 * @interface
 * @extends {Resolver}
 */
class IChannel extends Resolver {
	constructor() {
		super();
		/** @type {AsyncSender<*> | null} */
		this._res1 = null;
		/** @type {Array<AsyncSender<*> | null> | null} */
		this._responds = null;
		/** @type {AbortController | null} */
		this._controller = null;
		/** @type {Sender<*> | null} */
		this._defer1 = null;
		/** @type {*} */
		this._defer1val = null;
		/** @type {Array<Sender<*> | *> | null} */
		this._defers = null;
	}
}

/**
 * @interface
 */
class Factory {
	constructor() {
		/** @type {number} */
		this._flag;
		/** @type {number} */
		this._level;
		/** @type {Owner | null} */
		this._owner;
	}
}

/**
 * Ownership boundary — Root and Effect.
 * @interface
 * @extends {Disposer}
 * @extends {Factory}
 */
class Owner extends Disposer {
	constructor() {
		super();
		/** @type {(function(): void) | Array<(function(): void)> | null} */
		this._cleanup = null;
		/** @type {Array<Receiver> | null} */
		this._owned = null;
		/** @type {(function(*): boolean) | Array<(function(*): boolean)> | null} */
		this._recover = null;
	}
}

/**
 * Value-producing node — Signal and Compute.
 * @interface
 * @template T
 * @extends {Disposer}
 */
class Sender extends Disposer {
	constructor() {
		super();
		/** @type {T} */
		this._value;
		/** @type {number} */
		this._stamp;
		/** @type {Receiver | null} */
		this._sub1;
		/** @type {Array<Receiver> | null} */
		this._subs;
		/** @type {number} */
		this._tombstones;
		/** @type {number} */
		this._ctime;
		/** @type {number} */
		this._time;
		/** @type {(function(T, T): boolean) | null | undefined} */
		this._equal;
	}
	/** @returns {void} */
	_drop() { }
	/** @returns {void} */
	_purge() { }
	/**
	 * @param {T} value
	 * @returns {boolean}
	 */
	_changed(value) { }

	/** @returns {void} */
	_refresh() { }
	/**
	 * @param {number} time
	 * @returns {void}
	 */
	_update(time) { }
}

/**
 * Async-capable sender — Cell (resource) and async Compute (task).
 * Adds channel, settlement, and error handling on top of Sender.
 * @interface
 * @template T
 * @extends {Sender<T>}
 * @extends {AsyncDisposer}
 */
class AsyncSender extends Sender {
	constructor() {
		super();
		/** @type {Resolver | IChannel | null} */
		this._chan;
	}
	/** @returns {Resolver | IChannel} */
	_channel() { }
}

/**
 * Value-consuming node — Compute and Effect.
 * @interface
 * @extends {Disposer}
 */
class Receiver extends Disposer {
	constructor() {
		super();
		/** @type {Sender<*> | null} */
		this._dep1;
		/** @type {Array<Sender<*>> | null} */
		this._deps;
		/** @type {number} */
		this._time;
		/** @type {number} */
		this._stamp;
		/** @type {Function | null} */
		this._fn;
		/** @type {*} */
		this._args;
		/** @type {(function(): void) | Array<(function(): void)> | null} */
		this._cleanup;
	}
	/**
	 * @template T
	 * @param {Sender<T>} sender 
	 * @returns {T}
	 */
	val(sender) { }
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
}

/**
 * Async-capable receiver — async Compute (task) and async Effect (spawn).
 * Adds channel, settlement, and error handling on top of Receiver.
 * @interface
 * @extends {Receiver}
 * @extends {AsyncDisposer}
 */
class AsyncReceiver extends Receiver {
	constructor() {
		super();
		/** @type {IChannel | null} */
		this._chan = null;
	}
	/** @returns {IChannel} */
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
 * Compute interface — merges Sender and Receiver.
 * @interface
 * @template T
 * @extends {AsyncReceiver}
 * @extends {AsyncSender<T>}
 * @extends {AsyncDisposer<T>}
 */
class ICompute extends Sender {
	constructor() {
		super();
		/* Receiver properties */
		/** @type {Sender<*> | null} */
		this._dep1 = null;
		/** @type {Array<Sender<*>> | null} */
		this._deps = null;
		/** @type {Function | null} */
		this._fn = null;
		/** @type {IChannel | null} */
		this._chan = null;
		/** @type {*} */
		this._args = undefined;
		/** @type {(function(): void) | Array<(function(): void)> | null} */
		this._cleanup = null;
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
	/** @returns {IChannel} */
	_channel() { }
	/* ICompute-specific */
	/** @returns {void} */
	_refresh() { }
	/**
	 * @param {Sender<*>} sender
	 * @returns {*}
	 */
	val(sender) { }
}

/**
 * Effect interface — merges Owner and Receiver.
 * @interface
 * @extends {Owner}
 * @extends {AsyncReceiver}
 * @extends {AsyncDisposer<void>}
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
		/** @type {IChannel | null} */
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
	/** @returns {IChannel} */
	_channel() { }
	/** @returns {void} */
	dispose() { }
}

export {
	Disposer, Owner,
	AsyncDisposer, Factory,
	Sender, AsyncSender,
	Receiver, AsyncReceiver,
	IChannel, Resolver,
	ICompute, IEffect
};
