# playground · vue

A minimal Vue example: `@aparte/vue`'s `<AparteChat>` driving a **real** model, plus the `model-selector`
and `marked` plugins.

```bash
pnpm --filter @aparte-workspace/playground-vue dev
```

`setupAparte()` ([`src/aparte.ts`](./src/aparte.ts)) registers the providers + transport and starts the
`AparteClient` once; `<AparteChat>` ([`src/App.vue`](./src/App.vue)) renders the UI — the client drives it
through the host binding. `vite.config.ts` sets `isCustomElement` so Vue leaves the `<aparte-*>` tags alone.

## Talking to a model (BYOK / local)

Pick a provider in the selector: **Ollama** / **LM Studio** run locally with **no key** (enable CORS on the
local server); **OpenRouter** uses a key you paste in the top bar (stored in `localStorage` only). Never
commit a key.

Dev resolves `@aparte/*` from source (HMR); `pnpm build` consumes the published `dist`.
