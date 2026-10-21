---
'@aparte/core': patch
---

A suggestion chip that sends now hands the focus to the composer, instead of dropping it to the page when its row hides.

With `empty-only`, the row hides as soon as the message is on its way, and the chip a keyboard user had pressed went with it: the focus fell to `<body>`. When the chip held the focus, the composer now takes it after the send. A click that did not focus the chip changes nothing.
