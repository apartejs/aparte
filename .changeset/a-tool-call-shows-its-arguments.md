---
'@aparte/core': minor
'@aparte/locale-fr': patch
---

**A tool call now shows what went in and what came out**, and it is drawn as a row rather than a badge.

The pill named the tool and showed nothing else — not the arguments the model chose, not the result it got — while the segment carried both the whole time. Missing presentation, not missing data. It opens onto `Input` (pretty-printed JSON) and `Output`, coloured by a registered highlight provider when there is one and readable as escaped text when there is not.

**Collapsed, always** — including while the loop waits for a decision. The reasoning block stays closed while it is being produced, which is the most live moment there is, so a tool call has no stronger claim to unroll itself. One rule, no special cases. A `<details>` appears only when there is something behind it: a disclosure onto nothing is an affordance that lies.

**Breaking, pre-1.0: four CSS classes are renamed**, because a name in a public CSS contract must name a ROLE and not a shape — the shape belongs to whoever is styling it. `tool-pill` → `tool-label`, `tool-pill-icon` → `tool-icon`, `tool-pill-name` → `tool-name`, `tool-pill-spinner` → `tool-spinner`, `tool-pill-status` → `tool-state`. Same reasoning that retired `footer-left/center/right`: a name the design contradicts is a name that will lie.

**And it no longer looks like a tag.** The identity is neutral at every status — it used to be filled green when a call resolved and red when it was refused, which made a finished step shout louder than the reply it belongs to. The colour lives on a small state badge at the far end, which now carries a WORD as well as a glyph (`Running`, `Done`, `Rejected`, `Stopped`): a bare cross beside a name reads as a button that removes something, so the state was being mistaken for an affordance.

The renderer gains an `update`, which it never had. Without one the bubble replaced the element on every change — and a tool call changes status several times a turn, so a disclosure the reader opened would have slammed shut under them each time. A registered `registerToolRenderer` still owns its whole markup and is rebuilt rather than patched.

New locale keys: `toolInput`, `toolOutput`, `toolRunning`, `toolCompleted`, `toolRejected`, `toolStopped`, translated in `@aparte/locale-fr`. New themable variable: `--aparte-tool-row-radius`.
