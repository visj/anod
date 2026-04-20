# Async native signals

## Task Details
Your task is to implement native async await for the task/spawn. In short, when you finish, it will be possible to do this:

```js
const taskA = task(async c => {
  return await c.suspend(somePromise());
});

spawn(async c => {
  const val = await c.suspend(taskA);
  console.log(val);
});
```

So basically, we're integrating tasks as first hand citizens straight into the reactive signal engine. Here's how it's going to work:

The Fiber class will get a new a new property: _channel, which is of type IAwaiter | IResponder. Then you will create two classes, I have no idea what to name them, just call them Task and Spawn for now. The Task is of type IAwaiter | IResponder, Spawn is just IAwaiter.

These interfaces basically mean: IAwaiter is a node that can call await to a task. So a Task can await another Task, but a Spawn can only await a Task. Then, IResponder is a Task that can resolve/reject promises.

Here is a sketch of the interfaces:

```js
interface IAwaiter {
  _res1: IResponder;
  _res1slot: number;
  _responds: Array<IResponder | number>
}

interface IResponder {
  _waiters: Array<IAwaiter | number | typeof resolve | typeof reject>;
}
```

So basically, it mirrors our current Sub/Dep strategy with a two-way binding, but now instead for the async case.

The critical thing to understand about this implementation is: **when nothing holds a reference to a resolve/reject of a promise, it GC's**.

I have tested this, but I'm not 100% sure, so we have to build and make sure it doesn't leak memory and actually works. But the idea is: like this with comments:

```js
const taskA = task(async c => {
  return await c.suspend(somePromise());
});
// Here, the Fiber has not allocated a _channel yet, because, you can by default just check if task.loading() return fast path. The async/await is opt in feature 

spawn(async c => {
  const val = await c.suspend(taskA); // inside suspend, we notice we don't have a _channel yet, so we allocate
  // Now we have created a two way link between the Spawn <--> Task. The Task holds the promise resolve/reject functions used to continue the spawn once the Task finally settles. The Spawn has a link to the Task, so it can remove itself if it disposes or updates.
  console.log(val);
});
```

The suspend() now takes two variations: both native promises (existing functionality, and Task objects (actually, instanceof Computes)).

In the updateAsync path, we must now check: have we allocated any _waits the last round? If so, we have our slot into their _waiters array. So just like how our current slot mechanism works, we go into the IResponder, (which is a Compute node), use our slot to get the Promise (-1 for wait1, then index into the 4 stride array). We remove the Promise, with the same pop/insert strategy. If our slot is the last, do nothing, otherwise pop and update the slot of the IAwaiter at index 0 of the 4 stride.

The _waiters property store: [IAwaiter, slot, resolve function (from Promise), reject function]. So, since this array is the only place that holds a reference to the resolve/reject, once we null out them and no one has a reference to the resolve, it can never run, and the Promise can be GC'd from the previous run.

So, let's consider this example:

```js
spawn(async c => {
  const sync = c.val(sigVal);
  const val = await c.suspend(taskA);
  console.log(val);
});

sigVal.set(2); // Now, the spawn is triggered by a sync signal, which forces it to refresh
```

This is why we maintain a two-way binding: when a spawn disposes or updates, it removes the resolvers in Task to make sure they never fire.

There are some real complex things to solve here:

A Task can be disposed indepentently of a Spawn. 

```js
const taskA = task(async c => {
  return await c.suspend(somePromise());
});
spawn(async c => {
  const sync = c.val(sigVal);
  const val = await c.suspend(taskA);
  console.log(val);
});

taskA.dispose();
```
So when a Task disposes, it loops over its awaiters. If it's a Compute, it settles that node manually with an error. If it's an Effect, it handles it like it normally does: tryRecover, and then dispose the effect. But, we never actually yield the promise, that one just dies. We manually "kill" any awaiters, just like if they threw themself, but we do that for them, and they just silently die.

This is a lot to build. So, try to make the fundamentals work, and add tests. Especially, add tests to make sure it doesn't introduce memory leaks. Make sure the two-way binding that nulls out the Promise resolve/reject causes the awaiters just garbage collect.

The disposal part can be complex. You may leave that part out for now, since it's an edge case. Just be aware that it has to be supported.
