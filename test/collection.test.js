import assert from 'assert';
import { root, array, dispose, cleanup, effect, compute, value } from './helper/zorn.js';


describe("collection", function () {

    it("should re-evaluate when an array element is changed", function () {
        var d1 = array([1, 2, 3]);
        var c1 = d1.join(',');
        effect(function () {
            assert.equal(c1.val, d1.val.join(','));
        });
        d1.val = [4, 5, 6];
    });
});