# Real-World Use Cases Where Anod Shines

A collection of patterns that are genuinely awkward in traditional reactive libraries but become elegant with anod's primitives — particularly `task`, `spawn`, `c.suspend()`, `c.pending()`, and `c.defer()`.

---

## 1. Async Data Streams with Backpressure

**The problem:** You have a WebSocket/SSE stream pushing data, and a consumer that must process items sequentially — writing to IndexedDB, posting to an API, or rendering frames. If the producer is faster than the consumer, you need backpressure. In traditional libraries, you'd manage a queue, handle the async gap manually, and wire up disposal.

**In other libraries (Solid):**
```js
const [data, setData] = createSignal(null);
const queue = [];
let processing = false;

ws.onmessage = (e) => {
  queue.push(e.data);
  if (!processing) processQueue();
};

async function processQueue() {
  processing = true;
  while (queue.length > 0) {
    const item = queue.shift();
    setData(item);
    await saveToIndexedDB(item); // async consumer
  }
  processing = false;
}

// Cleanup? Hope you remembered to close the WebSocket
// and clear the queue on component unmount.
```

**In anod:**
```js
const feed = c.signal(null);

c.spawn(async (cx) => {
  const ws = new WebSocket(url);
  cx.cleanup(() => ws.close());

  // The spawn re-runs when feed changes.
  // But we use a while loop to process sequentially.
  while (true) {
    const data = cx.val(feed); // subscribes to the feed
    if (data !== null) {
      await cx.suspend(saveToIndexedDB(data));
    }
    // Block until the next value arrives
    await cx.suspend(/* next change */);
  }
});

// Elsewhere, just push into the signal
ws.onmessage = (e) => feed.set(e.data);
```

Actually, this pattern is even cleaner with a task as the data source:

```js
const endpoint = c.signal("/api/stream");

// Task fetches data reactively
const stream = c.task((cx) => {
  const url = cx.val(endpoint);
  return cx.suspend(fetch(url).then((r) => r.json()));
});

// Spawn consumes the stream and persists it
c.spawn(async (cx) => {
  const data = await cx.suspend(stream);
  await cx.suspend(db.put("latest", data));
  console.log("Persisted:", data);
  // When endpoint changes, stream re-fetches,
  // this spawn re-runs automatically
});
```

The cleanup, the re-subscription, the backpressure — it's all structural. Dispose the root and everything tears down.

---

## 2. Dependent API Calls (Waterfall with Cancellation)

**The problem:** Fetch a user, then fetch their settings, then fetch their team. If the user ID changes mid-flight, cancel everything and restart. In React, this is `useEffect` hell. In Solid, you chain `createResource` but cancellation is manual.

**In other libraries (React):**
```jsx
function UserDashboard({ userId }) {
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [team, setTeam] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setUser(null); setSettings(null); setTeam(null);

    fetchUser(userId).then((u) => {
      if (cancelled) return;
      setUser(u);
      return fetchSettings(u.settingsId);
    }).then((s) => {
      if (cancelled) return;
      setSettings(s);
      return fetchTeam(s.teamId);
    }).then((t) => {
      if (cancelled) return;
      setTeam(t);
    });

    return () => { cancelled = true; };
  }, [userId]);
  // ...
}
```

**In anod:**
```js
const userId = c.signal(42);

const user = c.task((cx) =>
  cx.suspend(fetchUser(cx.val(userId)))
);

const settings = c.task(async (cx) => {
  const u = await cx.suspend(user);
  return cx.suspend(fetchSettings(u.settingsId));
});

const team = c.task(async (cx) => {
  const s = await cx.suspend(settings);
  return cx.suspend(fetchTeam(s.teamId));
});

// In your UI effect:
c.effect((cx) => {
  if (cx.pending([user, settings, team])) {
    renderSkeleton();
    return;
  }
  renderDashboard(cx.val(user), cx.val(settings), cx.val(team));
});

// Change user — everything cascades, stale fetches are abandoned
userId.set(99);
```

