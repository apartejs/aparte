---
"@aparte/angular": minor
"@aparte/react": minor
"@aparte/vue": minor
"@aparte/svelte": minor
---

One imperative API across the four wrappers:

- `injectTokenStream` now takes the cross-wrapper `AsyncIterable<string>` contract on Angular
  too (the RxJS `Observable<string>` shape still works — it's a union).
- Angular `provideAparte()` auto-connects the client on app init (`autoConnect: false` to opt
  out); no more manual `AparteAiService.connect()` in components. `connect()` stays as the
  idempotent escape hatch.
- The viewport accessor is `getViewport(): HTMLElement | null` everywhere. **Breaking**: it
  replaces React's `handle.viewport` property and Vue's exposed `viewport` ref.
- The Vue/Svelte `AparteChatInstance` interfaces now include the full imperative surface
  (`scrollToBottom`, `focusInput`, `getViewport`).
- `AparteUiHandle` (and `AparteUiProps` where idiomatic) exported from every barrel, not just
  React's.
