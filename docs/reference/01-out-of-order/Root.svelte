<script>
	import App from "./App.svelte";

	let props = $props();
</script>

<!-- The pending snippet is only shown until the first load is done. -->
<svelte:boundary>
	<App {...props} />
	{#snippet pending()}
		<p {@attach () => props.show("searching")}>searching</p>
	{/snippet}
</svelte:boundary>
