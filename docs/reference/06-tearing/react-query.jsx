import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider, useQueries } from "@tanstack/react-query";
import { mountReact } from "../_harness/dom.js";

function App({ api, show, expose }) {
	const [userId, setUserId] = useState(1);
	/** Both keys come from the same id, so a complete pair is never torn. */
	const pair = useQueries({
		queries: [
			{ queryKey: ["user", userId], queryFn: ({ signal }) => api.user(userId, signal) },
			{ queryKey: ["posts", userId], queryFn: ({ signal }) => api.posts(userId, signal) }
		],
		combine: ([user, posts]) =>
			user.isSuccess && posts.isSuccess ? `${user.data} | ${posts.data.join(", ")}` : undefined
	});
	/**
	 * Workaround: keepPreviousData works per query, so the user would
	 * switch before the posts. The last complete pair is kept in state
	 * instead, set during render as React's docs describe for values
	 * from previous renders. (Suspense with a transition holds the old
	 * pair too, but React delays revealing content 300ms after a
	 * fallback, so the first pair would show after the switch.)
	 */
	const [last, setLast] = useState("loading");
	if (pair !== undefined && pair !== last) {
		setLast(pair);
	}
	const text = pair ?? last;

	useEffect(() => show(text), [text]);
	useEffect(() => expose({ selectUser: setUserId }), []);
	return <p>{text}</p>;
}

export async function mount({ api, show }) {
	const client = new QueryClient();
	const { promise, resolve } = Promise.withResolvers();
	const unmount = await mountReact(
		<QueryClientProvider client={client}>
			<App api={api} show={show} expose={resolve} />
		</QueryClientProvider>
	);
	return {
		...(await promise),
		unmount: async () => {
			await unmount();
			client.clear();
		}
	};
}
