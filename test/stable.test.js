import { describe, test, expect } from "#test-runner";
import { signal, root, c } from "#anod";

describe("stable compute", () => {
	test("val() returns stale value for unread compute (version 0 collision)", () => {
		/**
		 * A compute node created but never pulled has _version = 0.
		 * A stable compute's _update doesn't bump VERSION, so VERSION
		 * stays at 0 (restored after all setups). When the stable node
		 * conditionally reads the unread compute for the first time:
		 *
		 *   if (sender._version === version) return sender._value;
		 *
		 * evaluates 0 === 0 → true, returning _value without checking
		 * FLAG_STALE. The compute never refreshes.
		 */
		const trigger = signal(1);
		const stableTrigger = signal("a");

		// The "victim" compute: created but never pulled during setup.
		// It reads trigger, so when trigger changes it becomes stale.
		const victim = c.compute((cx) => cx.val(trigger) * 10);
		// Don't pull victim! Its _version stays at 0.

		// Stable compute that conditionally reads victim
		let branch = false;
		const stable = c.compute((cx) => {
			cx.val(stableTrigger); // setup dep
			cx.stable();
			if (branch) {
				return cx.val(victim); // new dep in stable mode
			}
			return -1;
		});

		// Run setup
		expect(stable.get()).toBe(-1);

		// Now make victim stale
		trigger.set(2);

		// Switch branch so stable reads victim on next run
		branch = true;
		stableTrigger.set("b"); // marks stable as stale

		// stable re-runs in stable mode, reads victim for the first time.
		// victim._version is 0, VERSION is 0 → collision!
		// Should return 20 (trigger=2, 2*10), but might return undefined/0 (initial _value)
		expect(stable.get()).toBe(20);
	});

	test("val() returns stale value: victim was pulled once then went stale (setup stamps persist)", () => {
		/**
		 * Variant: the victim WAS pulled during the outer stable node's
		 * setup (so its _version got stamped to the setup VERSION).
		 * After setup, VERSION restores to 0. Later, a DIFFERENT setup
		 * node happens to stamp with the same VERSION number? No — SEED
		 * only increases. But what about the case where the victim is
		 * read during stable mode by a different stable node?
		 *
		 * This variant just confirms the fix also handles the case where
		 * victim._version = 0 because it was never read.
		 */
		const s1 = signal(1);
		const s2 = signal(100);

		// victim: never pulled
		const victim = c.compute((cx) => cx.val(s1) + 1);

		// stable outer: reads s2 in setup, conditionally reads victim later
		let readVictim = false;
		const outer = c.compute((cx) => {
			const base = cx.val(s2);
			cx.stable();
			if (readVictim) {
				return base + cx.val(victim);
			}
			return base;
		});

		expect(outer.get()).toBe(100);

		// Make victim stale
		s1.set(5);

		// Now enable reading victim
		readVictim = true;
		s2.set(200);

		// Should be 200 + (5+1) = 206
		expect(outer.get()).toBe(206);
	});
});
