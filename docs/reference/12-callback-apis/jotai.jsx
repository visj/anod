import { useEffect } from "react";
import { atom, createStore, Provider, useAtomValue } from "jotai";
import { unwrap } from "jotai/utils";
import { mountReact } from "../_harness/dom.js";

export async function mount({ api, show }) {
	const store = createStore();
	const name = atom("A");
	/**
	 * Wrapped in a promise. A resolve from a replaced promise settles
	 * a promise nothing reads any more, so it is ignored.
	 */
	const result = atom((get) => new Promise((resolve, reject) => api.lookup(get(name), resolve, reject)));
	const view = unwrap(result);

	function Lookup() {
		const n = useAtomValue(name);
		const data = useAtomValue(view);
		const text = data === void 0 ? `looking up ${n}` : `${data.name} is #${data.id}`;
		useEffect(() => show(text), [text]);
		return text;
	}

	const unmount = await mountReact(<Provider store={store}><Lookup /></Provider>);
	return {
		lookup: (n) => store.set(name, n),
		unmount
	};
}
