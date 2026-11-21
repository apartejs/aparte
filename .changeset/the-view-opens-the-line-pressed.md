---
'@aparte/plugin-subagents': patch
---

Open on a sub-agent's line now shows that sub-agent in the view, even when another sub-agent of the reply has the same id.

A backend that mints sub-agent ids per run names a resume's first one like the paused run's. The view took the first sub-agent under that id, drew the other's writes over it while it ran, and both lines read as the one shown. `connectSubagentView` now hands the view the call of the line pressed, and only that line is marked.
