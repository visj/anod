import { useEffect } from "react";
import { atom, createStore, Provider, useAtomValue } from "jotai";
import { mountReact } from "../_harness/dom.js";

export async function mount({ api }) {
	const store = createStore();
	const selected = atom(1);

	/**
	 * A plain useEffect: jotai-effect's atomEffect is synchronous too,
	 * so it would need the same controller and checks.
	 */
	function Canvas() {
		const id = useAtomValue(selected);
		useEffect(() => {
			const controller = new AbortController();
			const { signal } = controller;
			(async () => {
				const bytes = await api.load(id, signal);
				const image = await api.decode(bytes);
				/** decode can't be aborted, so check before drawing. */
				if (!signal.aborted) {
					api.draw(image);
				}
			})().catch((err) => {
				if (err.name !== "AbortError") {
					throw err;
				}
			});
			return () => controller.abort();
		}, [id]);
		return null;
	}

	const unmount = await mountReact(<Provider store={store}><Canvas /></Provider>);
	return {
		select: (id) => store.set(selected, id),
		unmount
	};
}
