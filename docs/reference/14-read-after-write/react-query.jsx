import { useEffect, useState } from "react";
import { mountReact } from "../_harness/dom.js";

const totalOf = (price, quantity) => price * quantity;

function App({ api, show, expose }) {
	const [price] = useState(10);
	const [quantity, setQuantity] = useState(1);
	const total = totalOf(price, quantity);

	/**
	 * State is a snapshot: total still holds the old value until the
	 * next render. So the handler works out the new total itself, as
	 * React's docs suggest, repeating the derivation.
	 */
	function onQuantity(n) {
		setQuantity(n);
		api.track(totalOf(price, n));
	}

	const text = `total ${total}`;
	useEffect(() => show(text), [text]);
	useEffect(() => expose({ setQuantity: onQuantity }), []);
	return <p>{text}</p>;
}

export async function mount({ api, show }) {
	const { promise, resolve } = Promise.withResolvers();
	const unmount = await mountReact(<App api={api} show={show} expose={resolve} />);
	return { ...(await promise), unmount };
}
