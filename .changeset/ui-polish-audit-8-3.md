---
"@aparte/core": patch
"@aparte/plugin-ask-user": patch
---

Four visual fixes: popovers and the select dropdown cast a visible shadow, the recommended elicitation option shows one focus ring instead of two, the bubble's action-bar buttons reach the touch-target size on a coarse pointer, and `@aparte/plugin-ask-user`'s receipt shows the answer in the strong text colour instead of green. The shadows are `--aparte-popover-shadow` and `--aparte-select-shadow` — set them yourself if you had: on cream the old one was imperceptible. The recommended option no longer shows its tinted border under the focus ring — one ring at a time. On a coarse pointer the action-bar buttons grow like the other controls already did. And the receipt's green was the one hue outside the palette on the whole transcript.
