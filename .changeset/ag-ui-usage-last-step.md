---
'@aparte/runner-ag-ui': patch
---

A reply from an AG-UI agent now reports the usage of its last model step, as a run in the page does, so the context gauge no longer overstates a multi-step run.

The runner added every step's usage together — TanStack AI reports one per model step — and `<aparte-context>` reads a reply's usage as the size of the context, so a three-step run read as three times the context it used.
