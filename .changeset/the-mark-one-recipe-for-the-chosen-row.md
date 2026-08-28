---
"@aparte/core": minor
---

A new CSS class, `aparte-mark`, gives a chosen row one look everywhere: an intent tint on its ground and a bar on its start edge. `aparte-mark--success`, `--danger`, `--neutral` and `--quiet` pick the intent (primary by default), and two tokens move every mark at once: `--aparte-mark-tint` (18%) and `--aparte-mark-bar` (2px). The select's chosen option, a checked field choice and the active conversation wear it; any row, option or button can.

The recipe lives in `display/mark.css`. The bar is drawn in the intent's ink so it reads at 3:1 and above (the raw success fill was 2.27:1 on the light surface); `--quiet` is the outcome that did not happen: no tint, no bar, muted. The bar is a `::before` pseudo-element on the logical start edge, so a right-to-left row — `dir` on the document, on the row, or `auto` — gets it on the right edge. The select's chosen option keeps its look and now reads those tokens; a checked field choice (the elicitation panel's options) gains the tint and the bar beside its primary border, and keeps them under the pointer; the active conversation gains the bar (its ground stays the list's own).

Tool-call rows: rejected and aborted no longer share the error ink — both keep the muted voice, and the glyph tells them apart (a cross for rejected, a stop square for aborted). Red stays for what went wrong.
