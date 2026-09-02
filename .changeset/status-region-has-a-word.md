---
"@aparte/core": patch
---

`<aparte-chat-status>` now carries a screen-reader-only word inside its live region, so the default dots-only form is announced instead of being silent.

The container is `role="status" aria-live="polite"`, and a live region announces its CONTENT. In the dots-only default that content was an `aria-hidden` dot and an empty span — the empty string — so the whole state rode on `aria-label`, which names the region rather than reporting it. A sighted reader saw the dots pulse; a screen-reader user was told nothing.

One writer now keeps exactly one of the two text nodes populated: the visible `.aparte-status-text` when the `text` attribute is set (the label is already that same string, so a second copy would be read twice), and a new `.aparte-status-sr` span wearing the existing `.aparte-sr-only` recipe when it is not. No new CSS, no new token, and the documented dots-only LOOK is unchanged — nothing visible was added.

One edge aligns as a consequence: mounting with an empty `text=""` used to print the literal `Typing` on screen, where setting `text=""` after mount cleared it. Both paths now read an empty attribute as the dots-only default.
