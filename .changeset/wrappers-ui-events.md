---
"@aparte/react": patch
"@aparte/vue": patch
"@aparte/svelte": patch
"@aparte/angular": patch
---

`<AparteUi>` forwards ten more events when you pass no `events` of your own: `aparte-suggestion`, `aparte-context-threshold`, `aparte-scroll-rail-jump`, `aparte-sidebar-toggle`, `aparte-split-resize`, and the turn's lifecycle — `aparte-message-start`, `aparte-message-done`, `aparte-message-error`, `aparte-message-aborted` and `aparte-tool-approval-request`.

No wrapper code changed: the default list is `APARTE_DEFAULT_UI_EVENTS`, it lives in `@aparte/core`, and the ten names joined it there. It is repeated here because this is the CHANGELOG a wrapper consumer reads, and the effect is theirs — watching a turn end used to mean reaching past `<AparteUi>` for a `window` listener, and this release's shell elements (`<aparte-sidebar>`, `<aparte-split>`, `<aparte-scroll-rail>`) speak through the proxy from their first version.

If you pass your own `events` array you are unaffected: that list is used verbatim, as before.
