---
'@aparte/core': patch
---

In a right-to-left chat, a tool row's opened detail and a reasoning block now put their indent beside their rule, on the right.

Their rule is `border-inline-start`, the right edge in a right-to-left chat, but the indent came from physical shorthands that set the left padding, so the Input/Output panels and the reasoning text sat flush against the rule with an empty strip on the other side. The rename field in the conversation list had the same mismatch. All four now use logical properties.
