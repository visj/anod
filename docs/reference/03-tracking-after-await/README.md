# 03. Tracking after `await`

Most signal libraries track dependencies through a global "current listener". An `await` ends the synchronous part of a function, so a signal read after it isn't tracked, and the code silently stops updating. Here a document is fetched, and if it is translatable it is shown in the selected language. The language is only read once the document has arrived.

**Scenario.** Fetch document 1 (20ms). At 50ms the language changes to `"sv"`.

- **Expected:** `loading`, `Hello`, `Hello (sv)`. Re-fetching is allowed.

## anod

```js
const view = c.task(async (c) => {
	const doc = await c.suspend(api.doc(1));
	return doc.translatable ? api.translate(doc.text, c.val(language)) : doc.text;
});
```

Reads go through the context `c`, not a global, so `c.val(language)` after the await subscribes like any other read. The naive version is correct.

It isn't free, though: a language change re-runs the whole task, fetch included. Splitting it into a task for the document and a compute for the translation is better here, in anod as everywhere else. What anod adds is that the unsplit version is right, not silently wrong.

## React + TanStack Query

```jsx
const { data } = useQuery({
	queryKey: ["doc", 1],
	queryFn: () => api.doc(1),
	select: (doc) => (doc.translatable ? api.translate(doc.text, language) : doc.text)
});
```

TanStack has no tracking: the query key lists the inputs. The idiomatic split puts the translation in `select`, which runs again without fetching.

- **Naive:** reading `language` inside the queryFn without adding it to the key leaves the view stuck on `Hello`. TanStack's ESLint plugin flags this.

## Solid 2.0

```js
const doc = createMemo(() => api.doc(1));
const view = createMemo(() => {
	const d = doc();
	return d.translatable ? api.translate(d.text, language()) : d.text;
});
```

A read after an await is not tracked (verified in 2.0.0-beta.8). The split is the documented answer, and a memo that reads an async memo is itself synchronous.

- **Naive:** `language()` read after the await shows `loading`, `Hello`, and never updates.

## Jotai

```js
const view = atom(async (get) => {
	const { text, translatable } = await get(doc);
	return translatable ? api.translate(text, get(language)) : text;
});
```

Like anod, Jotai passes the reader explicitly (`get`), so a read after an await is tracked. The naive version is correct.

## Svelte 5

```svelte
const doc = $derived(await api.doc(1));
const text = $derived(doc.translatable ? api.translate(doc.text, language) : doc.text);
```

Svelte's compiler keeps tracking after an `await` that is written in the `$derived` expression itself: `$derived(tr(await api.doc(1), language))` works, but re-fetches. It doesn't reach into functions the expression calls.

- **Naive:** a helper `load()` that reads `language` after its own await loses the dependency silently, with no warning, and shows `Hello` forever.

## Verdict

**anod and Jotai share this property**, for the same structural reason: an explicit reader instead of a global listener.

- Svelte handles it partially, through the compiler.
- Solid and React need the code split, which is often the better design anyway.

The real difference is what happens to the naive code: correct in anod and Jotai, silently stale in Solid, Svelte (in helpers) and React (outside the key).

| | Read after `await` tracked | Naive code |
|---|---|---|
| anod | ✓ | correct (re-fetches) |
| React + TanStack Query | n/a (query key) | stale |
| Solid 2.0 | ✗ | stale |
| Jotai | ✓ | correct |
| Svelte 5 | in the expression only | stale in helpers |
