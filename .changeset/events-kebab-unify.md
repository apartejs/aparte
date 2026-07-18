---
"@aparte/core": minor
"@aparte/react": minor
"@aparte/vue": minor
"@aparte/svelte": minor
"@aparte/angular": minor
"@aparte/plugin-model-selector": minor
---

Unify every custom DOM event to one kebab-case convention and type it.

The public event surface used three conventions — kebab (`aparte-send`), colon
(`aparte:retry`, `aparte:action`, `aparte:artifact-*`, …) and separatorless
(`apartemessagestart`/`done`/`error`/`aborted`). They are now **all kebab-case**:

- `aparte:*` → `aparte-*` (e.g. `aparte:retry` → `aparte-retry`, `aparte:action`
  → `aparte-action`, `aparte:tool-decision` → `aparte-tool-decision`).
- `apartemessagestart|done|error|aborted` → `aparte-message-start|done|error|aborted`.
- Already-kebab events (`aparte-send`, `aparte-select-*`, `aparte-model-change`, …)
  are unchanged.

Kebab is the only convention every framework can bind in a template — Angular
parses a `:` in an event name as a `target:event` selector, so colon events could
never be `(aparte:x)`-bound there.

**New:** an `HTMLElementEventMap` augmentation ships with `@aparte/core`, so
`element.addEventListener('aparte-retry', e => e.detail)` gives a typed `e.detail`
(no more `(e as CustomEvent<…>).detail` cast) for the public bubble / lifecycle /
artifact / tool events.

**Breaking:** any consumer listening on the old colon or separatorless names must
rename to kebab. Pre-1.0, so shipped as minor.
