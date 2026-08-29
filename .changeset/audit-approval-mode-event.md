---
"@aparte/core": minor
---

`aparte-approval-mode-change` carries a typed detail: `AparteApprovalModeChangeEventDetail` (`{ mode, previousMode }`) is exported from `@aparte/core` and is in `AparteEventMap`, so a listener reads `e.detail` without a cast.

The event is dispatched by `@aparte/plugin-approval`'s `<aparte-approval-mode>` when the person switches mode; it bubbles and crosses shadow roots, so a host can persist the choice from any ancestor. `@aparte/plugin-approval` re-exports the type. It is not in `APARTE_DEFAULT_UI_EVENTS` — a plugin's events never are — so under a wrapper, pass the name: `events: ['aparte-approval-mode-change']`.

The type lives in core for the same reason `AparteModelChangeEventDetail` does: the event map is core's, and a listener in any framework reads its detail through it. `mode` and `previousMode` are plain strings — the four values (`plan`, `ask`, `auto-edit`, `auto`) are the plugin's, and core names none of them.

`pnpm check:event-map` refuses an event dispatched with a detail and absent from the map, since every listener would otherwise cast.
