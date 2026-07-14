# @aparte/provider-openai-compat

**One** adapter for every OpenAI-compatible `/chat/completions` endpoint — OpenAI, Mistral,
OpenRouter, Z.ai, Groq, Together, LM Studio, Ollama (`/v1`) and friends all speak the same
wire format, so they share a single, **zero-dependency** format adapter. Vendors differ only
by data (base URL, auth header, branding), passed as config or picked from `presets`.

```ts
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { AparteConfig } from '@aparte/core';

AparteConfig.registerAIProvider(createOpenAICompatProvider(presets.OPENROUTER));
// …or any compat endpoint, no preset needed:
AparteConfig.registerAIProvider(createOpenAICompatProvider({ id: 'groq', baseURL: 'https://api.groq.com/openai/v1' }));
```

`@aparte/core` is an **optional peer**. For vendors outside the OpenAI-compat family
(Anthropic, Gemini, …) use [`@aparte/provider-ai-sdk`](../ai-sdk) instead.

> Part of the [aparté](https://github.com/apartejs/aparte) monorepo. ESM-only.
> See the **Providers** guide in the docs for the full usage.