The `c.suspend()` chain handles cancellation automatically via REGRET. When `userId` changes, `user` task re-runs, which invalidates `settings`, which invalidates `team`. Any in-flight fetch from the old chain silently dies. The effect only renders when all three are settled. Zero manual cancellation logic.

---

## 3. Polling with Adaptive Intervals

**The problem:** Poll an API endpoint. If the data hasn't changed, slow down the interval. If it changed, speed up. If the component unmounts, stop. If the endpoint URL changes, restart with the fast interval.

**In other libraries:** A mess of `setInterval`, `clearInterval`, ref tracking, and cleanup functions that are easy to get wrong.

**In anod:**
```js
const endpoint = c.signal("/api/status");
const pollMs = c.signal(1000);

c.spawn(async (cx) => {
  const url = cx.val(endpoint);
  const interval = cx.val(pollMs);
  const controller = cx.controller();

  const res = await cx.suspend(
    fetch(url, { signal: controller.signal }).then((r) => r.json())
  );

  // Adaptive: slow down if unchanged, speed up if changed
  if (res.unchanged) {
    pollMs.set(Math.min(interval * 2, 30000));
  } else {
    pollMs.set(1000);
  }

  // Wait, then let the signal dep (pollMs) trigger re-run
  await cx.suspend(new Promise((r) => setTimeout(r, interval)));
});
```

When `endpoint` changes, the spawn re-runs immediately (old fetch aborted via controller). When `pollMs` changes (from the adaptive logic), the spawn also re-runs. Disposal kills everything. The whole polling loop is a single spawn with zero external state management.

---

## 4. Optimistic Updates with Rollback

**The problem:** User clicks "save". Show the update immediately (optimistic), send to server, rollback if it fails. Other parts of the UI that depend on this data should see the optimistic value, then the confirmed value, or the rollback.

**In other libraries:** Complex state management with "pending" flags, "error" flags, "previous value" tracking, and manual rollback logic.

**In anod:**
```js
const serverData = c.task((cx) =>
  cx.suspend(fetchData(cx.val(dataId)))
);

// Local override — set() on a compute overrides the derived value
const displayData = c.compute((cx) => cx.val(serverData));

async function saveOptimistic(newValue) {
  const oldValue = displayData.peek();

  // Optimistic: override the compute
  displayData.set(newValue);

  try {
    await postToServer(newValue);
    // Server confirmed — trigger a re-fetch to get canonical state
    dataId.set(dataId.peek()); // force re-run
  } catch (err) {
    // Rollback
    displayData.set(oldValue);
  }
}

// UI just reads displayData — sees optimistic, confirmed, or rollback
c.effect((cx) => {
  render(cx.val(displayData));
});
```

The writable compute (`displayData.set()`) is the key. It lets you override the derived value temporarily. When the upstream (`serverData`) re-settles, it naturally overwrites the override. This is a pattern that's impossible in most reactive libraries where computed values are read-only.

---

## 5. Debounced Search with Loading States

**The problem:** User types in a search box. Debounce the input, show a loading indicator while fetching, show results when done. If they type again before results arrive, cancel the old fetch.

**In other libraries (Vue):**
```js
const query = ref("");
const results = ref([]);
const loading = ref(false);

let timeout = null;
watch(query, (val) => {
  clearTimeout(timeout);
  loading.value = true;
  timeout = setTimeout(async () => {
    try {
      results.value = await searchAPI(val);
    } finally {
      loading.value = false;
    }
  }, 300);
});

onUnmounted(() => clearTimeout(timeout));
```

**In anod:**
```js
const rawQuery = c.signal("");

// Debounced version of the query
const query = c.task((cx) => {
  const q = cx.val(rawQuery);
  return cx.suspend(
    new Promise((resolve) => setTimeout(() => resolve(q), 300))
  );
});

// Search results derived from debounced query
const results = c.task((cx) => {
  const q = cx.val(query);
  if (!q) return cx.suspend(Promise.resolve([]));
  return cx.suspend(searchAPI(q));
});

// UI
c.effect((cx) => {
  if (cx.pending(results)) {
    showSpinner();
    return;
  }
  renderResults(cx.val(results));
});
```

