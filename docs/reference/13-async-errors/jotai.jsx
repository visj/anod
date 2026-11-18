import { useEffect } from "react";
import { atom, createStore, Provider, useAtomValue } from "jotai";
import { atomWithRefresh, unwrap } from "jotai/utils";
import { mountReact } from "../_harness/dom.js";

const loading = () => "loading";

export async function mount({ api, show }) {
	const store = createStore();
	/** Setting it with no arguments loads again. */
	const data = atomWithRefresh(() => api.load());
	/**
	 * Jotai 3 dropped loadable(), and unwrap rethrows, so the error is
	 * turned into a value here rather than caught by an error boundary.
	 */
	const view = unwrap(
		atom((get) => get(data).then((v) => `data: ${v}`, (err) => `error: ${err.message}`)),
		loading
	);

	function Data() {
		const text = useAtomValue(view);
		useEffect(() => show(text), [text]);
		return text;
	}

	/**
	 * React has no app-level handler for async errors: an error
	 * boundary only sees render errors, so each effect catches its own.
	 */
	function Analytics() {
		useEffect(() => {
			api.sendAnalytics().catch((err) => api.report(err));
		}, []);
		return null;
	}

	const unmount = await mountReact(
		<Provider store={store}>
			<Data />
			<Analytics />
		</Provider>
	);
	return {
		retry: () => store.set(data),
		unmount
	};
}
