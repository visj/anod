/**
 * Dependent queries: a user, then the projects of the user's team. The
 * second request needs the first one's result. While either is in
 * flight, the view shows "loading".
 *
 * app: selectUser(id). The app starts with user 1.
 */
import { request } from "../_harness/api.js";

const USERS = { 1: { name: "Ada", team: "x" }, 2: { name: "Bob", team: "y" } };
const PROJECTS = { x: ["p1", "p2"], y: ["p3"] };

export function createApi(ctx) {
	return {
		user(id, signal) {
			ctx.event(`fetch user ${id}`);
			return request(ctx, { value: USERS[id], ms: 20, signal, label: `user ${id}` });
		},
		projects(team, signal) {
			ctx.event(`fetch projects ${team}`);
			return request(ctx, { value: PROJECTS[team], ms: 20, signal, label: `projects ${team}` });
		}
	};
}

export async function drive(app, { wait }) {
	await wait(60);
	app.selectUser(2);
	await wait(80);
}

export const expected = {
	shown: ["loading", "Ada: p1, p2", "loading", "Bob: p3"],
	events: ["fetch user 1", "fetch projects x", "fetch user 2", "fetch projects y"]
};
