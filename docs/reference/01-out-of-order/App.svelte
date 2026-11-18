<script>
	import { getAbortSignal } from "svelte";

	let { api, show, expose } = $props();
	let q = $state("a");
	expose({ type: (v) => (q = v) });

	/** A re-run aborts the signal, so the request in flight is cancelled. */
	const results = $derived(await api.search(q, getAbortSignal()));
	const text = $derived(
		$effect.pending() ? "searching" : `${results.items.length} results for ${results.q}`
	);

	$effect(() => show(text));
</script>

<p>{text}</p>
