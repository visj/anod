/**
 * A fake request: resolves with value after ms, or rejects with error.
 * Given an AbortSignal, an abort while it is still in flight records
 * "abort <label>" and rejects with an AbortError, as fetch does. An
 * abort after it has settled does nothing, so only aborts of real
 * requests show up in the log.
 */
export function request(ctx, { value, error, ms, signal, label }) {
	return new Promise((resolve, reject) => {
		let done = false;
		const timer = setTimeout(() => {
			done = true;
			if (error !== void 0) {
				reject(error);
			} else {
				resolve(typeof value === "function" ? value() : value);
			}
		}, ms);
		if (signal) {
			signal.addEventListener("abort", () => {
				if (!done) {
					done = true;
					clearTimeout(timer);
					ctx.event(`abort ${label}`);
					reject(new DOMException("Aborted", "AbortError"));
				}
			});
		}
	});
}
