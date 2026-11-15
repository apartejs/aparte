---
'@aparte/core': patch
'@aparte/plugin-triggers': patch
'@aparte/plugin-approval': patch
'@aparte/plugin-diff': patch
'@aparte/plugin-artifacts': patch
'@aparte/plugin-model-selector': patch
---

An element handed a value it already holds no longer closes, unfocuses or resets what the person was doing in it — re-rendering a framework wrapper with the same props is now harmless.

- `<aparte-triggers>`: re-setting `triggers` keeps the open list open, on the row the keyboard was on, when the trigger it shows is still declared. The commands-and-mentions recipe re-set it on every React render, so the list opened on `@` and closed at once.
- `<aparte-approval-mode>`: re-setting `labels` renames the options in place, so an open list stays open.
- `<aparte-diff>`: re-setting `diff` with the change it shows — the same text or object, or an equal one, such as an inline `{ path, before, after }` — keeps the lines picked, the comment field and its text, the folds and the focus.
- `<aparte-artifact-panel>`: re-setting `render` with the same function keeps the tab and the preview the reader chose.
- `<aparte-conversation-list>`: re-setting `conversations` while a row's menu is open or a title is being renamed waits for them to end, instead of closing the menu and dropping what was typed.
- `<aparte-suggestions>`: re-setting `suggestions` keeps the focused chip and the row's scroll.
- An attribute written again with the value it has does nothing, on every element of core and the plugins (eleven of them redrew or rewrote their parts).

`applyElementProps`, which every `AparteUi` and the generated React components use, now writes an attribute or a CSS variable only when it differs from the value it last wrote on that element; an object or a function is still assigned every time, because it may have been mutated in place (a Vue `push` behind a deep watch, a Svelte 5 proxy, Svelte 4's `arr = arr`). An element that changes its own attribute keeps what it did until the prop next changes, as the React components already behaved.

A test reads every element of core and of the seven plugins with a manifest and holds each to this: an attribute written again makes no mutation under the element, and a property assigned again keeps the focus and what is open, selected or typed.
