---
title: Providers
description: Connect aparté to a real model — OpenAI-compatible endpoints, the Vercel AI SDK bridge, or a model running 100% in the browser.
sidebar:
  order: 1
  label: Overview
---

`@aparte/core` is model-agnostic: it never talks to a vendor directly. Two composable pieces do that:

- A **provider** — the *wire-format adapter* for a model family (how a request is shaped, how the
  response stream is parsed). Providers ship as opt-in `@aparte/provider-*` packages, so core stays
  zero-dependency.
- A **transport** — *where* the request goes and *how* the key is handled: `DirectTransport`
  (browser → provider) or `BackendTransport` (browser → your server). See
  [Getting started](/guides/getting-started/#wire-a-real-model).

Register a provider, set a transport, construct an `AparteClient`, and streaming just works:

```ts
import { AparteConfig, AparteClient, DirectTransport } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';

AparteConfig.registerAIProvider(createOpenAICompatProvider(presets.OPENROUTER));
AparteConfig.setTransport(new DirectTransport({ byok: true }));   // browser → provider, key stays client-side
new AparteClient({
  // BYOK: hand the browser-held key to each request (see "Supplying the key" below).
  keyResolver: () => localStorage.getItem('openrouter.key') ?? undefined,
}).start();                                                        // .start() drives the streaming loop
```

## Supplying the API key (BYOK)

A **cloud** provider needs a key — without one it returns an empty model list and can't stream.
With `DirectTransport({ byok: true })` the key lives in the **browser** (it's never sent to a
server), and you hand it to each request via **`keyResolver`** on `AparteClient`:

```ts
new AparteClient({
  // Called per request with the providerId; return the key (or undefined for none).
  keyResolver: (providerId) => localStorage.getItem(`${providerId}.key`) ?? undefined,
}).start();
```

The canonical BYOK flow: a small key `<input>` in your UI writes the value to `localStorage`,
and `keyResolver` reads it back — so no key is ever hard-coded or committed:

```ts
keyInput.addEventListener('change', () => {
  localStorage.setItem('openrouter.key', keyInput.value.trim());
});
```

- **Local providers** (`presets.LMSTUDIO`, `presets.OLLAMA`) are keyless — they set `isLocal`, so
  `keyResolver` can return `undefined` for them. Run one and you need no key at all.
- Want the key **off the client** entirely? Use [`BackendTransport`](/guides/backend-transport/)
  instead — the key stays on your server and never reaches the browser.
- `keyResolver` may return a `Record<string, string>` (for providers needing several auth headers)
  and may be async (fetch from your own vault). `AparteConfig.setKeyProvider(...)` is an alternative
  channel if you'd rather register the key globally instead of per-client.

## Which one?

| You want to reach… | Package |
| --- | --- |
| OpenAI, Mistral, OpenRouter, Groq, Together, Z.ai, LM Studio, Ollama | [`openai-compat`](/providers/ai/openai-compat/) |
| Anthropic, Google, Amazon Bedrock, or any other `@ai-sdk/*` vendor | [`ai-sdk`](/providers/ai/ai-sdk/) |
| A model running 100% in the browser — no server, no key | [`transformers`](/providers/ai/transformers/) |

## Writing your own

A provider is any object implementing the `AparteAIProvider` interface. There are two shapes, and
both surfaces are optional — implement only the half you need:

- **Format adapter** (`buildRequest` / `authHeaders` / `parseStream` / `parseText` +
  `defaultEndpoint`) — the provider only shapes the payload and parses the stream; a transport owns
  auth and the network. This is what [`openai-compat`](/providers/ai/openai-compat/) does.
- **Own-I/O** (`chat()`) — the provider makes its own request (an SDK, a local runtime);
  `DirectTransport` delegates to it and forwards the abort signal. This is what
  [`ai-sdk`](/providers/ai/ai-sdk/) and [`transformers`](/providers/ai/transformers/) do.
