---
title: Streaming Markdown in a chat, token by token
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

Call it once at startup. It fills the `aparteGlobalConfig.setStreamingMarkdownProvider` seam, which the chat
bubble uses while a message is streaming. That is all you need: when the turn completes, what this
plugin rendered stays on the page. Pairing it with a one-shot provider like
[`marked`](/plugins/marked/) is optional — register one and the finished message is re-rendered
through it, at that renderer's full fidelity.

## Security

The streaming path writes DOM nodes directly, so it bypasses the one-shot HTML sanitiser. To keep the
same URL policy **live**, the plugin drops any `href`/`src` whose scheme fails core's `isSafeUrl` as it
streams — a `[x](javascript:…)` token never becomes a clickable `javascript:` link, even if the scheme
is split across two chunks — and a link that resolves off-site (`https://…`, `//host`, a leading space, `http:/host`) gets `target="_blank" rel="noopener noreferrer"` live, the rule the sanitiser applies. At completion the settled message goes through the sanitiser in full: re-rendered by the one-shot provider when one is registered, re-sanitised in place otherwise.
