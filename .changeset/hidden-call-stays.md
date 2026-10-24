---
"@aparte/core": minor
---

A hidden tool call — `registerToolDisplay(…, { hidden: true })`, or a renderer that draws nothing — now stays in the message and in the model's history.

A call whose renderer returned `''` at tool-start was never added to the message, and the history a later turn sends is rebuilt from the message: from the next turn on, the model no longer saw a call it had made, nor its answer. A reload drew the default row for it instead. Every call is added now; a hidden one draws an empty `hidden` placeholder, live and restored, and an approval it needs is still asked. A turn of nothing but hidden calls renders no chrome.

`isToolHidden(name)` says which wins: a hide, unless a renderer is registered for the tool more specifically — a `'*'` hide leaves a tool with its own renderer (a plugin's receipt) drawn.

If you hid a tool with `registerToolRenderer(name, { render: () => '' })`, that call is now saved and sent to the model on later turns, as every other call is. `registerToolDisplay(name, { hidden: true })` says the same thing more directly.
