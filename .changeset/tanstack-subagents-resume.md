---
'@aparte/runner-ag-ui': patch
---

A TanStack AI sub-agent that paused for an approval now resumes: the runner sends the sub-agents' own messages back with the answer. Nothing to change in your code.

- **The resume carries the sub-agents' messages.** TanStack AI continues a paused sub-agent only from
  its own messages, found after the last user message, each tagged with its `subagentRunId`, with
  its card in `metadata.tanstack.subagent` (name, status, the interrupts it waits on, the router's
  plan). The page's history never holds a sub-agent's words, so the resume carried none, and
  TanStack refused it: `Resume entry references unknown interrupt`. The runner now keeps what each
  sub-agent wrote and ran, hands it to the page in the pause's ticket, and sends it after the
  history on the resume. A sibling that had finished is sent as finished, so TanStack does not run
  it again; the answer to a browser tool a sub-agent called goes with that sub-agent's messages,
  after the one that declares the call. Only to TanStack AI (a run whose events carry
  `metadata.tanstack`): any other AG-UI agent keeps its sub-agents' work itself, and its resume is
  unchanged. Verified against TanStack AI 1.0's real `chat()`, with a router and with agent tools.
- **One plan card across a pause.** The router's plan used the run's id, and a resumed run has a
  new one, so the resume drew a second card. The card's id now comes with the ticket, and so does
  what it had ticked; the page's resumed run updates the card in place (with `@aparte/core` of the
  same release, whose stream adapter finds an activity a paused run placed on the reply).
- **A run's usage is its own when its sub-agents ran.** TanStack AI puts the sub-agents' model calls
  on the run's `RUN_FINISHED` too, after the run's own report, so the runner reported the last
  sub-agent call's usage as the reply's. It now reads the run's own (the first entry), and none
  when the run's own model never spoke (a router that only delegates).
