---
"@aparte/core": patch
---

A file in a sent message can open: declare `setHostHandlers({ filePreview: true })` and its tile sends `aparte-attachment-preview`, which now carries the file's `type`.

Images keep their own declaration, `attachmentPreview`, so a lightbox written for images is never handed a PDF. A file tile becomes a button only when its URL is one a tab can open — the composer's object URL, or a remote URL; a `data:` URL stays a plain tile. The event's `type` is the MIME type (`''` when unknown) on every preview, the image ones included.
