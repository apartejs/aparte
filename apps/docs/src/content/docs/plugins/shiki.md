---
title: Syntax highlighting for streamed code (shiki)
description: Highlight code blocks in aparté via shiki — one lazily-created highlighter, grammars loaded on demand, and a second entry point for shipping only the languages you use.
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
fills the `aparteGlobalConfig.setHighlightProvider` seam.

## Light and dark

One theme paints one scheme: `github-dark` stays a dark block on a light page. Pass a pair and the
block follows core's theme switch — the `[data-aparte-theme="dark"]` attribute from the
[Theming](/guides/theming/) guide:

```ts
await setupShikiProvider({ theme: { light: 'github-light', dark: 'github-dark' } });
```

Both themes are loaded, every token carries both colours as CSS variables (`--shiki-light` /
`--shiki-dark`, shiki's own dual-theme output), and the plugin adds one small stylesheet that reads the
right one under `[data-aparte-theme="dark"]`. The same option works on
`setupShikiProviderFromHighlighter` when the highlighter you built carries both themes.

The pair is the exported `ShikiThemePair` type, and what either entry point hands to shiki's
`codeToHtml` — `{ lang, theme }` for one theme, `{ lang, themes, defaultColor: false }` for a pair —
is `ShikiRenderOptions`: shiki's own option names, exported so a highlighter of your own can
accept exactly what the plugin sends.

## Bundle — two different costs

Shiki knows ~300 languages. The question is not *when* a grammar loads, it is *how many of them end up in
the files you distribute*.

- **Loading is lazy.** A grammar is fetched the first time that language appears in a message. You only
  ever *run* the ones you render, and an unknown language degrades to plain text instead of throwing.
- **Shipping is not.** `import { setupShikiProvider } from '@aparte/plugin-shiki'` pulls in `shiki`,
  whose bundle names every one of those languages in a dynamic import. Your bundler cannot know which
  ones you will need, so it prepares **all of them** — one file each, in your build output.

Measured on a build whose only import was `setupShikiProvider`:

| entry point | files emitted | weight |
| --- | --- | --- |
| `@aparte/plugin-shiki` | 302 | 11 MB |
| `@aparte/plugin-shiki/core`, three grammars | 1 | 560 kB |

`emacs-lisp` alone is 780 kB, and `wasm`, `wolfram`, `vue-vine` come along for a chat that will show
twenty languages. Restricting the language list does **not** help — a static import is a static import
(measured: still 302 files).

### Shipping only the grammars you need

Build the highlighter yourself with shiki's fine-grained entry points, then hand it over. Same plugin,
same behaviour, one chunk:

Those fine-grained entry points live in **separate packages** — add them alongside `shiki`:

```bash
npm install @shikijs/langs @shikijs/themes
```

```ts
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import ts from '@shikijs/langs/typescript';
import bash from '@shikijs/langs/bash';
import githubDark from '@shikijs/themes/github-dark';
import { setupShikiProviderFromHighlighter } from '@aparte/plugin-shiki/core';

setupShikiProviderFromHighlighter(
  await createHighlighterCore({
    themes: [githubDark],
    langs: [ts, bash],
    engine: createJavaScriptRegexEngine(),
  }),
  { theme: 'github-dark' },
);
```

The trade is explicit: your highlighter's grammars are fixed, so a language it does not carry renders as
plain text — there is no on-demand load to fall back on. Everything else is identical, including the
plaintext aliases (`text`, `plaintext`, `txt`, `ansi`) and the case-insensitive language match.

`@aparte/plugin-shiki/core` imports **nothing** from `shiki` at runtime (only types, which are erased),
which is what makes the difference — not a flag.

:::tip[Which one should I use?]
Prototyping, a docs site, an app where a few MB of lazily-fetched chunks are free: the convenience
entry. Anything you ship as a download — a desktop app, a CLI delivered by `npx`, a page with a size
budget: `/core`.
:::
