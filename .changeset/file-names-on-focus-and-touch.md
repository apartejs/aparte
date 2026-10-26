---
"@aparte/core": patch
---

An attachment tile now shows its file name on a touch screen all the time, and on keyboard focus where the tile takes it — a pending file through its ✕, a picture the app opens previews for — not only on hover. A sent file tile that is not a control still shows it on hover and on touch.

The tile's label shows only the extension, so two PDFs looked alike to anyone who could not hover. The name keeps its scrim over a picture. On a touch screen, where it is always shown, the sent strip's tiles grow to 56px and the composer's to 72px, the name's band is tighter, and a sent file's extension sits above it, so the name covers about 40% of a sent tile instead of 79% and no label hides under a pending file's ✕.
