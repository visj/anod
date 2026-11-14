<script>
	import App from "./App.svelte";

	let { api, show, expose } = $props();
	/** Up here, so the pending snippet can show it. */
	let name = $state("A");
	expose({ lookup: (n) => (name = n) });
</script>

<svelte:boundary>
	<App {api} {show} {name} />
	{#snippet pending()}
		<p {@attach () => show(`looking up ${name}`)}>looking up {name}</p>
	{/snippet}
</svelte:boundary>
