# example · vanilla

A complete chat site, framework-free: the `@aparte/core` web components and the shell recipes
around them — a sidebar with the conversation list and its search, a header with the title and
a theme toggle, the chat with its composer, suggestions, scroll rail, context gauge and model
selector. It answers with a **scripted model** by default, so it works on a fresh clone with no
server and no key.

```bash
pnpm --filter @aparte-workspace/example-vanilla dev
```

## What is where

- [`index.html`](./index.html) — the whole site as static HTML: the `.aparte-app-shell` grid,
  `<aparte-sidebar>`, `<aparte-conversation-list>`, the `.aparte-app-header` recipe, and the chat.
  Nothing here needs script to have its shape.
- [`src/shell.ts`](./src/shell.ts) — the site's glue over the library's conversation chain: the
  [conversation manager](https://apartejs.dev/guides/conversation-persistence/) and controller, the
  list fed from the manager, new chat, the theme toggle, the settings dialog.
- [`src/main.ts`](./src/main.ts) — the shared setup, then what is this page's alone: the layout
  variants (`?layout=…`) and the two-chats page (`?chats=2`).
- [`../_shared/`](../_shared/) — what the five examples share: `site-setup.ts` (renderers and
  plugins, the provider, the transport, the `AparteClient`), `site-shell.ts` (the helpers the
  shell calls), `sample-conversations.ts` and `sample-adapter.ts` (the conversations the sidebar
  lists, served after a delay on purpose — `?fast` and `?slow` change it), `theme-chatgpt.css`
  (the skin, every value measured on the product) and `site.css`.

## Talking to a model

The **Settings** page (top right) switches from the scripted model to a **local server**:

- **Ollama** (`http://localhost:11434`) or **LM Studio** (`http://localhost:1234`) — run a model
  locally and chat with **no API key**. Enable CORS on the local server (LM Studio:
  *Developer → CORS*; Ollama: set `OLLAMA_ORIGINS=*`) so the browser can reach it directly.
- Any other OpenAI-compatible endpoint, with a token — stored in `localStorage` only and sent
  straight to the endpoint (`AparteDirectTransport({ byok: true })`). Never commit a key.

`?scenario` and `?local` in the URL override the setting for one page load.

## Variants, by URL

- `?layout=split` — the chat beside a preview frame in an `<aparte-split>`.
- `?layout=page` — the overlay composer: the transcript scrolls edge to edge under it.
- `?chats=2` — two chats on one page, one `AparteClient`.
- `?view=settings` — the settings page.

Dev resolves `@aparte/*` from source (HMR); `pnpm build` consumes the published `dist`.
