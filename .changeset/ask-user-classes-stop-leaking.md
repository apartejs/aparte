---
'@aparte/plugin-ask-user': minor
---

The question-receipt's classes stop leaking onto your page.

**BREAKING for themes of this plugin**: eight names change.

The plugin styled and emitted seven UNPREFIXED classes. Core renders into the light DOM —
no shadow root, no `::part()` — so an unprefixed rule in a package a consumer imports is a
**global** rule on their page.

`.segment` is the worst of them: it is Semantic UI's own base class, and CLAUDE.md already
names it as a known collision. The same package's other renderer was writing
`aparte-segment` correctly, so the two disagreed with each other.

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

The keyframes name is in the table for the same reason as the classes: animation names live
in one global namespace too, so `qr-appear` was one `@keyframes` away from a consumer's own.
