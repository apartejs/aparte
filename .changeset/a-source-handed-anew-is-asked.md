---
'@aparte/plugin-triggers': patch
---

A trigger source handed anew while its list is open (a memoized declaration recomputed for another channel) is asked again, once the declarations stop changing.

Since the fix that keeps a list arriving while the app re-renders on every token, a new function for the same search was never asked: the first channel's members stayed listed, and Enter inserted one of them. The answer on its way still arrives while the app re-renders, however slowly it re-renders and however slow the source is: a re-ask never aborts it, and the newest source is asked once that answer is in.
