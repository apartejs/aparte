---
'@aparte/core': minor
'@aparte/locales': minor
---

Add `aparteGlobalConfig.setTurnSummary()`: reasoning and consecutive tool calls fold behind one line. Off by default, and with it off the DOM does not change.

While the steps run the line says `Working…` and names the current tool; afterwards it says `Worked 9 s · 7 tools`, or `Used 7 tools` on a stored turn that carries no timing. `setTurnSummary({ openWhileRunning: true })` keeps the fold open while it works, and never closes one somebody opened.

A call waiting for approval, a call that failed and a tool with its own `registerToolRenderer` stay outside the fold, since those are what somebody has to read. A `hidden` tool is neither counted nor breaks the run, and a single step is never folded.

New locale keys, added in all nine bundles: `turnWorking`, `turnWorked`, `turnUsed`, `turnTools`. `turnTools` is a plural form string by `Intl.PluralRules` category (`one:{n} tool|other:{n} tools`).
