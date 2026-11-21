---
'@aparte/core': patch
---

Removing an attachment from the keyboard now leaves the focus on the next file's remove button, or in the editor when none is left, instead of on the page.

The strip is drawn again whole on every change, so the focused remove button was destroyed and the next Tab started again at the top of the page. A file added while a remove button has the focus keeps it on that file.
