---
"@aparte/core": minor
---

One recipe for "this one": `aparte-mark` (display/mark.css) — an intent tint on the ground and a bar on the start edge, primary by default, with `--success`, `--danger`, `--neutral` and `--quiet` (the outcome that did not happen: no tint, no bar, muted). Two tokens move every mark at once: `--aparte-mark-tint` (18%) and `--aparte-mark-bar` (2px). The select's chosen option keeps its look and now reads those tokens; a checked field choice (the elicitation panel's options) gains the tint and the bar beside its primary border; the active conversation gains the bar. Any row, option or button can wear the class.

Tool-call rows: rejected and aborted no longer share the error ink — both keep the muted voice, and the glyph tells them apart (a cross for rejected, a stop square for aborted). Red stays for what went wrong.
