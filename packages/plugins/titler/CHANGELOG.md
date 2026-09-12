# @aparte/plugin-titler

## 0.17.0

### Patch Changes

- 7802512: A failed model load is retried on the next title instead of disabling auto-titling for the life of the page. Nothing to change on your side.

  The model is resolved once and cached, and the cache kept a REJECTED promise: one transient failure — the model fetch, a CSP hiccup on the dynamic import — and every conversation from then on quietly kept its default title. `@aparte/plugin-shiki` clears its cached promise on failure for the same reason. The error still reaches the caller; only the caching of it is gone.

## 0.16.11

## 0.16.10

### Patch Changes

- 3df9174: New package: `setupTitler(manager, { titler: loadTitler })` titles each conversation from its first message with an [aparte-titler](https://apartejs.dev/models/titler/) model — 3 to 6 words, in the browser, no API call.

  The model is not a dependency of the plugin: hand it `@aparte/titler-latin`'s `loadTitler` (17 languages, 133 KB), a `Titler`, a promise of one, or any object with `title(message, budget?)`. The loader runs once, the first time a title is needed. `createTitleProvider(options)` is the provider alone, for a manager built with the `titleProvider` option; the teardown returned by `setupTitler` restores the previous provider.
