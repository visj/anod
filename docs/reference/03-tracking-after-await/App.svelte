<script>
	let { api, show, expose } = $props();
	let language = $state("en");
	expose({ setLanguage: (lang) => (language = lang) });

	const doc = $derived(await api.doc(1));
	/** Kept out of the fetch, so a language change doesn't fetch again. */
	const text = $derived(doc.translatable ? api.translate(doc.text, language) : doc.text);

	$effect(() => show(text));
</script>

<p>{text}</p>