The debounce IS a task. The search IS a task. Loading state IS `c.pending()`. No timers to clean up, no loading flags to manage, no cancellation logic. When `rawQuery` changes, the debounce task re-runs (old timer abandoned via REGRET), which invalidates the search task (old fetch abandoned), which re-triggers the effect (shows spinner until settled).

---

## 6. Auth Token Refresh with Retry

**The problem:** API calls need an auth token. The token expires. When it expires, refresh it, then retry the failed call. Multiple calls might fail simultaneously — only refresh once. All waiting calls should resume with the new token.

**In other libraries:** Typically involves a shared promise, a mutex/lock, and careful coordination. Easy to get wrong with race conditions.

**In anod:**
```js
const tokenVersion = c.signal(0);

const token = c.task((cx) => {
  cx.val(tokenVersion); // re-fetch when bumped
  return cx.suspend(refreshToken());
});

// Any API call just depends on the token task
function apiCall(endpoint) {
  return c.task(async (cx) => {
    const t = await cx.suspend(token);
    const res = await cx.suspend(
      fetch(endpoint, { headers: { Authorization: t } })
    );
    if (res.status === 401) {
      // Token expired — bump version to trigger refresh
      tokenVersion.set(tokenVersion.peek() + 1);
      // This task will re-run because token (our dep) will re-settle
      // with the new token. REGRET handles the stale activation.
    }
    return res.json();
  });
}

const userData = apiCall("/api/me");
const notifications = apiCall("/api/notifications");

// Both calls share the same token task.
// If either gets a 401, the token refreshes ONCE,
// and BOTH tasks re-run with the new token.
```

The `token` task is a shared dependency. Multiple API tasks await it via `c.suspend(token)`. When the token is refreshed, all dependents are notified and re-run with the new value. The reactive graph handles the "refresh once, retry all" coordination automatically.

---

## 7. Persistent State Sync (localStorage / IndexedDB)

**The problem:** Keep reactive state in sync with persistent storage. Changes to signals should be saved. On load, restore from storage. Handle serialization errors gracefully.

**In anod:**
```js
function persisted(key, defaultValue) {
  // Load from storage
  const stored = localStorage.getItem(key);
  const initial = stored !== null ? JSON.parse(stored) : defaultValue;
  const sig = c.signal(initial);

  // Auto-save on changes
  c.spawn(async (cx) => {
    const value = cx.val(sig);
    // Defer the write so it doesn't block the reactive graph
    await cx.suspend(Promise.resolve());
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn(`Failed to persist ${key}:`, err);
    }
  });

  return sig;
}

// Usage — just a signal, automatically persisted
const theme = persisted("theme", "light");
const fontSize = persisted("fontSize", 14);

theme.set("dark"); // saved to localStorage asynchronously
```

The spawn acts as a persistent write-behind cache. It subscribes to the signal, and on every change, writes to storage after yielding. If the signal changes again before the write completes, the old write is abandoned (REGRET) and only the latest value is written. The `cx.suspend(Promise.resolve())` is a minimal yield that ensures the write doesn't block the synchronous reactive update.

---

## 8. Resource Pool with Lifecycle Management

**The problem:** Manage a pool of WebSocket connections, database connections, or workers. Create them on demand, dispose when no longer needed, handle errors gracefully.

**In anod:**
```js
function createPool(factory, maxSize) {
  const demand = c.signal(0);

  return c.root((r) => {
    const connections = [];

    // Spawn a manager that reacts to demand
    r.effect((cx) => {
      const needed = cx.val(demand);
      while (connections.length < Math.min(needed, maxSize)) {
        const conn = factory();
        connections.push(conn);
        // Register cleanup so disposal closes the connection
        cx.cleanup(() => conn.close());
      }
    });

    return {
      acquire() {
        demand.set(demand.peek() + 1);
        return connections[connections.length - 1];
      },
      release() {
        demand.set(Math.max(0, demand.peek() - 1));
      },
      dispose: () => r.dispose(), // closes all connections
    };
  });
}
```

