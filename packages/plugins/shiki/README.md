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

**Bundle**: nothing is eagerly bundled. Each language grammar is dynamically imported from shiki's bundle
the first time it appears, so you pay only for the languages you actually render. An unknown language
degrades to plain text instead of throwing.

> ESM-only. Part of the aparté monorepo.
