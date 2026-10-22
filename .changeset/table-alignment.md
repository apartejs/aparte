---
'@aparte/core': patch
---

The columns of a Markdown table keep the alignment the Markdown gave them (`---:` right, `:---:` centred).

The renderer emits `<td align="right">`, which a browser reads as a `text-align` hint of the lowest weight, and the prose sheet set `text-align: start` on every cell, so the hint always lost. That rule now applies only to cells without `align`.
