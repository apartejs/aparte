---
"@aparte/core": patch
---

The action bar's first glyph starts on the text column; every inline recipe of the kit sits on the midline (`vertical-align: middle`); the avatar's initials, corner and group overlap scale with its size — `--aparte-avatar-initials-ratio`, `--aparte-avatar-radius-ratio` and `--aparte-avatar-overlap-ratio` replace the absolute `--aparte-avatar-font-size`, `--aparte-avatar-radius`, `--aparte-radius-avatar` and `--aparte-avatar-group-overlap` — and the assistant avatar's text is the text colour.

The most reproducible defect of the audit: in 14 previews the first action button's ink began 5 to 8px right of the paragraph above it, because a glyph is centred in a 24px box; the bar takes that slack back. Inline boxes fall on the baseline unless they say otherwise, and none did: the icon button rode 3px above its neighbours, three spinners shared a bottom edge instead of a centre. The 40px avatar drew the same 11px initials as the 32px one, its corner drifted from squircle to square up the ramp, and a 6px overlap was a fifth of a small avatar and a tenth of a large one — the fractions are computed on the element so a size modifier moves them.
