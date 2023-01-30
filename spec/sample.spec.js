/* globals describe, it, expect */
describe("S.sample(...)", function () {
    it("avoids a dedendency", function () {
        S.root(function () {
            var a = S.data(1),
                b = S.data(2),
                c = S.data(3),
                d = 0,
                e = S(function () { d++; a(); S.sample(b); c(); });
                
            expect(d).toBe(1);
            
            b(4);
            
            expect(d).toBe(1, "derp");
            
            a(5);
            c(6);
            
            expect(d).toBe(3);
        });
    })
})