---
"@aparte/core": patch
---

The image-preview button is now the thumbnail image rather than the tile: the ✕ is no longer a button nested inside a button, and the tile no longer announces its file name three times.

In the composer's pending strip, `role="button"` sat on the tile, and the tile wraps the remove `<button>`. No role permits a button inside a button, and the outer one takes its name from its contents — so a screen reader read the file name from the `title`, again from the hover overlay, and a third time inside "Remove report.png", then offered two nested controls with no way to tell which an Enter would reach.

The role, the tab stop and an explicit `aria-label` (the file name, once) now sit on the `<img>`, which is what the preview opens; the ✕ sits beside it. Its focus ring is drawn inset, because the tile is the frame and clips: an outline drawn outward from an image that fills the tile would not be visible at all.

The sent-message strip in the bubble is unchanged and keeps the role on its tile — it has no ✕, so nothing is nested and the tile is the whole control.
