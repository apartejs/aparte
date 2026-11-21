---
'@aparte/plugin-subagents': patch
'@aparte/plugin-artifacts': patch
---

An Escape that ends an IME composition in a field inside `<aparte-subagent-view closable>` or `<aparte-artifact-panel>` no longer closes the pane.

A Japanese or Chinese reader cancelling a conversion candidate in a field inside the pane (a diff comment, say) folded it mid-composition: the field now leaves that Escape to the composition, and the pane read it as its own.
