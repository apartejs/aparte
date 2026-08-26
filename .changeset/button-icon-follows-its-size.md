---
'@aparte/core': patch
---

A button's size modifier now moves its icon with it. `--aparte-btn-icon-size` was a
fixed 16px, so the same glyph filled 80% of a `--sm` button and 44% of a `--lg` one —
which is no longer the same icon. `--sm` and `--lg` now set it too, from the icon scale,
keeping every size at the `--md` ratio. The comment above that rule already claimed this
("sized with the button so the two axes stay in step"); it now does it.

`.aparte-action-btn` and `.aparte-art-card__btn` carried `aparte-btn--sm` AND a
width/height of their own of 28px — which is the `--md` default the modifier was
contradicting. They declare `--aparte-btn-size` instead and drop the modifier, so their
icons are unchanged at 16px. Genuinely small buttons (conversation actions, the
attachment remove) go from a cramped 16px glyph to 12px.

Note the limit: the icon follows the size MODIFIER, not the button's pixel size. A
component that sets `--aparte-btn-size` on its own — the send button and the
scroll-to-bottom button, both 36px — still gets the default 16px icon.
