<script>
	let { api, show, expose } = $props();
	let channel = $state("A");
	let last = $state("waiting");
	expose({ setChannel: (name) => (channel = name) });

	$effect(() => {
		const name = channel;
		last = "waiting";
		const socket = api.connect(name, (msg) => (last = msg));
		/** Runs before the next channel opens, and on unmount. */
		return () => socket.close();
	});

	const text = $derived(`${channel}: ${last}`);
	$effect(() => show(text));
</script>

<p>{text}</p>
