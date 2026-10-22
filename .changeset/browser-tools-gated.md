---
'@aparte/core': minor
'@aparte/engine': minor
'@aparte/runner-ag-ui': patch
---

A browser tool that a server loop or an AG-UI agent calls now goes through the page's approval gate before it runs: its `needsApproval` asks through the approval panel (or your `approvalResolver`), and the approval policy can allow or refuse it. A refusal goes back as the call's answer, which the model reads.

Until now the page ran such a tool as soon as the server or the agent called it: the gate it gets in the page's own loop was skipped, so a `needsApproval` browser tool ran unasked and a plan-mode policy did not stop it. A tool with no `needsApproval` under no policy still runs at once.

`@aparte/engine`: a deferred external call answered with `{ kind: 'decision', approved: false }` is refused like a gated call — `tool-rejected`, the refusal as its `tool` message, and another turn so the model reads it — where it used to be deferred again. `@aparte/runner-ag-ui` sends that refusal to the agent as the frontend tool's result.
