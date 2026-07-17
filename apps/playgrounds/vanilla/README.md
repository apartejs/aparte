# playground · vanilla

A minimal, framework-free example: `@aparte/core` web components driving a **real** model, plus the
`model-selector` and `marked` plugins. ~60 lines of wiring in [`src/main.ts`](./src/main.ts).

```bash
pnpm --filter @aparte-workspace/playground-vanilla dev
```

## Talking to a model (BYOK / local)

The selector lists three providers — pick one:

- **Ollama** (`http://localhost:11434`) or **LM Studio** (`http://localhost:1234`) — run a model locally and
  chat with **no API key**. Enable CORS on the local server (LM Studio: *Developer → CORS*; Ollama: set
  `OLLAMA_ORIGINS=*`) so the browser can reach it directly.
- **OpenRouter** — paste a key in the top bar; it's stored in `localStorage` only and sent straight to
  OpenRouter (`DirectTransport({ byok: true })`). Never commit a key.

Dev resolves `@aparte/*` from source (HMR); `pnpm build` consumes the published `dist`.
