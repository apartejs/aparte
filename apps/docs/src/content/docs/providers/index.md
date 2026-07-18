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
AparteConfig.setTransport(new DirectTransport({ byok: true }));   // browser → provider, your key
new AparteClient().start();                                        // .start() drives the streaming loop
```

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
