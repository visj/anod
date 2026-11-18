import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { mountReact } from "../_harness/dom.js";

function App({ api, show, expose }) {
	const [language, setLanguage] = useState("en");
	/**
	 * The fetch doesn't depend on the language, so it isn't in the key.
	 * The translation is a select, which runs again when its closure
	 * changes, without fetching again.
	 */
	const { data } = useQuery({
		queryKey: ["doc", 1],
		queryFn: () => api.doc(1),
		select: (doc) => (doc.translatable ? api.translate(doc.text, language) : doc.text)
	});
	const text = data ?? "loading";

	useEffect(() => show(text), [text]);
	useEffect(() => expose({ setLanguage }), []);
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
