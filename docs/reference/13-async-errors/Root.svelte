<script>
	import App from "./App.svelte";

	let { api, show, expose } = $props();
	let reset;
	expose({ retry: () => reset() });

	/**
	 * Workaround: a rejection after an await in an effect doesn't reach a
	 * boundary, so the background job catches and reports it by hand.
	 */
	$effect(() => {
		api.sendAnalytics().catch((err) => api.report(err));
	});
</script>

<!-- A retry renders the content again, which loads again. -->
<svelte:boundary onerror={(_, r) => (reset = r)}>
	<App {api} {show} />
	{#snippet pending()}
		<p {@attach () => show("loading")}>loading</p>
	{/snippet}
	{#snippet failed(err)}
		<p {@attach () => show(`error: ${err.message}`)}>error: {err.message}</p>
	{/snippet}
</svelte:boundary>
