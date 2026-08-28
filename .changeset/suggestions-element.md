---
"@aparte/core": minor
"@aparte/locale-fr": patch
---

New `<aparte-suggestions>`: a row of prompt starters. Give it `suggestions='["…", {"label": "…", "prompt": "…"}]'` (or set the `suggestions` property), and a click fills the composer and submits it; `mode="fill"` only fills and focuses, `empty-only` hides the row after the first send, `target` names the chat when the element sits outside its composer. It fires a cancelable `aparte-suggestion` first. New locale key `suggestionsLabel` (the group's accessible name), translated in `@aparte/locale-fr`.

Every chat product opens on three or four of these, and the example app hand-rolled them — four buttons, a click handler, a CSS recipe of its own. The click goes through the composer's `submit()` on purpose: that is where every gate lives (disabled, streaming, `requireModelSelection`), and a chip that bypassed them sent a request with an empty model id while the composer was visibly greyed out. The chips wear the `aparte-btn` recipe, so a theme reaches them with no knob of their own.
