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

`@aparte/core` and `streaming-markdown` are **peer dependencies**. Pair it with a one-shot provider
(e.g. `@aparte/plugin-marked`) for finished / re-rendered messages.

**Security**: the streaming path writes DOM directly, bypassing the one-shot sanitizer, so it enforces
the URL policy live — a streamed `[x](javascript:…)` never produces a clickable `javascript:` link.

> ESM-only. Part of the aparté monorepo.
