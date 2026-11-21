---
'@aparte/core': patch
---

Escape and Tab typed in a field of a web component inside a modal dialog are the dialog's again: an open drawer or the launcher no longer takes them.

The drawer and the launcher leave a modal dialog's keys to it, and looked for the dialog around where the key began with `closest()`, which stops at the edge of the component's own shadow root: the drawer closed, or the launcher hid the chat, on the dialog's Escape. They now look along the key's whole path.
