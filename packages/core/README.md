# @aparte/core

Framework-agnostic AI-chat UI as **vanilla Web Components** — zero runtime dependencies,
ESM-only, usable in any framework or none.

> 🚧 **Pre-alpha** — not yet published to npm. Part of the
> [aparté](https://github.com/apartejs/aparte) monorepo.

## Install

```bash
npm install @aparte/core
```

## Quick start

```ts
import '@aparte/core';               // registers the <aparte-*> custom elements
import '@aparte/core/styles.css';    // theme variables + component styles
import { registerDefaultRenderers, AparteClient } from '@aparte/core';

registerDefaultRenderers();
// Drop the shell in your HTML:  <aparte-chat placeholder="Ask anything…"></aparte-chat>

// Give it a provider + transport (see the docs), then construct the client and call
// .start() — it listens for the composer's events and streams the reply into the
// conversation. (Without .start(), no listeners are attached and nothing streams.)
new AparteClient().start();
```

## What's in it

- **`<aparte-chat>`** — a drop-in shell (viewport + composer), or compose the primitives
  yourself (`<aparte-chat-viewport>`, `<aparte-composer>`, `<aparte-chat-bubble>`, …).
- **`AparteClient`** — an optional driver that turns composer events into a streamed reply.
  Retry / edit fork the conversation into **branches** with a built-in `‹ 1/2 ›` picker.
- **Transports** — `DirectTransport` (browser → provider, BYOK / local model) or
  `BackendTransport` (browser → your endpoint, API key stays server-side).
- **Theming** — restyle everything through `--aparte-*` CSS variables (Light DOM, no forking).
- **Customization** — icons, render hooks, and a zoned action registry via `AparteConfig`.

Zero runtime dependencies: Markdown, syntax highlighting, etc. are **opt-in** providers you inject.
ESM-only (CJS consumers use `await import()`).

## Docs

Guides + a generated API reference live in the monorepo under
[`apps/docs`](https://github.com/apartejs/aparte/tree/main/apps/docs): Getting started, Theming,
Customization, Conversations &amp; branching, and The agent engine.

## License

MIT
