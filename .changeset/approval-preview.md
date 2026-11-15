---
'@aparte/core': minor
'@aparte/plugin-diff': minor
---

An approval question can now show what the call would do: a tool's display takes `approvalPreview`, and the panel mounts what it returns between the question and the buttons.

`approvalPreview(call)` returns an element, a string of HTML (sanitised) or `null`; `requestUserInput()` takes the same thing as `preview` on an approval request. `setupDiff()` registers a diff preview for an edit tool from its input (`before` and `after`, or `old_string` and `new_string`), and takes a `preview` option for another shape, or `false` for none.
