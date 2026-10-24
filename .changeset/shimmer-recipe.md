---
"@aparte/core": minor
---

New kit recipe `.aparte-shimmer`: a light sweeping across a label while something runs.

Put it on the span that holds the words of a step in progress ("Searching the web…", "Thinking"). It is drawn through the text fill, so the element keeps a real colour; it holds still under `prefers-reduced-motion`, and reads as plain text in forced colours and where `background-clip: text` is not supported. New tokens: `--aparte-shimmer-base` and `--aparte-shimmer-shine` (muted to full ink, which keeps its order in both themes) and `--aparte-duration-shimmer` (2s). The reasoning line, a quiet tool row and a running conversation's title wear it.
