import { useEffect } from "react";
import { atom, createStore, Provider, useAtomValue } from "jotai";
import { mountReact } from "../_harness/dom.js";

export async function mount({ api, show }) {
	const store = createStore();
	const likes = atom(0);
	const saving = atom(0);
	/** The last count the server confirmed. */
	let confirmed = 0;
	/** Workaround: numbers the writes, so only the latest one settles the count. */
	let latest = 0;

	const like = atom(null, async (get, set) => {
		const write = ++latest;
		set(likes, get(likes) + 1);
		set(saving, (n) => n + 1);
		try {
			confirmed = await api.like();
		} catch {
			/**
			 * Not a rollback to the value before this click: that was
			 * itself a guess. The latest write lands on the confirmed count.
			 */
		} finally {
			set(saving, (n) => n - 1);
			if (write === latest) {
				set(likes, confirmed);
			}
		}
	});

	/** The first click comes at once, so mount waits for the first render. */
	let rendered;
	const firstRender = new Promise((resolve) => (rendered = resolve));

	function Likes() {
		const n = useAtomValue(likes);
		const text = useAtomValue(saving) > 0 ? `${n} (saving)` : String(n);
		useEffect(() => {
			show(text);
			rendered();
		}, [text]);
		return text;
	}

	const unmount = await mountReact(<Provider store={store}><Likes /></Provider>);
	await firstRender;
	return {
		like: () => store.set(like),
		unmount
	};
}
