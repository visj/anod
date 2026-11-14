import { useEffect } from "react";
import { atom, createStore, Provider, useAtomValue } from "jotai";
import { mountReact } from "../_harness/dom.js";

export async function mount({ api, show }) {
	const store = createStore();
	const channel = atom("A");
	/**
	 * An atom per channel, holding its last message. onMount opens the
	 * socket when a component first subscribes, and the returned
	 * function closes it when the last one leaves.
	 */
	const messages = atom((get) => {
		const name = get(channel);
		const last = atom("waiting");
		last.onMount = (set) => {
			const socket = api.connect(name, set);
			return () => socket.close();
		};
		return last;
	});

	function Chat() {
		const name = useAtomValue(channel);
		const last = useAtomValue(useAtomValue(messages));
		const text = `${name}: ${last}`;
		useEffect(() => show(text), [text]);
		return text;
	}

	const unmount = await mountReact(<Provider store={store}><Chat /></Provider>);
	return {
		setChannel: (name) => store.set(channel, name),
		unmount
	};
}
