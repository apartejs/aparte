---
'@aparte/core': patch
---

A framework chat's re-sync now carries every field a segment changed, a text segment's included, and a change the app wrote in place on the segment it handed over.

A reasoning block's label, a code block's language, an error's details reached the bubble only when the segment was drawn anew: for a segment with text, only the text was patched. And a field written in place (`seg.status = 'resolved'`, idiomatic in Svelte and Vue) was compared with the bubble's copy, which is the same object, so a resolved call kept reading as running. Each re-sync now compares with what was last handed over.
