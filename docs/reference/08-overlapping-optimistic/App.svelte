<script>
	let { api, show, expose } = $props();
	let likes = $state(0);
	let saving = $state(0);
	/** The last count the server confirmed. */
	let confirmed = 0;

	expose({
		like() {
			likes++;
			saving++;
			api.like().then(
				(n) => (confirmed = n),
				() => {}
			).finally(() => {
				/**
				 * Workaround: a failed save can't just undo its own +1, since
				 * the value under it may be a guess too. Once the last save
				 * has settled, the count goes back to what the server holds.
				 */
				if (--saving === 0) {
					likes = confirmed;
				}
			});
		}
	});

	const text = $derived(saving > 0 ? `${likes} (saving)` : String(likes));
	$effect(() => show(text));
</script>

<p>{text}</p>
