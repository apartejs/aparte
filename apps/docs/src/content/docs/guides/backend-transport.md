---
title: Backend transport
description: Keep your API key server-side — route chat through your own /api/chat with BackendTransport and createAparteChatHandler.
sidebar:
  order: 8
---

Every aparté chat goes through a **transport**: *where* the request goes and *how* the
key is handled. [`DirectTransport`](/guides/getting-started/#wire-a-real-model) calls the
vendor straight from the browser — fine for BYOK or a local model, but it puts the key in
devtools. `BackendTransport` instead POSTs to **your own endpoint**; your server resolves
the vendor key, calls the vendor, and streams normalized events back. The key never
reaches the browser.

## When to use it

| | `DirectTransport` | `BackendTransport` |
| --- | --- | --- |
| Key location | Browser (devtools-visible) | Server only |
| Good for | BYOK, local models (Ollama, LM Studio), prototyping | Production / SaaS with a key you pay for |
| Client needs | The vendor's format adapter | Only a `providerId` string |

If your app pays for the API key, use `BackendTransport`. If the *user* supplies their own
key (or the model runs locally, keyless), `DirectTransport` is simpler and there's no
server hop.

## 1. Build the server handler

`createAparteChatHandler` builds a framework-free `/api/chat` handler: a plain
`(req: Request) => Promise<Response>` using only the Web `fetch` API, so it drops into a
Next.js route handler, Deno, Bun, or a Cloudflare Worker unchanged. It reads
`{ providerId, request }`, runs the matching **format adapter** server-side
(`buildRequest` → auth → vendor fetch → `parseStream`), and re-emits the result as NDJSON
(one JSON object per line) — the exact wire format `BackendTransport` expects on the way
back.

```ts
// app/api/chat/route.ts (Next.js) — runs in the Node.js runtime
import { createAparteChatHandler } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';

export const POST = createAparteChatHandler({
  providers: {
    openai: createOpenAICompatProvider(presets.OPENAI),
  },
  resolveKey: (providerId) => process.env[`${providerId.toUpperCase()}_KEY`],
});
```

`createAparteChatHandler` and its `AparteChatHandlerOptions` type are exported from
`@aparte/core`'s **Node/SSR entry** (resolved automatically via the `node` export
condition when a server file does `import '@aparte/core'`) — that entry is DOM-free, so
importing it on the server never touches `HTMLElement`.

Handler options:

- **`providers`** — a `Record<string, AparteAIProvider>` keyed by the `providerId` the
  client will send (the same `@aparte/provider-*` adapters you'd use with
  `DirectTransport` — nothing changes about the adapter itself). Each entry must expose
  the **format-adapter** surface (`buildRequest` + `parseStream` + `defaultEndpoint`, plus
  `authHeaders` or `authQuery`) — `createOpenAICompatProvider(...)` already does. An
  unregistered `providerId` gets a `400`; a provider missing the adapter surface gets a
  `500`.
- **`resolveKey(providerId)`** — pulls the vendor key from env/a secret store, server-side
  only. Return `undefined` for keyless/local providers.
- **`fetchImpl`** — override the `fetch` used to call the vendor (defaults to global
  `fetch`), e.g. in tests or behind a proxy.

Register one entry per vendor you support; the map key is what the client sends as
`providerId`, so route between OpenAI, Mistral, OpenRouter, etc. by adding more entries.

:::note
Non-streaming requests (`request.stream === false`) resolve server-side too: the handler
calls the adapter's `parseText` and replies with a plain `{ text }` JSON body instead of
NDJSON.
:::

### SSRF safety

The client never sends a URL — only a `providerId` string. The vendor URL comes from
`adapter.defaultEndpoint` inside **your** `providers` map, resolved on the server; nothing
in the request body can redirect the server to an arbitrary host. A malicious or buggy
client can pick a *registered* provider at most, never an arbitrary endpoint. Vendor
errors (bad key, rate limit, etc.) are propagated back with their original status and body
so the client surfaces the real vendor message, same as `DirectTransport`.

## 2. Point the browser at it

On the client, skip the provider adapter entirely — the browser only needs to know the
`providerId` and where your endpoint lives. Set `BackendTransport` instead of
`DirectTransport` and drive the rest exactly as usual:

```ts
import { AparteConfig, AparteClient, BackendTransport } from '@aparte/core';

AparteConfig.setTransport(new BackendTransport({ endpoint: '/api/chat' }));
new AparteClient().start();   // .start() attaches the aparte-send/-retry/-edit listeners
```

No key, no adapter import, nothing devtools-visible — the browser just POSTs
`{ providerId, request }` to `/api/chat` and streams the reply back into your bubbles.

:::caution
`AparteConfig` still needs to know *which* `providerId` to send (e.g. via the model
selector, or hardcoded if you only support one vendor) — `BackendTransport` doesn't need
the provider's format adapter registered client-side, but something has to pick the id.
:::

`BackendTransportOptions`:

- **`endpoint`** — your chat route, e.g. `/api/chat`.
- **`headers`** — extra headers sent with every request (a session cookie is sent
  automatically; add an app-specific auth header here if you need one).
- **`buildBody`** — override how the request is serialized to your backend. Defaults to
  `{ providerId, request }`; return any JSON-serializable value if your route expects a
  different shape.

## Wire format

The NDJSON `BackendTransport` reads back is aparté's own — one JSON `AparteStreamEvent`
per line — **not** the Vercel AI SDK Data Stream Protocol. You don't need to think about
this if you use `createAparteChatHandler` on the server (it produces exactly this format),
but a hand-rolled route must match it if you skip the helper.

## Next steps

- **[Providers](/providers/)** — the format adapters you register in the `providers` map
  (OpenAI-compatible, the AI SDK bridge, Transformers.js).
- **[Getting started](/guides/getting-started/#wire-a-real-model)** — the
  `DirectTransport` / BYOK path, for contrast.
- **[The agent engine](/guides/engine)** — `runStreamAgent`, for a headless loop instead
  of the `AparteClient` event wiring shown here.
