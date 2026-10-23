---
'@aparte/engine': patch
'@aparte/core': patch
---

An approval the page gave to a paused call no longer approves a later call that reuses its id: a resumed run asks about every new call again.

`deferral.outcomes` used to answer every call of the resumed run by id, not only the calls the run resumed. A vendor that sends no tool-call ids has them minted per stream (`aparte-call-1`, `aparte-call-2`, …), so the model's next turn could carry an id the resume had been answered for. An approval given for the paused `delete_file` then ran a new `delete_file` with other arguments, with nobody asked, and a refusal refused a new call that nobody had refused. This reached a server loop (`createAgentHandler`) and any host that drives `runStreamAgent` with `deferral`.
