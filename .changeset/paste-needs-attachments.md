---
'@aparte/core': minor
---

A pasted image now attaches only on a composer that offers attachments (one with an `<aparte-composer-add-attachment>`, which `attachments` on `<aparte-chat>` renders). On a composer without it, pasting an image adds nothing.

It used to attach on any composer: a chat that offered no attachments — no paperclip, no drop target — still collected a pasted screenshot and sent it with the message. Paste now follows the same signal drag and drop answers to.
