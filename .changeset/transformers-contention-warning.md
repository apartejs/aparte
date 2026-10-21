---
'@aparte/provider-transformers': patch
---

The two-models console warning no longer tells a page with no cache limit to set one.

It said "with a cache budget of N, a switch can evict and reload gigabytes" and advised `setMaxCachedModels(2)` whatever N was — including `0`, which is no limit, where that advice would lower it. It now says what serializing costs (each switch unloads one model and loads the other), and mentions deleted weights and `setMaxCachedModels(2)` only at a budget of 1, the one budget where a switch deletes the other chat's model.
