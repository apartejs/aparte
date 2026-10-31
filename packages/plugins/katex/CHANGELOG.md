# @aparte/plugin-katex

## 0.29.3

## 0.29.2

## 0.29.1

## 0.29.0

## 0.28.3

## 0.28.2

## 0.28.1

## 0.28.0

### Minor Changes

- 8c4cd8f: New package: `@aparte/plugin-katex` draws the maths a model writes with KaTeX. Call `setupKatex()` and import `katex/dist/katex.min.css`.

  Every `$…$`, `$$…$$`, `\(…\)` and `\[…\]` a Markdown provider recognises is drawn as a formula, while the reply streams: `@aparte/plugin-marked` and `@aparte/plugin-streaming-markdown` recognise maths on their own once it is registered. A formula still arriving keeps the last drawing that parsed, so nothing flashes red mid-stream; a finished one that does not parse shows its TeX, quietly. KaTeX is loaded on the first formula, and `@aparte/plugin-katex/core` takes a KaTeX you hand it (`setupKatexWith`). Whatever the options say, `trust` stays off, sizes and macro expansion are capped, and each formula gets its own macros.
