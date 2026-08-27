---
title: Backend transport
description: Keep your API key server-side — route chat through your own /api/chat with AparteBackendTransport and createAparteChatHandler.
sidebar:
  order: 8
---

Every aparté chat goes through a **transport**: *where* the request goes and *how* the
key is handled. [`AparteDirectTransport`](/guides/getting-started/#wire-a-real-model) calls the
vendor straight from the browser — fine for BYOK or a local model, but it puts the key in
devtools. `AparteBackendTransport` instead POSTs to **your own endpoint**; your server resolves
the vendor key, calls the vendor, and streams normalized events back. The key never
reaches the browser.

## When to use it

| | `AparteDirectTransport` | `AparteBackendTransport` |
| --- | --- | --- |
| Key location | Browser (devtools-visible) | Server only |
| Good for | BYOK, local models (Ollama, LM Studio), prototyping | Production / SaaS with a key you pay for |
| Client needs | The vendor's format adapter | Only a `providerId` string |

If your app pays for the API key, use `AparteBackendTransport`. If the *user* supplies their own
key (or the model runs locally, keyless), `AparteDirectTransport` is simpler and there's no
server hop.

### Writing your own transport

`AparteAIProvider` is a union of two arms: a provider either **shapes payloads** (a format
adapter — `buildRequest`, `parseStream`, an endpoint and a way to present a key) or **owns its
I/O** in a `chat()` method, the way `@aparte/provider-transformers` runs a model locally. The
compiler tells an author which arm they implemented; `isFormatAdapter` tells a *transport*
which arm it was handed, and narrows the type as it answers:

```ts
import { isFormatAdapter, aparteGlobalConfig, type AparteChatRequest } from '@aparte/core';

async function dispatch(providerId: string, request: AparteChatRequest) {
  const provider = aparteGlobalConfig.getAIProvider(providerId);
  if (!provider) throw new Error(`no provider registered for "${providerId}"`);

  if (isFormatAdapter(provider)) {
    // Narrowed: buildRequest / parseStream / defaultEndpoint are all non-optional here,
    // so you do the HTTP and the auth, and the provider only shapes the bytes.
    const { path, body } = provider.buildRequest(request);
    return { url: provider.defaultEndpoint + path, body };
  }

  // The other arm: the provider does its own I/O, so stay out of the way.
  return provider.chat?.(request);
}
void dispatch;
```

Both built-in transports do exactly this — it is why one map of providers serves a
browser-direct app and a server-held-key app without either provider knowing which it is in.

## 1. Build the server handler

`createAparteChatHandler` builds a framework-free `/api/chat` handler: a plain
`(req: Request) => Promise<Response>` using only the Web `fetch` API, so it drops into a
Next.js route handler, Deno, Bun, or a Cloudflare Worker unchanged. It reads
`{ providerId, request }`, runs the matching **format adapter** server-side
(`buildRequest` → auth → vendor fetch → `parseStream`), and re-emits the result as NDJSON
(one JSON object per line) — the exact wire format `AparteBackendTransport` expects on the way
back.

Importing `@aparte/core` on the server is fine: a `node` export condition resolves to a
DOM-free entry (no custom elements, no CSS), and the same holds for the format-adapter
providers. See **[On the server](/frameworks/elements/#on-the-server)** for what the
DOM-free entry keeps and loses, and for what each wrapper does about it — the contract is
enforced in CI by a real Node import, not just documented.

```ts
// app/api/chat/route.ts (Next.js) — runs in the Node.js runtime
import { createAparteChatHandler } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';

// Your own session lookup — the same one guarding your other authenticated routes.
declare function getSession(req: Request): Promise<{ userId: string } | null>;

export const POST = createAparteChatHandler({
  providers: {
    openai: createOpenAICompatProvider(presets.OPENAI),
  },
  resolveKey: (providerId) => process.env[`${providerId.toUpperCase()}_KEY`],
  // REQUIRED. This route spends your key, so your own auth goes here. Return false
  // for 401, a Response for your own status, or true to proceed.
  authorize: async (req) => Boolean(await getSession(req)),
});
```

:::caution[`authorize` has to actually authenticate]
It is required so the decision cannot be skipped, but a required option can still be
satisfied by something that decides nothing. `Boolean(req.headers.get('cookie'))` is
the shape to avoid: **any** request carrying **any** cookie passes, including a
cross-site one from a page you have never seen — so the route spends your vendor key
for anyone who can load it. Call your real session lookup, the same one that guards
your other authenticated routes.
:::

`createAparteChatHandler` and its `AparteChatHandlerOptions` type are exported from
`@aparte/core`'s **Node/SSR entry** (resolved automatically via the `node` export
condition when a server file does `import '@aparte/core'`) — that entry is DOM-free, so
importing it on the server never touches `HTMLElement`.

Handler options:

- **`providers`** — a `Record<string, AparteAIProvider>` keyed by the `providerId` the
  client will send (the same `@aparte/provider-*` adapters you'd use with
  `AparteDirectTransport` — nothing changes about the adapter itself). Each entry must expose
  the **format-adapter** surface (`buildRequest` + `parseStream` + `defaultEndpoint`, plus
  `authHeaders` or `authQuery`) — `createOpenAICompatProvider(...)` already does. An
  unregistered `providerId` gets a `400`; a provider missing the adapter surface gets a
  `500`.
- **`resolveKey(providerId)`** — pulls the vendor key from env/a secret store, server-side
  only. Return `undefined` for keyless/local providers.
- **`fetchImpl`** — override the `fetch` used to call the vendor (defaults to global
  `fetch`), e.g. in tests or behind a proxy.
- **`authorize(req)`** — an auth gate run on every request **before any work**. Return
  `false` to reject with `401`, a `Response` to reject with your own status/body (e.g.
  `403` + a message), or `true` to proceed. Read cookies/headers from `req`.

Register one entry per vendor you support; the map key is what the client sends as
`providerId`, so route between OpenAI, Mistral, OpenRouter, etc. by adding more entries.

:::caution[This endpoint spends your key]
`/api/chat` makes the vendor call with your server-held key, so anyone who can reach the
route can spend your quota. Put your own auth in front of it — upstream (middleware/edge)
or via the **`authorize(req)`** option above (return `false`/a `403` `Response` for an
unauthenticated caller). The handler does not authenticate for you.
:::

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
errors (bad key, rate limit, etc.) keep their original **status**, but their **body is
summarised** to `{ error: { message, code?, type? } }` rather than relayed. That is
deliberate: an OpenAI 401 body reads `Incorrect API key provided: sk-proj-****abcd`, so
passing it through would hand a caller your key's prefix, tail and format — and other
vendors echo organisation ids and request fragments. The machine-readable `code` / `type`
survive, which is what a client actually branches on; the vendor's prose belongs in your
server's logs. (`AparteDirectTransport` has no such concern: there, the key is the
caller's own.)

## 2. Point the browser at it

On the client, skip the provider adapter entirely — the browser only needs to know the
`providerId` and where your endpoint lives. Set `AparteBackendTransport` instead of
`AparteDirectTransport` and drive the rest exactly as usual:

```ts
import { aparteGlobalConfig, AparteClient, AparteBackendTransport } from '@aparte/core';

aparteGlobalConfig.setTransport(new AparteBackendTransport({ endpoint: '/api/chat' }));
new AparteClient().start();   // .start() attaches the aparte-send/-retry/-edit listeners
```

No key, no adapter import, nothing devtools-visible — the browser just POSTs
`{ providerId, request }` to `/api/chat` and streams the reply back into your bubbles.

:::caution
`aparteGlobalConfig` still needs to know *which* `providerId` to send (e.g. via the model
selector, or hardcoded if you only support one vendor) — `AparteBackendTransport` doesn't need
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

The NDJSON `AparteBackendTransport` reads back is aparté's own — one JSON `AparteStreamEvent`
per line — **not** the Vercel AI SDK Data Stream Protocol. You don't need to think about
this if you use `createAparteChatHandler` on the server (it produces exactly this format),
but a hand-rolled route must match it if you skip the helper.

## Next steps

- **[Providers](/providers/)** — the format adapters you register in the `providers` map
  (OpenAI-compatible, the AI SDK bridge, Transformers.js).
- **[Getting started](/guides/getting-started/#wire-a-real-model)** — the
  `AparteDirectTransport` / BYOK path, for contrast.
- **[The agent engine](/guides/engine)** — `runStreamAgent`, for a headless loop instead
  of the `AparteClient` event wiring shown here.
