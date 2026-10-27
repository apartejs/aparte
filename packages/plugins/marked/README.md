# @aparte/plugin-marked

Markdown rendering for [aparté](https://github.com/apartejs/aparte) via
[marked](https://marked.js.org). Registers the **one-shot** Markdown provider used for finished /
re-rendered message bubbles.

```bash
npm install @aparte/plugin-marked @aparte/core marked
```

```ts
import { setupMarkedProvider } from '@aparte/plugin-marked';

setupMarkedProvider({ gfm: true, breaks: true }); // options are optional
```

`@aparte/core` and `marked` are **peer dependencies**. For token-by-token incremental rendering during
streaming, add `@aparte/plugin-streaming-markdown` alongside this — or use marked for the stream too:

## Stream with marked

```ts
import { setupMarkedStreamingProvider } from '@aparte/plugin-marked/streaming';

setupMarkedStreamingProvider(); // replaces setupMarkedProvider(); same options
```

marked formats the reply while it streams and once it is done, so a finished reply looks exactly as
it did at its last chunk. The block being written is completed by Vercel's
[`remend`](https://www.npmjs.com/package/remend) before marked reads it — `**bold` shows bold before
its closing `**`, a link shows as a link from its first character — and drawn again at each chunk;
the blocks above it are not. Every block goes through the config's sanitizer. `remend` is a
dependency of this plugin, imported by the `/streaming` entry only.

> ESM-only. Part of the aparté monorepo.

## Maths

Install `@aparte/plugin-katex` and marked hands it every formula — `$…$`, `$$…$$`, `\(…\)`,
`\[…\]` — instead of reading the TeX as Markdown (`\,` and `a*b*c` mean something else to it). It
turns on by itself when a `math` renderer is registered; `MarkedProviderOptions.math` forces it
either way:

```ts
setupMarkedProvider({ math: false }); // leave dollars as text, whatever is registered
```

A single `$` follows Pandoc's rule, so `$5 and $10` stays text. While a reply streams, a formula
is drawn as it arrives.
