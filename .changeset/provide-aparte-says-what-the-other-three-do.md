---
"@aparte/angular": patch
---

`provideAparte`'s documentation now shows the calls React, Vue and Svelte make instead of it, so its absence in the other three wrappers is not read as a missing feature. Nothing to change in your code: the docblock ships in the published types.

The docblock said only that you "can equally call `aparteGlobalConfig.*` yourself" — a capability named in passing, with no example, which is the shape a reader skips. It now carries the four calls that replace the provider (register a provider, set the model config, set the locale, set `data-aparte-theme`) and says what Angular alone needs it for: an initializer that runs before the first component, and a `DestroyRef` to release the theme listener it registers. The one option that is not a plain call is named as such: `theme: 'auto'` is a `prefers-color-scheme` listener you write and dispose of yourself.

The same block, and the trigger that would end the asymmetry — a second wrapper needing that listener with a disposer of its own, at which point `applyThemeMode` moves into `@aparte/core` and all four call it — are on the Wrapper surface reference page.
