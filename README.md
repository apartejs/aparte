# aparté

**AI chat and agent UI components, built as Web Components — with the runtime inside.**
Everything an AI chat shows, each piece [on its own page with live variants](https://apartejs.dev/components/):
the conversation, messages with Markdown and code, reasoning, tool calls a human approves,
the questions an agent asks, the composer and its model picker — then the layout around it
(app shell, sidebar, conversation list) and a UI kit for the rest of your app. Use them in
React, Vue, Svelte, Angular or plain HTML, connect any model, restyle everything with CSS
variables. **Zero third-party dependencies** at the core.

Start from a [template](https://apartejs.dev/templates/) — an assistant, an agent workshop, a
support widget, a research assistant — or see [how it compares](https://apartejs.dev/compare/)
with assistant-ui, AI Elements, Deep Chat and Loquix.

[![CI](https://github.com/apartejs/aparte/actions/workflows/ci.yml/badge.svg)](https://github.com/apartejs/aparte/actions/workflows/ci.yml)
[![npm (beta)](https://img.shields.io/npm/v/@aparte/core/beta?label=npm%20beta&color=d9a24b)](https://www.npmjs.com/package/@aparte/core/v/beta)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

> 🚀 **Beta on npm.** Every `@aparte/*` package ships **together at one version**
> under the `beta` tag — `npm i @aparte/core@beta` (the badge above is the live
> number). The number itself is a plain `0.x`: what says *beta* is the npm tag, the
> leading zero and this notice — not a `-beta` suffix. The declared surface is
> [frozen as of 0.17.0](https://apartejs.dev/reference/stability/) and leaves only
> through a notice release; what changed when is at
> **[apartejs.dev/changelog](https://apartejs.dev/changelog/)** (or
> [CHANGELOG.md](./CHANGELOG.md) here), and the docs live at
> **[apartejs.dev](https://apartejs.dev/)**.

<sub>pronounced *ah-par-té* — French *aparté*: a line spoken aside, a private word taken "in aparté". Also reads as *a part*: one composable piece.</sub>

## Why aparté

- **The whole chat, as components.** Conversation, message actions and branches,
  attachments, reasoning, code blocks, tool calls, artifacts, errors, approvals, questions,
  suggestions, a model picker, a context gauge — and the shell around them. Each one is
  documented with its variants running live, not as a screenshot.
- **The runtime is included.** Streaming, the agent loop (`@aparte/engine`) and tool calls
  come with the components — or keep your own loop and
  [stream its replies](https://apartejs.dev/guides/bring-your-own-loop/) into the chat.
- **A human in the loop.** Mark a tool `needsApproval` and the user approves or rejects the
  call; the agent can ask typed questions; and with the
  [server loop](https://apartejs.dev/guides/server-loop/) an approval survives a reload.
- **Framework-agnostic core.** One engine — vanilla Web Components — renders the
  *same* chat everywhere. Thin wrappers give React/Vue/Svelte/Angular an
  ergonomic component; with no framework, use the `<aparte-*>` custom elements
  directly.
- **Zero third-party dependencies in `@aparte/core`.** Markdown, syntax highlighting, model
  pickers — all opt-in `provider-*` / `plugin-*` packages. The core stays tiny.
- **Bring your own model, your way.** A **transport** seam decides where the
  request goes: `AparteDirectTransport` (browser-direct — BYOK or a local model) or
  `AparteBackendTransport` (your `/api/chat`, key stays server-side). Providers cover
  the OpenAI-compatible family, the Vercel AI SDK (25+ vendors), and in-browser
  Transformers.js.
- **Yours to restyle.** Theme everything through CSS variables (no forking), swap
  icons and render hooks, and localise the UI strings (English built-in, French
  shipped).
- **A library, not an app.** No routing, settings, or persistence baked in, and
  backend-agnostic — it's a chat surface you compose, not a product you inherit.

## Quick start — no framework

```bash
npm install @aparte/core @aparte/provider-openai-compat @aparte/plugin-marked marked
```

```html
<aparte-chat center-empty placeholder="Ask anything…" style="height: 600px"></aparte-chat>
```

```ts
import '@aparte/core';                 // registers the <aparte-*> custom elements
import '@aparte/core/styles.css';      // theme variables + component styles
import { registerDefaultRenderers, aparteGlobalConfig, AparteClient, AparteDirectTransport } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { setupMarkedStreamingProvider } from '@aparte/plugin-marked/streaming';

registerDefaultRenderers();
setupMarkedStreamingProvider();        // Markdown, as it streams — core alone shows the text as written

// A local model (LM Studio / Ollama) needs no key — just enable CORS in the app.
// Swap in presets.OPENAI / .MISTRAL / .OPENROUTER (+ a keyResolver) for a cloud vendor.
aparteGlobalConfig.registerAIProvider(createOpenAICompatProvider(presets.LMSTUDIO));
aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));
new AparteClient().start();            // listens for sends, shows the user's message, streams the reply

// Retry/edit only work with a host like the client above, so core ships them off:
aparteGlobalConfig.setBubbleActions({ retry: true, edit: true });
```

A real streaming, bring-your-own-key chat — no backend, no build magic.
→ **[Getting started](./apps/docs/src/content/docs/guides/getting-started.mdx)**

## Any framework

Same core, a component per framework in its own syntax — props, slots or snippets, a bindable
list of messages, your components inside tool calls — and the chat keeps its own thread, so
there's even less to wire:

```bash
npm install @aparte/react @aparte/core @aparte/provider-openai-compat @aparte/plugin-marked marked react react-dom
```

```tsx
import { AparteChat, useAparteClient } from '@aparte/react';
import { aparteGlobalConfig, AparteDirectTransport } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { setupMarkedStreamingProvider } from '@aparte/plugin-marked/streaming';
import '@aparte/core/styles.css';

setupMarkedStreamingProvider();
aparteGlobalConfig.registerAIProvider(createOpenAICompatProvider(presets.OPENROUTER));
aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));

export function Chat() {
  useAparteClient();                   // bridges composer sends to the model
  return <AparteChat centerWhenEmpty />;
}
```

| Framework | Package | Tested in CI with | Rendered on a server, tested in | Guide |
|---|---|---|---|---|
| React 18 / 19 | `@aparte/react` | React 19 | Next 15 App Router | [React](./apps/docs/src/content/docs/frameworks/react.mdx) |
| Vue 3.5 | `@aparte/vue` | Vue 3.5 | Nuxt 3 | [Vue](./apps/docs/src/content/docs/frameworks/vue.mdx) |
| Svelte 4 / 5 | `@aparte/svelte` (`/runes` on Svelte 5) | Svelte 4 and 5 | SvelteKit 2 | [Svelte](./apps/docs/src/content/docs/frameworks/svelte.mdx) |
| Angular 19–21 | `@aparte/angular` | Angular 19 and 21, zoneless | Angular 21 SSR, hydrated | [Angular](./apps/docs/src/content/docs/frameworks/angular.mdx) |

Each server-rendered page is built for production, served, and hydrated in a browser with no
mismatch. Underneath, it is the same Web Components: the chat's markup and its CSS variables are
aparté's.

Runnable examples for every framework (plus vanilla) live in
[`apps/examples`](./apps/examples).

## Packages

| Package | What |
|---|---|
| `@aparte/core` | Vanilla web components — the chat engine, **zero third-party dependencies** |
| `@aparte/engine` | Framework-agnostic agent loop (`runStreamAgent`) |
| `@aparte/react` · `/vue` · `/svelte` · `/angular` | Thin, ergonomic framework wrappers (peer deps) |
| `@aparte/provider-openai-compat` | One adapter for every OpenAI-compatible endpoint (OpenAI, Mistral, OpenRouter, Groq, LM Studio, Ollama…) |
| `@aparte/provider-ai-sdk` | Vercel AI SDK bridge (Anthropic, Google, 25+ vendors) |
| `@aparte/provider-transformers` | In-browser inference via Transformers.js |
| `@aparte/runner-ag-ui` | Render an AG-UI agent (Agno, LangGraph, Mastra, CrewAI) or a TanStack AI route |
| `@aparte/runner-n8n` | Put the chat on an n8n chat workflow (Chat Trigger + AI Agent), streamed or not |
| `@aparte/provider-scenario` | A scripted model — replays turns you wrote, for demos, docs and your own tests |
| `@aparte/docs-mcp` | The docs as an MCP server — `npx @aparte/docs-mcp` lets your coding agent search and read them |
| `@aparte/plugin-marked` · `-streaming-markdown` · `-shiki` | Markdown rendering + syntax highlighting |
| `@aparte/plugin-model-selector` · `-ask-user` · `-approval` · `-compaction` | A provider/model picker; a question-elicitation UI; approval modes (plan / ask / auto-edit / auto); conversation compaction |
| `@aparte/locales` | The UI strings in nine languages — French, Spanish, Portuguese (Brazil), German, Italian, Russian, Japanese, Korean, Chinese (Simplified); English is core's built-in default |

## Documentation

Live at **[apartejs.dev](https://apartejs.dev/)** — a [Starlight](https://starlight.astro.build/)
site in [`apps/docs`](./apps/docs) (run `pnpm run docs` locally):

- **[Getting started](./apps/docs/src/content/docs/guides/getting-started.mdx)** — your first streaming chat, no framework
- **[Providers](./apps/docs/src/content/docs/providers/index.mdx)** — connect a real model (OpenAI-compatible, AI SDK, Transformers.js)
- **[Theming](./apps/docs/src/content/docs/guides/theming.mdx)** — restyle everything through CSS variables
- **[Customization](./apps/docs/src/content/docs/guides/customization/index.mdx)** — icons, render hooks, action registries
- **[Conversations & branching](./apps/docs/src/content/docs/guides/conversations-branching.mdx)** — retry, edit, branches, persistence
- **[The agent engine](./apps/docs/src/content/docs/guides/engine.mdx)** — the headless `runStreamAgent` loop
- **[Tools & human-in-the-loop](./apps/docs/src/content/docs/guides/tools.mdx)** — function calling with an approve/reject gate
- **[Backend transport](./apps/docs/src/content/docs/guides/backend-transport.mdx)** — your `/api/chat`, key stays server-side
- **[Bring your own loop](./apps/docs/src/content/docs/guides/bring-your-own-loop.mdx)** — display-only mode for an external agent loop

## Status

Beta, built in the open. The core, engine, four wrappers, providers, plugins and
six runnable examples are **on npm**, green across the unit suite and a browser
E2E suite (Chromium, WebKit and Firefox, accessibility gated with axe-core). The
declared surface is frozen; what is still open before the first stable release is
on the [roadmap](https://apartejs.dev/roadmap/).

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
