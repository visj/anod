     import { signal, compute } from "./src/index.js";
     const s1 = signal(1);
    let count = 0;

    const c1 = compute((c) => {
        c.read(s1);
        return ++count;
    });

    s1.set(2);
    let x = c1.val();
    x === 2;