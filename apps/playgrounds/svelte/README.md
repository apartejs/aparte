# playground · svelte

A minimal Svelte example: `@aparte/svelte`'s `<AparteChat>` driving a **real** model, plus the
`model-selector` and `marked` plugins.

```bash
pnpm --filter @aparte-workspace/playground-svelte dev
```

`setupAparte()` ([`src/aparte.ts`](./src/aparte.ts)) registers the providers + transport and starts the
`AparteClient` once; `<AparteChat>` ([`src/App.svelte`](./src/App.svelte)) renders the UI — the client
drives it through the host binding.

> **Note:** `@aparte/svelte` is Svelte 4, so this app pins **Vite 5 + vite-plugin-svelte 3** (Vite 6's
> plugin requires Svelte 5) and consumes the wrapper from its pre-compiled `dist`. Rich `.svelte` types /
> Svelte 5 support is a tracked follow-up (`@sveltejs/package`).

## Talking to a model (BYOK / local)

Pick a provider in the selector: **Ollama** / **LM Studio** run locally with **no key** (enable CORS on the
local server); **OpenRouter** uses a key you paste in the top bar (stored in `localStorage` only). Never
commit a key.
