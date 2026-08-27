---
'@aparte/core': patch
---

Two artifact-card buttons and one transition were missed by the sweeps that tokenised
the rest.

`.aparte-art-card__btn:disabled` and `.aparte-art-card__tabs button:disabled` were
still at a literal `0.4` rather than `--aparte-disabled-opacity`, so they stayed the
two odd ones out of the unification. They were written as one-line rules
(`{ opacity: 0.4; cursor: not-allowed; }`), and the sweep's pattern anchored `opacity`
to the start of a line — so it never saw a declaration sitting right after the brace.
`transition: transform 0.2s` was missed the same way and now reads
`--aparte-duration-slow`.

They move from 0.4 to 0.5, in line with every other disabled control.
