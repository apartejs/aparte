---
'@aparte/core': patch
---

After a reload, resuming a reply paused on a sub-agent's call no longer tells the model the call that opened the sub-agent was stopped.

`@aparte/plugin-subagents` marks that call `awaiting-approval` while the sub-agent's question is up. Loading the reply turned it into `aborted`, so the resume answered it "The tool call was stopped before it ran." for a delegation whose sub-agent was about to go on, and its line read Stopped. In a reply paused on `deferredCalls` no gate of the page is open, so a waiting call is kept open and the resume hands it back open.
