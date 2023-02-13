var obj = {
    _val: 0,
};

Object.defineProperty(obj, "val", {
    get: function () {
        return obj._val;
    },
    set: function (val) {
        console.log(val);
        obj._val = val;
    }
})


obj.val += 3

console.log(obj.val);
