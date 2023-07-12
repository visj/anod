/**
 * 
 * @param {Function} ctor 
 * @param {Array<Function>} supers 
 */
 function extend(ctor, supers) {
    var proto;
    var construct;
    var ln = supers.length;
    var parent = supers[0];
    for (var i = 1; i < ln; i++) {
        construct = function () { };
        construct.prototype = Object.create(parent);
        proto = supers[i].prototype;
        for (var key in proto) {
            construct.prototype[key] = proto[key];
        }
        parent = construct;
    }
    ctor.prototype = Object.create(parent);
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