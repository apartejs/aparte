# @aparte/plugin-titler

## 0.28.3

## 0.28.2

### Patch Changes

- 2d108c1: The npm page of each of these packages now links to its docs page; nine of them pointed at `/plugins/…` addresses that only redirect since the docs moved, and `docs-mcp` pointed at the site's home.

## 0.28.1

## 0.28.0

## 0.27.4

## 0.27.3

## 0.27.2

## 0.27.1

## 0.27.0

## 0.26.0

## 0.25.0

## 0.24.0

## 0.23.0

## 0.22.0

## 0.21.0

## 0.20.0

## 0.19.3

### Patch Changes

- 04180a3: Four doc comments now say what the code does: the auto-compact rule, the titler's default word count, the bubble's `timestamp`, and the composer's internal bus.

  - `<aparte-context auto-compact>` asks for a compaction on each turn that ends in `danger`, one request at a time, not once per crossing.
  - `setupTitler`'s `budget`, omitted, does not mean six words: the model keeps, among its six best-scored words, those it is at least half sure of, never fewer than three, and every word of a message of four words or fewer.
  - The bubble's `timestamp` attribute no longer names a private method.
  - The composer's `_on` / `_emit` are marked `@internal` and leave the generated reference; from outside, listen for `aparte-composer-change`.

## 0.19.2

## 0.19.1

## 0.19.0

## 0.18.0

## 0.17.3

## 0.17.2

### Patch Changes

- 7513253: The README follows `@aparte/titler` 1.2: a single-language model file is 41 KB. No code change — the plugin accepts any titler, and 1.2 keeps the same `title(message, budget?)` API.

## 0.17.1

## 0.17.0

### Patch Changes

- 7802512: A failed model load is retried on the next title instead of disabling auto-titling for the life of the page. Nothing to change on your side.

  The model is resolved once and cached, and the cache kept a REJECTED promise: one transient failure — the model fetch, a CSP hiccup on the dynamic import — and every conversation from then on quietly kept its default title. `@aparte/plugin-shiki` clears its cached promise on failure for the same reason. The error still reaches the caller; only the caching of it is gone.

## 0.16.11

## 0.16.10

### Patch Changes

- 3df9174: New package: `setupTitler(manager, { titler: loadTitler })` titles each conversation from its first message with an [aparte-titler](https://apartejs.dev/models/titler/) model — 3 to 6 words, in the browser, no API call.

  The model is not a dependency of the plugin: hand it `@aparte/titler-latin`'s `loadTitler` (17 languages, 133 KB), a `Titler`, a promise of one, or any object with `title(message, budget?)`. The loader runs once, the first time a title is needed. `createTitleProvider(options)` is the provider alone, for a manager built with the `titleProvider` option; the teardown returned by `setupTitler` restores the previous provider.
