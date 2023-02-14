var { signal, effect, computed, batch } = window.Preact;

var s1 = signal(1);
var s2 = signal(2);
var s3 = signal(3);

effect(() => {
    if (s1.value > 2) {
        throw new Error("value is " + s1.value);
    }
});

effect(() => {
    console.log("s2.value is " + s2.value);
});

effect(() => {
    console.log("s3.value is " + s3.value);
})

batch(() => {
    s2.value = 3;
    s3.value = 5;
    s1.value = 5;
});