<script>
	import { getAbortSignal } from "svelte";

	let { api, show, expose } = $props();
	let userId = $state(1);
	expose({ selectUser: (id) => (userId = id) });

	/** Promises, so both requests start at once rather than one after the other. */
	const name = $derived(api.user(userId, getAbortSignal()));
	const posts = $derived(api.posts(userId, getAbortSignal()));
	/** One update, which is only shown once both have arrived. */
	const text = $derived(`${await name} | ${(await posts).join(", ")}`);

	$effect(() => show(text));
</script>

<p>{text}</p>
