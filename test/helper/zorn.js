export * from '../../dist/zorn.min.mjs';

export var test = {
    ok: function(ok, msg) {
        if (!ok) {
            throw new Error(msg);
        }
    },
    equals: function(a, b, msg) {
        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) {
                throw new Error(msg);
            }
            for (var i = 0; i < a.length; i++) {
                if (a[i] !== b[i]) {
                    throw new Error(msg);
                }
            }
        } else if (typeof a === 'object' && typeof b === 'object') {
            if (a === null && b !== null) {
                throw new Error(msg);
            }
            var keys = Object.keys(a);
            if (keys.length !== Object.keys(b).length) {
                throw new Error(msg);
            }
            for (var i = 0; i < keys.length; i++) {
                if (a[keys[i]] !== b[keys[i]]) {
                    throw new Error(msg);
                }
            }
        } else if (a !== b) {
            throw new Error(msg);
        }
    },
    throws: function(fn, msg) {
        var thrown = false;
        try {
            fn();
        } catch (e) {
            thrown = true;
        }
        if (!thrown) {
            throw new Error(msg);
        }
    }
}