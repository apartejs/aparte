---
title: OpenAI-compatible
description: One zero-dependency adapter for every OpenAI-compatible /chat/completions endpoint — OpenAI, Mistral, OpenRouter, Groq, LM Studio, Ollama and friends.
sidebar:
  order: 2
  label: openai-compat
---

The OpenAI `/chat/completions` format is the industry default — OpenAI, Mistral, OpenRouter, Groq,
Together, Z.ai, LM Studio and Ollama (`/v1`) all speak it. This **one zero-dependency adapter**
covers the whole family; vendors differ only by data (base URL, branding), which you pass as config
or pick from `presets`.

```bash
npm install @aparte/provider-openai-compat @aparte/core
```

```ts
import { aparteGlobalConfig, AparteDirectTransport } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';

// A known vendor, via a preset:
aparteGlobalConfig.registerAIProvider(createOpenAICompatProvider(presets.MISTRAL));

// …or any compat endpoint, no preset needed — just an id + base URL:
aparteGlobalConfig.registerAIProvider(createOpenAICompatProvider({
  id: 'groq',
  baseURL: 'https://api.groq.com/openai/v1',
}));

aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));
```

Built-in presets: `OPENAI`, `MISTRAL`, `ZAI`, `OPENROUTER`, `LMSTUDIO`, `OLLAMA`.

## Models are your data

Pass a static `models` list, or rely on the generic `GET {baseURL}/models` fetcher (part of the
compat standard). Cloud endpoints need a key to list; local servers list keyless.

```ts
createOpenAICompatProvider({
  id: 'x',
  baseURL: 'https://x.example/v1',
  models: [{ id: 'llama-3.3-70b', name: 'Llama 3.3 70B' }],
});
```

## Local models (LM Studio, Ollama)

Local servers are served through their OpenAI-compat `/v1` endpoint. The `isLocal` presets relax
the key requirement and fetch models keyless:

```ts
aparteGlobalConfig.registerAIProvider(createOpenAICompatProvider(presets.OLLAMA)); // http://localhost:11434/v1
aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));
```

:::note
Ollama is used through its OpenAI-compat `/v1` endpoint, **not** its native `/api/chat` — so
native-only niceties (inline base64 images, Ollama-shaped tool calls, `keep_alive`) don't apply.
:::

## As a pure format adapter (bring your own `fetch`)

The provider separates **wire format** from **transport**, so you can take the first and keep the
second. `createOpenAICompatProvider` returns an `OpenAICompatProvider` — the provider type *plus*
the format-adapter surface, with `buildRequest` / `parseStream` / `authHeaders` / `parseText`
guaranteed present (the base `AparteAIProvider` declares them optional, since a provider may do its
own I/O):

```ts
import { readableToAsyncIterable } from '@aparte/core';
import type { AparteChatRequest } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';

const provider = createOpenAICompatProvider(presets.MISTRAL);

const baseURL = 'https://api.mistral.ai/v1';
const apiKey = process.env['MISTRAL_API_KEY'] ?? '';
const request: AparteChatRequest = { messages: [{ role: 'user', content: 'hi' }], modelId: 'mistral-small-latest', stream: true };

// You own the call: your URL, your headers, your AbortSignal, your retries.
// `buildRequest` takes the request alone; the key goes through `authHeaders`.
const { path, body, headers } = provider.buildRequest(request);
const res = await fetch(`${baseURL}${path}`, {
  method: 'POST',
  headers: { ...headers, ...provider.authHeaders(apiKey) },
  body: JSON.stringify(body),
});

// `parseStream` returns a ReadableStream, which is NOT async-iterable in Chromium
// (or under `lib: DOM`). `readableToAsyncIterable` is core's adapter for exactly this.
const controller = new AbortController(); // yours to abort — the helper honours it
for await (const event of readableToAsyncIterable(provider.parseStream(res.body!), controller.signal)) {
  // text · thinking · tool_use · done{usage} — typed, vendor quirks already handled
  void event;
}
```

No transport, no `AparteClient`, no DOM: useful when the loop lives somewhere else entirely (a
separate process, a server route, an Electron main process).

For vendors outside this family (Anthropic, Gemini…), use the [AI SDK bridge](/providers/ai/ai-sdk/).
