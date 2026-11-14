import { useEffect } from "react";
import { atom, createStore, Provider, useAtomValue } from "jotai";
import { unwrap } from "jotai/utils";
import { mountReact } from "../_harness/dom.js";

/**
 * While the next page loads, unwrap shows what this returns, given the
 * last page. Stable, since unwrap caches its atom by this function.
 */
const stale = (prev) => prev && { ...prev, updating: true };

export async function mount({ api, show }) {
	const store = createStore();
	const page = atom(1);
	const list = atom((get, { signal }) => api.page(get(page), signal));
	const view = unwrap(list, stale);

	function List() {
		const data = useAtomValue(view);
		let text = "loading";
		if (data !== void 0) {
			text = `page ${data.n}: ${data.items.join(", ")}${data.updating ? " (updating)" : ""}`;
		}
		useEffect(() => show(text), [text]);
		return text;
	}

	const unmount = await mountReact(<Provider store={store}><List /></Provider>);
	return {
		setPage: (n) => store.set(page, n),
		unmount
	};
}
