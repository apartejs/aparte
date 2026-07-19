---
"@aparte/core": patch
---

Escape the `thinking` segment's `label` before it reaches `innerHTML` (the adjacent
`content` was already escaped). Built-in callers always pass a hardcoded label, but a
host rendering a model-derived label into a thinking segment would otherwise have a
stored-XSS sink — closed defensively, consistent with the other renderer escapes.
