---
'@aparte/plugin-cards': patch
---

An item of the items card that links to `mailto:` or `tel:` opens the mail or phone app, not an empty new tab.

- The item's link asks the chat's link target (`config.decideLink`), as a link in a reply does: a web page opens in a new tab, and says so to a screen reader; a `mailto:` or `tel:` link gets no `target`, and no "opens in a new tab".
