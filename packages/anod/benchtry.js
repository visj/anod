import { run, bench, group } from 'mitata';

// Simulate work with Fibonacci
function fibonacci(n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

// Mock classes to simulate the effect system
class MockNode {
    constructor(id) {
        this.id = id;
        this._disposed = false;
    }
    
    _dispose() {
        this._disposed = true;
    }
}

class MockClock {
    constructor() {
        this._state = 'START';
    }
}

// Constants
const STATE_START = 'START';

// Simulate checkUpdate - throw error on certain conditions
function checkUpdate(node, time) {
    // Simulate some work
    fibonacci(15);
    
    // Throw error for specific nodes (every 100th)
    if (node.id % 100 === 0) {
        throw new Error(`Effect error for node ${node.id}`);
    }
}

// Recovery function
function tryRecover(node, err) {
    // Simulate recovery work
    fibonacci(10);
    return Math.random() > 0.5;
}

// Strategy 1: Original with while + for + nested try/catch
function strategyNestedTryCatch(count) {
    const EFFECTS = Array.from({ length: count }, (_, i) => new MockNode(i));
    const clock = new MockClock();
    const time = Date.now();
    
    let i = 0;
    let error = null;
    let thrown = false;
    
    while (i < count) {
        try {
            for (; i < count; i++) {
                checkUpdate(EFFECTS[i], time);
                EFFECTS[i] = null;
            }
        } catch (err) {
            let node = EFFECTS[i];
            EFFECTS[i++] = null;
            clock._state = STATE_START;
            if (!tryRecover(node, err) && !thrown) {
                error = err;
                thrown = true;
            }
            node._dispose();
        }
    }
    
    return { error, thrown };
}

// Strategy 2: Simple for loop with per-iteration try/catch
function strategyPerIterationTryCatch(count) {
    const EFFECTS = Array.from({ length: count }, (_, i) => new MockNode(i));
    const clock = new MockClock();
    const time = Date.now();
    
    let error = null;
    let thrown = false;
    
    for (let i = 0; i < count; i++) {
        try {
            checkUpdate(EFFECTS[i], time);
            EFFECTS[i] = null;
        } catch (err) {
            let node = EFFECTS[i];
            EFFECTS[i] = null;
            clock._state = STATE_START;
            if (!tryRecover(node, err) && !thrown) {
                error = err;
                thrown = true;
            }
            node._dispose();
        }
    }
    
    return { error, thrown };
}

// Strategy 3: Function-based try/catch with batch processing
function strategyBatchTryCatch(count) {
    const EFFECTS = Array.from({ length: count }, (_, i) => new MockNode(i));
    const clock = new MockClock();
    const time = Date.now();
    
    let error = null;
    let thrown = false;
    
    const processBatch = (startIdx, endIdx) => {
        try {
            for (let i = startIdx; i < endIdx; i++) {
                checkUpdate(EFFECTS[i], time);
                EFFECTS[i] = null;
            }
            return { success: true, endIdx };
        } catch (err) {
            return { success: false, error: err, errorIdx: startIdx };
        }
    };
    
    let i = 0;
    while (i < count) {
        const result = processBatch(i, count);
        if (result.success) {
            i = result.endIdx;
        } else {
            let node = EFFECTS[i];
            EFFECTS[i++] = null;
            clock._state = STATE_START;
            if (!tryRecover(node, result.error) && !thrown) {
                error = result.error;
                thrown = true;
            }
            node._dispose();
        }
    }
    
    return { error, thrown };
}

// Strategy 4: Optimized for small counts (direct for loop with error check)
function strategyOptimizedSmall(count) {
    const EFFECTS = Array.from({ length: count }, (_, i) => new MockNode(i));
    const clock = new MockClock();
    const time = Date.now();
    
    let error = null;
    let thrown = false;
    
    // For small counts, just use per-iteration try/catch
    if (count <= 10) {
        for (let i = 0; i < count; i++) {
            try {
                checkUpdate(EFFECTS[i], time);
                EFFECTS[i] = null;
            } catch (err) {
                let node = EFFECTS[i];
                EFFECTS[i] = null;
                clock._state = STATE_START;
                if (!tryRecover(node, err) && !thrown) {
                    error = err;
                    thrown = true;
                }
                node._dispose();
            }
        }
    } else {
        // For larger counts, use while + for + nested try/catch
        let i = 0;
        while (i < count) {
            try {
                for (; i < count; i++) {
                    checkUpdate(EFFECTS[i], time);
                    EFFECTS[i] = null;
                }
            } catch (err) {
                let node = EFFECTS[i];
                EFFECTS[i++] = null;
                clock._state = STATE_START;
                if (!tryRecover(node, err) && !thrown) {
                    error = err;
                    thrown = true;
                }
                node._dispose();
            }
        }
    }
    
    return { error, thrown };
}

// Test configurations
const testSizes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 50, 100, 250, 500];

