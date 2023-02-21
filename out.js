"use strict";
(() => {
  // dist/zorn.mjs
  function G(t) {
    var i = x, n = l, e = a, s = t.length === 0, r = s ? i : new F(), o = s ? void 0 : function() {
      H(r);
    };
    x = l = r, a = !1;
    try {
      return s ? t() : t(o);
    } finally {
      x = i, l = n, a = e;
    }
  }
  function P(t) {
    return new v(8192, k, t, null);
  }
  function V(t, i, n, e) {
    return new d(t, i, 1, n, e);
  }
  function H(t) {
    t._opt & 6 || (h === 0 ? t._dispose(y) : (t._opt |= 2, I._add(t)));
  }
  function Q(t) {
    if (h === 0) {
      L(), h = 1;
      try {
        t(), q();
      } finally {
        h = 0;
      }
    } else
      t();
  }
  function b(t) {
    this._stage = t, this._items = [], this._count = 0;
  }
  b.prototype._add = function(t) {
    this._items[this._count++] = t;
  };
  b.prototype._run = function(t) {
    h = this._stage;
    for (var i = 0, n = 0; n < this._count; n++) {
      var e = this._items[n];
      if (e._opt & 10)
        try {
          e._opt & 8 ? e._update(t) : e._dispose(t);
        } catch (s) {
          i = 1;
        } finally {
          e._opt &= -249;
        }
      else
        e._opt &= -225;
      this._items[n] = null;
    }
    return this._count = 0, i;
  };
  var k = {}, ut = [], y = 1, h = 0, I = new b(2), S = new b(3), m = new b(4), T = new b(5), x = null, l = null, a = !1;
  function M(t, i, n, e, s) {
    function r() {
    }
    var o = r.prototype = {};
    if (i !== void 0)
      for (var _ = 0; _ < i.length; _++) {
        var c = i[_].prototype;
        for (var j in c)
          o[j] = c[j];
      }
    if (n !== void 0) {
      var C = { peek: { get: n }, val: { get: e } };
      s !== void 0 && (C.length = { get: s }), Object.defineProperties(o, C);
    }
    t.prototype = new r(), t.constructor = t;
  }
  function w(t) {
    throw new Error(t);
  }
  function L() {
    I._count = S._count = m._count = T._count = 0;
  }
  function E(t, i) {
    t._opt |= 512, i._opt |= 2048;
    var n, e = i._source1 === null ? -1 : i._sources === null ? 0 : i._sources.length;
    t._node1 === null ? (n = -1, t._node1 = i, t._node1slot = e) : t._nodes === null ? (t._opt |= 1024, n = 0, t._nodes = [i], t._nodeslots = [e]) : (t._opt |= 1024, n = t._nodes.length, t._nodes[n] = i, t._nodeslots[n] = e), i._source1 === null ? (i._source1 = t, i._source1slot = n) : i._sources === null ? (i._opt |= 4096, i._sources = [t], i._sourceslots = [n]) : (i._opt |= 4096, i._sources[e] = t, i._sourceslots[e] = n);
  }
  function q() {
    var t = l;
    try {
      z();
    } finally {
      h = 0, l = t, a = !1;
    }
  }
  function z() {
    var t, i = 0, n = 0, e = I, s = S, r = m, o = T;
    do
      t = ++y, e._count !== 0 && (n += e._run(t)), s._count !== 0 && (n += s._run(t)), r._count !== 0 && (n += r._run(t)), o._count !== 0 && (n += o._run(t)), n !== 0 && w("error encountered"), i++ > 1e5 && w("cycle detected");
    while (s._count !== 0 || e._count !== 0 || r._count !== 0 || o._count !== 0);
  }
  function F() {
    this._opt = 0, this._children = [], this._cleanups = null, this._recovers = null;
  }
  function B(t, i) {
    t._opt = 4;
    var n, e, s = t._children, r = t._cleanups;
    if (s !== null && (e = s.length) !== 0)
      for (n = 0; n < e; n++)
        s[n]._dispose(i);
    if (r !== null && (e = r.length) !== 0)
      for (n = 0; n < e; n++)
        r[n](!0);
    t._cleanups = t._children = t._recovers = null;
  }
  M(F);
  var O = F.prototype;
  O._dispose = function(t) {
    B(this, t);
  };
  O._addChild = function(t) {
    this._opt |= 256, this._children === null ? this._children = [t] : this._children[this._children.length] = t;
  };
  O._addCleanup = function(t) {
    this._cleanups === null ? this._cleanups = [t] : this._cleanups[this._cleanups.length] = t;
  };
  O._addRecover = function(t) {
    this._recovers === null ? this._recovers = [t] : this._recovers[this._recovers.length] = t;
  };
  function J(t) {
    t._opt = 4;
    var i, n = t._node1, e = t._nodes;
    if (n !== null && ($(n, t._node1slot), t._node1 = null), e !== null && (i = e.length) !== 0)
      for (var s = t._nodeslots; i-- !== 0; )
        $(e.pop(), s.pop());
    t._owner = t._eq = t._nodes = t._nodeslots = null;
  }
  function N(t, i) {
    if (t._opt !== 4)
      if (i === -1)
        t._node1 = null, t._opt & 1024 || (t._opt &= -513);
      else {
        var n = t._nodes, e = t._nodeslots, s = n.pop(), r = e.pop(), o = n.length;
        i !== o && (n[i] = s, e[i] = r, r === -1 ? s._source1slot = i : s._sourceslots[r] = i), o === 0 && (t._opt &= ~(1024 | (t._node1 === null ? 512 : 0)));
      }
  }
  function $(t, i) {
    if (t._opt !== 4)
      if (i === -1)
        t._source1 = null;
      else {
        var n = t._sources, e = t._sourceslots, s = n.pop(), r = e.pop(), o = n.length;
        i !== o && (n[i] = s, e[i] = r, r === -1 ? s._node1slot = i : s._nodeslots[r] = i), o === 0 && (t._opt &= -4097);
      }
  }
  function U(t, i) {
    var n, e = t._node1, s = t._nodes;
    if (e !== null && e._age !== i && e._recUpdate(i), s !== null && (n = s.length) > 0)
      for (var r = 0; r < n; r++)
        e = s[r], e._age !== i && e._recUpdate(i);
  }
  function K(t, i) {
    var n = t._node1, e = t._nodes;
    n !== null && n._age !== i && !(n._opt & 64) && n._recMayUpdate(i);
    var s;
    if (e !== null && (s = e.length) > 0)
      for (var r = 0; r < s; r++)
        n = e[r], n._age !== i && !(n._opt & 64) && n._recMayUpdate(i);
  }
  function X(t, i) {
    for (var n = t.length, e = 0; e < n; e++) {
      var s = t[e];
      s._opt & 6 || s._recDispose(i);
    }
  }
  function Y(t, i, n) {
    for (var e = i.length, s = 0; s < e; s++) {
      var r = i[s];
      r._opt & 38 || r._recMayDispose(t, n);
    }
  }
  function _t() {
  }
  _t.prototype._clearMayUpdate = function(t, i) {
  };
  function v(t, i, n, e) {
    this._opt = t, this._value = n, this._owner = null, this._eq = e, this._node1 = null, this._node1slot = -1, this._nodes = null, this._nodeslots = null, this._set = i;
    var s = l;
    s !== null && s._addChild(this);
  }
  function Z() {
    return this._value;
  }
  function tt() {
    return !(this._opt & 6) && a && E(this, l), this._value;
  }
  M(v, [], Z, tt);
  var D = v.prototype;
  function it(t) {
    var i = this._opt;
    t:
      if (!(i & 6) && (this._eq === null || (i & 65536 ? !this._eq(t, this._value) : t !== this._value))) {
        var n = y, e = h;
        if (e === 4 && i & 32) {
          if (i & 128)
            throw new Error();
          if (this._opt |= 128, this._owner._clearMayUpdate(e, n), this._opt &= -225, this._opt & 6)
            break t;
        }
        this._set !== k && t !== this._set && w("conflicting values"), this._set = t, e === 0 ? (L(), this._update(y + 1), q()) : (this._opt |= 8, S._add(this));
      }
  }
  D.set = it;
  D._dispose = function(t) {
    J(this), this._set = null, this._value = void 0;
  };
  D._recDispose = function(t) {
    this._opt = 2;
  };
  D._recMayDispose = function(t, i) {
    this._opt |= 32, this._owner === null && (this._owner = t);
  };
  D._update = function(t) {
    this._value = this._set, this._set = k, this._opt &= -233, this._opt & 512 && U(this, t);
  };
  function d(t, i, n, e, s, r) {
    v.call(this, n | (s === null ? 8192 : s !== void 0 ? 65536 : 0), t.length < 3 ? t : ft(this, t), i, s), this._children = null, this._cleanups = null, this._recovers = null, this._age = 0, this._source1 = null, this._source1slot = 0, this._sources = null, this._sourceslots = null, this._args = e, n & 32768 ? (this._opt &= -32769, A(this, r)) : rt(this, !0, this, e, r);
  }
  function nt(t) {
    var i = t._opt;
    !(i & 6) && h !== 0 && i & 104 && t._clearMayUpdate(h, y);
  }
  function et() {
    return nt(this), this._value;
  }
  function st() {
    var t = this._opt;
    return !(t & 6) && h !== 0 && (t & 104 && this._clearMayUpdate(h, y), !(this._opt & 6) && a && E(this, l)), this._value;
  }
  M(d, [F], et, st);
  var g = d.prototype;
  function rt(t, i, n, e, s) {
    var r = l, o = a, _ = n._opt;
    if (l = t, a = i, h === 0) {
      L(), h = 1;
      try {
        _ & 16384 && A(n, s), n._value = n._set(n._value, e), (S._count !== 0 || I._count !== 0) && z();
      } finally {
        h = 0, l = null, a = !1;
      }
    } else
      _ & 16384 && A(this, s), n._value = n._set(n._value, e);
    l = r, a = o;
  }
  function ft(t, i) {
    var n = function() {
      H(t);
    };
    return function(e, s) {
      return i(e, s, n);
    };
  }
  function A(t, i) {
    if (Array.isArray(i))
      for (var n = i.length, e = 0; e < n; e++)
        E(i[e], t);
    else
      E(i, t);
    a = !1;
  }
  function ot(t) {
    if (t._source1 !== null && (N(t._source1, t._source1slot), t._source1 = null), t._opt & 4096) {
      var i, n = t._sources;
      if (n !== null && (i = n.length) !== 0)
        for (var e = t._sourceslots; i-- !== 0; )
          N(n.pop(), e.pop());
    }
    t._opt &= -6145;
  }
  g._dispose = function(t) {
    B(this, t), J(this), ot(this), this._set = this._args = this._sources = this._sourceslots = null, this._value = void 0;
  };
  g._recDispose = function(t) {
    var i = this._opt;
    this._age = t, this._opt = (i | 2) & -9, (i & 320) === 256 && X(this._children, t);
  };
  g._recMayDispose = function(t, i) {
    var n = this._opt;
    this._opt = (n | 32) & -129, this._owner === null && (this._owner = t), (n & 320) === 256 && Y(this, this._children, i);
  };
  g._update = function(t) {
    var i, n, e = l, s = a;
    l = null, a = !1;
    var r = this._opt, o = this._children;
    if (r & 256) {
      for (i = 0, n = o.length; i < n; i++)
        o[i]._dispose(t);
      o.length = 0, this._opt &= -257;
    }
    var _ = this._cleanups;
    if (_ !== null && (n = _.length) !== 0) {
      for (i = 0; i < n; i++)
        _[i](!1);
      _.length = 0;
    }
    l = this, r & 1 ? a = !1 : (a = !0, ot(this));
    var c = this._value;
    this._opt |= 16, this._value = this._set(c, this._args), (r & 8704) === 512 && (r & 65536 ? !this._eq(c, this._value) : c !== this._value) && U(this, t), this._opt &= -249, l = e, a = s;
  };
  g._recUpdate = function(t) {
    var i = this._opt;
    this._age = t, this._opt |= 8, i & 256 && X(this._children, t), (i & 8704) === 512 ? (m._add(this), i & 64 || K(this, t)) : (T._add(this), i & 512 && U(this, t));
  };
  g._recMayUpdate = function(t) {
    var i = this._opt;
    this._opt = (i | 64) & -129, (i & 288) === 256 && Y(this, this._children, t), i & 512 && K(this, t);
  };
  g._clearMayUpdate = function(t, i) {
    if (t === 4) {
      if (this._opt & 128 && w("cyclic dependency"), this._opt |= 128, this._opt & 32 && (this._owner._clearMayUpdate(t, i), this._opt &= -33), (this._opt & 70) === 64) {
        t: {
          var n = this._source1;
          if (n !== null && n._opt & 64 && (n._clearMayUpdate(t, i), this._age === i))
            break t;
          if ((this._opt & 4160) === 4160) {
            var e, s = this._sources;
            if (s !== null && (e = s.length) > 0) {
              for (var r = 0; r < e; r++)
                if (n = s[r], n._opt & 64 && (n._clearMayUpdate(t, i), this._age === i))
                  break t;
            }
          }
        }
        this._opt &= -65;
      }
      this._opt &= -129;
    }
    this._opt & 8 && this._age === i && (this._opt & 16 && w("cyclic dependency"), this._update(i));
  };
  function ht(t, i) {
    return i.val.length;
  }
  function at() {
    return this._length === null && (this._length = new d(ht, this._value.length, 49153, this, void 0, this)), this._length;
  }
  function R() {
  }
  M(R, [v]);
  var u = R.prototype;
  u.mut = function() {
    return nt(this), [this._mut[0], this._mut[1]];
  };
  u.at = function(t) {
  };
  u.concat = function(t) {
  };
  u.every = function(t) {
  };
  u.filter = function(t) {
  };
  u.find = function(t) {
  };
  u.findIndex = function(t) {
  };
  u.findLast = function(t) {
  };
  u.findLastIndex = function(t) {
  };
  u.forEach = function(t) {
  };
  u.includes = function(t) {
  };
  u.indexOf = function(t, i) {
  };
  function ct(t, i) {
    var n = i[0], e = i[1];
    return n._value.join(e);
  }
  u.join = function(t) {
    return new d(ct, "", 16384, [this, t], void 0, this);
  };
  function pt(t, i) {
    return i[0]._value.lastIndexOf(
      i[1],
      i[2]
    );
  }
  u.lastIndexOf = function(t, i) {
    return new d(pt, -1, 16384, [this, t, i], void 0, this);
  };
  u.map = function(t) {
  };
  u.reduce = function(t, i) {
  };
  u.reduceRight = function(t, i) {
  };
  function vt(t, i) {
    i[1] = 1;
    var n = i[0], e = i[4];
    return n.val.slice(e[0], e[1]);
  }
  u.slice = function(t, i) {
    return new W(this, vt, [t, i]);
  };
  u.some = function(t) {
  };
  function lt(t, i) {
    v.call(this, 8192 | (i !== void 0 ? 65536 : 0), k, t != null ? t : [], i === void 0 ? null : i), this._length = null, this._mut = [], this._smut = [], this._args = [null, 0, 0];
  }
  M(lt, [v, R], Z, tt, at);
  var p = lt.prototype;
  function f(t, i, n) {
    t._set !== k && w("conflicting mutation"), t._smut[0] = i, t._smut[1] = n, it.call(t, ut);
  }
  p.set = function(t, i) {
    var n = arguments.length;
    n === 1 ? f(this, 1537, t) : n > 0 && f(this, 770, [t, i]);
  };
  p._update = function(t) {
    var i = this._smut, n = i[0], e = i[1], s = this._value;
    switch (n) {
      case 1537:
        this._value = e;
        break;
      case 770:
        s[e[0]] = e[1];
        break;
      case 67:
        s.length--;
        break;
      case 196:
        s.length -= e;
        break;
      case 69:
        s[s.length] = e;
        break;
      case 198:
        s.push.apply(s, e);
        break;
      case 295:
        s.shift();
        break;
      case 553:
        s.unshift(e);
        break;
      case 682:
        s.unshift.apply(s, e);
        break;
      case 1041:
        s.reverse();
        break;
      case 1042:
        s.sort(e);
        break;
      case 19:
        break;
      default:
        s.splice.apply(s, e);
    }
    this._smut = this._mut, this._smut[1] = void 0, this._mut = i, this._set = k, this._opt &= -233, this._opt & 512 && U(this, t);
  };
  p.pop = function() {
    this._value.length !== 0 && f(this, 67);
  };
  p.push = function(t) {
    var i = arguments, n = i.length;
    if (n === 1)
      f(this, 69, t);
    else if (n > 0) {
      for (var e = 0, s = new Array(n); e < n; e++)
        s[e] = i[e];
      f(this, 198, s);
    }
  };
  p.reverse = function() {
    this._value.length !== 0 && f(this, 1041);
  };
  p.shift = function() {
    this._value.length !== 0 && f(this, 295);
  };
  p.sort = function(t) {
    this._value.length !== 0 && f(this, 1042, t);
  };
  p.splice = function(t, i, n) {
    var e = arguments, s = e.length;
    if (s > 0) {
      var r, o = this._value.length, _;
      if (t < 0)
        (t += o) < 0 && (t = 0);
      else if (t >= o) {
        if (s < 3)
          return;
        t = o, i = 0;
      }
      if (i >= o - t && (i = o - t), (0 | i) > 0)
        if (s > 2)
          if (s - 2 === i) {
            if (i === 1)
              return f(this, 770, [t, n]);
            r = 911;
          } else
            r = 976;
        else {
          if (o === 0)
            return;
          if (t === 0) {
            if (i === 1)
              return f(this, 295);
            r = 424;
          } else
            i === 1 ? r = 267 : r = 396;
        }
      else {
        if (s < 3)
          return;
        if (s === 3) {
          if (t === 0)
            return f(this, 553, n);
          r = 525;
        } else
          r = 654;
      }
      if (r & 512)
        if (r & 128) {
          _ = [t, i];
          for (var c = 2; c < s; c++)
            _[c] = e[c];
        } else
          _ = [t, i, n];
      else
        f(this, r, [t, i]);
      f(this, r, _);
    }
  };
  p.unshift = function(t) {
    var i = arguments.length;
    if (i === 1)
      f(this, 553, t);
    else if (i > 0) {
      for (var n = 0, e = new Array(i); n < i; n++)
        e[n] = arguments[n];
      f(this, 682, e);
    }
  };
  function W(t, i, n) {
    v.call(this, 16385, i, []), this._age = 0, this._source1 = null, this._source1slot = 0, this._mut = [0], this._args = [t, 1, 0, void 0, n], rt(null, !1, this, this._args, t);
  }
  M(W, [d, R], et, st, at);
  var dt = W.prototype;
  dt._update = function(t) {
    var i = l, n = a, e = this._args;
    l = null, a = !1, e[1] = 0, e[2] = this._mut[0], e[3] = this._mut[1], this._opt |= 16, this._value = this._set(this._value, e), e[1] === 1 && U(this, t), this._opt &= -249, l = i, a = n;
  };

  // index.js
  G(() => {
    let t = P(1), i = P(2);
    V(() => {
      console.log(t.val + i.val);
    }), setInterval(() => {
      Q(() => {
        t.set(t.val + 1), i.set(i.val + 2);
      });
    }, 1e3);
  });
})();
