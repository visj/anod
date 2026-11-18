import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { mountReact } from "../_harness/dom.js";

function App({ api, show, expose }) {
	const [query, setQuery] = useState("a");
	/**
	 * Each query has its own cache entry, so a late response for "a"
	 * can't land on "ab". Reading the signal lets TanStack abort "a"
	 * once nothing observes it.
	 */
	const { data, isPending } = useQuery({
		queryKey: ["search", query],
		queryFn: ({ signal }) => api.search(query, signal)
	});
	const text = isPending ? "searching" : `${data.items.length} results for ${data.q}`;

	useEffect(() => show(text), [text]);
	useEffect(() => expose({ type: setQuery }), []);
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
