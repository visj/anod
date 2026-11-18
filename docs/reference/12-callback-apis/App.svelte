<script>
	let { api, show, name } = $props();

	/** A promise around the callbacks: a stale resolve is dropped. */
	const result = $derived(await new Promise((resolve, reject) => api.lookup(name, resolve, reject)));
	const text = $derived(
		$effect.pending() ? `looking up ${name}` : `${result.name} is #${result.id}`
	);

	$effect(() => show(text));
</script>

<p>{text}</p>
