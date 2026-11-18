import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { mountReact } from "../_harness/dom.js";

function App({ api, show, expose }) {
	const [userId, setUserId] = useState(1);
	const user = useQuery({
		queryKey: ["user", userId],
		queryFn: ({ signal }) => api.user(userId, signal)
	});
	/**
	 * Waits for the user through enabled. The key holds the team the
	 * queryFn reads, so the projects only refetch when the team changes.
	 */
	const team = user.data?.team;
	const projects = useQuery({
		queryKey: ["projects", team],
		queryFn: ({ signal }) => api.projects(team, signal),
		enabled: team !== undefined
	});
	/** A disabled query is pending too, so this covers both steps. */
	const text = user.isPending || projects.isPending
		? "loading"
		: `${user.data.name}: ${projects.data.join(", ")}`;

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
