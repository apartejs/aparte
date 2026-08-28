---
'@aparte/core': patch
---

A custom tool renderer keeps its styles when a stored conversation is re-rendered.

The injection lived inline in two live paths — `AparteClient`'s `tool-start` handler and
the stream adapter's — and nowhere on the path that draws history. So a renderer
registered with `registerToolRenderer` came back styled while its tool ran and **bare
after a reload**: the markup returned, because `toolCallRenderer` looks the renderer up
and delegates to it, but nothing replays `tool-start` for a persisted message, so the CSS
never arrived. Reported by a consumer who was re-injecting the stylesheet themselves at
startup — the shape of a defect in this library, not a concern of theirs.

One owner now, called from the render path as well as the two live ones, so "the renderer
drew" and "its rules are on the page" cannot come apart again. Keyed by tool name, so it
is still injected once however many times the segment is drawn.
