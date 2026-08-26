---
'@aparte/core': minor
---

The masters now reach the component tier, which is what makes them masters.

`--aparte-space-unit` moved the scale and stopped there: 28 component tokens were
literals whose values already WERE steps — `--aparte-message-gap` was `12px`, which is
`space-6` — so a chat at `--aparte-space-unit: 3px` grew its gutters and kept its
message padding at 16px. It scaled crooked. They derive now.

Proven in a browser, side by side: at `--aparte-space-unit: 3px`,
`--aparte-radius-unit: 4px`, `--aparte-font-scale: 1.25` on ONE `<aparte-chat>`, its
message padding goes 16/12px → 24/18px, its viewport padding 16 → 24px, its option
radius 8 → 16px and its content text 15 → 18.75px, while the sibling chat at the
defaults does not move.

And measured the other way: of 317 pre-existing tokens resolved on a real property in
both themes, **not one changes value**. This is a pure refactor.

### The line, because there is one

The spacing scale governs gutters, padding and margin. The radius scale governs
corners. The type scale governs text. **None of them governs a stroke width or a
control's size.** `--aparte-thinking-rail-width` stays `2px` because loosening spacing
must not thicken a rule, and `--aparte-avatar-size` stays `32px` because tightening it
must not shrink an avatar. Both verified to stay put under a moved master.

Eight text sizes were px and are rem now (`--aparte-content-font-size`,
`--aparte-input-font-size`, `--aparte-avatar-font-size`, `--aparte-name-font-size`,
`--aparte-timestamp-font-size`, `--aparte-branch-picker-label-size`,
`--aparte-input-editor-font-size`, `--aparte-status-font-size`) — identical at a 16px
root, and following the reader's browser setting elsewhere, like the rest of the
typography.
