---
'@aparte/plugin-streaming-markdown': minor
---

With a maths renderer registered (`@aparte/plugin-katex`), a streamed formula that is plainly maths is now drawn: a display formula whose `$$` starts a line as it arrives, an inline one once its closer has come. With none registered, nothing changes.

The fork wrote `$…$` and `$$…$$` as `<equation-inline>` and `<equation-block>`, elements nothing on the page draws, so a formula stayed raw TeX until the reply settled. Those it plainly reads as maths are now written as `<code class="language-math math-display">` or `math-inline` — the placeholder `@aparte/plugin-marked` writes and core's code-language engine draws.

Only those, because its rules are looser than Pandoc's: a `$` before a word opens a formula that no newline ends, and the closing `$$` of a one-line `$$x$$` opens a block. Handing those to KaTeX drew the prose after them as maths. So an inline formula is drawn only once its own closer arrives and its TeX has no space just inside a delimiter (`$HOME and $PATH` stays text) and is more than a number (`\(1\)` stays a reference); a display formula only when its `$$` starts a line. Everything else keeps the fork's element, which reads as text.
