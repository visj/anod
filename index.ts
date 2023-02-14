import { root, val, compute, effect, when, data } from './';

root(function() {
    var d1 = data(1);
    var d2 = data(2);
    var d3 = data("test");

    div(_, _, val(() => 'Hello ' + d3.val));

    effect(when([d1, d2, d1, d3], function([d1, d2, d3, d4]) {

    }, true));
});