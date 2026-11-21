---
'@aparte/core': patch
---

The server-loop guide now says how a host that lives as long as the conversation (an Electron main process) lets a sub-agent's calls ask a person: it runs `runStreamAgent` itself, with no `deferral` and an `approvalResolver` that waits.

A sub-agent opened by a tool of a `createAparteAgentHandler` turn cannot pause the run for an approval: the server pauses rather than waits, and a stateless server would have to keep the sub-agent's whole conversation between two requests to resume it. A long-lived host does not need the pause: its own loop waits for the answer, and the sub-agent asks like any other call. (apartejs/aparte#287)
