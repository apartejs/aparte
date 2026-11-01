---
"@aparte/plugin-cards": patch
---

`--aparte-product-image-fit: cover` now fills the product card's photo frame; a photo that was not square used to leave bands above and below it.

The frame centres what it holds (for the placeholder's glyph), so the photo's 100% height never
resolved: measured 186×140 px in a 186×186 frame. Shop packshots, drawn with the default
`contain`, look the same as before.
