---
'@aparte/core': patch
---

The branch picker announces its move to a screen reader.

The arrows deliberately do not take focus — pressing `›` should not steal the caret from
wherever the reader was — so a live region is the only thing left to signal the change.
There wasn't one. `.aparte-sr-only` existed in the bubble, but inside the WAITING
indicator, written only with the locale's "typing" label, so a screen-reader user pressing
next got a different answer with no indication that anything had happened.

`.aparte-branch-status` is a polite live region carrying the position. It is separate from
the visible `.aparte-branch-label` on purpose: a custom `setSiblingNavRenderer` may replace
that label with dots, which reads as nothing. No new locale key — the position is digits,
and the two buttons beside it already carry translated labels.

Found by a documentation audit, and the way it survived is worth recording: the
accessibility guide described this behaviour as if it shipped. The sentence was true of the
design and false of the code, which is the one kind of claim no test and no guard was ever
going to catch.
