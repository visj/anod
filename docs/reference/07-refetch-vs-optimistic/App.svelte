<script>
	let { api, show, expose } = $props();
	let todos = $state(["a"]);
	/**
	 * Workaround: nothing ties the refetch to later writes, so each
	 * write aborts the refetch in flight by hand.
	 */
	let refetching = new AbortController();

	expose({
		refetch() {
			refetching.abort();
			refetching = new AbortController();
			api.list(refetching.signal).then((list) => (todos = list), () => {});
		},
		add(text) {
			refetching.abort();
			todos = [...todos, text];
			api.add(text);
		}
	});

	const text = $derived(todos.join(", "));
	$effect(() => show(text));
</script>

<p>{text}</p>
