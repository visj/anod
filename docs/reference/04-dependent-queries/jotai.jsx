import { useEffect } from "react";
import { atom, createStore, Provider, useAtomValue } from "jotai";
import { unwrap } from "jotai/utils";
import { mountReact } from "../_harness/dom.js";

export async function mount({ api, show }) {
	const store = createStore();
	const userId = atom(1);
	const user = atom((get, { signal }) => api.user(get(userId), signal));
	/** Awaits the user atom: no enabled flag, and no undefined to handle. */
	const projects = atom(async (get, { signal }) => {
		const { team } = await get(user);
		return api.projects(team, signal);
	});
	/** unwrap, not Suspense: see 01-out-of-order/jotai.jsx. */
	const userView = unwrap(user);
	const projectsView = unwrap(projects);

	function Projects() {
		const u = useAtomValue(userView);
		const list = useAtomValue(projectsView);
		const text = u === void 0 || list === void 0 ? "loading" : `${u.name}: ${list.join(", ")}`;
		useEffect(() => show(text), [text]);
		return text;
	}

	const unmount = await mountReact(<Provider store={store}><Projects /></Provider>);
	return {
		selectUser: (id) => store.set(userId, id),
		unmount
	};
}
