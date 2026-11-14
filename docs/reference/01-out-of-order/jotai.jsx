import { useEffect } from "react";
import { atom, createStore, Provider, useAtomValue } from "jotai";
import { unwrap } from "jotai/utils";
import { mountReact } from "../_harness/dom.js";

export async function mount({ api, show }) {
	const store = createStore();
	const query = atom("a");
	/** A new query aborts the signal, and the stale promise is dropped. */
	const results = atom((get, { signal }) => api.search(get(query), signal));
	/**
	 * unwrap instead of Suspense: React holds a revealed boundary back
	 * for up to 300ms after a fallback, longer than this scenario runs.
	 */
	const view = unwrap(results);

	function Search() {
		const data = useAtomValue(view);
		const text = data === void 0 ? "searching" : `${data.items.length} results for ${data.q}`;
		useEffect(() => show(text), [text]);
		return text;
	}

	const unmount = await mountReact(<Provider store={store}><Search /></Provider>);
	return {
		type: (q) => store.set(query, q),
		unmount
	};
}
