import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider, keepPreviousData, useQuery } from "@tanstack/react-query";
import { mountReact } from "../_harness/dom.js";

function App({ api, show, expose }) {
	const [page, setPage] = useState(1);
	/** keepPreviousData shows the last page while the next one loads. */
	const { data, isPlaceholderData } = useQuery({
		queryKey: ["page", page],
		queryFn: ({ signal }) => api.page(page, signal),
		placeholderData: keepPreviousData
	});
	let text = "loading";
	if (data !== undefined) {
		text = `page ${data.n}: ${data.items.join(", ")}`;
		if (isPlaceholderData) {
			text += " (updating)";
		}
	}

	useEffect(() => show(text), [text]);
	useEffect(() => expose({ setPage }), []);
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
