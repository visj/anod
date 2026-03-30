/** interface for a reactive framework.
 *
 * Implement this interface to add a new reactive framework to the test and performance test suite.
 */
export interface ReactiveFramework {
	name: string
	signal<T>(initialValue: T): Signal<T>
	computed<T>(fn: () => T): Computed<T>
	effect(fn: () => any): any
	withBatch<T>(fn: () => T): any
	withBuild<T>(fn: () => T): T
}

export interface Signal<T> {
	val(): T
	set(v: T): void
}

export interface Computed<T> {
	val(): T
}
