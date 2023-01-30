var Zorn = (function () {
    'use strict';

    var S = function S2(fn, value2) {
      var node = new Computation(fn, value2);
      return function computation() {
        return node.get();
      };
    };
    Object.defineProperty(S, "default", { value: S });
    S.root = function root(fn) {
      var owner = Owner, root2 = fn.length === 0 ? Orphan : new Root(), result = void 0, disposer = fn.length === 0 ? null : function _dispose() {
        ScheduledDisposes.add(root2);
        if (Idle) {
          reset();
          start();
        }
      };
      Owner = root2;
      if (Idle) {
        result = topLevelRoot(fn, disposer, owner);
      } else {
        result = disposer === null ? fn() : fn(disposer);
        Owner = owner;
      }
      return result;
    };
    function topLevelRoot(fn, disposer, owner) {
      try {
        return disposer === null ? fn() : fn(disposer);
      } finally {
        Owner = owner;
      }
    }
    S.on = function on(ev, fn, seed, onchanges) {
      if (Array.isArray(ev))
        ev = callAll(ev);
      onchanges = !!onchanges;
      return S(on2, seed);
      function on2(value2) {
        var running = Listener;
        ev();
        if (onchanges)
          onchanges = false;
        else {
          Listener = null;
          value2 = fn(value2);
          Listener = running;
        }
        return value2;
      }
    };
    function callAll(ss) {
      return function all() {
        for (var i = 0; i < ss.length; i++)
          ss[i]();
      };
    }
    S.effect = function effect(fn, value2) {
      new Computation(fn, value2);
    };
    S.data = function data(value2) {
      var node = new Data(value2);
      return function data2(value3) {
        if (arguments.length === 0) {
          return node.get();
        } else {
          return node.set(value3);
        }
      };
    };
    S.value = function value(current, eq) {
      var data2 = S.data(current), age = -1;
      return function value2(update) {
        if (arguments.length === 0) {
          return data2();
        } else {
          var same = eq ? eq(current, update) : current === update;
          if (!same) {
            var time = Time;
            if (age === time)
              throw new Error("conflicting values: " + update + " is not the same as " + current);
            age = time;
            current = update;
            data2(update);
          }
          return update;
        }
      };
    };
    S.freeze = function freeze(fn) {
      var result = void 0;
      if (Idle) {
        Idle = false;
        reset();
        try {
          result = fn();
          event();
        } finally {
          Idle = true;
        }
      } else {
        result = fn();
      }
      return result;
    };
    S.sample = function sample(fn) {
      var result, running = Listener;
      if (running !== null) {
        Listener = null;
        result = fn();
        Listener = running;
      } else {
        result = fn();
      }
      return result;
    };
    S.cleanup = function cleanup(fn) {
      if (Owner !== null) {
        if (Owner.cleanups === null)
          Owner.cleanups = [fn];
        else
          Owner.cleanups.push(fn);
      }
    };
    var Data = function(value2) {
      this.state = State.Current;
      this.value = value2;
      this.pending = nil;
      this.node1 = null;
      this.node1slot = -1;
      this.nodes = null;
      this.nodeslots = null;
    };
    S.Data = Data;
    Data.prototype.get = function() {
      if (Listener !== null) {
        logRead(this, Listener);
      }
      return this.value;
    };
    Data.prototype.set = function(value2) {
      if (Idle) {
        if (this.node1 !== null || this.nodes !== null) {
          this.pending = value2;
          this.state = State.Stale;
          reset();
          ScheduledUpdates.add(this);
          event();
        } else {
          this.value = value2;
        }
      } else {
        if (this.pending !== nil) {
          if (value2 !== this.pending) {
            throw new Error("conflicting changes: " + value2 + " !== " + this.pending);
          }
        } else {
          this.pending = value2;
          this.state = State.Stale;
          ScheduledUpdates.add(this);
        }
      }
      return value2;
    };
    Data.prototype.update = function() {
      this.value = this.pending;
      this.pending = nil;
      this.state = State.Current;
    };
    var Root = function() {
      this.state = State.Current;
      this.owned = null;
      this.cleanups = null;
    };
    Root.prototype.dispose = function() {
      runCleanups(this, true);
    };
    var Computation = function(fn, value2) {
      this.fn = fn;
      this.age = 0;
      this.state = State.Current;
      this.node1 = null;
      this.node1slot = -1;
      this.nodes = null;
      this.nodeslots = null;
      this.source1 = null;
      this.source1slot = 0;
      this.sources = null;
      this.sourceslots = null;
      this.owned = null;
      this.cleanups = null;
      var owner = Owner, running = Listener;
      Owner = Listener = this;
      if (Idle) {
        Idle = false;
        reset();
        try {
          this.value = this.fn(value2);
          if (ScheduledUpdates.count > 0 || ScheduledDisposes.count > 0) {
            start();
          }
        } finally {
          Owner = Listener = null;
          Idle = true;
        }
      } else {
        this.value = this.fn(this.value);
      }
      if (owner !== null && owner !== Orphan) {
        if (owner.owned === null)
          owner.owned = [this];
        else
          owner.owned.push(this);
      }
      Owner = owner;
      Listener = running;
    };
    Computation.prototype.get = function() {
      if (Listener !== null) {
        if (this.age === Time) {
          if (this.state === State.Running) {
            throw new Error("circular dependency");
          } else if (this.state === State.Stale) {
            this.update();
          }
        }
        logRead(this, Listener);
      }
      return this.value;
    };
    Computation.prototype.update = function() {
      var owner = Owner, running = Listener;
      Owner = Listener = this;
      this.state = State.Running;
      runCleanups(this, false);
      cleanupSources(this);
      this.value = this.fn(this.value);
      this.state = State.Current;
      Owner = owner;
      Listener = running;
    };
    Computation.prototype.dispose = function() {
      this.fn = null;
      this.node1 = null;
      this.nodes = null;
      runCleanups(this, true);
      cleanupSources(this);
    };
    var Queue = function() {
      this.items = [];
      this.count = 0;
    };
    Queue.prototype.add = function(item) {
      this.items[this.count++] = item;
    };
    var State = /* @__PURE__ */ ((State2) => {
      State2[State2["Current"] = 1] = "Current";
      State2[State2["Stale"] = 2] = "Stale";
      State2[State2["Running"] = 4] = "Running";
      State2[State2["Notified"] = 8] = "Notified";
      return State2;
    })(State || {});
    var nil = {};
    var Time = 0;
    var Idle = true;
    var ScheduledUpdates = new Queue();
    var RunningUpdates = new Queue();
    var ScheduledDisposes = new Queue();
    var RunningDisposes = new Queue();
    var PendingUpdates = new Queue();
    var Listener = null;
    var Owner = null;
    var Orphan = new Root();
    function reset() {
      ScheduledUpdates.count = RunningUpdates.count = PendingUpdates.count = 0;
    }
    function logRead(from, to) {
      var fromslot, toslot = to.source1 === null ? -1 : to.sources === null ? 0 : to.sources.length;
      if (from.node1 === null) {
        from.node1 = to;
        from.node1slot = toslot;
        fromslot = -1;
      } else if (from.nodes === null) {
        from.nodes = [to];
        from.nodeslots = [toslot];
        fromslot = 0;
      } else {
        fromslot = from.nodes.length;
        from.nodes.push(to);
        from.nodeslots.push(toslot);
      }
      if (to.source1 === null) {
        to.source1 = from;
        to.source1slot = fromslot;
      } else if (to.sources === null) {
        to.sources = [from];
        to.sourceslots = [fromslot];
      } else {
        to.sources.push(from);
        to.sourceslots.push(fromslot);
      }
    }
    function event() {
      var owner = Owner;
      try {
        start();
      } finally {
        Idle = true;
        Owner = owner;
        Listener = null;
      }
    }
    function start() {
      var i = 0, j = 0, cycle = 0;
      var swap, data2, node, child;
      Idle = false;
      do {
        swap = ScheduledUpdates;
        ScheduledUpdates = RunningUpdates;
        RunningUpdates = swap;
        swap = ScheduledDisposes;
        ScheduledDisposes = RunningDisposes;
        RunningDisposes = swap;
        var time = ++Time;
        while (RunningDisposes.count !== 0 || RunningUpdates.count !== 0) {
          for (i = 0; i < RunningDisposes.count; i++) {
            node = RunningDisposes.items[i];
            RunningDisposes.items[i] = null;
            node.age = time;
            node.state = 1 /* Current */;
            node.dispose();
            if (node.owned !== null) {
              for (j = 0; j < node.owned.length; j++) {
                RunningDisposes.add(node.owned[j]);
              }
              node.owned = null;
            }
          }
          RunningDisposes.count = 0;
          for (i = 0; i < RunningUpdates.count; i++) {
            data2 = RunningUpdates.items[i];
            RunningUpdates.items[i] = null;
            if (data2.state & 2 /* Stale */) {
              data2.update();
              if (!(data2.state & 8 /* Notified */)) {
                node = data2.node1;
                if (node !== null && node.age < time) {
                  PendingUpdates.add(node);
                }
                node = data2.nodes;
                if (node !== null) {
                  for (j = 0; j < node.length; j++) {
                    child = node[j];
                    if (child !== null && child.age < time) {
                      PendingUpdates.add(child);
                    }
                  }
                }
              }
            }
          }
          RunningUpdates.count = 0;
          for (i = 0; i < PendingUpdates.count; i++) {
            data2 = PendingUpdates.items[i];
            PendingUpdates.items[i] = null;
            if (data2.age < time) {
              data2.age = time;
              data2.state |= 2 /* Stale */ | 8 /* Notified */;
              RunningUpdates.add(data2);
              if (data2.owned !== null) {
                for (j = 0; j < data2.owned.length; j++) {
                  child = data2.owned[j];
                  RunningDisposes.add(child);
                }
              }
              node = data2.node1;
              if (node !== null && node.age < time) {
                PendingUpdates.add(node);
              }
              node = data2.nodes;
              if (node !== null) {
                for (j = 0; j < node.length; j++) {
                  child = node[j];
                  if (child !== null && child.age < time) {
                    PendingUpdates.add(child);
                  }
                }
              }
            }
          }
          PendingUpdates.count = 0;
        }
        if (cycle++ > 1e5) {
          throw new Error("Runaway clock detected");
        }
      } while (ScheduledUpdates.count !== 0 || ScheduledDisposes.count !== 0);
      Idle = true;
    }
    function runCleanups(node, final) {
      var cleanups = node.cleanups, i;
      if (cleanups !== null) {
        for (i = 0; i < cleanups.length; i++) {
          cleanups[i](final);
        }
        node.cleanups = null;
      }
    }
    function cleanupSources(node, final) {
      var source1 = node.source1, sources = node.sources, sourceslots = node.sourceslots, i, len;
      if (source1 !== null) {
        cleanupSource(source1, node.source1slot);
        node.source1 = null;
      }
      if (sources !== null) {
        for (i = 0, len = sources.length; i < len; i++) {
          cleanupSource(sources.pop(), sourceslots.pop());
        }
      }
    }
    function cleanupSource(source, slot) {
      var nodes = source.nodes, nodeslots = source.nodeslots, last, lastslot;
      if (slot === -1) {
        source.node1 = null;
      } else {
        last = nodes.pop();
        lastslot = nodeslots.pop();
        if (slot !== nodes.length) {
          nodes[slot] = last;
          nodeslots[slot] = lastslot;
          if (lastslot === -1) {
            last.source1slot = slot;
          } else {
            last.sourceslots[lastslot] = slot;
          }
        }
      }
    }

    return S;

})();
