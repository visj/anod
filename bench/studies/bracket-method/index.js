function Queue(items) {
    this.count = items.length;
    this.items = items;
}

Queue.prototype.add = function (item) {
    this.items[this.count++] = item;
}

Queue.prototype.runFnParam = function(fn) {
    var sum = 0;
    for (var i = 0; i < this.count; i++) {
        sum += fn(this.items[i]);
        this.items[i] = null;
    }
    this.count = 0;
    return sum;
}

Queue.prototype.runFnThis = function(fn) {
    var sum = 0;
    for (var i = 0; i < this.count; i++) {
        sum += fn.call(this.items[i]);
        this.items[i] = null;
    }
    this.count = 0;
    return sum;
}

Queue.prototype.runDirect = function() {
    var sum = 0;
    for (var i = 0; i < this.count; i++) {
        sum += this.items[i].update();
        this.items[i] = null;
    }
    this.count = 0;
    return sum;
}

Queue.prototype.runBracket = function(method) {
    var sum = 0;
    for (var i = 0; i < this.count; i++) {
        sum += this.items[i][method]();
        this.items[i] = null;
    }
    this.count = 0;
    return sum;
}

var nil = {};

function Data() {
    this.state =  Math.floor(10 * Math.random());
    this.value = nil;
    this.prev = new Struct();
    this.log = {
        node1: null,
        nodes: null,
    };
}

function Struct() {
    this.a = 10 * Math.random();
    this.b = 10 * Math.random();
    this.c = 10 * Math.random();
}

Data.prototype.update = function() {
    this.prev = this.value;
    this.value = new Struct();
    return this.value.a + this.value.b + this.value.c +
        this.prev.a + this.prev.b + this.prev.c;
}

var datas = new Array(1000);

for (var i = 0; i < 1000; i++) {
    datas[i] = new Data();
}
function update(data) {
    return data.update();
}

function updateBound() {
    return this.update();
}

function benchFn() {
    var queue = new Queue(datas.slice());
    return queue.runFnParam(update);
}

function benchFnThis() {
    var queue = new Queue(datas.slice());
    return queue.runFnThis(updateBound);
}

function benchDirect() {
    var queue = new Queue(datas.slice());
    return queue.runDirect();
}

function benchBracket () {
    var queue = new Queue(datas.slice());
    return queue.runBracket('update');
}

function bench(fn, name) {
    var t1 = performance.now();
    var sum = 0;
    for (var i = 0; i < 1000; i++) {
        sum += fn();
    }
    var t2 = performance.now();
    return { sum: sum / 1000, time: t2 - t1 };
}

for (var i = 0; i < 10; i++) {
    runBenchmarks();
}

function runBenchmarks(log) {
    var fn = bench(benchFn, "benchFn");
    var fnThis =  bench(benchFnThis, "benchFnThis");
    var direct = bench(benchDirect, "benchDirect");
    var bracket = bench(benchBracket, "benchBracket");
    if (log) {
        console.log("sumFn: ", fn);
        console.log("sumFnThis: ", fnThis);
        console.log("sumDirect: ", direct);
        console.log("sumBracket: ", bracket);
    }
}

runBenchmarks(true);