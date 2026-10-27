# @aparte/plugin-katex

Maths for [aparté](https://github.com/apartejs/aparte) via [KaTeX](https://katex.org). Every
`$…$`, `$$…$$`, `\(…\)` and `\[…\]` in a reply is drawn as a formula — while the reply streams,
under whichever Markdown provider recognises maths.

```bash
npm install @aparte/plugin-katex @aparte/core katex
```

```ts
import 'katex/dist/katex.min.css';
import { setupKatex } from '@aparte/plugin-katex';

setupKatex();
```

`@aparte/core` and `katex` are **peer dependencies**. KaTeX's stylesheet is yours to import: its
fonts are relative URLs your bundler resolves. Without it each formula shows twice, and the plugin
says so once in the console.

## Which Markdown provider

Maths has to be recognised before Markdown reads it — `\,` and `a*b*c` mean something else to
Markdown. `@aparte/plugin-marked` (one-shot and `/streaming`) and
`@aparte/plugin-streaming-markdown` recognise it on their own once this plugin is registered.
A provider of your own hands maths over by emitting
`<code class="language-math math-inline">TeX</code>`, or `<pre><code class="language-math
math-display">` for a block — the markup remark-math already produces.

A single `$` follows Pandoc's rule, so a price stays a price: `$5 and $10` is text.

## While a reply streams

A formula is drawn as it arrives. One KaTeX cannot parse yet — `\frac{1}{` — keeps the last
drawing that it could, so nothing flashes red mid-stream. Once the reply is finished, a formula
that still does not parse shows its TeX, quietly, with KaTeX's message as a tooltip.

## Options

`setupKatex(options?, config?)` takes `KatexOptions`:

| option | default | |
| --- | --- | --- |
| `live` | `true` | `false` draws a formula once it has closed |
| `katex` | `{}` | KaTeX's own options: `macros`, `leqno`, `fleqn`, `output`… |
| `maxLength` | `4000` | a longer formula shows as TeX |

What the plugin keeps, whatever `katex` says: `trust` is `false` (no `\href`, no `\htmlClass`),
`maxSize` and `maxExpand` are capped, and `macros` is copied for each formula, so a `\gdef` in one
reply cannot reach the next.

## Two entry points

`@aparte/plugin-katex` loads KaTeX on the first formula. If you would rather hand it over —
your own build, a CDN copy — use the entry that imports nothing from `katex`:

```ts
import katex from 'katex';
import { setupKatexWith } from '@aparte/plugin-katex/core';

setupKatexWith(katex);
```

`setupKatexWith` takes the instance, or a function returning a promise of it, and any object
shaped like `KatexLike` (a `renderToString`). Both functions return a disposer.

ESM only.
