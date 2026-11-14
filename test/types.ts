/**
 * Type tests, checked by `tsc -p .`: each line fails to compile if a
 * type is wrong. Nothing here runs.
 */
import { root } from "../types/index.js";
import type {
	Task,
	Resource,
	Spawn,
	Compute,
	ReadonlySignal,
	Context,
	Reader,
} from "../types/index.js";

type Equal<A, B> =
	(<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
		? true
		: false;
function expectType<A>() {
	return <B>(value: B & (Equal<A, B> extends true ? unknown : never)) => value;
}

type User = { name: string; orgId: number };
declare const userId: Task<number>;
declare const flag: Resource<boolean>;
declare function fetchUser(id: number): Promise<User>;
declare function org(id: number): Task<{ title: string }>;

root((r) => {
	// One step: a returned promise is adopted
	expectType<Task<User>>()(r.task((c) => c.suspend(userId, (id) => fetchUser(id))));

	// Two steps
	expectType<Task<number>>()(
		r.task((c) =>
			c.suspend(userId, (id) => c.suspend(fetchUser(id), (u) => u.name.length))
		)
	);

	// One arm returns a value, the other suspends
	expectType<Task<string>>()(
		r.task((c) =>
			c.suspend(userId, (id) =>
				id < 0 ? "guest" : c.suspend(org(id), (o) => o.title)
			)
		)
	);

	// onReject joins the value
	expectType<Task<number | null>>()(
		r.task((c) => c.suspend(userId, (id) => id, () => null))
	);

	// An async callback
	expectType<Task<string>>()(
		r.task((c) =>
			c.suspend(userId, async (id) => {
				const u = await c.suspend(fetchUser(id));
				return u.name;
			})
		)
	);

	// Arrays of tasks, resources and promises
	expectType<Task<string>>()(
		r.task((c) =>
			c.suspend([userId, flag, fetchUser(1)], ([id, on, u]) =>
				on ? u.name : String(id)
			)
		)
	);

	// The setup-fn form
	expectType<Task<number>>()(r.task((c) => c.suspend<number>((resolve) => resolve(1))));

	// A step that isn't returned: name the value
	expectType<Task<string>>()(
		r.task<string>((c) => {
			c.suspend(userId, (id) => String(id));
		})
	);

	// Bound
	expectType<Task<User>>()(
		r.task(userId, (id, c) => c.suspend(fetchUser(id), (u) => u))
	);

	// The await form is unchanged
	expectType<Task<User>>()(
		r.task(async (c) => c.suspend(fetchUser(await c.suspend(userId))))
	);

	// A spawn takes either form
	expectType<Spawn>()(
		r.spawn((c) => {
			c.suspend(userId, (id) => fetchUser(id));
		})
	);
	expectType<Spawn>()(r.spawn((c) => c.suspend(userId, (id) => id)));
	expectType<Spawn>()(
		r.spawn(async (c) => {
			await c.suspend(userId);
		})
	);

	// A step has no members
	r.task((c) => {
		const step = c.suspend(userId, (id) => id);
		// @ts-expect-error
		step.then;
		return step;
	});

	// A wrong value is caught
	// @ts-expect-error
	expectType<Task<string>>()(r.task((c) => c.suspend(userId, (id) => id)));
});

// A ReadonlySignal is read wherever a node is read (bug 42)
declare const count: ReadonlySignal<number>;
function watch(c: Context & Reader) {
	expectType<number>()(c.val(count));
	expectType<number>()(c.defer(count));
	expectType<boolean>()(c.pending(count));
	expectType<boolean>()(c.pending([count, flag]));
	c.rejected(count);
	// A write still wants a writable node
	// @ts-expect-error
	c.set(count, 1);
}
root((r) => {
	expectType<Compute<string>>()(r.compute(count, (n) => String(n)));
	expectType<Task<number>>()(r.task(count, async (n) => n + 1));
	r.effect(count, (n, c) => {
		expectType<number>()(n);
		expectType<number>()(c.defer(count));
	});
	r.spawn(count, async (n) => {
		expectType<number>()(n);
	});
	r.action(count, (n) => {
		expectType<number>()(n);
	});
	// A compute or task can't be written to
	r.effect((c) => {
		// @ts-expect-error
		c.set(r.compute(count, (n) => n), 1);
		// @ts-expect-error
		c.set(userId, 1);
		c.set(flag, true);
	});
	// A concrete node still gives its own value type
	expectType<Compute<boolean>>()(r.compute(flag, (b) => !b));
	expectType<Compute<number>>()(r.compute(userId, (id) => id * 2));
});
