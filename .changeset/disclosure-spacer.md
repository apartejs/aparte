---
'@aparte/core': patch
---

Opening a tool row, a reasoning block or any `<details>` in the transcript no longer leaves a blank under the reply.

The bottom spacer, which lets the person's message rise to the top, is now recomputed when a disclosure opens or closes. It used to keep its closed-row size, so opening a tool row lengthened the transcript by the row's height (176px on the examples). Closes #105.
