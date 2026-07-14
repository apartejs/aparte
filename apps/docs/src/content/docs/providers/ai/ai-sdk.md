---
title: Vercel AI SDK bridge
description: Bridge any Vercel AI SDK model into aparté — bring your own @ai-sdk/* package (Anthropic, Google, 25+ vendors) and aparté renders it.
sidebar:
  order: 3
  label: ai-sdk
---

For vendors outside the OpenAI-compat family (Anthropic, Google, Bedrock, 25+ more), bridge the
[Vercel AI SDK](https://sdk.vercel.ai). You bring your `@ai-sdk/*` package and hand its model to
`createAiSdkProvider`; the bridge maps `streamText`'s output to aparté's event stream.

```bash
npm install @aparte/provider-ai-sdk ai @ai-sdk/anthropic
```

`ai` is a **peer dependency** pinned to the verified major (`^7`) — this bridge is the only aparté
module that touches the SDK's types.

```ts
import { createAnthropic } from '@ai-sdk/anthropic';
import { createAiSdkProvider } from '@aparte/provider-ai-sdk';
import { AparteConfig, DirectTransport } from '@aparte/core';

AparteConfig.registerAIProvider(createAiSdkProvider({
  id: 'anthropic',
  name: 'Anthropic',
  models: [{ id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' }],
  languageModel: (modelId, auth) =>
    createAnthropic({
      apiKey: typeof auth === 'string' ? auth : auth?.apiKey,
      headers: { 'anthropic-dangerous-direct-browser-access': 'true' }, // BYOK from the browser
    })(modelId),
}));

AparteConfig.setTransport(new DirectTransport({ byok: true }));
```

The `languageModel` factory receives the model id and the key/config your key-resolver produced —
rebuild the vendor provider per call for UI-driven BYOK, or ignore `auth` if your factory already
carries the key. The bridge owns its I/O through the SDK and honours the abort signal, so a user
"stop" cancels the underlying vendor call.
