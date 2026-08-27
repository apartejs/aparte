---
'@aparte/core': patch
---

The light theme's status colours failed WCAG AA wherever they were TEXT, and the dark
theme's solid buttons failed worse.

Two defects, one cause: a colour was doing two jobs.

**The intent as text.** `--aparte-primary`, `--aparte-info`, `--aparte-success`,
`--aparte-warning` and `--aparte-error` were both the FILL of a solid button or a badge
and the TEXT colour of every ghost, outline and soft button, the tool-call status, the
field error, and `--aparte-link-color` — so every link core renders. Read as text on
`--aparte-bg` in the light theme they measure 3.23, 3.29, 2.27, 1.92 and 3.37 against the
4.5:1 AA asks of body text.

An accent gains contrast by moving AWAY from its background — down on a light ground, up
on a dark one — so one value cannot serve both themes. Five `--aparte-*-ink` tokens now
carry the text role, per theme, and the recipes read them: the button's new
`--aparte-btn-intent-ink` defaults to the fill, so a consumer who sets only
`--aparte-btn-intent` is unaffected. Outline keeps the FILL on its border, which is not
text and clears the 3:1 it has to.

**The ink on a fill.** `--aparte-btn-ink` was `var(--aparte-text)`, which is near-black on
light and near-WHITE on dark. `button.css` had measured white against every intent and
rejected it in a comment — and the dark theme was silently getting it anyway. The solid
primary button read at 1.96:1, a success badge at 2.19, and the checkbox's checkmark the
same. `--aparte-on-intent: #14100a` is now fixed rather than theme-flipped, because the
fills are mid-to-bright in BOTH themes; it measures 5.04 to 8.82 across the five.
`--aparte-on-primary` stays white for `neutral`, the one intent dark enough to want it.

Found by running axe over the docs site's live component previews. Verified the same way:
17 page/theme pairs, from 63 contrast violations to zero. `--aparte-primary` itself is
unchanged — it is the brand colour, and the icon tints that read it clear the 3:1 a
graphic has to.
