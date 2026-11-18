import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { mountReact } from "../_harness/dom.js";

const dataKey = ["data"];

function App({ api, show, expose }) {
	const queryClient = useQueryClient();
	/**
	 * The token stays out of the key, as auth usually does: in the key,
	 * a refresh would start a new query and abort the one in flight.
	 */
	const token = useRef("t1");
	const { data } = useQuery({
		queryKey: dataKey,
		queryFn: ({ signal }) => api.data(token.current, signal)
	});

	/**
	 * Workaround: a refetch while one is in flight either cancels it or,
	 * with cancelRefetch: false, joins it and never uses the new token.
	 * So wait for the request in flight, then refetch.
	 */
	async function setToken(t) {
		token.current = t;
		if (queryClient.isFetching({ queryKey: dataKey })) {
			await queryClient.refetchQueries({ queryKey: dataKey }, { cancelRefetch: false });
		}
		await queryClient.refetchQueries({ queryKey: dataKey });
	}

	const text = data ?? "loading";
	useEffect(() => show(text), [text]);
	useEffect(() => expose({ setToken }), []);
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
