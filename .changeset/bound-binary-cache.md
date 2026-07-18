---
"@aparte/core": patch
---

Bound the binary-artifact preview cache. `_binaryArtifactCache` held full file buffers
(pdf/xlsx/docx) keyed by segment id and was never evicted, so a long session generating
many binary artifacts grew memory for the page's lifetime. It's now capped (LRU-ish: cap
24, oldest evicted on insert, re-insert refreshes recency).
