---
"@aparte/core": minor
---

Open tool rows by default with `setSegmentDefaults('tool_call', { collapsed: false })`, or one tool's rows with its display's `open: true`.

The row was collapsed always and read no field. It reads the segment's `collapsed` now, as reasoning does, else the tool's display; closed stays the default, and an update never forces it.
