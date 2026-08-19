---
title: Plugins
description: Opt-in extensions for aparté — Markdown rendering, syntax highlighting, a model selector, and the ask_question tool. Each is a separate package the consumer installs.
sidebar:
  order: 1
  label: Overview
---

`@aparte/core` is presentational and zero-dependency: it renders raw text, exposes **seams**, and asks
nothing of you. Plugins fill those seams — each is an opt-in `@aparte/plugin-*` package that you install
and wire in one call, so core stays small and you pay only for what you use.

| You want… | Package | Seam it fills |
| --- | --- | --- |
| Render finished Markdown messages | [`marked`](/plugins/marked/) | `setMarkdownProvider` |
| Stream Markdown token-by-token | [`streaming-markdown`](/plugins/streaming-markdown/) | `setStreamingMarkdownProvider` |
| Highlight code blocks | [`shiki`](/plugins/shiki/) | `setHighlightProvider` |
| Let the user pick a provider + model | [`model-selector`](/plugins/model-selector/) | `<aparte-model-selector>` element |
| Let the AI ask the user a question | [`ask-question`](/plugins/ask-question/) | `registerTool` + elicitation |

Every plugin lists `@aparte/core` as a peer dependency and, where it wraps a third-party library
(marked, streaming-markdown, shiki), that library too — so you control its version and it is never
bundled into core.

:::note[Shiki ships in two flavours]
`@aparte/plugin-shiki` is the convenience import: it knows ~300 languages, and your bundler prepares all
of them (302 files, 11 MB measured). `@aparte/plugin-shiki/core` takes a highlighter you built with the
grammars you actually use — 1 file, 560 kB. Same plugin, and the
[page explains which to pick](/plugins/shiki/#bundle--two-different-costs).
:::

## The shape of a plugin

Most plugins register something on the config once, at startup:

```ts
import { setupMarkedProvider } from '@aparte/plugin-marked';
import { setupShikiProvider } from '@aparte/plugin-shiki';

setupMarkedProvider();          // finished messages → HTML
await setupShikiProvider();     // code blocks → highlighted HTML
```

The two Markdown plugins are complementary: `streaming-markdown` renders each token as it arrives, and
`marked` re-renders the finished message. Register both for the best of both.

## Localization

Translating the built-in UI strings is its own seam — see the
[Localization guide](/guides/localization/) and the `@aparte/locale-fr` package.
