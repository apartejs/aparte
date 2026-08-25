---
'@aparte/core': minor
---

A second request for the human now **waits** instead of being answered `cancel` on arrival.

`AparteConfig.requestUserInput` holds a queue, so one request reaches the presenter at a time. That limit is real — the composer has one panel slot, and a second request used to clobber the first's DOM — but the old protection lived in `<aparte-elicitation>`, which resolved the second request `{ action: 'cancel' }` immediately. That is a refusal invented for a question nobody was ever shown, and the model reads it as the user having refused. Waiting is the honest behaviour.

Two things this also fixes: a consumer's own presenter, registered with `setElicitationPresenter`, previously had no protection at all; and a request that has been queued while its turn is stopped is no longer presented, because asking about a run that is already over asks about nothing.

Filed minor rather than patch for one reason worth naming: code that leaves a request unawaited and then awaits a second one used to get an immediate `cancel` and now waits for the first to settle. Nothing in this repo did that, and a dangling request is itself settled by the composer's turn-end eviction, but the shape of the change is visible enough to be a minor.

The queue only costs a microtask when something is actually ahead: with nothing waiting, a request is still presented in the calling tick, which is what the panel being mounted synchronously depends on.
