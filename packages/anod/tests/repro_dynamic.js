import { signal, compute, derive, batch } from '../src/index.js';

let counter = 0;
let sink = 0;

function pseudoRandom(seed) {
    let h = 2166136261 >>> 0;
    for (let k, i = 0; i < seed.length; i++) {
        k = Math.imul(seed.charCodeAt(i), 3432918353);
        k = (k << 15) | (k >>> 17);
        h ^= Math.imul(k, 461845907);
        h = (h << 13) | (h >>> 19);
        h = (Math.imul(h, 5) + 3864292196) | 0;
    }
    h ^= seed.length;
    function nextHash() {
        h ^= h >>> 16;
        h = Math.imul(h, 2246822507);
        h ^= h >>> 13;
        h = Math.imul(h, 3266489909);
        h ^= h >>> 16;
        return h >>> 0;
    }
    let a = nextHash(), b = nextHash(), c = nextHash(), d = nextHash();
    return function () {
        a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
        let t = (a + b) | 0;
        a = b ^ (b >>> 9);
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        d = (d + 1) | 0;
        t = (t + d) | 0;
        c = (c + t) | 0;
        return (t >>> 0) / 4294967296;
    };
}

function removeElems(src, rmCount, rand) {
    const copy = src.slice();
    for (let i = 0; i < rmCount; i++) {
        copy.splice(Math.floor(rand() * copy.length), 1);
    }
    return copy;
}

function makeDynGraph(width, totalLayers, staticFraction, nSources) {
    const sources = new Array(width);
    for (let i = 0; i < width; i++) {
        sources[i] = signal(i);
    }
    const random = pseudoRandom('seed');
    let prevRow = sources;
    const layers = [];
    const allNodes = [...sources];
    for (let l = 0; l < totalLayers - 1; l++) {
        const row = new Array(width);
        for (let myDex = 0; myDex < width; myDex++) {
            const mySources = new Array(nSources);
            for (let s = 0; s < nSources; s++) {
                mySources[s] = prevRow[(myDex + s) % width];
            }
            if (random() < staticFraction) {
                row[myDex] = derive(c => {
                    counter++;
                    let sum = 0;
                    for (let s = 0; s < mySources.length; s++) {
                        sum += c.read(mySources[s]);
                    }
                    return sum;
                });
            } else {
                const first = mySources[0];
                const tail = mySources.slice(1);
                row[myDex] = compute(c => {
                    counter++;
                    let sum = c.read(first);
                    const shouldDrop = sum & 0x1;
                    const dropDex = sum % tail.length;
                    for (let i = 0; i < tail.length; i++) {
                        if (shouldDrop && i === dropDex) {
                            continue;
                        }
                        sum += c.read(tail[i]);
                    }
                    return sum;
                });
            }
            allNodes.push(row[myDex]);
        }
        layers.push(row);
        prevRow = row;
    }
    return { sources, layers, allNodes };
}

/**
 * Validate that all subs arrays are structurally sound.
 */
