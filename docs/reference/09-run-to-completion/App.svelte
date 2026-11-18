<script>
	let { api, expose } = $props();
	let items = $state(["a", "b"]);
	expose({ setItems: (list) => (items = list) });

	/**
	 * Workaround: an effect can't finish a run before the next one, so
	 * a keepLatest queue is written by hand. running is the save in
	 * progress, next the latest list that came in meanwhile.
	 */
	let running = null;
	let next = null;

	async function drain(list) {
		while (list) {
			for (const item of list) {
				await api.save(item);
			}
			api.done();
			[list, next] = [next, null];
		}
		running = null;
	}

	$effect(() => {
		const list = items;
		if (running) {
			next = list;
		} else {
			running = drain(list);
		}
	});

	/** Unmounting can't wait, so the shutdown is chained to the save in progress. */
	$effect(() => () => {
		next = null;
		Promise.resolve(running).then(() => api.shutdown());
	});
</script>
