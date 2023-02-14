import { root, val, compute, when, data } from './';

root(function() {
    var d1 = data(1);
    var d2 = data(2);
    var d3 = data("test");

    compute(when([d1, d2], function(src) {
        return src[0] + src[1];
    }));
});