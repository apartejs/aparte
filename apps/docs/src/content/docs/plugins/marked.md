---
title: Markdown (marked)
description: Render finished assistant messages as Markdown in aparté via marked — register it as the one-shot Markdown provider.
sidebar:
  order: 2
  label: marked
---

Render finished assistant messages as Markdown, powered by [marked](https://marked.js.org). This is the
**one-shot** provider — it re-renders a whole message to HTML once it is complete (pair it with
[`streaming-markdown`](/plugins/streaming-markdown/) for the live token stream).

```bash
npm install @aparte/plugin-marked @aparte/core marked
```

`@aparte/core` and `marked` are **peer dependencies** — you control the `marked` version.

```ts
import { setupMarkedProvider } from '@aparte/plugin-marked';

setupMarkedProvider();
```

Call it once at startup. It registers a function on `AparteConfig.setMarkdownProvider` that parses raw
Markdown to sanitised HTML. Pass a [`MarkedExtension`](https://marked.js.org/using_advanced) to customise
the parser:

```ts
setupMarkedProvider({ gfm: true, breaks: true });
```

Core sanitises the returned HTML before inserting it, so the provider only has to produce markup.
