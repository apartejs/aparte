---
'@aparte/core': minor
---

The scroll-to-bottom button is `aparte-btn--lg aparte-btn--circle` and stops redrawing
what that already means.

Its 36px box is exactly `--aparte-btn-size-lg`, so naming the size gives it the box, the
round corner and a 20px glyph for free — the arrow was 16px in a 36px circle, 44% of its
box where the rest of the library reads at ~57%.

**Removed:** `--aparte-scroll-btn-bg`, `--aparte-scroll-btn-hover-bg`,
`--aparte-scroll-btn-color` and `--aparte-scroll-btn-border`. Each resolved to exactly
what `aparte-btn--surface` already applies (`var(--aparte-surface-1)`,
`var(--aparte-surface-2)`, `var(--aparte-text)`, `var(--aparte-border)`) — four names
for one thing. Rendering is byte-identical in both themes; measured. To restyle the
button, target `.aparte-scroll-btn` directly, which light DOM has always allowed.
`--aparte-scroll-btn-size` and `--aparte-scroll-btn-shadow` stay: they are the two
things the recipe has no word for.

Also fixed: a consumer's custom bubble action button rendered without the button recipe,
so it had no focus ring, no hover and no padding reset. Three dead CSS rules for
`aparte-composer-dictate` — an element that has never existed — are gone. And
`<aparte-progress-spinner>`'s `--aparte-spinner-size` was documented as 14px when it has
always been 16.
