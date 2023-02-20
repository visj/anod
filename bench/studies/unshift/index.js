var suite = new Benchmark.Suite;

var unshiftArray = function (arr, item) {
};

function makeArray() {
    var arr = [];
    for (var i = 0; i < 100; i++) {
        arr.push({ a: i, b: i, c: i, d: [i, i, i] });
    }
    return arr;
}

// add tests
suite.add('unshift#custom', function () {
    var arr = makeArray();
    for (var i = 0; i < 100; i++) {
        var len = arr.length;
        while (len) {
            arr[len] = arr[len - 1];
            len--;
        }
        arr[0] = { a: 1, b: 1, c: 1, d: [1, 1, 1] };
    }
})

    .add('unshift#native', function () {
        var arr = makeArray();
        for (var i = 0; i < 100; i++) {
            arr.unshift({ a: 1, b: 1, c: 1, d: [1, 1, 1] });
        }
    })
    // add listeners
    .on('cycle', function (event) {
        console.log(String(event.target));
    })
    .on('complete', function () {
        console.log('Fastest is ' + this.filter('fastest').map('name'));
    })
    // run async
    .run({ 'async': true });