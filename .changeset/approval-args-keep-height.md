---
'@aparte/core': patch
---

In a short window, the approval panel now scrolls its body instead of squeezing the tool's arguments: the arguments keep their height.

The panel is capped at half the viewport and does not scroll itself, and its parts were its direct flex children, so the arguments — the one block that could shrink — gave way first: 48px of a 66px block in a 560px-tall window, the thing being approved disappearing before anything else. Everything but the corner now sits in an `.aparte-elic-body` that scrolls, as the question panel's does.
