/**
 * 
 * @param {Function} ctor 
 * @param {Array<Function>} supers 
 */
function extend(ctor, supers) {
    var proto;
    var parent;
    var construct;
    for (var i = 0, ln = supers.length; i < ln; i++) {
        proto = function() { };
        construct = function() { };
        construct.prototype = supers[i].prototype;
        proto.prototype = new construct();
        if (i === 0) {
            parent = proto;
        } else {
            construct = function() { };
            construct.prototype = new parent();
            proto = proto.prototype;
            for (var key in proto) {
                construct.prototype[key] = proto[key];
            }
            parent = construct;
        }
    }
    ctor.prototype = new parent();
    ctor.constructor = ctor;
}

function First() {

}

First.prototype.first = function() {
    console.log("first");
};

First.prototype.common = function() {
    console.log("first: common");
};

function Second() {

}

Second.prototype.second = function() {
    console.log("second");
};

Second.prototype.common = function() {
    console.log("second: common");
};

function Third() {

}


extend(Third, [Second, First]);

var t = new Third();

t.first();
t.second();
t.common();