---
'@aparte/plugin-artifacts': patch
---

An artifact card drawn from a tool result keeps its syntax colouring: an update that does not change the code no longer rewrites the pane as plain text.

A card built from `create_artifact`'s result is settled from its first paint and still receives every update its tool segment gets. Each one set the pane's `textContent`, which wiped the token spans the setup had painted, and with no stream ending there was no second highlight — a plain block in a Shiki frame. The pane is now written only when its content changes, and coloured again when it does.