function validateGraph(allNodes) {
    for (let n = 0; n < allNodes.length; n++) {
        const node = allNodes[n];

        /** Check subs */
        if (node._subs != null) {
            const subs = node._subs;
            if (subs.length % 2 !== 0) {
                return `node#${n}: odd subs.length=${subs.length}`;
            }
            for (let i = 0; i < subs.length; i += 2) {
                if (typeof subs[i] !== 'object' || subs[i] == null) {
                    return `node#${n}: bad subs[${i}]=${subs[i]} (type ${typeof subs[i]}) len=${subs.length}`;
                }
                let depslot = subs[i + 1];
                if (typeof depslot !== 'number' || depslot < 0 || depslot > 10000) {
                    return `node#${n}: bad depslot subs[${i + 1}]=${depslot}`;
                }
            }
        }

        /** Check deps */
        if (node._deps != null) {
            const deps = node._deps;
            if (deps.length % 2 !== 0) {
                return `node#${n}: odd deps.length=${deps.length}`;
            }
            for (let i = 0; i < deps.length; i += 2) {
                if (typeof deps[i] !== 'object' || deps[i] == null) {
                    return `node#${n}: bad deps[${i}]=${deps[i]} len=${deps.length}`;
                }
                let subslot = deps[i + 1];
                if (typeof subslot !== 'number' || subslot < 0 || subslot > 10000) {
                    return `node#${n}: bad subslot deps[${i + 1}]=${subslot}`;
                }
            }
        }

        /** Cross-check: dep1 sub-slot points back to this node */
        if (node._dep1 != null) {
            const sender = node._dep1;
            const subslot = node._dep1slot;
            if (subslot === 0) {
                if (sender._sub1 !== node) {
                    return `node#${n}: dep1slot=0 but sender._sub1 is not this node`;
                }
            } else {
                if (!sender._subs || sender._subs[subslot - 1] !== node) {
                    return `node#${n}: dep1slot=${subslot} but sender._subs[${subslot - 1}] is ${sender._subs?.[subslot - 1]}`;
                }
            }
        }

        /** Cross-check: each deps entry sub-slot points back to this node */
        if (node._deps != null) {
            const deps = node._deps;
            for (let i = 0; i < deps.length; i += 2) {
                const sender = deps[i];
                const subslot = deps[i + 1];
                if (subslot === 0) {
                    if (sender._sub1 !== node) {
                        const actualIdx = allNodes.indexOf(sender._sub1);
                        return `node#${n}: deps[${i}] subslot=0 but sender._sub1 is node#${actualIdx} (not this node). sender._sub1slot=${sender._sub1slot}`;
                    }
                    if (sender._sub1slot !== i + 1) {
                        return `node#${n}: deps[${i}] subslot=0, sender._sub1slot=${sender._sub1slot} expected ${i + 1}`;
                    }
                } else {
                    if (!sender._subs || sender._subs[subslot - 1] !== node) {
                        const actualIdx = sender._subs ? allNodes.indexOf(sender._subs[subslot - 1]) : -1;
                        return `node#${n}: deps[${i}] subslot=${subslot} but sender._subs[${subslot - 1}]=node#${actualIdx} (not this node). subs.len=${sender._subs?.length}`;
                    }
                    if (sender._subs[subslot] !== i + 1) {
                        return `node#${n}: deps[${i}] subslot=${subslot}, sender._subs[${subslot}]=${sender._subs?.[subslot]} expected depslot=${i + 1}`;
                    }
                }
            }
        }
    }
    return null;
}

const { sources, layers, allNodes } = makeDynGraph(100, 15, 0.5, 6);
const leaves = layers[layers.length - 1];

/** Initial materialization */
for (let r = 0; r < leaves.length; r++) {
    leaves[r].val();
}

let err = validateGraph(allNodes);
if (err) {
    console.log('VALIDATION FAIL after init:', err);
    process.exit(1);
}

const rand = pseudoRandom('seed');
const readLeaves = removeElems(leaves, 0, rand);
const readLen = readLeaves.length;
const srcLen = sources.length;

for (let iter = 1; iter <= 200; iter++) {
    try {
        const sourceDex = iter % srcLen;
        batch(() => {
            sources[sourceDex].set(iter + sourceDex);
        });
        for (let r = 0; r < readLen; r++) {
            readLeaves[r].val();
        }
    } catch (e) {
        console.log(`CRASH at iter ${iter}: ${e.message}`);
        console.log(e.stack.split('\n').slice(1, 4).join('\n'));
        process.exit(1);
    }

    const n586check = allNodes[586];
    const s487check = allNodes[487];
    let dupCount = 0;
    if (n586check._deps) {
        for (let i = 0; i < n586check._deps.length; i += 2) {
            if (n586check._deps[i] === s487check) dupCount++;
        }
    }
    if (dupCount > 1) {
        console.log(`iter ${iter}: n586 has ${dupCount} copies of s487, deps.length=${n586check._deps.length}`);
    }

    err = validateGraph(allNodes);
    if (err) {
        const n586 = allNodes[586];
        console.log(`VALIDATION FAIL after iter ${iter}: ${err}`);
        console.log(`  n586._deps.length = ${n586._deps?.length}`);
        if (n586._deps) {
            for (let i = 0; i < n586._deps.length; i += 2) {
                const s = n586._deps[i];
                const ss = n586._deps[i+1];
                const si = allNodes.indexOf(s);
                console.log(`  deps[${i}] = node#${si}, subslot=${ss}`);
            }
        }
        process.exit(1);
    }
}

console.log('OK: 200 iterations, all validations passed');
