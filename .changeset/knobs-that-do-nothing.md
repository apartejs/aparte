---
'@aparte/core': patch
---

Fixed: ten documented `@cssprop` knobs did nothing.

When a component stopped drawing its own radius or colour and let `.aparte-btn` /
`.aparte-field` draw it, the component's own token lost its last reader — and stayed in
the JSDoc, so each component's generated page kept listing it. Setting
`--aparte-radius-send-btn`, `--aparte-radius-action-btn`, `--aparte-conv-delete-radius`,
`--aparte-conv-archive-radius`, `--aparte-elic-input-radius`,
`--aparte-elic-step-underline`, `--aparte-action-bar-btn-color`,
`--aparte-branch-picker-btn-color`, `--aparte-thumb-remove-bg` or
`--aparte-thumb-remove-color` had no effect. Each now feeds the recipe that draws it, so
all ten work again and the values they name are back — the conversation and composer
action buttons return to their documented 4px corner.

One of them was a visible regression, not just a dead knob: the attachment remove button
had lost its dark scrim and its white glyph, leaving a muted ✕ directly on the picture,
invisible over anything light.

`.aparte-field` gained `--aparte-field-radius`. It was the only recipe that hardcoded
its corner while every sibling names it, so a field could not be re-cornered from its
own element the way a button or a tag can.

`check:derived-vars` now refuses a `@cssprop` that no stylesheet reads. That is the rule
that would have caught all ten the day they broke.
