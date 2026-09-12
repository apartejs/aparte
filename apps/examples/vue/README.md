# example · vue

The chat site in Vue: `@aparte/vue`'s `<AparteChat>` inside the application shell — the sidebar
with the conversation list, the header, the settings dialog — over the library's own conversation
chain, with the same skin and the same setup as the other examples.

```bash
pnpm --filter @aparte-workspace/example-vue dev
```

`setupSite()` ([`../_shared/site-setup.ts`](../_shared/site-setup.ts)) registers the renderers and
plugins, the provider, the transport and starts the `AparteClient` once, before the first render;
[`src/App.vue`](./src/App.vue) renders the site and feeds the list from the conversation manager —
`<AparteChat>`'s host runs the controller (select, new chat, the wait while a conversation loads).
`vite.config.ts` sets `isCustomElement` so Vue leaves the `<aparte-*>` tags alone.

## Talking to a model (BYOK / local)

The scripted model answers by default. The **Settings** dialog (top right) switches to a local
server: **Ollama** / **LM Studio** run locally with **no key** (enable CORS on the local server); any
OpenAI-compatible endpoint works with the endpoint and token fields (stored in `localStorage` only,
sent straight to the endpoint). Never commit a key.

Dev resolves `@aparte/*` from source (HMR); `pnpm build` consumes the published `dist`.
