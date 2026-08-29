---
"@aparte/core": patch
---

The ✕ on a pending attachment now appears when it is focused and on touch devices — it was the only way to remove one.

`.aparte-thumb__remove` sat at `opacity: 0` with a single `:hover` rule to reveal it. A keyboard user tabbing onto it got a focus ring drawn around nothing; a touch user, who cannot hover at all, never saw it and could not drop a file attached by mistake. The sheet now pairs `:focus-within` with the hover rule — the same pair the message action bar and the conversation row already use, which is what makes this an omission rather than a design — and the coarse-pointer block shows it outright, beside the conversation row's ⋯ that is there for the same reason.

`e2e/tests/attachments.spec.ts` passed through all of it: Playwright's visibility check ignores `opacity`. The new unit suite asserts the sheet and the control together, because the two halves hold each other up — `:focus-within` can only ever match if the ✕ is genuinely focusable.
