import {
    OPT_DEFER,
    OPT_STABLE,
    OPT_SETUP,
    OPT_WEAK,
    c,
} from "@fyren/core";
import "@fyren/list";

export {
    OPT_DEFER,
    OPT_STABLE,
    OPT_SETUP,
    OPT_WEAK,
    c,
}

const counter = c.signal(0);
c.effect(counter, val => {
	console.log(`Val is ${val}`);
});
/**
 * Signals drain synchronously.
 * This will print 10 times to console,
 * once for each counter.
 */
for (let i = 0; i < 10; i++) {
	counter.set(counter.get() + 1);
}
