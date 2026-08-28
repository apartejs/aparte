---
"@aparte/core": minor
---

`showPanel()` now mounts the panel inside any `<aparte-composer>` descendant marked `data-aparte-panel-host`. Without the marker nothing changes: the panel still goes right after the first `<aparte-composer-input>`.

"After the input" is a position, not a choice — a layout with the input in a row and the panel meant for a block of its own had no way to say so, and a builder that lays the composer out for you needs to.
