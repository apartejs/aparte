---
'@aparte/plugin-artifacts': patch
---

A Markdown artifact is no longer cut off after its first code block, on screen or in Copy, Download and Open. There is nothing to change in your code.

The card looked for a closing code fence whether or not the document had opened one, so the first code block of a report ended the report. It now removes a fence only when one wraps the whole document, and it still drops what a model repeats after that fence.

A wrapped document keeps the code blocks inside it, and a Markdown document that opens on a code block of its own is left as it is. `stripCodeFences` is internal to the plugin, so its new `kind` argument changes no public name.
