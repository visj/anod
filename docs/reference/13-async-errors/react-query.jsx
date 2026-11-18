import { useEffect } from "react";
import { MutationCache, QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { mountReact } from "../_harness/dom.js";

function App({ api, show, expose }) {
	/** retry: false, or the first failure would be retried before it is shown. */
	const { data, error, isPending, refetch } = useQuery({
		queryKey: ["data"],
		queryFn: () => api.load(),
		retry: false
	});
	const text = isPending ? "loading" : error ? `error: ${error.message}` : `data: ${data}`;

	/** A mutation, so its failure goes to the MutationCache's onError. */
	const { mutate: sendAnalytics } = useMutation({ mutationFn: () => api.sendAnalytics() });
	useEffect(() => sendAnalytics(), []);

	useEffect(() => show(text), [text]);
	useEffect(() => expose({ retry: refetch }), []);
	return <p>{text}</p>;
}

export async function mount({ api, show }) {
	/** The app-level handler. Query errors are rendered, so only mutations report here. */
	const client = new QueryClient({
		mutationCache: new MutationCache({ onError: (err) => api.report(err) })
	});
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
