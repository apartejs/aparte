---
"@aparte/core": patch
---

Selecting text in a dialog and releasing outside it no longer closes the dialog. A programmatic `dialog.click()` no longer closes it either — use `close()`.

A `click` fires on the nearest common ancestor of where the press landed and where it was released, so a selection dragged a few pixels past the box targets the `<dialog>` itself — identical, from the click alone, to a deliberate press on the backdrop. Reproduced in all three engines, in both directions (press outside, release inside, same result).

The backdrop dismissal now asks for both ends of the gesture on the backdrop. The cost is the second line above: a synthetic click has pressed nothing, so it is no longer a dismissal.
