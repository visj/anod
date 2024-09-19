import { signal, computed, effect } from "@preact/signals-core";
import { array } from "./dist/array.js";
import { value, compute, batch } from "./dist/index.js";
import S from "s-js";

function createArray() {
  return [...new Array(50).keys()].slice(1);
}

function val(seed) {
  return Math.floor(seed % 50);
}

var RUNS = 1000000;

function benchPreact() {
  var start = performance.now();
  var runs = 0;
  var s1 = signal(createArray());
  var ev = computed(() => {
    return s1.value.findLastIndex(val => {
      runs++;
      return val === 47;
    })
  });
  for (var i = 0; i < RUNS; i++) {
    var peek = s1.peek().slice();
    if (i % 7 === 0) {
      peek.reverse();
    } else if (i % 5 === 0) {
      peek.push(val(i));
    } else if (i % 3 === 0) {
      peek.unshift(val(i));
    } else if (i % 2 === 0) {
      peek.shift();
    } else {
      if (peek.length < 100) {
        peek.push(val(i));
      } else {
        peek.pop();
      }
    }
    s1.value = peek;
    ev.value;
  }
  console.log("Preact. Runs: " + runs + ", Time: " + (performance.now() - start));
}

function benchAnod() {
  var start = performance.now();
  var s1 = array(createArray());
  var runs = 0;
  var ev = s1.findLastIndex(val => {
    runs++;
    return val === 47;
  });

  /* compute(function() {
    if (s1.val().findLastIndex(val => val === 47) !== ev.val()) {
      console.log("Wrong value");
    }
    }); */
  for (var i = 0; i < RUNS; i++) {
    if (i % 7 === 0) {
      s1.reverse();
    } else if (i % 5 === 0) {
      s1.push(val(i));
    } else if (i % 3 === 0) {
      s1.unshift(val(i));
    } else if (i % 2 === 0) {
      s1.shift();
    } else {
      if (s1.length() < 100) {
        s1.push(val(i));
      } else {
        s1.pop();
      }
    }
  }
  console.log("Anod. Runs: " + runs + ", Time: " + (performance.now() - start));
}

// var v1 = signal(1);
// var c1 = computed(function () {
//   console.log("v1", v1.value);
//   if (v1.value === 3) {
//     throw new Error("oh no");
//   }
//   return v1.peek();
// });
// batch(function() {
//   console.log("c1", c1.value);
//   v1.value = 3;
//   v1.value = 2;
//   v1.value = 4;
// });
// console.log("here")
// console.log("c1", c1.value);

var v1 = value(1);
var c1 = compute(function () {
  console.log("v1", v1.peek());
  if (v1.val() === 3) {
    throw new Error("oh no");
  }
  return v1.peek();
});
try {
  v1.update(3);
} catch(err) {
}
batch(function() {
  // console.log("c1", c1.val());
  v1.update(2);
});
console.log("here")
console.log("c1", c1.val());


for (var i = 0; i < 10; i++) {
  // benchPreact();
}

for (var i = 0; i < 10; i++) {
  // benchAnod();
}
