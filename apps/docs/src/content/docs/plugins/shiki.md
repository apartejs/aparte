---
title: Syntax highlighting (shiki)
description: Highlight code blocks in aparté via shiki — a single lazily-created highlighter, grammars loaded on demand, so you pay only for the languages you render.
sidebar:
  order: 4
  label: shiki
---

Highlight code blocks with [shiki](https://shiki.style). The plugin registers shiki as the highlight
provider, backed by a **single lazily-created highlighter**: it is built once, and each language grammar
loads on demand and is cached — no re-initialisation per code block.

```bash
npm install @aparte/plugin-shiki @aparte/core shiki
```

`@aparte/core` and `shiki` are **peer dependencies**.

```ts
import { setupShikiProvider } from '@aparte/plugin-shiki';

await setupShikiProvider({ theme: 'github-dark' });
```

`setupShikiProvider` is **async** — `await` it once at startup before highlighted messages render. It
fills the `AparteConfig.setHighlightProvider` seam.

## Bundle

Nothing is eagerly bundled. Each grammar is dynamically imported from shiki's bundle the first time that
language appears, so you pay only for the languages you actually render. An unknown language degrades to
plain text instead of throwing.
