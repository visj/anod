The next big task is to implement proper error handling. Below follows an envisioned API.

## Errors in Compute
If an error occurs inside a Compute, that compute becomes a "mine". It holds on to the exception, but doesn't throw any error. Not until someone actually read it does it throw. The idea is that effects, the final stage, are the "consumers", and they are responsible for handling any thrown error.

## Errors in Effect/Scope
We need to add a new property to Effects, _owner. I was hoping to avoid it, since we layer scopes so we generally don't have to do any lookup of pending dispose effects/computes, but for error boundary, we have to add it.

Whenever an Effect throws an error, we catch the error, and check: in this Effect's ownership chain, do we have any error handlers bound to it? If so, call that error handler. If it returns true (or, how do libraries normally handle it? maybe like an event handler, return false if it didn't handle the exception?), somehow, we just swallow the error. We keep walking the ownership tree until we hit the root. If there are no error handlers, we throw it as a top level error (still, after the whole graph stabilizies, check the start() loop).

## The recover() function
Inspired by golang, we will create a e.recover() function. When inside any scope or effect node (and Root, we must add this functionality to Root as well), if you call e.recover(), we register a recovery function. The logic is similar to that of cleanups. Generally, assume a node will only have a single recovery function, so add it first as just the function. Only if someone adds 2 or more do we allocate an array of recovery functions.

This should ideally toggle a bit in the state flag, to say that the node has a recovery. That allows us to quickly check while traversing. On cleanup/dispose, make sure to properly remove the recover function.

## Tests
Add proper tests for this. Make sure that error bubbling works correctly. Test that a compute throws an error, swallows it, and then an effect node reads it which leads to throw. Then, the parent scope registers a recovery that is called, and we just continue.
