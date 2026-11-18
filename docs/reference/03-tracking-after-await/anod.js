import { root, signal } from "anod";

export function mount({ api, show }) {
	const language = signal("en");

	const app = root((c) => {
		const view = c.task(async (c) => {
			const doc = await c.suspend(api.doc(1));
			/** Read after the await, and still tracked. */
			return doc.translatable ? api.translate(doc.text, c.val(language)) : doc.text;
		});

		c.effect(view, (text) => show(text ?? "loading"));
	});

	return {
		setLanguage: (lang) => language.set(lang),
		unmount: () => app.dispose()
	};
}
