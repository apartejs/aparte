---
'@aparte/core': patch
---

An open `<aparte-select>` (the model selector, the approval mode) now answers only the keys typed in it, and Tab closes it.

It listened on the whole document: open, it took Enter, the arrows and Escape typed anywhere. Tab back to the composer left it open, and Enter there sent the message, then also switched the model. Its Escape also came after every listener on the way up, so inside a launcher the whole chat closed on the Escape meant to dismiss the list.
