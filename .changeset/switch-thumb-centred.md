---
"@aparte/core": patch
---

The switch's thumb is centred in its track, and the track is 40×22 with a 2px inset. The thumb's size is now derived from the track (`--aparte-switch-thumb-size` = height − 2 × border − 2 × inset) instead of being a fourth number set by hand, so the three cannot drift apart again; a theme that changes the height gets a thumb that still fits. `--aparte-switch-width`, `--aparte-switch-height` and `--aparte-switch-thumb-inset` are the knobs.

It had been off by a pixel on one axis and the four values had been tuned separately — a defect you saw the moment the density preset made the control larger.
