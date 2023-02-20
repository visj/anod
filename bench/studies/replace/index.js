var suite = new Benchmark.Suite;

function makeArray(ln) {
    var arr = [];
    for (var i = 0; i < ln; i++) {
        arr.push({ a: i, b: i, c: i, d: [i, i, i] });
    }
    return arr;
}

function makeApplyArray(ln) {
    var arr = [40, 20];
    for (var i = 0; i < ln; i++) {
        arr.push({ a: i, b: i, c: i, d: [i, i, i] });
    }
    return arr;
}

// add tests
suite.add('replace#custom', function() {
    var arr = makeArray(100);
    var next = makeArray(20);
    for (var i = 0; i < 100; i++) {
        for (var j = 0, k = 40; j < 20; j++, k++) {
            arr[k] = next[j];
        }
    }
})

.add('replace#native', function() {
    var arr = makeArray(100);
    var next = makeApplyArray();
    for (var i = 0; i < 100; i++) {
        arr.splice.apply(next);
    }
})
// add listeners
.on('cycle', function(event) {
  console.log(String(event.target));
})
.on('complete', function() {
  console.log('Fastest is ' + this.filter('fastest').map('name'));
})
// run async
.run({ 'async': true });