---
'@aparte/core': patch
---

**A bubble with nothing to paint no longer paints a box.** Reported from the page: send
a file with no text, and the message showed an empty coloured rectangle under the chips.

`.aparte-message-content` carries the user bubble's background, padding and radius, and
the attachment chips render **above** it, outside it. So a message that is only
attachments left that box with no content, no segments and no waiting dots — and it drew
itself anyway.

It is hidden now when it is empty **and not waiting**, which is the whole rule: the
assistant's typing dots live inside that same box, and a fresh streaming bubble is empty
by definition. Hiding on emptiness alone would have taken the typing indicator with it —
asserted, not assumed.
