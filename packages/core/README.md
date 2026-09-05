# @aparte/core

[![Published on webcomponents.org](https://img.shields.io/badge/webcomponents.org-published-blue.svg)](https://www.webcomponents.org/element/@aparte/core)

Framework-agnostic AI chat UI as **vanilla Web Components, with the agent loop inside** —
zero third-party dependencies, ESM-only, usable in any framework or none.

> **Alpha.** On npm, released in lockstep with every other `@aparte/*` package — the
> version number is a plain `0.x` and the API can still change before the first stable
> cut. Part of the [aparté](https://github.com/apartejs/aparte) monorepo; what changed
> when is at [apartejs.dev/changelog](https://apartejs.dev/changelog/).

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

The built-in segment renderers install themselves the first time a segment needs one, so
there is nothing to call for text, code or thinking blocks to appear. Calling
`registerDefaultRenderers()` yourself still works and makes the moment explicit.

## Node / SSR

`@aparte/core` imports cleanly on the server. A `node` export condition resolves to a
DOM-free entry, so `import '@aparte/core'` works in Node, an Electron **main** process,
or an SSR pass (Next / Nuxt / SvelteKit / Angular Universal) without a DOM shim:

```ts
// Node — same specifier, DOM-free entry
const { AparteClient, createAparteChatHandler, contentToText } = await import('@aparte/core');
```

**You keep** the client, the chat host, transports + `createAparteChatHandler`, the
conversation/message runtime, config, parsers and every type. **You lose** the custom
elements themselves — they extend `HTMLElement`, so they're browser-only, and
`registerAllComponents()` is a safe no-op there.

Reading `src/index.ts` is misleading on this point: that's the *browser* entry (it defines
the custom elements), and the workspace resolves it first by design. The contract is
enforced by `pnpm check:node-import`, which imports the built packages in real Node on
every CI run.

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
- **Customization** — icons, render hooks, and a zoned action registry via `aparteGlobalConfig`.

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

(This package used to carry `CUSTOMIZATION.md` and `THEMING.md` alongside these.
They were never published — `files` is `dist`, `README.md`, `LICENSE` — nothing
linked to them, and both had drifted: one taught a `registerBubbleAction` that does
not exist, the other listed six `--aparte-bubble-*` variables that the stylesheet
never defined. A wrong orphan a coding agent finds by grepping the repo is worse
than no orphan, so they are gone rather than fixed twice.)

## License

MIT
