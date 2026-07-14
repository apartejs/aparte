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
npm install @aparte/provider-openai-compat
```

```ts
import { AparteConfig, DirectTransport } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';

// A known vendor, via a preset:
AparteConfig.registerAIProvider(createOpenAICompatProvider(presets.MISTRAL));

// …or any compat endpoint, no preset needed — just an id + base URL:
AparteConfig.registerAIProvider(createOpenAICompatProvider({
  id: 'groq',
  baseURL: 'https://api.groq.com/openai/v1',
}));

AparteConfig.setTransport(new DirectTransport({ byok: true }));
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
AparteConfig.registerAIProvider(createOpenAICompatProvider(presets.OLLAMA)); // http://localhost:11434/v1
AparteConfig.setTransport(new DirectTransport({ byok: true }));
```

:::note
Ollama is used through its OpenAI-compat `/v1` endpoint, **not** its native `/api/chat` — so
native-only niceties (inline base64 images, Ollama-shaped tool calls, `keep_alive`) don't apply.
:::

For vendors outside this family (Anthropic, Gemini…), use the [AI SDK bridge](/providers/ai/ai-sdk/).
