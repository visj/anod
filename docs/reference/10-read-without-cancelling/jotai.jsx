import { useEffect } from "react";
import { atom, createStore, Provider, useAtomValue } from "jotai";
import { unwrap } from "jotai/utils";
import { mountReact } from "../_harness/dom.js";

/** Stable, since unwrap caches its atom by the fallback's identity. */
const keepPrevious = (prev) => prev;

export async function mount({ api, show }) {
	const store = createStore();
	const token = atom("t1");
	/**
	 * Workaround: every get() is tracked, and a change aborts the read,
	 * so the request reads a copy that only follows token between requests.
	 */
	const requestToken = atom("t1");
	const data = atom((get, { signal }) => api.data(get(requestToken), signal));
	const setToken = atom(null, async (get, set, t) => {
		set(token, t);
		await get(data).catch(() => {});
		set(requestToken, get(token));
	});
	const view = unwrap(data, keepPrevious);

	function Data() {
		const text = useAtomValue(view) ?? "loading";
		useEffect(() => show(text), [text]);
		return text;
	}

	const unmount = await mountReact(<Provider store={store}><Data /></Provider>);
	return {
		setToken: (t) => store.set(setToken, t),
		unmount
	};
}
