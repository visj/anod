<script>
	let { api, show, expose } = $props();
	let price = $state(10);
	let quantity = $state(1);
	const total = $derived(price * quantity);

	expose({
		setQuantity(n) {
			quantity = n;
			/** A $derived is computed on read, so it is up to date here. */
			api.track(total);
		}
	});

	$effect(() => show(`total ${total}`));
</script>

<p>total {total}</p>
