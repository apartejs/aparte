# @aparte/plugin-streaming-markdown

Incremental (token-by-token) Markdown rendering for [aparté](https://github.com/apartejs/aparte) via
[`streaming-markdown`](https://github.com/thetarnav/streaming-markdown). Parses only the new text and
**appends** DOM nodes per streamed chunk — no per-token re-parse or `innerHTML` rebuild.

```bash
npm install @aparte/plugin-streaming-markdown @aparte/core streaming-markdown
```

```ts
import { setupStreamingMarkdownProvider } from '@aparte/plugin-streaming-markdown';

setupStreamingMarkdownProvider();
```

`@aparte/core` and `streaming-markdown` are **peer dependencies**.

This plugin is enough on its own: a reply renders the same whether it streams or arrives complete — a
conversation restored after a reload, a non-streaming provider's answer — because with no one-shot
provider registered, core runs the whole string through this parser too. A one-shot provider (e.g.
`@aparte/plugin-marked`) is optional — register one and finished and restored messages are rendered
through it, at that renderer's full fidelity.

**Security**: the streaming path writes DOM directly, bypassing the one-shot sanitizer, so it enforces
the URL policy live — a streamed `[x](javascript:…)` never produces a clickable `javascript:` link — and
a finished message is passed through core's sanitizer either way.

> ESM-only. Part of the aparté monorepo.
