---
'@aparte/core': patch
---

A select's trigger text is now the value it shows and nothing else, so `textContent` of the trigger reads "gpt-4o" and not every option's label run together.

Nothing to change in your code, unless a test read the hidden width labels (`.aparte-select-label-sizer > span`) as text: they now carry the label in `data-label` and CSS draws it as generated content. The trigger keeps the width of its widest option, as before. The testing guide lists the select's hook.
