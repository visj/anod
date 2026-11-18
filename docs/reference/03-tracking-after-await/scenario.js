/**
 * A dependency that only exists after an await. A document is fetched;
 * if it is translatable, it is shown in the selected language, so the
 * language is only read once the document has arrived. Changing the
 * language must update the view.
 *
 * app: setLanguage(lang). The app starts in "en".
 */
import { request } from "../_harness/api.js";

export function createApi(ctx) {
	return {
		doc(id) {
			ctx.event(`fetch doc ${id}`);
			return request(ctx, { value: { id, text: "Hello", translatable: true }, ms: 20 });
		},
		translate(text, lang) {
			return lang === "en" ? text : `${text} (${lang})`;
		}
	};
}

export async function drive(app, { wait }) {
	await wait(50);
	app.setLanguage("sv");
	await wait(60);
}

/**
 * Fetches aren't compared: re-fetching when the language changes is
 * allowed, as is splitting the fetch from the translation.
 */
export const expected = {
	shown: ["loading", "Hello", "Hello (sv)"]
};
