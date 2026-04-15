import { run, bench, group } from 'mitata';

// Flag constants
const FLAG_PENDING = 1 << 0;
const FLAG_STALE = 1 << 1;
const FLAG_DISPOSED = 1 << 2;
const FLAGS_MASK = FLAG_PENDING | FLAG_STALE;

// Base node factory that creates nodes with different notify implementations
function createNodeFactory(variant) {
    class SignalNode {
        constructor(id, depth = 0) {
            this.id = id;
            this._flag = 0;
            this.depth = depth;
            this.subscribers = [];
            this.dependencies = [];
            this.value = id;
        }
        
        _receive(time) {
            // Simulate work
            let sum = 0;
            for (let i = 0; i < this.dependencies.length; i++) {
                sum += this.dependencies[i].value;
            }
            this.value = sum + this.id;
            
            // Recursively notify subscribers
            for (let i = 0; i < this.subscribers.length; i++) {
                const sub = this.subscribers[i];
                const flag = (Math.random() > 0.5) ? FLAG_PENDING : FLAG_STALE;
                sub.notify(flag, time);
            }
        }
    }
    
    // Add the variant-specific notify method
    switch (variant) {
        case 'original':
            SignalNode.prototype.notify = function(flag, time) {
                if (this._flag & FLAGS_MASK) {
                    this._flag |= flag;
                } else {
                    this._flag |= flag;
                    this._receive(time);
                }
            };
            break;
            
        case 'hadFlags':
            SignalNode.prototype.notify = function(flag, time) {
                const hadFlags = this._flag & FLAGS_MASK;
                this._flag |= flag;
                if (!hadFlags) {
                    this._receive(time);
                }
            };
            break;
            
        case 'logicalOr':
            SignalNode.prototype.notify = function(flag, time) {
                const hadFlags = this._flag & FLAGS_MASK;
                this._flag |= flag;
                hadFlags || this._receive(time);
            };
            break;
            
        case 'inverted':
            SignalNode.prototype.notify = function(flag, time) {
                if (!(this._flag & FLAGS_MASK)) {
                    this._flag |= flag;
                    this._receive(time);
                } else {
                    this._flag |= flag;
                }
            };
            break;
            
        case 'ternary':
            SignalNode.prototype.notify = function(flag, time) {
                const shouldReceive = !(this._flag & FLAGS_MASK);
                this._flag |= flag;
                shouldReceive ? this._receive(time) : null;
            };
            break;
    }
    
    return SignalNode;
}

// Build signal graph with specific node class
function buildSignalGraph(NodeClass, depth = 4, breadth = 3) {
    const nodes = [];
    let id = 0;
    
    function createNode(currentDepth) {
        const node = new NodeClass(id++, currentDepth);
        nodes.push(node);
        
        if (currentDepth < depth) {
            for (let i = 0; i < breadth; i++) {
                const dep = createNode(currentDepth + 1);
                node.dependencies.push(dep);
                dep.subscribers.push(node);
            }
        }
        
        return node;
    }
    
    const root = createNode(0);
    return { root, nodes };
}

// Create benchmarks for different graph configurations
const graphConfigs = [
    { name: 'Shallow (depth 2, breadth 2)', depth: 2, breadth: 2, nodes: 7 },
    { name: 'Medium (depth 3, breadth 3)', depth: 3, breadth: 3, nodes: 40 },
    { name: 'Deep (depth 4, breadth 2)', depth: 4, breadth: 2, nodes: 31 },
    { name: 'Wide (depth 2, breadth 5)', depth: 2, breadth: 5, nodes: 31 },
];

// Pre-build graphs for each variant to avoid construction overhead
function createBenchmarkFn(variant, depth, breadth) {
    const NodeClass = createNodeFactory(variant);
    const { root } = buildSignalGraph(NodeClass, depth, breadth);
    
    return () => {
        // Reset flags for clean state
        function resetNode(node) {
            node._flag = 0;
            node.dependencies.forEach(resetNode);
        }
        resetNode(root);
        
        // Trigger the cascade
        root.notify(FLAG_PENDING, Date.now());
    };
}

