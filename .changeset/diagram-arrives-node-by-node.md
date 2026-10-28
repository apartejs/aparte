---
'@aparte/plugin-mermaid': patch
---

A diagram still arriving now shows a placeholder box instead of its source, then draws each node as soon as its line is complete; it no longer flashes an empty image.

Before, a fence streamed its Mermaid source as text, then the header alone (`flowchart LR`, an `accTitle`) drew an empty 16×16 image in its place, and nothing changed until the whole of a half-written line parsed: characters, then a blank, then the diagram. Now its first frame is the skeleton recipe, each later frame draws the source up to its last complete line, and a frame whose drawing would paint nothing keeps what is shown. A closed fence is drawn as before; `progressive: false` still waits for it.
