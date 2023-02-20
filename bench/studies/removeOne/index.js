

var suite = new Benchmark.Suite();

function makeArray() {
    var arr = [];
    for (var i = 0; i < 100; i++) {
        arr.push({ a: i, b: i, c: i, d: [i, i, i] });
    }
    return arr;
}

// add tests
suite.add('removeOne#custom', function () {
    var arr = makeArray(100);
    var index = 37;
    var len = arr.length;
    while (index < len) {
        arr[index] = arr[index + 1];
        index++;
    }
    arr.length--;
})
    .add('removeOne#native', function () {
        var arr = makeArray(100);
        arr.splice(37, 1);
    })
    // add listeners
    .on('cycle', function (event) {
        console.log(String(event.target));
    })
    .on('complete', function () {
        console.log('Fastest is ' + this.filter('fastest').map('name'));
    })
    // run async
    .run();