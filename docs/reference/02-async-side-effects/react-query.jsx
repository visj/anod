import { useEffect, useState } from "react";
import { mountReact } from "../_harness/dom.js";

function App({ api, expose }) {
	const [selected, setSelected] = useState(1);

	/**
	 * No query here, only an effect. Its cleanup aborts the load, but
	 * decode() can't be cancelled, so the run checks the signal itself
	 * after each await, and has to swallow its own AbortError.
	 */
	useEffect(() => {
		const controller = new AbortController();
		const { signal } = controller;
		(async () => {
			const bytes = await api.load(selected, signal);
			const image = await api.decode(bytes);
			if (!signal.aborted) {
				api.draw(image);
			}
		})().catch((err) => {
			if (err.name !== "AbortError") {
				throw err;
			}
		});
		return () => controller.abort();
	}, [selected]);

	useEffect(() => expose({ select: setSelected }), []);
	return null;
}

export async function mount({ api }) {
	const { promise, resolve } = Promise.withResolvers();
	const unmount = await mountReact(<App api={api} expose={resolve} />);
	return { ...(await promise), unmount };
}
