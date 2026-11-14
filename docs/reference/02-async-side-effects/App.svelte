<script>
	import { getAbortSignal } from "svelte";

	let { api, expose } = $props();
	let selected = $state(1);
	expose({ select: (id) => (selected = id) });

	$effect(() => {
		const id = selected;
		/** Aborted when the effect re-runs, which cancels the load in flight. */
		const signal = getAbortSignal();
		(async () => {
			const bytes = await api.load(id, signal);
			const image = await api.decode(bytes);
			/** decode() can't be cancelled, so check again after it. */
			if (!signal.aborted) {
				api.draw(image);
			}
		})().catch((err) => {
			if (err.name !== "AbortError") {
				throw err;
			}
		});
	});
</script>
