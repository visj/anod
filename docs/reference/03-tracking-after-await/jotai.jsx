import { useEffect } from "react";
import { atom, createStore, Provider, useAtomValue } from "jotai";
import { unwrap } from "jotai/utils";
import { mountReact } from "../_harness/dom.js";

/** Stable, since unwrap caches its atom by the fallback's identity. */
const keepPrevious = (prev) => prev;

export async function mount({ api, show }) {
	const store = createStore();
	const language = atom("en");
	const doc = atom(() => api.doc(1));
	const view = atom(async (get) => {
		const { text, translatable } = await get(doc);
		/** Read after the await, and still tracked. */
		return translatable ? api.translate(text, get(language)) : text;
	});
	/** Keeps the old text while the new one resolves, a microtask later. */
	const shown = unwrap(view, keepPrevious);

	function Doc() {
		const text = useAtomValue(shown) ?? "loading";
		useEffect(() => show(text), [text]);
		return text;
	}

	const unmount = await mountReact(<Provider store={store}><Doc /></Provider>);
	return {
		setLanguage: (lang) => store.set(language, lang),
		unmount
	};
}
