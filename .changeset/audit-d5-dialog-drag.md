---
"@aparte/core": patch
---

The dialog recipe dismisses on a backdrop click only when both ends of the gesture landed on the backdrop: selecting text inside the box and releasing outside it leaves the dialog open, and a programmatic `dialog.click()` does not close it — call `close()`.

A `click` fires on the nearest common ancestor of where the press landed and where it was released, so a selection dragged a few pixels past the box targets the `<dialog>` itself — identical, from the click alone, to a deliberate press on the backdrop. Reproduced in all three engines, in both directions (press outside, release inside, same result).

So the dismissal asks for the press as well: `installDialogTriggersOnce()` records where `pointerdown` landed and the `click` handler only dismisses when that was the backdrop too. The cost is the second half of the first line — a synthetic click has pressed nothing, so it is not a dismissal.
