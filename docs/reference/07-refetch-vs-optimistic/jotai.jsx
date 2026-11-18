import { useEffect } from "react";
import { atom, createStore, Provider, useAtomValue } from "jotai";
import { mountReact } from "../_harness/dom.js";

export async function mount({ api, show }) {
	const store = createStore();
	const todos = atom(["a"]);
	/** Workaround: the refetch in flight, so a write can cancel it. */
	const inflight = atom(null);

	const refetch = atom(null, async (get, set) => {
		const controller = new AbortController();
		set(inflight, controller);
		try {
			set(todos, await api.list(controller.signal));
		} catch (err) {
			if (err.name !== "AbortError") {
				throw err;
			}
		}
	});
	/** An optimistic write: cancels the refetch, whose snapshot predates it. */
	const add = atom(null, async (get, set, text) => {
		get(inflight)?.abort();
		set(todos, [...get(todos), text]);
		await api.add(text);
	});

	function Todos() {
		const text = useAtomValue(todos).join(", ");
		useEffect(() => show(text), [text]);
		return text;
	}

	const unmount = await mountReact(<Provider store={store}><Todos /></Provider>);
	return {
		refetch: () => store.set(refetch),
		add: (text) => store.set(add, text),
		unmount
	};
}
