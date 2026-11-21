---
'@aparte/core': patch
---

The kit's dialog attributes (`data-aparte-dialog-open`, `data-aparte-dialog-close`, the backdrop click) now work inside an app's own shadow root.

A click from a shadow root reaches the document with the shadow host as its target, so the opener and the closer were never found, and the dialog was looked up in the document, where it is not. The click is now read where it began, and the dialog is found in the opener's own root.
