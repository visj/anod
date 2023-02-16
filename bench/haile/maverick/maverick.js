var maverick = (function () {
  // src/symbols.ts
  var SCOPE = Symbol(0);

  // src/core.ts
  var scheduledEffects = false;
  var runningEffects = false;
  var currentScope = null;
  var currentObserver = null;
  var currentObservers = null;
  var currentObserversIndex = 0;
  var effects = [];
  var NOOP = () => {
  };
  var HANDLERS = Symbol(0);
  var STATE_CLEAN = 0;
  var STATE_CHECK = 1;
  var STATE_DIRTY = 2;
  var STATE_DISPOSED = 3;
  function flushEffects() {
    scheduledEffects = true;
    queueMicrotask(runEffects);
  }
  function runEffects() {
    if (!effects.length) {
      scheduledEffects = false;
      return;
    }
    runningEffects = true;
    for (let i = 0; i < effects.length; i++) {
      if (!isZombie(effects[i]))
        read.call(effects[i]);
    }
    effects = [];
    scheduledEffects = false;
    runningEffects = false;
  }
  function root(init) {
    const scope = createScope();
    return compute(scope, !init.length ? init : init.bind(null, dispose.bind(scope)), null);
  }
  function peek(compute2) {
    const prev = currentObserver;
    currentObserver = null;
    const result = compute2();
    currentObserver = prev;
    return result;
  }
  function untrack(compute2) {
    const prev = currentScope;
    currentScope = null;
    const result = peek(compute2);
    currentScope = prev;
    return result;
  }
  function tick() {
    if (!runningEffects)
      runEffects();
  }
  function getScope() {
    return currentScope;
  }
  function scoped(run, scope) {
    try {
      return compute(scope, run, null);
    } catch (error) {
      handleError(scope, error);
      return;
    }
  }
  function getContext(key, scope = currentScope) {
    return lookup(scope, key);
  }
  function setContext(key, value, scope = currentScope) {
    if (scope)
      (scope.k ??= {})[key] = value;
  }
  function onError(handler) {
    if (!currentScope)
      return;
    const context = currentScope.k ??= {};
    if (!context[HANDLERS])
      context[HANDLERS] = [handler];
    else
      context[HANDLERS].push(handler);
  }
  function onDispose(disposable) {
    if (!disposable || !currentScope)
      return disposable || NOOP;
    const node = currentScope;
    if (!node.a) {
      node.a = disposable;
    } else if (Array.isArray(node.a)) {
      node.a.push(disposable);
    } else {
      node.a = [node.a, disposable];
    }
    return function removeDispose() {
      if (node.f === STATE_DISPOSED)
        return;
      disposable.call(null);
      if (isFunction(node.a)) {
        node.a = null;
      } else if (Array.isArray(node.a)) {
        node.a.splice(node.a.indexOf(disposable), 1);
      }
    };
  }
  var scopes = [];
  function dispose(self = true) {
    if (this.f === STATE_DISPOSED)
      return;
    let current = self ? this : this.i, head = self ? this.l : this;
    if (current) {
      scopes.push(this);
      do {
        current.f = STATE_DISPOSED;
        if (current.a)
          emptyDisposal(current);
        if (current.b)
          removeSourceObservers(current, 0);
        if (current.l)
          current.l.i = null;
        current[SCOPE] = null;
        current.b = null;
        current.d = null;
        current.l = null;
        current.k = null;
        scopes.push(current);
        current = current.i;
      } while (current && scopes.includes(current[SCOPE]));
    }
    if (head)
      head.i = current;
    if (current)
      current.l = head;
    scopes = [];
  }
  function emptyDisposal(scope) {
    try {
      if (Array.isArray(scope.a)) {
        for (let i = 0; i < scope.a.length; i++) {
          const callable = scope.a[i];
          callable.call(callable);
        }
      } else {
        scope.a.call(scope.a);
      }
      scope.a = null;
    } catch (error) {
      handleError(scope, error);
    }
  }
  function compute(scope, compute2, observer) {
    const prevScope = currentScope, prevObserver = currentObserver;
    currentScope = scope;
    currentObserver = observer;
    try {
      return compute2.call(scope);
    } finally {
      currentScope = prevScope;
      currentObserver = prevObserver;
    }
  }
  function lookup(scope, key) {
    if (!scope)
      return;
    let current = scope, value;
    while (current) {
      value = current.k?.[key];
      if (value !== void 0)
        return value;
      current = current[SCOPE];
    }
  }
  function handleError(scope, error, depth) {
    const handlers = lookup(scope, HANDLERS);
    if (!handlers)
      throw error;
    try {
      const coercedError = error instanceof Error ? error : Error(JSON.stringify(error));
      for (const handler of handlers)
        handler(coercedError);
    } catch (error2) {
      handleError(scope[SCOPE], error2);
    }
  }
  function read() {
    if (this.f === STATE_DISPOSED)
      return this.j;
    if (currentObserver) {
      if (!currentObservers && currentObserver.b && currentObserver.b[currentObserversIndex] == this) {
        currentObserversIndex++;
      } else if (!currentObservers)
        currentObservers = [this];
      else
        currentObservers.push(this);
    }
    if (this.o)
      shouldUpdate(this);
    return this.j;
  }
  function write(newValue) {
    const value = isFunction(newValue) ? newValue(this.j) : newValue;
    if (this.p(this.j, value)) {
      this.j = value;
      if (this.d) {
        for (let i = 0; i < this.d.length; i++) {
          notify(this.d[i], STATE_DIRTY);
        }
      }
    }
    return this.j;
  }
  var ScopeNode = function Scope() {
    this[SCOPE] = null;
    this.i = null;
    this.l = null;
    if (currentScope)
      currentScope.append(this);
  };
  var ScopeProto = ScopeNode.prototype;
  ScopeProto.k = null;
  ScopeProto.o = null;
  ScopeProto.a = null;
  ScopeProto.append = function appendScope(scope) {
    scope[SCOPE] = this;
    scope.l = this;
    if (this.i)
      this.i.l = scope;
    scope.i = this.i;
    this.i = scope;
  };
  function createScope() {
    return new ScopeNode();
  }
  var ComputeNode = function Computation(initialValue, compute2, options) {
    ScopeNode.call(this);
    this.f = compute2 ? STATE_DIRTY : STATE_CLEAN;
    this.t = false;
    this.q = false;
    this.b = null;
    this.d = null;
    this.j = initialValue;
    if (compute2)
      this.o = compute2;
    if (options && options.dirty)
      this.p = options.dirty;
  };
  var ComputeProto = ComputeNode.prototype;
  Object.setPrototypeOf(ComputeProto, ScopeProto);
  ComputeProto.p = isNotEqual;
  ComputeProto.call = read;
  function createComputation(initialValue, compute2, options) {
    return new ComputeNode(initialValue, compute2, options);
  }
  function isNotEqual(a, b) {
    return a !== b;
  }
  function isFunction(value) {
    return typeof value === "function";
  }
  function isZombie(node) {
    let scope = node[SCOPE];
    while (scope) {
      if (scope.o && scope.f === STATE_DIRTY)
        return true;
      scope = scope[SCOPE];
    }
    return false;
  }
  function shouldUpdate(node) {
    if (node.f === STATE_CHECK) {
      for (let i = 0; i < node.b.length; i++) {
        shouldUpdate(node.b[i]);
        if (node.f === STATE_DIRTY) {
          break;
        }
      }
    }
    if (node.f === STATE_DIRTY)
      update(node);
    else
      node.f = STATE_CLEAN;
  }
  function cleanup(node) {
    if (node.i && node.i[SCOPE] === node)
      dispose.call(node, false);
    if (node.a)
      emptyDisposal(node);
    if (node.k && node.k[HANDLERS])
      node.k[HANDLERS] = [];
  }
  function update(node) {
    let prevObservers = currentObservers, prevObserversIndex = currentObserversIndex;
    currentObservers = null;
    currentObserversIndex = 0;
    try {
      cleanup(node);
      const result = compute(node, node.o, node);
      if (currentObservers) {
        if (node.b)
          removeSourceObservers(node, currentObserversIndex);
        if (node.b && currentObserversIndex > 0) {
          node.b.length = currentObserversIndex + currentObservers.length;
          for (let i = 0; i < currentObservers.length; i++) {
            node.b[currentObserversIndex + i] = currentObservers[i];
          }
        } else {
          node.b = currentObservers;
        }
        let source;
        for (let i = currentObserversIndex; i < node.b.length; i++) {
          source = node.b[i];
          if (!source.d)
            source.d = [node];
          else
            source.d.push(node);
        }
      } else if (node.b && currentObserversIndex < node.b.length) {
        removeSourceObservers(node, currentObserversIndex);
        node.b.length = currentObserversIndex;
      }
      if (!node.q && node.t) {
        write.call(node, result);
      } else {
        node.j = result;
        node.t = true;
      }
    } catch (error) {
      handleError(node, error);
      if (node.f === STATE_DIRTY) {
        cleanup(node);
        if (node.b)
          removeSourceObservers(node, 0);
      }
      return;
    }
    currentObservers = prevObservers;
    currentObserversIndex = prevObserversIndex;
    node.f = STATE_CLEAN;
  }
  function notify(node, state) {
    if (node.f >= state)
      return;
    if (node.q && node.f === STATE_CLEAN) {
      effects.push(node);
      if (!scheduledEffects)
        flushEffects();
    }
    node.f = state;
    if (node.d) {
      for (let i = 0; i < node.d.length; i++) {
        notify(node.d[i], STATE_CHECK);
      }
    }
  }
  function removeSourceObservers(node, index) {
    let source, swap;
    for (let i = index; i < node.b.length; i++) {
      source = node.b[i];
      if (source.d) {
        swap = source.d.indexOf(node);
        source.d[swap] = source.d[source.d.length - 1];
        source.d.pop();
      }
    }
  }

  // src/signals.ts
  function signal(initialValue, options) {
    const node = createComputation(initialValue, null, options), signal2 = read.bind(node);
    signal2.set = write.bind(node);
    return signal2;
  }
  function isReadSignal(fn) {
    return isFunction(fn);
  }
  function computed(compute2, options) {
    return read.bind(
      createComputation(
        options?.initial,
        compute2,
        options
      )
    );
  }
  function effect(effect2, options) {
    const signal2 = createComputation(
      null,
      function runEffect() {
        let effectResult = effect2();
        isFunction(effectResult) && onDispose(effectResult);
        return null;
      },
      void 0
    );
    signal2.q = true;
    read.call(signal2);
    return dispose.bind(signal2, true);
  }
  function readonly(signal2) {
    return () => signal2();
  }
  function isWriteSignal(fn) {
    return isReadSignal(fn) && "set" in fn;
  }

  return { SCOPE, compute, computed, createComputation, createScope, dispose, effect, getContext, getScope, isFunction, isNotEqual, isReadSignal, isWriteSignal, onDispose, onError, peek, read, readonly, root, scoped, setContext, signal, tick, untrack, write };
})();