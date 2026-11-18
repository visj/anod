import { useEffect } from "react";
import { atom, createStore, Provider, useAtomValue } from "jotai";
import { mountReact } from "../_harness/dom.js";

export async function mount({ api, show }) {
	const store = createStore();
	const price = atom(10);
	const quantity = atom(1);
	const total = atom((get) => get(price) * get(quantity));

	function Cart() {
		const text = `total ${useAtomValue(total)}`;
		useEffect(() => show(text), [text]);
		return text;
	}

	const unmount = await mountReact(<Provider store={store}><Cart /></Provider>);
	return {
		setQuantity(n) {
			store.set(quantity, n);
			/** The store is synchronous: a derived atom is fresh right after set(). */
			api.track(store.get(total));
		},
		unmount
	};
}
