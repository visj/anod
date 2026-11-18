/**
 * Tearing: a header shows the user's name and a list shows their posts.
 * Both come from the same user id, from requests that take different
 * times. After switching users, the screen must never show one user's
 * name over another user's posts: the old pair stays until the new
 * pair is complete.
 *
 * app: selectUser(id). The app starts with user 1. Each shown line is
 * "<header> | <list>", as rendered together.
 */
import { request } from "../_harness/api.js";

const USERS = { 1: "Ada", 2: "Bob" };
const POSTS = { 1: ["a1", "a2"], 2: ["b1"] };

export function createApi(ctx) {
	return {
		user(id, signal) {
			return request(ctx, { value: USERS[id], ms: 20, signal, label: `user ${id}` });
		},
		posts(id, signal) {
			return request(ctx, { value: POSTS[id], ms: 60, signal, label: `posts ${id}` });
		}
	};
}

export async function drive(app, { wait }) {
	await wait(100);
	app.selectUser(2);
	await wait(120);
}

export const expected = {
	shown: ["loading", "Ada | a1, a2", "Bob | b1"]
};
