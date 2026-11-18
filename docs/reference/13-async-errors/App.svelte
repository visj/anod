<script>
	let { api, show } = $props();

	const data = $derived(await api.load());
	$effect(() => show(`data: ${data}`));
</script>

<p>data: {data}</p>
