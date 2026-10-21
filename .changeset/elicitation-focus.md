---
'@aparte/core': patch
---

A question or approval panel no longer steals the focus from a reader writing elsewhere on the page or using another chat.

The panel focused itself on every open, so a turn the reader did not start pulled the focus out of the field they were typing in, and the page with it. It now leaves the focus in place when it is in an editable field outside the chat or in another chat. Everywhere else it takes it as before, since the focus is how the panel is announced: from the chat, from a button of your own beside it, and from nowhere (a click in Safari, a screen reader's activation), in which case the page is not scrolled. It gives the focus back on close.
