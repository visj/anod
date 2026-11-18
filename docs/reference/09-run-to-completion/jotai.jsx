import { useEffect } from "react";
import { atom, createStore, Provider, useAtomValue } from "jotai";
import { mountReact } from "../_harness/dom.js";

export async function mount({ api }) {
	const store = createStore();
	const items = atom(["a", "b"]);

	/**
	 * Workaround: neither Jotai nor React has a keepLatest job, so this
	 * runs one by hand. A change while a save runs queues the latest
	 * list, and the lists in between are overwritten.
	 */
	let running = null;
	let queued = null;
	let stopped = false;
	async function save(list) {
		while (list) {
			for (const item of list) {
				await api.save(item);
			}
			api.done();
			list = stopped ? null : queued;
			queued = null;
		}
		running = null;
	}

	function Saver() {
		const list = useAtomValue(items);
		useEffect(() => {
			if (running) {
				queued = list;
			} else {
				running = save(list);
			}
		}, [list]);
		return null;
	}

	const unmountReact = await mountReact(<Provider store={store}><Saver /></Provider>);
	return {
		setItems: (list) => store.set(items, list),
		/** React can't wait in a cleanup, so unmount waits for the save itself. */
		async unmount() {
			stopped = true;
			await unmountReact();
			await running;
			api.shutdown();
		}
	};
}
