---
"@aparte/core": minor
"@aparte/engine": minor
"@aparte/locale-fr": patch
---

New `<aparte-context>`: a gauge of the model's context window. It reads each turn's reported usage and the window the current model declares (or a `window` attribute), sets `data-level` to `ok` / `warn` / `danger` at the `warn` / `danger` fractions (75 % / 90 %), fires `aparte-context-threshold` when the level changes, and with `auto-compact` dispatches `aparte-compact` on reaching danger. New in `@aparte/engine`: `createCompactionSelector({ contextWindow, systemPrompt })`, the budget-aware `compactionSelector` for `AparteClient` — the newest turns that fit stay verbatim, the rest is summarised. New locale key `contextLabel`, translated in `@aparte/locale-fr`.

The first product built on the library showed a context badge that turned red at 90 % — and then nothing happened, because `compact()` existed, `compactionSelector` existed, the engine's compactor existed, and no piece joined them. This is the join: the gauge watches, the selector decides, and the two read the same window.
