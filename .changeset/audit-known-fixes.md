---
"@aparte/core": patch
"@aparte/vue": patch
"@aparte/svelte": patch
"@aparte/react": patch
---

Round-3 audit follow-ups (bounded fixes):

- **Cross-wrapper parity is now compile-enforced on all four wrappers** (was only React +
  Angular): Vue's `defineExpose` uses `satisfies AparteChatImperativeApi`, Svelte adds a
  type-checked parity factory. A dropped/mistyped method is now a build error in every
  wrapper — and the `AparteChatImperativeApi` JSDoc no longer overstates the guarantee.
- **core**: `AparteConfig.unregisterAIProvider` now `_notify()`s (a mounted model-selector
  drops the removed provider instead of showing a stale list); `<aparte-select>` resolves its
  selected label by iterating options instead of an interpolated attribute selector (a model
  id containing `"`/`]` no longer throws `SyntaxError`).
- **docs/JSDoc hygiene**: removed three shipped references to non-existent
  `@aparte/plugin-{skeleton,icons}-default` packages; fixed the `useAparteChat` `@example` that
  re-appended the user message (double-append); the three AI-provider READMEs now call
  `@aparte/core` a required **peer dependency** (it's a runtime import), not an "optional peer".
