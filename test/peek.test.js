import { test, root, effect, compute, peek, value } from './helper/zorn.js';

describe("peek(...)", function () {

    it("returns the value of a data", function () {
        root(function() {
            var d = value(1);
            test.equals(d.peek , 1);
        });
    });

    it("avoids a dedendency", function () {
        root(function () {
            var a = value(1);
            var b = value(2);
            var c = value(3);
            var d = 0;
            
            effect(function () {
                d++; 
                a.val;
                b.peek;
                c.val;
            });

            test.equals(d , 1);

            b.set(4);

            test.equals(d , 1);

            a.set(5);
            c.set(6);

            test.equals(d , 3);
        });
    });

    it("can take computed values", function() {
        root(function () {
            var a = value(1);
            var b = value(2);
            var c = value(3);
            var d = 0;
            
            effect(function () {
                d++; 
                a.val;
                peek(function() {
                    a.val; b.val;
                });
                c.val;
            });

            test.equals(d , 1);
            b.set(4);

            test.equals(d , 1);
            a.set(5);

            test.equals(d , 2);
        });
    });
})