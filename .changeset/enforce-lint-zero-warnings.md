---
"@aparte/core": patch
---

Enforce lint at zero warnings (`eslint . --max-warnings 0`) and clear the 37
`no-explicit-any` backlog — each replaced with a precise type or, where DOM /
custom-element interop genuinely requires it, a structural `unknown` cast (no blanket
`any` disables). A few public types are tightened from `any` to a precise type or
`unknown` (e.g. `AparteCustomSegment.data`, `AparteError` context) — a type-safety
improvement with no runtime change.
