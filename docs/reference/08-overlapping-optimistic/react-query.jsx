import { useEffect } from "react";
import { QueryClient, QueryClientProvider, useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mountReact } from "../_harness/dom.js";

const countKey = ["likes"];
const likeKey = ["like"];

function App({ api, show, expose }) {
	const queryClient = useQueryClient();
	const { data } = useQuery({
		queryKey: countKey,
		queryFn: () => api.count(),
		initialData: 0,
		staleTime: Infinity
	});
	/**
	 * Concurrent optimistic updates as TkDodo describes them: no
	 * snapshot rollback, since the snapshot may itself be a guess.
	 * Only the last mutation to settle refetches, and returning the
	 * promise keeps it pending until the server's count has arrived.
	 */
	const like = useMutation({
		mutationKey: likeKey,
		mutationFn: () => api.like(),
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey: countKey });
			queryClient.setQueryData(countKey, (n) => n + 1);
		},
		onSettled: () => {
			if (queryClient.isMutating({ mutationKey: likeKey }) === 1) {
				return queryClient.invalidateQueries({ queryKey: countKey });
			}
		}
	});
	const saving = useIsMutating({ mutationKey: likeKey }) > 0;
	const text = saving ? `${data} (saving)` : String(data);

	useEffect(() => show(text), [text]);
	useEffect(() => expose({ like: () => like.mutate() }), []);
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
