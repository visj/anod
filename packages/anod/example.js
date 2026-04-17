import { bench, run } from 'mitata';
import {
    batch,
    derive,
    watch,
    compute,
    signal,
    transmit
} from './src/index.js';

let sink = 0;
let counter = 0;

const fib = (n) => {
    if (n < 2) return 1;
    return fib(n - 1) + fib(n - 2);
};
const hard = (n, _log) => n + fib(16);

/* === Kairo Benchmarks === */

function setupDeep() {
    const len = 50;
    const head = signal(0);
    let current = head;
    for (let i = 0; i < len; i++) {
        current = transmit(current, (v) => {
            counter++;
            return v + 1;
        });
    }
    const tail = current;
    watch(tail, (v) => {
        counter++;
        sink += v;
    });
    let i = 0;
    return () => {
        head.set(++i);
    };
}

setupDeep()();