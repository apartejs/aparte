---
'@aparte/core': patch
---

Renaming a conversation with an input method (Japanese, Chinese, Korean) no longer commits or cancels the rename on the Enter or Escape meant for the word being composed.

Enter confirms a candidate and Escape cancels a composition. Firefox sends them flagged `isComposing`, and Safari sends that Enter after the composition with keyCode 229. The list took both for its own: the title was saved half converted, in the middle of the word, or the rename was thrown away.
