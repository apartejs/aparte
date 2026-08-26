---
'@aparte/plugin-ask-user': minor
'@aparte/core': patch
---

The question-receipt's classes stop leaking onto your page.

**BREAKING for themes of `@aparte/plugin-ask-user`**: seven class names change.

The plugin styled and emitted seven UNPREFIXED classes. Core renders into the light DOM —
no shadow root, no `::part()` — so an unprefixed rule in a package a consumer imports is a
**global** rule on their page. `.segment` is the worst of them: it is Semantic UI's own base
class, and CLAUDE.md already names it as a known collision. The same package's other renderer
was writing `aparte-segment` correctly, so the two disagreed with each other.

| before | after |
| --- | --- |
| `.segment` | `.aparte-segment` |
| `.seg-qreceipt` | `.aparte-question-receipt` |
| `.seg-qreceipt-group` | `.aparte-question-receipt__group` |
| `.seg-qreceipt--declined` | `.aparte-question-receipt--declined` |
| `.qr-question` | `.aparte-question-receipt__question` |
| `.qr-answer` | `.aparte-question-receipt__answer` |
| `.qr-sep` | `.aparte-question-receipt__sep` |
| `.qr-declined` | `.aparte-question-receipt__answer--declined` |
| `@keyframes qr-appear` | `@keyframes aparte-question-receipt-appear` |

The keyframes name is in the table for the same reason as the classes: animation names live in
one global namespace too, so `qr-appear` was one `@keyframes` away from a consumer's own.

The names follow the rule the [CSS classes reference](/reference/css-classes/) now states —
`<block>__<part>`, `--<modifier>` — so the receipt is spelled the way every other part of the
library is.

**No new guard for this.** The policy had already drifted twice — 42 bare classes in core, then
these seven — and the answer is not a twenty-fourth `check:*` step. `gen-css-classes.mjs` walks
every stylesheet on every docs build; it now reports unprefixed selectors instead of reading
past them.

## `@aparte/core`: one escaper instead of three

`aparte-composer-attachments` and `aparte-conversation-list` each carried a private
`_escape`/`_esc` that re-implemented `escapeHtml`'s five replacements, in files that already
imported from `utils/escape.js`. All three were behaviourally identical, so nothing was
unescaped — but a fix to one would have reached one of three call sites, and this repo has
already shipped a weaker local copy that let `'` and `>` through. Both now call the shared one.
