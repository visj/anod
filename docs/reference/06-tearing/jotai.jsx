import { useEffect } from "react";
import { atom, createStore, Provider, useAtomValue } from "jotai";
import { unwrap } from "jotai/utils";
import { mountReact } from "../_harness/dom.js";

/** Stable, since unwrap caches its atom by the fallback's identity. */
const keepPrevious = (prev) => prev;

export async function mount({ api, show }) {
	const store = createStore();
	const userId = atom(1);
	const user = atom((get, { signal }) => api.user(get(userId), signal));
	const posts = atom((get, { signal }) => api.posts(get(userId), signal));
	/**
	 * Awaits both, so it only ever holds a pair from the same user.
	 * While the next pair loads, unwrap keeps the last one.
	 */
	const page = atom(async (get) => {
		const [name, list] = await Promise.all([get(user), get(posts)]);
		return `${name} | ${list.join(", ")}`;
	});
	const view = unwrap(page, keepPrevious);

	function Page() {
		const text = useAtomValue(view) ?? "loading";
		useEffect(() => show(text), [text]);
		return text;
	}

	const unmount = await mountReact(<Provider store={store}><Page /></Provider>);
	return {
		selectUser: (id) => store.set(userId, id),
		unmount
	};
}
