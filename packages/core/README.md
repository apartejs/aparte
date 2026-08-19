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
  them on next to the client: `AparteConfig.setBubbleActions({ retry: true, edit: true })`.
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
