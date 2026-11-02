# @aparte/core

[![Published on webcomponents.org](https://img.shields.io/badge/webcomponents.org-published-blue.svg)](https://www.webcomponents.org/element/@aparte/core)

**The complete AI chat UI, for any framework** — Web Components for React, Vue, Svelte, Angular
or plain HTML, with the agent loop inside. Replies that stream with Markdown and code, a
conversation list, tools a person approves, answers drawn as
[cards](https://apartejs.dev/guides/cards/). Your own backend or an AG-UI agent behind it (n8n
too), your styles on it. Zero third-party dependencies, ESM-only.

<a href="https://apartejs.dev/templates/assistant/"><picture><source media="(prefers-color-scheme: dark)" srcset="https://apartejs.dev/shots/chat-dark.png"><img src="https://apartejs.dev/shots/chat.png" alt="An aparté chat: the conversation list, a question, and the assistant's reply — its reasoning, a weather card and the answer — above the composer"></picture></a>

The conversation, messages, reasoning, tool calls a human approves, the questions an agent
asks, the composer, the layout around the chat (app shell, sidebar, conversation list) and a
UI kit for the rest of the app — each one [shown live with its variants](https://apartejs.dev/components/),
and assembled into [templates](https://apartejs.dev/templates/) you can copy.

> **1.x.** On npm, released in lockstep with every other `@aparte/*` package, and the
> declared surface follows semver: a [frozen](https://apartejs.dev/reference/stability/)
> name keeps its name, and what its documentation says it does, until 2.0. Part of the
> [aparté](https://github.com/apartejs/aparte)
> monorepo; what changed when is at [apartejs.dev/changelog](https://apartejs.dev/changelog/).

## Install

```bash
npm install @aparte/core
```

## Quick start

```ts
import '@aparte/core';               // registers the <aparte-*> custom elements
import '@aparte/core/styles.css';    // theme variables + component styles
import { aparteGlobalConfig, AparteClient } from '@aparte/core';

// Drop the shell in your HTML:  <aparte-chat placeholder="Ask anything…"></aparte-chat>

// Give it a provider + transport (see the docs), then construct the client and call
// .start() — it echoes your user message, streams the reply into the conversation,
// and listens for retry/edit. (Without .start(), nothing listens and nothing streams;
// a host that appends its own user bubble passes `echoUserMessage: false`.)
new AparteClient().start();

// The retry / edit buttons only do something with a host like the client above, so
// core ships them off. One line turns them on:
aparteGlobalConfig.setBubbleActions({ retry: true, edit: true });
```

**No key yet?** `npm i @aparte/provider-scenario` and register
`createScenarioProvider({ scenarios: showcase })` as the provider above: a real streaming
reply — markdown, reasoning, a tool round-trip — with no backend and no network. It is
what this repository's own examples run on, and the docs' live frames that answer.
[Scenario provider](https://apartejs.dev/providers/ai/scenario/).

The built-in segment renderers install themselves the first time a segment needs one, so
there is nothing to call for text, code or thinking blocks to appear. Calling
`registerDefaultRenderers()` yourself still works and makes the moment explicit.

## Node / SSR

`@aparte/core` imports cleanly on the server. A `node` export condition resolves to a
DOM-free entry, so `import '@aparte/core'` works in Node, an Electron **main** process,
or an SSR pass (Next / Nuxt / SvelteKit / Angular SSR) without a DOM shim:

```ts
// Node — same specifier, DOM-free entry
const { AparteClient, createAparteChatHandler, contentToText } = await import('@aparte/core');
```

**You keep** the client, the chat host, transports + `createAparteChatHandler`, the
conversation/message runtime, config, parsers and every type. **You lose** the custom
elements themselves — they extend `HTMLElement`, so they're browser-only, and
`registerAllComponents()` is a safe no-op there.

The `node` entry is checked on every CI run by importing the built package in real Node.

## What's in it

- **`<aparte-chat>`** — a drop-in shell (viewport + composer), or compose the primitives
  yourself (`<aparte-chat-viewport>`, `<aparte-composer>`, `<aparte-chat-bubble>`, …).
- **`AparteClient`** — an optional driver that turns composer events into a streamed reply,
  and the host that makes the retry / edit buttons real: retry forks the conversation into a
  **branch** (with a built-in `‹ 1/2 ›` picker), edit rewrites the message in place. Both
  buttons are **off by default** — without a host they would answer to nobody — so switch
  them on next to the client: `aparteGlobalConfig.setBubbleActions({ retry: true, edit: true })`.
- **Transports** — `AparteDirectTransport` (browser → provider, BYOK / local model) or
  `AparteBackendTransport` (browser → your endpoint, API key stays server-side).
- **Theming** — restyle everything through `--aparte-*` CSS variables (Light DOM, no forking).
- **Customization** — icons, render hooks and the message-action registry (the buttons under a
  message) via `aparteGlobalConfig`. A composer button is an `<aparte-composer-action>`
  element you write in markup.
- **`<aparte-launcher>`** — a floating button that opens the chat as a window, and as a
  full-window sheet on a narrow or short screen.
- **Citations** — sources a provider returns appear as a chip after the cited passage, with a
  card and a list.
- **Maths, diagrams and charts** — a code block in a registered language (`math`, `mermaid`,
  `echarts`…) is drawn as it streams. Core carries the seam
  (`registerCodeLanguageRenderer`); `@aparte/plugin-katex`, `-mermaid`, `-echarts` and
  `-chartjs` supply the drawings.
- **Suggestions** — `<aparte-suggestions>` shows prompt starters, and a model's suggestion
  block becomes quick replies.

Zero third-party dependencies (the agent loop, `@aparte/engine`, is the one first-party dependency): Markdown, syntax highlighting, etc. are **opt-in** providers you inject.
ESM-only (CJS consumers use `await import()`).

## Docs

Full guides and a generated API reference are at
**[apartejs.dev](https://apartejs.dev/)** — Getting started, Theming, Customization,
Attachments, Conversations & branching, Tools, Backend transport, Bring your own loop,
The agent engine, and Troubleshooting. Source under
[`apps/docs`](https://github.com/apartejs/aparte/tree/main/apps/docs).

The two most-asked-for pages, directly:

- **[Customization](https://apartejs.dev/guides/customization/)** — every render
  hook, the action registry, the composer toolbar.
- **[CSS variables](https://apartejs.dev/reference/css-variables/)** — the full
  token catalogue, GENERATED from the stylesheet, so it cannot drift from it.

## License

MIT
