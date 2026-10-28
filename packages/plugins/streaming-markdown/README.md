# @aparte/plugin-streaming-markdown

Incremental (token-by-token) Markdown rendering for [aparté](https://github.com/apartejs/aparte) via
[`@paulrichez/streaming-markdown`](https://github.com/PaulRichez/streaming-markdown), a maintained fork of
Damian Tarnawski's [`streaming-markdown`](https://github.com/thetarnav/streaming-markdown), which has had no
release since May 2025. Parses only the new text and **appends** DOM nodes per streamed chunk — no
per-token re-parse or `innerHTML` rebuild.

```bash
npm install @aparte/plugin-streaming-markdown @aparte/core
```

```ts
import { setupStreamingMarkdownProvider } from '@aparte/plugin-streaming-markdown';

setupStreamingMarkdownProvider();
```

`@aparte/core` is a **peer dependency**; the parser installs with the plugin. Coming from a version that used
`streaming-markdown`, you can remove it.

This plugin is enough on its own: a reply renders the same whether it streams or arrives complete — a
conversation restored after a reload, a non-streaming provider's answer — because with no one-shot
provider registered, core runs the whole string through this parser too. A one-shot provider (e.g.
`@aparte/plugin-marked`) is optional — register one and finished and restored messages are rendered
through it, at that renderer's full fidelity.

**Maths**: register a maths renderer and formulas are drawn as the reply streams — nothing else to
configure; without one, `$` and `\(` stay text. A display formula opened by `$$` or `\[` on its own
line is drawn as it arrives, any other once its closer has come; the rules are Pandoc's, so
`$5 and $10` stays two prices. See the [maths guide](https://apartejs.dev/guides/math/).

```ts
import 'katex/dist/katex.min.css';
import { setupKatex } from '@aparte/plugin-katex';
import { setupStreamingMarkdownProvider } from '@aparte/plugin-streaming-markdown';

setupKatex();
setupStreamingMarkdownProvider();
```

**Security**: the streaming path writes DOM directly, bypassing the one-shot sanitizer, so it enforces
the URL policy live — a streamed `[x](javascript:…)` never produces a clickable `javascript:` link — and
a finished message is passed through core's sanitizer either way.

> ESM-only. Part of the aparté monorepo.
