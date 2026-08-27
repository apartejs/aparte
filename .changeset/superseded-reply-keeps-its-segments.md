---
'@aparte/core': patch
---

An error on a reply that left the active path no longer destroys what it streamed.

`_handleLifecycleError` follows an "append the error, never replace the reply" rule — and
implemented it with `getMessages()`, which returns only the currently ACTIVE path. So the
rule held for the reply being streamed and silently became a full replace for any message
that had left that path.

A retry or an edit on an earlier bubble does exactly that to a reply still in flight: it
stays in the tree, drops off the active path, the lookup then finds nothing, and
`updateMessage` — which resolves ids tree-wide — overwrites every token, thinking block and
resolved tool call with a single error segment. Nothing is visible at the time; the loss
shows up later, when the reader opens that branch in the sibling picker and finds a bare
error where a complete answer used to be.

It now prefers the tree-wide `getMessage(id)`, which the viewport already exposed and the
client's target interface simply did not declare.

The same commit closes the asymmetry that made the race reachable: `aparte-retry` and
`aparte-edit` reset the abort flag but, unlike `aparte-send`, never cancelled the previous
turn's tool controllers — so a handler from the superseded turn kept running with its
timeout counting. All three now share one `_beginUserTurn()`.

Found by a cold audit. It survived adversarial review with one correction worth recording:
the two shipped providers swallow `AbortError` and close quietly, so the loss is not
reachable through them — it is deterministic on `AparteBackendTransport`, whose parser
turns a cut connection into a thrown error.
