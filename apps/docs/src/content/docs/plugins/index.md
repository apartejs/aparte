---
title: Plugins
description: Opt-in extensions for aparté — Markdown rendering, syntax highlighting, a model selector, and the ask_user tool. Each is a separate package the consumer installs.
sidebar:
  order: 1
  label: Overview
---

`@aparte/core` is presentational and carries no third-party dependency: it renders raw text, exposes **seams**, and asks
nothing of you. Plugins fill those seams — each is an opt-in `@aparte/plugin-*` package that you install
and wire in one call, so core stays small and you pay only for what you use.

| You want… | Package | Seam it fills |
| --- | --- | --- |
| Render finished Markdown messages | [`marked`](/plugins/marked/) | `setMarkdownProvider` |
| Stream Markdown token-by-token | [`streaming-markdown`](/plugins/streaming-markdown/) | `setStreamingMarkdownProvider` |
| Highlight code blocks | [`shiki`](/plugins/shiki/) | `setHighlightProvider` |
| Let the user pick a provider + model | [`model-selector`](/plugins/model-selector/) | `<aparte-model-selector>` element |
| Let the AI ask the user a question | [`ask-user`](/plugins/ask-user/) | `registerTool` + elicitation |
| Switch approval modes — plan, ask, auto-edit, auto | [`approval`](/plugins/approval/) | `setApprovalPolicy` + `<aparte-approval-mode>` |
| Let the AI produce a document — a page, a component, a spreadsheet — shown as a Code/Preview card | [`artifacts`](/plugins/artifacts/) | `registerTool` + `registerToolRenderer` + `registerStreamBlock` + `registerSegmentRenderer` |

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

### Scoping a plugin to one chat

Every `setup*` takes the config instance as its **last** argument, defaulting to the global
`aparteGlobalConfig`. Pass your own instance and the plugin registers there instead — which is what makes
two independently configured chats on one page actually work:

```ts
import { AparteConfig } from '@aparte/core';
import { setupMarkedProvider } from '@aparte/plugin-marked';

// Markdown for the support chat only; the other chat on the page keeps plain text.
const supportConfig = new AparteConfig();
setupMarkedProvider(undefined, supportConfig);
```

Then hand that same instance to the chat — the `config` prop on the React/Vue/Svelte/Angular
wrappers, or `new AparteClient({ config: supportConfig })` in vanilla.

:::note
Until 0.8.0 the `setup*` functions always wrote to the global config, so the wrappers' `config`
prop was a promise no plugin could keep. The parameter is optional and added last, so existing
one-chat calls are unchanged.
:::

## Localization

Translating the built-in UI strings is its own seam — see the
[Localization guide](/guides/localization/) and the `@aparte/locale-fr` package.
