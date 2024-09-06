import { test, assert, throws } from "../helper/index.js";

export function run(anod) {
    test("peek", function () {

        test("returns the value of a data", function () {
            anod.root(function() {
                var d = anod.value(1);
                assert(d.peek() , 1);
            });
        });
    
        test("avoids a dedendency", function () {
            anod.root(function () {
                var a = anod.value(1);
                var b = anod.value(2);
                var c = anod.value(3);
                var d = 0;
                
                anod.compute(function () {
                    d++; 
                    a.val();
                    b.peek();
                    c.val();
                });
    
                assert(d , 1);
    
                b.update(4);
    
                assert(d , 1);
    
                a.update(5);
                c.update(6);
    
                assert(d , 3);
            });
        });
    
        test("can take computed values", function() {
            anod.root(function () {
                var a = anod.value(1);
                var b = anod.value(2);
                var c = anod.value(3);
                var d = 0;
                
                anod.compute(function () {
                    d++; 
                    a.val();
                    anod.sample(function() {
                        a.val(); b.val();
                    });
                    c.val();
                });
    
                assert(d , 1);
                b.update(4);
    
                assert(d , 1);
                a.update(5);
    
                assert(d , 2);
            });
        });
    });
}
