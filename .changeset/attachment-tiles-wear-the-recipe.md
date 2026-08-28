---
"@aparte/core": patch
---

Attachments under a sent message render as real tiles — the same thumbnail tiles the composer previews — instead of a bare "PDF" beside an unframed image. The attachment strip and tile rules moved from `composer.css` to the display layer (`thumbnail.css`), where a recipe shared by two components belongs.

If you restyled the strip through `.aparte-attachments` or `.aparte-thumb…` selectors nothing changes: the class names are the same, only the sheet that declares them.
