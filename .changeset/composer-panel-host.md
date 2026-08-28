---
"@aparte/core": minor
---

Mark any descendant of `<aparte-composer>` with `data-aparte-panel-host` and `showPanel()` mounts the panel inside it. Without the marker nothing changes: the panel still goes right after the first `<aparte-composer-input>`.

"After the input" is a position, not a choice — a layout with the input in a row and the panel meant for a block of its own had no way to say so, and a builder that lays the composer out for you needs to.