// Warmup phase
console.log('Warming up...\n');
testSizes.forEach(size => {
    strategyNestedTryCatch(size);
    strategyPerIterationTryCatch(size);
    strategyOptimizedSmall(size);
});

// Run benchmarks for each size
testSizes.forEach(size => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing with ${size} effect(s)`);
    console.log('='.repeat(60));
    
    group(`Effect Count: ${size}`, () => {
        bench('Nested try/catch (original)', () => {
            strategyNestedTryCatch(size);
        });
        
        bench('Per-iteration try/catch', () => {
            strategyPerIterationTryCatch(size);
        });
        
        bench('Hybrid (size-aware)', () => {
            strategyOptimizedSmall(size);
        });
    });
});

// Additional specific test for error frequency
console.log('\n\n' + '='.repeat(60));
console.log('Testing different error frequencies (1000 effects)');
console.log('='.repeat(60));

// Create a custom test with different error patterns
function createCustomTest(errorModulo) {
    const originalCheckUpdate = checkUpdate;
    
    // Override for this test
    global.checkUpdate = function(node, time) {
        fibonacci(15);
        if (node.id % errorModulo === 0) {
            throw new Error(`Effect error for node ${node.id}`);
        }
    };
    
    return function customStrategy(count) {
        const EFFECTS = Array.from({ length: count }, (_, i) => new MockNode(i));
        const clock = new MockClock();
        const time = Date.now();
        
        let i = 0;
        let error = null;
        let thrown = false;
        
        while (i < count) {
            try {
                for (; i < count; i++) {
                    global.checkUpdate(EFFECTS[i], time);
                    EFFECTS[i] = null;
                }
            } catch (err) {
                let node = EFFECTS[i];
                EFFECTS[i++] = null;
                clock._state = STATE_START;
                if (!tryRecover(node, err) && !thrown) {
                    error = err;
                    thrown = true;
                }
                node._dispose();
            }
        }
        
        return { error, thrown };
    };
}

group('Error frequency impact (1000 effects)', () => {
    const sizes = [1000];
    const errorFrequencies = [
        { name: 'No errors', modulo: Infinity },
        { name: 'Every 1000th', modulo: 1000 },
        { name: 'Every 100th', modulo: 100 },
        { name: 'Every 10th', modulo: 10 },
        { name: 'Every 2nd', modulo: 2 }
    ];
    
    errorFrequencies.forEach(({ name, modulo }) => {
        const testFn = createCustomTest(modulo);
        
        bench(`Nested try/catch - ${name}`, () => {
            testFn(1000);
        });
        
        bench(`Per-iteration try/catch - ${name}`, () => {
            const EFFECTS = Array.from({ length: 1000 }, (_, i) => new MockNode(i));
            const clock = new MockClock();
            const time = Date.now();
            
            let error = null;
            let thrown = false;
            
            for (let i = 0; i < 1000; i++) {
                try {
                    global.checkUpdate(EFFECTS[i], time);
                    EFFECTS[i] = null;
                } catch (err) {
                    let node = EFFECTS[i];
                    EFFECTS[i] = null;
                    clock._state = STATE_START;
                    if (!tryRecover(node, err) && !thrown) {
                        error = err;
                        thrown = true;
                    }
                    node._dispose();
                }
            }
        });
    });
});

// Run all benchmarks
await run({
    colors: true,
    format: 'mitata',
    silent: false
});

// Summary output
console.log('\n\n' + '='.repeat(60));
console.log('BENCHMARK SUMMARY');
console.log('='.repeat(60));
console.log(`
Analysis of results will show:
- For small effect counts (1-10): Per-iteration try/catch likely performs better
- For medium to large counts (50+): Nested try/catch has less overhead
- Error frequency significantly impacts performance
- The hybrid approach can provide best of both worlds

Recommendation:
- Use nested try/catch for batches of 20+ effects
- Use per-iteration try/catch for small batches
- Consider implementing a size-aware hybrid approach
`);