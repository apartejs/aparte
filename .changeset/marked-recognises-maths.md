---
'@aparte/plugin-marked': minor
---

Install a maths renderer (`@aparte/plugin-katex`) and marked hands it every formula, `$…$`, `$$…$$`, `\(…\)` and `\[…\]`, instead of reading the TeX as Markdown; with none registered, nothing changes.

marked read TeX as Markdown: `\,` and `\\` were escapes to it, and `a*b*c` or `x_1 + y_2` became emphasis. Maths is now claimed by the tokenizer first and written as the placeholder a code-language renderer draws. It turns on by itself when a `math` renderer is registered on the config, so there is nothing to configure; `math: true` or `math: false` in the options forces it. A single `$` follows Pandoc's rule, so a price stays a price: `$5 and $10` is text.

While a reply streams, a formula is drawn as it arrives: an unclosed `$$`, `\[` or `\(` in the block being written is read as one still arriving. A single `$` is read only once it closes, since until then it could be a price. And `remend`, which completes the block being written, no longer sees the TeX: it used to turn `\[ a+b` into a link.
