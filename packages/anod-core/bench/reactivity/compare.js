import { readFileSync } from 'fs';

const args = process.argv.slice(2);
if (args.length !== 2) {
    console.error('Usage: node compare.js <baseline.json> <current.json>');
    process.exit(1);
}

const baseline = JSON.parse(readFileSync(args[0], 'utf8'));
const current = JSON.parse(readFileSync(args[1], 'utf8'));

/**
 * Format a time value in nanoseconds to a human-readable string.
 * @param {number} ns
 * @returns {string}
 */
function fmtTime(ns) {
    if (ns >= 1_000_000) {
        return (ns / 1_000_000).toFixed(2) + ' ms';
    }
    if (ns >= 1_000) {
        return (ns / 1_000).toFixed(2) + ' µs';
    }
    return ns.toFixed(2) + ' ns';
}

/**
 * Format a byte value to a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
function fmtBytes(bytes) {
    if (bytes == null) {
        return '-';
    }
    if (bytes >= 1024) {
        return (bytes / 1024).toFixed(2) + ' KB';
    }
    return bytes.toFixed(1) + ' B';
}

/**
 * Format an instruction count to a human-readable string.
 * @param {number} count
 * @returns {string}
 */
function fmtCount(count) {
    if (count == null) {
        return '-';
    }
    if (count >= 1_000_000) {
        return (count / 1_000_000).toFixed(2) + 'M';
    }
    if (count >= 1_000) {
        return (count / 1_000).toFixed(2) + 'k';
    }
    return count.toFixed(0);
}

/**
 * Format a percentage difference with color and arrow.
 * Negative = faster/less = green, positive = slower/more = red.
 * @param {number|null} base
 * @param {number|null} curr
 * @returns {string}
 */
function fmtDiff(base, curr) {
    if (base == null || curr == null) {
        return '-';
    }
    const pct = ((curr - base) / base) * 100;
    const sign = pct > 0 ? '+' : '';
    const arrow = pct > 1 ? ' ▲' : pct < -1 ? ' ▼' : ' ≈';
    const color = pct > 1 ? '\x1b[31m' : pct < -1 ? '\x1b[32m' : '\x1b[90m';
    return `${color}${sign}${pct.toFixed(1)}%${arrow}\x1b[0m`;
}

/** Pad or truncate a string to a given width. */
function pad(str, width) {
    if (str.length >= width) {
        return str.slice(0, width);
    }
    return str + ' '.repeat(width - str.length);
}

/** Right-align a string to a given width. */
function rpad(str, width) {
    const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
    const padding = width - stripped.length;
    if (padding <= 0) {
        return str;
    }
    return ' '.repeat(padding) + str;
}

const hasCounters = Object.values(baseline.benchmarks).some(b => b.cycles != null);

console.log();
console.log(`\x1b[1mBaseline:\x1b[0m ${baseline.name} (${baseline.date}) — ${baseline.cpu}`);
console.log(`\x1b[1mCurrent:\x1b[0m  ${current.name} (${current.date}) — ${current.cpu}`);
console.log(`\x1b[1mRuntime:\x1b[0m  ${baseline.runtime} vs ${current.runtime}`);
console.log();

const nameW = 36;
const colW = 12;
const diffW = 10;

let header = pad('Benchmark', nameW)
    + rpad('avg (B)', colW) + rpad('avg (C)', colW) + rpad('diff', diffW)
    + rpad('heap (B)', colW) + rpad('heap (C)', colW) + rpad('diff', diffW);
if (hasCounters) {
    header += rpad('instr (B)', colW) + rpad('instr (C)', colW) + rpad('diff', diffW);
    header += rpad('cycles (B)', colW) + rpad('cycles (C)', colW) + rpad('diff', diffW);
}
console.log('\x1b[90m' + '-'.repeat(header.replace(/\x1b\[[0-9;]*m/g, '').length) + '\x1b[0m');
console.log('\x1b[1m' + header + '\x1b[0m');
console.log('\x1b[90m' + '-'.repeat(header.replace(/\x1b\[[0-9;]*m/g, '').length) + '\x1b[0m');

const allNames = new Set([
    ...Object.keys(baseline.benchmarks),
    ...Object.keys(current.benchmarks),
]);

for (const name of allNames) {
    const b = baseline.benchmarks[name];
    const c = current.benchmarks[name];
    if (!b || !c) {
        console.log(pad(name, nameW) + '  (missing in ' + (!b ? 'baseline' : 'current') + ')');
        continue;
    }
    let line = pad(name, nameW)
        + rpad(fmtTime(b.avg), colW) + rpad(fmtTime(c.avg), colW) + rpad(fmtDiff(b.avg, c.avg), diffW)
        + rpad(fmtBytes(b.heap), colW) + rpad(fmtBytes(c.heap), colW) + rpad(fmtDiff(b.heap, c.heap), diffW);
    if (hasCounters) {
        line += rpad(fmtCount(b.instructions), colW) + rpad(fmtCount(c.instructions), colW) + rpad(fmtDiff(b.instructions, c.instructions), diffW);
        line += rpad(fmtCount(b.cycles), colW) + rpad(fmtCount(c.cycles), colW) + rpad(fmtDiff(b.cycles, c.cycles), diffW);
    }
    console.log(line);
}

console.log('\x1b[90m' + '-'.repeat(header.replace(/\x1b\[[0-9;]*m/g, '').length) + '\x1b[0m');
console.log();
console.log('\x1b[90m▼ = improved (>1%)  ▲ = regressed (>1%)  ≈ = within noise (±1%)\x1b[0m');
console.log();
