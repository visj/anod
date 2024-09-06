import { array } from "./dist/array.js";
import { compute } from "./dist/index.js";

var v1 = array([2, 4, 6, 8, 9, 10, 11, 12, 13, 14]);

var c1 = v1.find(v => v === 12);

compute(function() {
    console.log(v1.val(), c1.val());
});

v1.splice(2, 3, 1, 2, 3);