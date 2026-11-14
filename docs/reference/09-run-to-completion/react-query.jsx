import { useEffect, useRef, useState } from "react";
import { mountReact } from "../_harness/dom.js";

function App({ api, expose }) {
	const [items, setItems] = useState(["a", "b"]);
	/**
	 * React has no tasks, and a scoped useMutation would queue every
	 * list, not just the latest, so this is a hand-written keepLatest
	 * queue: the next list waits in a ref, and one loop drains it.
	 */
	const next = useRef(null);
	const running = useRef(null);
	const mounted = useRef(true);

	useEffect(() => {
		next.current = items;
		running.current ??= (async () => {
			while (next.current !== null && mounted.current) {
				const list = next.current;
				next.current = null;
				for (const item of list) {
					await api.save(item);
				}
				api.done();
			}
			running.current = null;
		})();
	}, [items]);

	/** The cleanup can't block unmounting, so it chains onto the save in progress. */
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			Promise.resolve(running.current).then(() => api.shutdown());
		};
	}, []);

	useEffect(() => expose({ setItems }), []);
	return null;
}

export async function mount({ api }) {
	const { promise, resolve } = Promise.withResolvers();
	const unmount = await mountReact(<App api={api} expose={resolve} />);
	return { ...(await promise), unmount };
}
