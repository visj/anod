<script>
	import { getAbortSignal } from "svelte";

	let { api, show, expose } = $props();
	let userId = $state(1);
	expose({ selectUser: (id) => (userId = id) });

	const user = $derived(await api.user(userId, getAbortSignal()));
	/** Waits for the user, since it reads it after the await above. */
	const projects = $derived(await api.projects(user.team, getAbortSignal()));
	const text = $derived($effect.pending() ? "loading" : `${user.name}: ${projects.join(", ")}`);

	$effect(() => show(text));
</script>

<p>{text}</p>
