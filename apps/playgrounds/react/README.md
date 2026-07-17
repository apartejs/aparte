# playground · react

A minimal React example: `@aparte/react`'s `<AparteChat>` driving a **real** model, plus the
`model-selector` and `marked` plugins.

```bash
pnpm --filter @aparte-workspace/playground-react dev
```

`setupAparte()` ([`src/aparte.ts`](./src/aparte.ts)) registers the providers + transport and starts the
`AparteClient` once; `<AparteChat>` ([`src/App.tsx`](./src/App.tsx)) just renders the UI — the client
drives it (appends + streams the reply) through the host binding.

## Talking to a model (BYOK / local)

Pick a provider in the selector: **Ollama** / **LM Studio** run locally with **no key** (enable CORS on the
local server); **OpenRouter** uses a key you paste in the top bar (stored in `localStorage` only, sent
straight to OpenRouter). Never commit a key.

Dev resolves `@aparte/*` from source (HMR); `pnpm build` consumes the published `dist`.
