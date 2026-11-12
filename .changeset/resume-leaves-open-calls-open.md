---
'@aparte/core': patch
---

Resuming a paused reply no longer tells the model that a call still running, or still waiting for a person, was stopped: the call is left open for the agent to answer.

When a reply paused while a call was not finished — the call that opened a sub-agent, whose sub-agent stopped for an approval — the request that resumed it answered that call with the stopped-tool text, so the model read that it never ran. It now sends that call unanswered, as it already did for the paused call itself. A server-loop resume is unchanged: every call there has settled, or carries its own ticket, by the time the run pauses. Nothing to change in your code.
