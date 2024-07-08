import { test, root, compute, sample, value } from './helper/anod.js';

describe("peek(...)", function () {

    it("returns the value of a data", function () {
        root(function() {
            var d = value(1);
            test.equals(d.peek() , 1);
        });
    });

    it("avoids a dedendency", function () {
        root(function () {
            var a = value(1);
            var b = value(2);
            var c = value(3);
            var d = 0;
            
            compute(function () {
                d++; 
                a.val();
                b.peek();
                c.val();
            });

            test.equals(d , 1);

            b.update(4);

            test.equals(d , 1);

            a.update(5);
            c.update(6);

            test.equals(d , 3);
        });
    });

    it("can take computed values", function() {
        root(function () {
            var a = value(1);
            var b = value(2);
            var c = value(3);
            var d = 0;
            
            compute(function () {
                d++; 
                a.val();
                sample(function() {
                    a.val(); b.val();
                });
                c.val();
            });

            test.equals(d , 1);
            b.update(4);

            test.equals(d , 1);
            a.update(5);

            test.equals(d , 2);
        });
    });
})