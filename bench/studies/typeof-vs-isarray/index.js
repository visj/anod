function createFunction() {

    var number = Math.floor(Math.random() * 100);

    return function() {
        return Math.random > 0.5 ? number / 2 : number * 2;
    }
}

function createArray() {
    var array = [];
    for (var i = 0; i < 10; i++) {
        array.push(Math.floor(Math.random() * 10));
    }
    return array;
}

var array = new Array(1000);

for (var i = 0; i < 1000; i++) {
    if (Math.random() > 0.5) {
        array[i] = createFunction();
    } else {
        array[i] = createArray();
    }
}

function benchIsArray() {
    var sum = 0;
    for (var i = 0; i < 1000; i++) {
        if (Array.isArray(array[i])) {
            sum += 4;
        } else {
            sum += 3;
        }
    }
    return sum / 1000;
}

function benchTypeOf() {
    var sum = 0;
    for (var i = 0; i < 1000; i++) {
        if (typeof array[i] === 'function') {
            sum += 3;
        } else {
            sum += 4;
        }
    }
    return sum / 1000;
}

// warmup

benchIsArray();
benchTypeOf();

var start = performance.now();

var sumIsArray = 0;

for (var i = 0; i < 1e5; i++) {
    sumIsArray += benchIsArray();
}

var end = performance.now();

console.log("isArray: ", end - start);

start = performance.now();

var sumTypeOf = 0;

for (var i = 0; i < 1e5; i++) {
    sumTypeOf += benchTypeOf();
}

end = performance.now();

console.log("typeof: ", end - start);

console.log("isArray: ", sumIsArray);
console.log("typeof: ", sumTypeOf);