/**
 * Runs every example in every framework and checks that they all
 * produce the scenario's expected log.
 *
 *   npm run docs:check              # everything
 *   npm run docs:check -- 07        # examples whose folder starts with 07
 *   npm run docs:check -- --fw=solid
 *   npm run docs:check -- -v        # print each log
 *
 * An example folder holds:
 *   scenario.js   createApi(ctx), drive(app, ctx), expected { shown, events? }
 *   anod.js, solid.js, react-query.jsx, jotai.jsx, svelte.js
 *     each exports mount(ctx) => app: the scenario's controls, plus unmount()
 *   gaps (optional, in scenario.js)  { framework: "why" } for a framework
 *     that can't produce the expected log today. Its mismatch is reported
 *     but doesn't fail the run; a match is reported, so the gap is removed.
 *
 * ctx.show(text) records what the UI displays. Consecutive duplicates
 * are collapsed, since a framework may render the same text twice.
 * ctx.event(text) records a side effect (a save, an abort, a socket
 * closing). Only the order of each list is compared, not the timing.
 * expected.order, a list of [shown, event] pairs, also requires that
 * text to be shown before that event is recorded.
 */
import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import "./dom.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FRAMEWORKS = [
	["anod", "anod.js"],
	["react-query", "react-query.jsx"],
	["solid", "solid.js"],
	["jotai", "jotai.jsx"],
	["svelte", "svelte.js"]
];

const args = process.argv.slice(2);
const verbose = args.includes("-v");
const fwArg = args.find((a) => a.startsWith("--fw="));
const only = fwArg ? fwArg.slice(5).split(",") : null;
const filters = args.filter((a) => !a.startsWith("-"));

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function createCtx() {
	const shown = [];
	const events = [];
	const errors = [];
	const t0 = performance.now();
	const at = () => String(Math.round(performance.now() - t0)).padStart(4);
	const timeline = [];
	const trace = [];
	return {
		trace,
		shown,
		events,
		errors,
		timeline,
		wait,
		show(text) {
			text = String(text);
			timeline.push(`${at()} show  ${text}`);
			trace.push(`show ${text}`);
			if (shown[shown.length - 1] !== text) {
				shown.push(text);
			}
		},
		event(text) {
			timeline.push(`${at()} event ${text}`);
			trace.push(`event ${text}`);
			events.push(String(text));
		}
	};
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function runOne(dir, file, scenario) {
	const ctx = createCtx();
	const onError = (e) => {
		ctx.errors.push(e && e.message ? e.message : String(e));
	};
	process.on("unhandledRejection", onError);
	try {
		const impl = await import(join(dir, file));
		ctx.api = scenario.createApi(ctx);
		const app = await impl.mount(ctx);
		await scenario.drive(app, ctx);
		await app.unmount();
		await wait(scenario.settle ?? 100);
	} catch (e) {
		onError(e);
	} finally {
		process.off("unhandledRejection", onError);
	}
	const expected = scenario.expected;
	let ok = ctx.errors.length === 0 && same(ctx.shown, expected.shown);
	if (expected.events !== void 0 && !same(ctx.events, expected.events)) {
		ok = false;
	}
	for (const [text, event] of expected.order ?? []) {
		const i = ctx.trace.indexOf(`show ${text}`);
		const j = ctx.trace.indexOf(`event ${event}`);
		if (i < 0 || j < 0 || i > j) {
			ok = false;
			ctx.errors.push(`expected "${text}" to be shown before "${event}"`);
		}
	}
	return { ok, ctx };
}

let failed = 0;
const examples = readdirSync(ROOT)
	.filter((d) => /^\d\d-/.test(d) && existsSync(join(ROOT, d, "scenario.js")))
	.filter((d) => filters.length === 0 || filters.some((f) => d.startsWith(f)))
	.sort();

for (const name of examples) {
	const dir = join(ROOT, name);
	const scenario = await import(join(dir, "scenario.js"));
	console.log(`\n${name}`);
	for (const [fw, file] of FRAMEWORKS) {
		if (only && !only.includes(fw)) {
			continue;
		}
		if (!existsSync(join(dir, file))) {
			console.log(`  -  ${fw.padEnd(12)} (missing)`);
			continue;
		}
		const { ok, ctx } = await runOne(dir, file, scenario);
		const gap = scenario.gaps?.[fw];
		if (gap !== void 0) {
			console.log(ok ? `  !  ${fw}  matches now: remove its gap` : `  ~  ${fw}  known gap: ${gap}`);
			if (ok) {
				failed++;
			}
		} else {
			console.log(`  ${ok ? "✓" : "✗"}  ${fw}`);
		}
		if ((!ok && gap === void 0) || verbose) {
			if (!ok) {
				failed++;
				console.log(`       expected shown: ${JSON.stringify(scenario.expected.shown)}`);
				if (scenario.expected.events) {
					console.log(`       expected events: ${JSON.stringify(scenario.expected.events)}`);
				}
			}
			console.log(`       shown:  ${JSON.stringify(ctx.shown)}`);
			console.log(`       events: ${JSON.stringify(ctx.events)}`);
			for (const e of ctx.errors) {
				console.log(`       error:  ${e}`);
			}
			if (verbose) {
				for (const line of ctx.timeline) {
					console.log(`         ${line}`);
				}
			}
		}
	}
}

console.log(failed === 0 ? "\nAll examples match." : `\n${failed} run(s) differ.`);
process.exit(failed === 0 ? 0 : 1);
