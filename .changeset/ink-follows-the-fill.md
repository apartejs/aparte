---
'@aparte/core': minor
---

The ink on a solid fill is derived from that fill, instead of written down.

**What was wrong.** `--aparte-on-intent: #14100a` was a hex chosen by measuring contrast
against THIS repo's own five intent fills, and every solid button, badge and checkbox
took its label colour from it. That made core's rendering depend on core's palette — in
a library whose whole premise is that consumers bring their own. Our theming guide
teaches an eight-line rebrand and a one-attribute
`<aparte-chat style="--aparte-primary: #16a34a">`, and names that token in neither, so a
consumer with a dark brand colour got near-black painted on it with no signal:
**1.11:1** measured on a navy `#1a1a2e`, **1.83:1** on slate `#334155`.

**And it was already broken here.** Escaping that constant needed a per-intent exception,
and `--neutral` had one — a hardcoded white, copied into `button.css`, `display/badge.css`
and `field.css`. The exception was pinned while the FILL flips with the theme
(`#6d6479` → `#a89bb6`), so on the stock palette, in dark mode, the solid neutral button's
label, the neutral badge's text and the neutral checkbox's checkmark all shipped at
**2.62:1**. Nothing measured it.

**What changes.** Each recipe now computes its ink from its own fill: keep the hue, drop
the chroma to a trace, and pick lightness 0 or 1 either side of the new
`--aparte-ink-flip` (0.57). This is not new art — Bootstrap has had `color-contrast()`
for years and Material's `on-*` tokens are generated per palette; this repo had borrowed
Material's naming and backed it with a constant.

Measured in a browser on the built stylesheet, **28 of 28** control/intent/theme
combinations now clear AA, where `neutral` in dark read 2.62. The derivation also matches
or beats the old hand-picked value on every one of the nine fills this palette declares,
so nothing regressed to get there.

- **Removed:** `--aparte-on-primary`. Its only readers were the three `--neutral` rules
  above; it is gone with them rather than left documenting a job it did not do. It was
  also cited on `<aparte-composer-send>` as the send icon's colour, which that button
  never read — the JSDoc now names `--aparte-btn-on-intent`, which it does.
- **Added:** `--aparte-ink-flip`, one knob for the flip point across all three recipes.
- **Kept:** `--aparte-on-intent`, now only the fallback for a browser without relative
  colour syntax (Firefox before 128), reached through `@supports`. A custom property does
  not fall back on an unparsable value the way a real property does, which is why the
  guard is `@supports` and not a second declaration.

Overriding `--aparte-btn-on-intent` / `--aparte-badge-on-intent` /
`--aparte-checkbox-on-intent` still wins, so a consumer who wants a specific ink says so.
