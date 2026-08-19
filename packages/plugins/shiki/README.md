# @aparte/plugin-shiki

Syntax highlighting for [aparté](https://github.com/apartejs/aparte) via [shiki](https://shiki.style).
Registers shiki as the highlight provider, backed by a **single lazily-created highlighter** — grammars
and the theme load on demand and are cached, so you never re-initialise per code block.

```bash
npm install @aparte/plugin-shiki @aparte/core shiki
```

```ts
import { setupShikiProvider } from '@aparte/plugin-shiki';

await setupShikiProvider({ theme: 'github-dark' });
```

`@aparte/core` and `shiki` are **peer dependencies**. `setupShikiProvider` is async — `await` it once at
startup before rendering highlighted messages.

## Two entry points, because size is a choice

**Loading** is lazy either way: a grammar is fetched the first time that language appears, and an unknown
language degrades to plain text instead of throwing.

**Shipping** is not. The import above pulls in `shiki`, whose bundle maps *every* known language to a
dynamic import, so your bundler emits one file per grammar — measured on a build that imported nothing
else:

| you import | files emitted | weight |
| --- | --- | --- |
| `@aparte/plugin-shiki` | 302 | 11 MB |
| `@aparte/plugin-shiki/core` (3 grammars) | 1 | 560 kB |

An option listing the languages would not change that — a static import is a static import (measured:
still 302 files). So if what you ship matters, build the highlighter yourself and hand it over:

```ts
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import ts from '@shikijs/langs/typescript';
import githubDark from '@shikijs/themes/github-dark';
import { setupShikiProviderFromHighlighter } from '@aparte/plugin-shiki/core';

setupShikiProviderFromHighlighter(
  await createHighlighterCore({
    themes: [githubDark],
    langs: [ts],
    engine: createJavaScriptRegexEngine(),
  }),
);
```

That module imports nothing from `shiki` — the trade is that its grammars are fixed, so a language it
does not carry renders as plain text (no on-demand load to fall back on).

> ESM-only. Part of the aparté monorepo.
