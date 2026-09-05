# @aparte/plugin-titler

## 0.16.10

### Patch Changes

- 3df9174: New package: `setupTitler(manager, { titler: loadTitler })` titles each conversation from its first message with an [aparte-titler](https://apartejs.dev/models/titler/) model — 3 to 6 words, in the browser, no API call.

  The model is not a dependency of the plugin: hand it `@aparte/titler-latin`'s `loadTitler` (17 languages, 133 KB), a `Titler`, a promise of one, or any object with `title(message, budget?)`. The loader runs once, the first time a title is needed. `createTitleProvider(options)` is the provider alone, for a manager built with the `titleProvider` option; the teardown returned by `setupTitler` restores the previous provider.
