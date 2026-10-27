---
'@aparte/plugin-streaming-markdown': minor
---

With a maths renderer registered (`@aparte/plugin-katex`), streamed formulas are now drawn; with none registered, `$` and `\(` now stay in the text instead of disappearing.

The plugin now depends on `@paulrichez/streaming-markdown` 0.3.2, which reads maths by Pandoc's rules — `$5 and $10` is two prices, a formula ends at a blank line or a line that opens a block, and a one-line `$$x$$` no longer opens a block that swallows the rest of the reply — and takes a `{ math }` option. The plugin turns maths on when a `math` renderer is registered, decided once per reply.

Each formula is written as `<code class="language-math math-inline">` or `math-display`, the placeholder `@aparte/plugin-marked` writes and core's code-language engine draws, marked `data-aparte-open` until its closer arrives. A display formula opened by `$$` or `\[` on its own line is drawn as it arrives; any other once its closer has come. A display block that a blank line ends before its closer, and a formula the reply ended in the middle of, go back to text, and one that holds only a number (`\[1\]`, a reference) is written back in its brackets, as plugin-marked reads it. Without a maths renderer the parser reads no maths at all: 0.3.0 wrote `$x$` as an `<equation-inline>` element and dropped its dollars.
