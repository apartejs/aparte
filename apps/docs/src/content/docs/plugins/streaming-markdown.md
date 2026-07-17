---
title: Streaming Markdown
description: Render Markdown token-by-token as it streams in aparté — incremental parsing that appends DOM nodes, with a live URL-safety guard.
sidebar:
  order: 3
  label: streaming-markdown
---

Render Markdown **incrementally** as tokens arrive, powered by
[streaming-markdown](https://github.com/thetarnav/streaming-markdown). It parses only the new text and
appends DOM nodes per chunk — no per-token re-parse, no `innerHTML` rebuild.

```bash
npm install @aparte/plugin-streaming-markdown @aparte/core streaming-markdown
```

`@aparte/core` and `streaming-markdown` are **peer dependencies**.

```ts
import { setupStreamingMarkdownProvider } from '@aparte/plugin-streaming-markdown';

setupStreamingMarkdownProvider();
```

Call it once at startup. It fills the `AparteConfig.setStreamingMarkdownProvider` seam, which the chat
bubble uses while a message is streaming. Pair it with [`marked`](/plugins/marked/) — the one-shot
provider re-renders the finished message at full fidelity.

## Security

The streaming path writes DOM nodes directly, so it bypasses the one-shot HTML sanitiser. To keep the
same URL policy **live**, the plugin drops any `href`/`src` whose scheme fails core's `isSafeUrl` as it
streams — a `[x](javascript:…)` token never becomes a clickable `javascript:` link, even if the scheme
is split across two chunks. The one-shot re-render at completion remains the full re-sanitisation.
