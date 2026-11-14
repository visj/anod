/**
 * A callback API that can't be cancelled, like geolocation or an old
 * SDK: lookup(name, onDone, onError). The user looks up "A", which is
 * slow, then "B" before "A" has answered. "A"'s callback still fires,
 * later, and must be ignored.
 *
 * app: lookup(name). The app starts by looking up "A".
 */
export function createApi(ctx) {
	return {
		lookup(name, onDone, onError) {
			ctx.event(`lookup ${name}`);
			setTimeout(() => onDone({ name, id: name.charCodeAt(0) }), name === "A" ? 80 : 20);
		}
	};
}

export async function drive(app, { wait }) {
	await wait(10);
	app.lookup("B");
	await wait(120);
}

export const expected = {
	shown: ["looking up A", "looking up B", "B is #66"],
	events: ["lookup A", "lookup B"]
};

export const gaps = {
	anod: "a task that starts loading again doesn't tell its readers, so c.pending() never sees it (see ../README.md)"
};
