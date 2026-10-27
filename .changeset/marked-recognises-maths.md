---
'@aparte/plugin-marked': minor
---

Install a maths renderer (`@aparte/plugin-katex`) and marked hands it every formula, `$…$`, `$$…$$`, `\(…\)` and `\[…\]`, instead of reading the TeX as Markdown; with none registered, nothing changes.

marked read TeX as Markdown: `\,` and `\\` were escapes to it, and `a*b*c` or `x_1 + y_2` became emphasis. Maths is now claimed by the tokenizer first and written as the placeholder a code-language renderer draws. It turns on by itself when a `math` renderer is registered on the config, so there is nothing to configure; `math: true` or `math: false` in the options forces it. A single `$` follows Pandoc's rule, so a price stays a price: `$5 and $10` is text.

A formula never crosses a blank line, code wins over it (a `$$` in a fence or a code span stays code), emphasis around a formula closes outside it, and escaped brackets such as `\[1\]` stay brackets. With maths on, rendering runs on a marked instance of the plugin's own: an extension added to the global `marked` with `marked.use()` no longer applies, so pass marked options to `setupMarkedProvider(options)`.

While a reply streams, a formula is drawn as it arrives: an unclosed `$$`, `\[` or `\(` in the block being written is read as one still arriving. A single `$` is read only once it closes, since until then it could be a price. And `remend`, which completes the block being written, no longer sees the TeX: it used to turn `\[ a+b` into a link.
