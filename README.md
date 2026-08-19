# aparté

**Framework-agnostic AI chat, as composable Web Components.** Drop an
`<aparte-chat>` onto any page — React, Vue, Svelte, Angular, or none at all —
wire it to any LLM through a pluggable transport, and restyle everything with CSS
variables. **Zero dependencies** at the core.

[![CI](https://github.com/apartejs/aparte/actions/workflows/ci.yml/badge.svg)](https://github.com/apartejs/aparte/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

> 🚀 **Alpha on npm.** Every `@aparte/*` package ships as `0.2.0-alpha.0` under
> the `alpha` tag — `npm i @aparte/core@alpha`. The API is still stabilising
> before the first stable cut; docs live at **[apartejs.dev](https://apartejs.dev/)**.

<sub>pronounced *ah-par-té* — French *aparté*: a line spoken aside, a private word taken "in aparté". Also reads as *a part*: one composable piece.</sub>

## Why aparté

- **Framework-agnostic core.** One engine — vanilla Web Components — renders the
  *same* chat everywhere. Thin wrappers give React/Vue/Svelte/Angular an
  ergonomic component; with no framework, use the `<aparte-*>` custom elements
  directly.
- **Zero dependencies in `@aparte/core`.** Markdown, syntax highlighting, model
  pickers — all opt-in `provider-*` / `plugin-*` packages. The core stays tiny.
- **Bring your own model, your way.** A **transport** seam decides where the
  request goes: `DirectTransport` (browser-direct — BYOK or a local model) or
  `BackendTransport` (your `/api/chat`, key stays server-side). Providers cover
  the OpenAI-compatible family, the Vercel AI SDK (25+ vendors), and in-browser
  Transformers.js.
- **Streaming, typed segments, tools.** Replies stream as typed segments — text,
  markdown, code, chain-of-thought — including a `tool_call` segment with a
  built-in **human-in-the-loop** approve/reject gate.
- **Yours to restyle.** Theme everything through CSS variables (no forking), swap
  icons and render hooks, and localise the UI strings (English built-in, French
  shipped).
- **A library, not an app.** No routing, settings, or persistence baked in, and
  backend-agnostic — it's a chat surface you compose, not a product you inherit.

## Quick start — no framework

```bash
npm install @aparte/core @aparte/provider-openai-compat
```

```html
<aparte-chat center-empty placeholder="Ask anything…" style="height: 600px"></aparte-chat>
```

```ts
import '@aparte/core';                 // registers the <aparte-*> custom elements
import '@aparte/core/styles.css';      // theme variables + component styles
import { registerDefaultRenderers, AparteConfig, AparteClient, DirectTransport } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';

registerDefaultRenderers();

// A local model (LM Studio / Ollama) needs no key — just enable CORS in the app.
// Swap in presets.OPENAI / .MISTRAL / .OPENROUTER (+ a keyResolver) for a cloud vendor.
AparteConfig.registerAIProvider(createOpenAICompatProvider(presets.LMSTUDIO));
AparteConfig.setTransport(new DirectTransport({ byok: true }));
new AparteClient().start();            // listens for sends, streams the reply into the chat

// The bare shell streams the assistant reply; echo the user's own message in:
const chat = document.querySelector('aparte-chat');
chat.addEventListener('aparte-send', (e) =>
  chat.viewport.appendMessage({ id: crypto.randomUUID(), role: 'user', content: e.detail.content, timestamp: Date.now() }),
);
```

A real streaming, bring-your-own-key chat — no backend, no build magic.
→ **[Getting started](./apps/docs/src/content/docs/guides/getting-started.md)**

## Any framework

Same core, an ergonomic component per framework — and the wrapper owns the state
and the user bubble, so there's even less to wire:

```bash
npm install @aparte/react @aparte/core react react-dom
```

```tsx
import { AparteChat, useAparteChat, useAparteClient } from '@aparte/react';
import { AparteConfig, DirectTransport } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import '@aparte/core/styles.css';

AparteConfig.registerAIProvider(createOpenAICompatProvider(presets.OPENROUTER));
AparteConfig.setTransport(new DirectTransport({ byok: true }));

export function Chat() {
  const chat = useAparteChat();
  useAparteClient();                   // bridges composer sends to the model
  return <AparteChat ref={chat.ref} messages={chat.messages} onMessagesChange={chat.setMessages} centerWhenEmpty />;
}
```

| Framework | Package | Guide |
|---|---|---|
| React 18 / 19 | `@aparte/react` | [React](./apps/docs/src/content/docs/frameworks/react.md) |
| Vue 3 | `@aparte/vue` | [Vue](./apps/docs/src/content/docs/frameworks/vue.md) |
| Svelte | `@aparte/svelte` | [Svelte](./apps/docs/src/content/docs/frameworks/svelte.md) |
| Angular 19 | `@aparte/angular` | [Angular](./apps/docs/src/content/docs/frameworks/angular.md) |

Runnable examples for every framework (plus vanilla) live in
[`apps/playgrounds`](./apps/playgrounds).

## Packages

| Package | What |
|---|---|
| `@aparte/core` | Vanilla web components — the chat engine, **zero dependencies** |
| `@aparte/engine` | Framework-agnostic agent loop (`runStreamAgent`) |
| `@aparte/react` · `/vue` · `/svelte` · `/angular` | Thin, ergonomic framework wrappers (peer deps) |
| `@aparte/provider-openai-compat` | One adapter for every OpenAI-compatible endpoint (OpenAI, Mistral, OpenRouter, Groq, LM Studio, Ollama…) |
| `@aparte/provider-ai-sdk` | Vercel AI SDK bridge (Anthropic, Google, 25+ vendors) |
| `@aparte/provider-transformers` | In-browser inference via Transformers.js |
| `@aparte/plugin-marked` · `-streaming-markdown` · `-shiki` | Markdown rendering + syntax highlighting |
| `@aparte/plugin-model-selector` · `-ask-question` | A provider/model picker; a question-elicitation UI |
| `@aparte/locale-fr` | French UI strings (English is core's built-in default) |

## Documentation

Live at **[apartejs.dev](https://apartejs.dev/)** — a [Starlight](https://starlight.astro.build/)
site in [`apps/docs`](./apps/docs) (run `pnpm run docs` locally):

- **[Getting started](./apps/docs/src/content/docs/guides/getting-started.md)** — your first streaming chat, no framework
- **[Providers](./apps/docs/src/content/docs/providers/index.md)** — connect a real model (OpenAI-compatible, AI SDK, Transformers.js)
- **[Theming](./apps/docs/src/content/docs/guides/theming.md)** — restyle everything through CSS variables
- **[Customization](./apps/docs/src/content/docs/guides/customization.md)** — icons, render hooks, action registries
- **[Conversations & branching](./apps/docs/src/content/docs/guides/conversations-branching.md)** — retry, edit, branches, persistence
- **[The agent engine](./apps/docs/src/content/docs/guides/engine.md)** — the headless `runStreamAgent` loop
- **[Tools & human-in-the-loop](./apps/docs/src/content/docs/guides/tools.md)** — function calling with an approve/reject gate
- **[Backend transport](./apps/docs/src/content/docs/guides/backend-transport.md)** — your `/api/chat`, key stays server-side
- **[Bring your own loop](./apps/docs/src/content/docs/guides/bring-your-own-loop.md)** — display-only mode for an external agent loop

## Status

Alpha, built in the open. The core, engine, four wrappers, providers, plugins and
six runnable playgrounds are **on npm**, green across the unit suite and a browser
E2E suite (Chromium + WebKit, accessibility gated with axe-core). The API may still
move before the first stable release.

Every `@aparte/*` package is released **together, at one version** — install any of
them at the same number. What shipped when: **[CHANGELOG.md](./CHANGELOG.md)** (the
aggregate), or a package's own `CHANGELOG.md` for its detail.

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) for conventions
and the gate each change lands behind. It's a pnpm + NX monorepo:

```bash
pnpm install
pnpm build        # all packages
pnpm test         # unit suite (Vitest)
pnpm e2e          # browser smoke E2E (Playwright; run pnpm e2e:install once)
pnpm run docs     # the docs site (bare `pnpm docs` triggers npm's builtin instead)
```

## License

[MIT](./LICENSE) © Paul Richez
