---
"@aparte/core": minor
---

One recipe for "this one": `aparte-mark` (display/mark.css) — an intent tint on the ground and a bar on the row's start edge, drawn in the intent's ink so it reads at 3:1 and above (the raw success fill was 2.27:1 on the light surface). Primary by default, with `--success`, `--danger`, `--neutral` and `--quiet` (the outcome that did not happen: no tint, no bar, muted). Two tokens move every mark at once: `--aparte-mark-tint` (18%) and `--aparte-mark-bar` (2px). The bar is a `::before` pseudo-element on the logical start edge, so a right-to-left row — `dir` on the document, on the row, or `auto` — gets it on the right edge. The select's chosen option keeps its look and now reads those tokens; a checked field choice (the elicitation panel's options) gains the tint and the bar beside its primary border, and keeps them under the pointer; the active conversation gains the bar (its ground stays the list's own). Any row, option or button can wear the class.

Tool-call rows: rejected and aborted no longer share the error ink — both keep the muted voice, and the glyph tells them apart (a cross for rejected, a stop square for aborted). Red stays for what went wrong.
