---
"@aparte/core": patch
---

Fix a small memory leak in the segment renderers: two internal per-segment throttle
maps (syntax-highlight and artifact-dispatch debouncing) grew one entry per streamed
segment for the page's lifetime. They're now bounded and evict oldest like the
neighbouring binary-artifact cache, so long-running sessions no longer accumulate them.
