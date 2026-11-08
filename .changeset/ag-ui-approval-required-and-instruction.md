---
'@aparte/runner-ag-ui': minor
---

The AG-UI runner now asks for an approval on the interrupt reason `approval_required`, and sends the words of a refusal to the agent.

`approval_required` is what the Laravel AI SDK sends. A refusal goes back as `{ approved: false, instruction }` when the person wrote what to do instead; the agent reads `approved` as before.
