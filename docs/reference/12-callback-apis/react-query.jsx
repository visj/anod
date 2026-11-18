import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { mountReact } from "../_harness/dom.js";

function App({ api, show, expose }) {
	const [name, setName] = useState("A");
	/**
	 * A queryFn only needs a promise. "A"'s late callback resolves the
	 * entry for "A", which nothing is showing any more.
	 */
	const { data, isPending } = useQuery({
		queryKey: ["lookup", name],
		queryFn: () => new Promise((resolve, reject) => api.lookup(name, resolve, reject))
	});
	const text = isPending ? `looking up ${name}` : `${data.name} is #${data.id}`;

	useEffect(() => show(text), [text]);
	useEffect(() => expose({ lookup: setName }), []);
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