---

## 9. Form Validation with Async Checks

**The problem:** A form where some fields need async validation (e.g., "is this username taken?"). Show per-field errors, disable submit while validating, aggregate all validation state.

**In anod:**
```js
const username = c.signal("");
const email = c.signal("");

// Async validation — debounced, cancellable
const usernameCheck = c.task(async (cx) => {
  const name = cx.val(username);
  if (name.length < 3) return "Too short";
  // Debounce
  await cx.suspend(new Promise((r) => setTimeout(r, 300)));
  const taken = await cx.suspend(checkUsername(name));
  return taken ? "Already taken" : null;
});

// Sync validation
const emailError = c.compute((cx) => {
  const e = cx.val(email);
  if (!e.includes("@")) return "Invalid email";
  return null;
});

// Aggregate: form is valid when all checks pass and none are loading
const formValid = c.compute((cx) => {
  if (cx.pending(usernameCheck)) return false;
  if (cx.val(usernameCheck) !== null) return false;
  if (cx.val(emailError) !== null) return false;
  return true;
});

// UI
c.effect((cx) => {
  const loading = cx.pending(usernameCheck);
  renderField("username", cx.val(username), loading ? "Checking..." : cx.val(usernameCheck));
  renderField("email", cx.val(email), cx.val(emailError));
  setSubmitEnabled(cx.val(formValid));
});
```

The `c.pending(usernameCheck)` check means the form naturally shows "Checking..." while the async validation is in flight. No loading flags, no manual state management. The debounce is built into the task via a delayed promise. If the user types again, the old check is abandoned via REGRET.

---

## 10. Worker Communication with Reactive Bridge

**The problem:** Offload heavy computation to a Web Worker. The worker should react to input changes and send results back. Handle the async boundary cleanly.

**In anod:**
```js
function workerCompute(workerUrl, inputSignal) {
  return c.task(async (cx) => {
    const input = cx.val(inputSignal);
    const controller = cx.controller();

    const worker = new Worker(workerUrl);
    cx.cleanup(() => worker.terminate());

    // Abort listener terminates worker on re-run
    controller.signal.addEventListener("abort", () => worker.terminate());

    return cx.suspend(new Promise((resolve, reject) => {
      worker.onmessage = (e) => resolve(e.data);
      worker.onerror = (e) => reject(e);
      worker.postMessage(input);
    }));
  });
}

const input = c.signal({ data: largeDataset, params: { threshold: 0.5 } });
const result = workerCompute("./analysis-worker.js", input);

c.effect((cx) => {
  if (cx.pending(result)) {
    showProgress();
    return;
  }
  renderChart(cx.val(result));
});

// Change input — old worker is terminated, new one starts
input.set({ data: newDataset, params: { threshold: 0.8 } });
```

The `cx.controller()` + `cx.cleanup()` combo handles the worker lifecycle. When the input changes, the task re-runs: the old worker is aborted/terminated via the controller, a new worker is spawned. The effect shows a progress indicator via `cx.pending()` and renders when settled. The entire worker lifecycle is managed by the reactive graph.

---

## Summary

The patterns where anod truly shines share common traits:

1. **Async operations that need cancellation** — REGRET handles this automatically, no manual `cancelled` flags or AbortController wiring.

2. **Dependent async chains** — Tasks can await other tasks via `c.suspend()`, forming natural waterfall patterns that auto-cancel on upstream changes.

3. **Loading state management** — `c.pending()` eliminates the need for separate `loading` flags. The loading state IS the task's state.

4. **Resource lifecycle** — `cx.cleanup()` + ownership model ensures resources (WebSockets, workers, timers) are released structurally, not procedurally.

5. **Concurrent data flows** — Multiple async operations sharing the same reactive dependencies naturally coordinate (e.g., auth token refresh triggering all dependent API calls).

The common thread: **anod turns imperative async coordination into declarative reactive dependencies.** Instead of managing the "when" and "how" of async operations, you declare "what depends on what" and the graph handles the rest.
