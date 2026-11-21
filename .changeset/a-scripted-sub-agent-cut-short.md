---
'@aparte/provider-scenario': patch
---

A scripted sub-agent cut short is reported to the parent model as cut short, with what it found.

The delegate tool's report knew only `done` and `failed`: a sub-agent that ended `partial` (its turn limit, a call it could not make) read "was stopped before it answered" and its text was dropped, while its line said Cut short.
