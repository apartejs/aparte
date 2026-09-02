---
"@aparte/core": patch
---

The ✕ that removes a pending attachment is 24px on touch, not 18px.

It is the only way to drop a file attached by mistake, and 18px is under the 24 of WCAG 2.2 SC 2.5.8. The coarse-pointer block already made the button visible there — a finger cannot hover — but left it at the size a mouse gets.

24 is not a new number: it is the box `aparte-btn--sm` already draws (`--aparte-btn-size-sm: 24px`), so the component simply stops out-specifying the recipe on touch. Not the 44px `--aparte-touch-target-size` its neighbours take: the composer's pending tile is 56px (`--aparte-attachment-image-size`, set on `aparte-composer-attachments`), so a 24px ✕ is already 43% of its edge and a 44px one would cover most of the picture — matching the neighbours properly means growing the tile too, a separate decision.
