---
"@aparte/core": patch
"@aparte/plugin-ask-user": patch
---

Four visual touches from the UI audit. Popovers and the select dropdown cast a real, two-layer shadow (`--aparte-popover-shadow`, `--aparte-select-shadow` — set them yourself if you had): on cream the old one was imperceptible. The recommended elicitation option no longer shows its tinted border under the focus ring — one ring at a time. On a coarse pointer the bubble's action bar buttons grow to the touch-target size, like the other controls already did. And `@aparte/plugin-ask-user`'s receipt shows the answer in the strong text colour rather than success green — the one hue outside the palette on the whole transcript.
