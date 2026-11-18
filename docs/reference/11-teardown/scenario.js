/**
 * Teardown: a live subscription to a chat channel. Switching channels
 * closes the old socket before the new one opens, and unmounting closes
 * the last one. No socket may leak, and the view only shows messages
 * from the current channel.
 *
 * app: setChannel(name). The app starts on channel "A".
 */
export function createApi(ctx) {
	return {
		/** Emits "<channel>1", "<channel>2", ... every 20ms until closed. */
		connect(channel, onMessage) {
			ctx.event(`open ${channel}`);
			let n = 0;
			const timer = setInterval(() => {
				const msg = `${channel}${++n}`;
				ctx.event(`message ${msg}`);
				onMessage(msg);
			}, 20);
			return {
				close() {
					clearInterval(timer);
					ctx.event(`close ${channel}`);
				}
			};
		}
	};
}

export async function drive(app, { wait }) {
	await wait(30);
	app.setChannel("B");
	await wait(30);
}

export const expected = {
	shown: ["A: waiting", "A: A1", "B: waiting", "B: B1"],
	events: ["open A", "message A1", "close A", "open B", "message B1", "close B"]
};
