import { useEffect } from "react";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mountReact } from "../_harness/dom.js";

const todosKey = ["todos"];

function App({ api, show, expose }) {
	const queryClient = useQueryClient();
	const { data, refetch } = useQuery({
		queryKey: todosKey,
		queryFn: ({ signal }) => api.list(signal),
		initialData: ["a"],
		staleTime: Infinity
	});
	/** The optimistic update from TanStack's docs. */
	const add = useMutation({
		mutationFn: (text) => api.add(text),
		onMutate: async (text) => {
			/** Without this, the refetch in flight would land on top of "b". */
			await queryClient.cancelQueries({ queryKey: todosKey });
			queryClient.setQueryData(todosKey, (old) => [...old, text]);
		},
		onSettled: () => queryClient.invalidateQueries({ queryKey: todosKey })
	});
	const text = data.join(", ");

	useEffect(() => show(text), [text]);
	useEffect(() => expose({ refetch, add: add.mutate }), []);
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
