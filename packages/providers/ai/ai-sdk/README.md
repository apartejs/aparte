# @aparte/provider-ai-sdk

Bridge **any** [Vercel AI SDK](https://sdk.vercel.ai) model into aparté. aparté's own wire
concern is deliberately tiny — [`@aparte/provider-openai-compat`](../openai-compat) covers the
one de-facto-standard format; everything else (Anthropic, Google, Bedrock, 25+ vendors) rides
the AI SDK ecosystem through this bridge. You bring your `@ai-sdk/*` package, hand its model to
`createAiSdkProvider`, and the bridge maps `streamText`'s `fullStream` to aparté's events.

```ts
import { createAnthropic } from '@ai-sdk/anthropic';
import { createAiSdkProvider } from '@aparte/provider-ai-sdk';
import { AparteConfig } from '@aparte/core';

AparteConfig.registerAIProvider(createAiSdkProvider({
    id: 'anthropic',
    name: 'Anthropic',
    models: [{ id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' }],
    languageModel: (modelId, auth) =>
        createAnthropic({ apiKey: typeof auth === 'string' ? auth : auth?.['apiKey'] })(modelId),
}));
```

`ai` is a **peerDependency pinned to the verified major** (`^7`) — this bridge is the only
aparté module touching the SDK's types. `@aparte/core` is an **optional peer**.

> Part of the [aparté](https://github.com/apartejs/aparte) monorepo. ESM-only.
> See the **Providers** guide in the docs for the full usage.
