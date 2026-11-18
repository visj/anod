<script>
	let { api, show, expose } = $props();
	let token = $state("t1");
	/** The token of the request in flight. */
	let used = $state("t1");
	expose({ setToken: (t) => (token = t) });

	/** No abort signal: a refresh must not cancel the request. */
	const data = $derived(await api.data(used));

	/**
	 * Workaround: a $derived re-runs as soon as the token changes, so the
	 * token it uses only catches up once nothing is pending.
	 */
	$effect(() => {
		if (!$effect.pending()) {
			used = token;
		}
	});

	$effect(() => show(data));
</script>

<p>{data}</p>