// Warmup phase
console.log('Warming up...\n');
const variants = ['original', 'hadFlags', 'logicalOr', 'inverted', 'ternary'];
graphConfigs.forEach(config => {
    variants.forEach(variant => {
        const fn = createBenchmarkFn(variant, config.depth, config.breadth);
        for (let i = 0; i < 100; i++) fn();
    });
});

// Run benchmarks for each graph size
graphConfigs.forEach(config => {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`${config.name} (${config.nodes} nodes)`);
    console.log('='.repeat(70));
    
    group(config.name, () => {
        bench('Original (if/else duplicate)', () => {
            createBenchmarkFn('original', config.depth, config.breadth)();
        });
        
        bench('hadFlags variable', () => {
            createBenchmarkFn('hadFlags', config.depth, config.breadth)();
        });
        
        bench('Logical OR (||)', () => {
            createBenchmarkFn('logicalOr', config.depth, config.breadth)();
        });
        
        bench('Inverted condition', () => {
            createBenchmarkFn('inverted', config.depth, config.breadth)();
        });
        
        bench('Ternary with null', () => {
            createBenchmarkFn('ternary', config.depth, config.breadth)();
        });
    });
});

// Test with different flag state distributions
console.log('\n\n' + '='.repeat(70));
console.log('Testing with different initial flag states');
console.log('='.repeat(70));

function createPreFlaggedBenchmark(variant, preFlagRatio) {
    const NodeClass = createNodeFactory(variant);
    const { root, nodes } = buildSignalGraph(NodeClass, 3, 3);
    
    return () => {
        // Reset and randomly set some flags
        nodes.forEach(node => {
            node._flag = (Math.random() < preFlagRatio) ? 
                (Math.random() > 0.5 ? FLAG_PENDING : FLAG_STALE) : 0;
        });
        
        root.notify(FLAG_PENDING, Date.now());
    };
}

const flagDistributions = [
    { name: '0% pre-flagged', ratio: 0.0 },
    { name: '25% pre-flagged', ratio: 0.25 },
    { name: '50% pre-flagged', ratio: 0.5 },
    { name: '75% pre-flagged', ratio: 0.75 },
    { name: '100% pre-flagged', ratio: 1.0 },
];

flagDistributions.forEach(dist => {
    group(`Flag distribution: ${dist.name}`, () => {
        variants.forEach(variant => {
            bench(variant, () => {
                createPreFlaggedBenchmark(variant, dist.ratio)();
            });
        });
    });
});

// Micro-benchmark: single node repeated calls
console.log('\n\n' + '='.repeat(70));
console.log('Micro-benchmark: Single node, 1000 sequential calls');
console.log('='.repeat(70));

function createMicroBenchmark(variant) {
    const NodeClass = createNodeFactory(variant);
    const node = new NodeClass(0);
    
    return () => {
        for (let i = 0; i < 1000; i++) {
            node._flag = (i % 3 === 0) ? FLAG_PENDING : 0;
            node.notify(FLAG_STALE, 0);
        }
    };
}

group('Single node repeated', () => {
    variants.forEach(variant => {
        bench(variant, () => {
            createMicroBenchmark(variant)();
        });
    });
});

// Run all benchmarks
await run({
    colors: true,
    format: 'mitata',
    silent: false
});

// Analysis output
console.log('\n\n' + '='.repeat(70));
console.log('PERFORMANCE ANALYSIS');
console.log('='.repeat(70));
console.log(`
Key findings to watch for:

1. Original vs hadFlags: 
   - hadFlags eliminates duplicate code and should be slightly faster
   - Single bitwise OR vs duplicated OR in both branches

2. Logical OR vs hadFlags:
   - Should compile to identical assembly in modern JITs
   - || might be slightly faster due to common short-circuit optimization

3. Impact of flag state distribution:
   - If most nodes are already flagged, branch predictor favors the fast path
   - If few nodes are flagged, _receive() is called more often

4. Graph topology matters:
   - Deep graphs: more sequential, better branch prediction
   - Wide graphs: more parallel, more branch mispredictions

Recommendation:
- Use 'hadFlags' or '||' variant for clarity and performance
- Original version duplicates the OR operation unnecessarily
`);