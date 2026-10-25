---
'@aparte/core': minor
---

**`auto-compact` on `<aparte-context>` is deprecated.** It still works, and your page keeps compacting as before, but it will be removed in a future major version: `@aparte/plugin-compaction` now decides when to compact (after a turn, and before a send that would overflow), so the gauge no longer needs to ask. Remove the attribute once your page runs the plugin's new release.

The gauge is now a button that opens a panel with what fills the window, and it no longer goes blank after a compaction.

What you may have to change:

- **After a compaction or a Restore, the gauge shows an estimate with a `~` prefix (`~12K / 128K`) instead of going blank until the next turn.** A reading you used to wait for is now there at once; an estimate is never drawn as if it were the provider's number. `aparte-context-threshold` fires on the estimate as it does on a reported number.
- **The gauge's markup changed.** The reading (`.aparte-context__text`) is inside a `<button class="aparte-context__toggle">`, and a hidden panel (`.aparte-context__panel`) follows it. The meter keeps its `role="meter"` and its label. CSS that targeted the gauge's direct children needs a look.
- A turn the model refused as over its window (`aparte-message-error` whose error code is `USAGE_CONTEXT_EXCEEDED`, for this gauge's chat) turns it `danger` whatever the number says, until the next reply reports.

What is new, all additive:

- A disclosure: the button has `aria-expanded` and `aria-controls`; click, Enter and Space open it, Escape and a click outside close it, and nothing opens on hover. The panel lists the system prompt, the tools, the summary of a compacted history, the messages, "other", what is free, and the total against the window. The parts are estimates and say so; they are scaled down for display so they never add up to more than the total.
- With a compactor registered (`setCompactor`) whose `preview()` returns something, the panel says "Compacting now would free ~N tokens" and offers **Compact now** (`compact({ force: true, reason: 'manual' })`). While it runs the element has `data-compact="running"`, after a failure `data-compact="failed"` and Retry in the panel. Both come from the `aparte-compact-start`, `-done` and `-error` events of the gauge's own chat.
- `aparte-compact` detail gains `auto` (set by the deprecated `auto-compact`, so the plugin can tell it from a button) and `window` (the window the gauge measured against). The `AparteContext.measure` getter returns the reading drawn.
- Nine optional locale keys: `contextSystem`, `contextTools`, `contextSummary`, `contextMessages`, `contextOther`, `contextFree`, `contextTotal`, `contextReclaim` (`{n}`) and `contextCompactNow`. Retry reuses `retry`. A locale without them falls back to the built-in English.

Why. The gauge drew the one number the last turn reported, so a compaction left it blank or wrong, and it said nothing about what the number was made of. Reading `measureContext` over the chat's own transcript fixes the first; the panel answers the second, and puts the one action that helps (Compact now) next to the number that asks for it.
