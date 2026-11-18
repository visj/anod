import { useEffect, useState } from "react";
import { mountReact } from "../_harness/dom.js";

function Channel({ api, show, name }) {
	const [last, setLast] = useState("waiting");
	/** The cleanup closes this socket before the next effect opens one. */
	useEffect(() => {
		const socket = api.connect(name, setLast);
		return () => socket.close();
	}, [name]);
	const text = `${name}: ${last}`;
	useEffect(() => show(text), [text]);
	return <p>{text}</p>;
}

function App({ api, show, expose }) {
	const [channel, setChannel] = useState("A");
	useEffect(() => expose({ setChannel }), []);
	/**
	 * The key remounts the channel, so its last message starts over at
	 * "waiting", instead of rendering "B: A1" for one commit.
	 */
	return <Channel key={channel} api={api} show={show} name={channel} />;
}

export async function mount({ api, show }) {
	const { promise, resolve } = Promise.withResolvers();
	const unmount = await mountReact(<App api={api} show={show} expose={resolve} />);
	return { ...(await promise), unmount };
}
