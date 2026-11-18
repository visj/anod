<script>
	import { getAbortSignal } from "svelte";

	let { api, show, expose } = $props();
	let page = $state(1);
	expose({ setPage: (n) => (page = n) });

	/** An update keeps showing the old page until the new one has arrived. */
	const data = $derived(await api.page(page, getAbortSignal()));
	const text = $derived(
		`page ${data.n}: ${data.items.join(", ")}${$effect.pending() ? " (updating)" : ""}`
	);

	$effect(() => show(text));
</script>

<p>{text}</p>
