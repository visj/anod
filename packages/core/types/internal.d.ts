// ─── Flag constants ──────────────────────────────────────────────────

export declare const FLAG_STALE: number;
export declare const FLAG_PENDING: number;
export declare const FLAG_SCHEDULED: number;
export declare const FLAG_DISPOSED: number;
export declare const FLAG_ERROR: number;
export declare const FLAG_RECEIVER: number;
export declare const FLAG_INIT: number;
export declare const FLAG_SETUP: number;
export declare const FLAG_LOADING: number;
export declare const FLAG_DEFER: number;
export declare const FLAG_STABLE: number;
export declare const FLAG_EQUAL: number;
export declare const FLAG_NOTEQUAL: number;
export declare const FLAG_ASYNC: number;
export declare const FLAG_BOUND: number;
export declare const FLAG_WAITER: number;
export declare const FLAG_FIBER: number;
export declare const FLAG_BLOCKED: number;
export declare const FLAG_LOCK: number;
export declare const FLAG_SINGLE: number;
export declare const FLAG_WEAK: number;
export declare const FLAG_EAGER: number;

// ─── Option constants ────────────────────────────────────��───────────

export declare const OPT_DEFER: number;
export declare const OPT_STABLE: number;
export declare const OPT_SETUP: number;
export declare const OPT_WEAK: number;
export declare const OPTIONS: number;

// ─── Internal state ──────────────────────────────────────────────────

export declare let IDLE: boolean;

// ─── Constructors ──────���─────────────────────────────────────────────

export declare class Signal<T = any> {
  constructor(value: T, guard?: ((prev: T, next: T) => boolean) | null);
  _flag: number;
  _value: T;
  _version: number;
  _ctime: number;
  _sub1: any;
  _sub1slot: number;
  _subs: any[] | null;
  _guard: ((prev: T, next: T) => boolean) | null;
}

export declare class Compute<T = any> {
  constructor(opts: number, fn: Function, dep1: any, seed?: T, args?: any);
  _flag: number;
  _value: T;
  _version: number;
  _ctime: number;
  _sub1: any;
  _sub1slot: number;
  _subs: any[] | null;
  _fn: Function | null;
  _dep1: any;
  _dep1slot: number;
  _deps: any[] | null;
  _time: number;
  _cleanup: Function | Function[] | null;
  _args: any;
}

export declare class Effect {
  constructor(opts: number, fn: Function, dep1: any, owner: any, args?: any);
  _flag: number;
  _fn: Function | null;
  _dep1: any;
  _dep1slot: number;
  _deps: any[] | null;
  _version: number;
  _time: number;
  _cleanup: Function | Function[] | null;
  _owned: any[] | null;
  _level: number;
  _owner: any;
  _recover: Function | Function[] | null;
  _args: any;
}

export declare class Root {
  constructor();
  _flag: number;
  _owned: any[] | null;
  _cleanup: Function | Function[] | null;
}

// ─── Internal functions ──────────────────────────────────────────────

export declare function connect(sender: any, receiver: any, depslot: number): number;
export declare function subscribe(receiver: any, sender: any): void;
export declare function schedule(node: any, payload: any, fn: Function): void;
export declare function assignSignal(node: any, value: any): void;
export declare function notify(node: any, flag: number): void;
export declare function flush(): void;
export declare function batch(fn: () => void): void;
export declare function startEffect(node: Effect): void;
export declare function startCompute(node: Compute): void;
export declare function signal<T>(value: T): Signal<T>;
export declare function compute(depOrFn: any, ...args: any[]): Compute;
export declare function task(depOrFn: any, ...args: any[]): Compute;
export declare function effect(depOrFn: any, ...args: any[]): Effect;
export declare function spawn(depOrFn: any, ...args: any[]): Effect;
export declare function root(fn: (c: any) => void): Root;
