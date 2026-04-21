import { ISignal, Signal } from "@fyren/core";

export interface IGate<T> extends ISignal<T> {
  check(fn: (newVal: T, oldVal: T) => boolean): IGate<T>;
  guard(fn: (value: T) => boolean): IGate<T>;
}

export declare class Gate<T> extends Signal<T> implements IGate<T> {
  constructor(value: T);
  check(fn: (newVal: T, oldVal: T) => boolean): this;
  guard(fn: (value: T) => boolean): this;
}

export declare function gate<T>(value: T): IGate<T>;
