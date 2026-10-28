# @aparte/provider-ai-sdk

Bridge **any** [Vercel AI SDK](https://sdk.vercel.ai) model into aparté. aparté's own wire
concern is deliberately tiny — [`@aparte/provider-openai-compat`](../openai-compat) covers the
one de-facto-standard format; everything else (Anthropic, Google, Bedrock, 25+ vendors) rides
the AI SDK ecosystem through this bridge. You bring your `@ai-sdk/*` package, hand its model to
`createAiSdkProvider`, and the bridge maps `streamText`'s `fullStream` to aparté's events.

```bash
npm install @aparte/provider-ai-sdk @aparte/core ai @ai-sdk/anthropic
```

`ai` and your chosen `@ai-sdk/*` vendor package are **peer dependencies** — you pick the
versions, and only the vendors you actually use end up in your bundle. `@aparte/core` is a
peer too.

```ts
import { createAnthropic } from '@ai-sdk/anthropic';
import { createAiSdkProvider } from '@aparte/provider-ai-sdk';
import { aparteGlobalConfig } from '@aparte/core';

aparteGlobalConfig.registerAIProvider(createAiSdkProvider({
    id: 'anthropic',
    name: 'Anthropic',
    models: [{ id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' }],
    languageModel: (modelId, auth) =>
        createAnthropic({ apiKey: typeof auth === 'string' ? auth : auth?.['apiKey'] })(modelId),
}));
```

`ai` is a **peerDependency pinned to the verified major** (`^7`) — this bridge is the only
aparté module touching the SDK's types. `@aparte/core` is a **peer dependency**.

## Sources and citations

A model that searches the web or reads documents reports what it drew on as `source` parts
in the SDK's stream. The bridge collects them and ends the turn with one `sources` event, just
before `done`: aparté lists the sources under the reply, and puts a chip in the text wherever
the vendor says a passage is cited. Nothing to configure — a model that reports no source
leaves the stream as it was.

<!-- doc-check: skip @ai-sdk/perplexity is the reader's vendor package, not one this repo installs -->
```ts
import { createPerplexity } from '@ai-sdk/perplexity';
import { createAiSdkProvider } from '@aparte/provider-ai-sdk';
import { aparteGlobalConfig } from '@aparte/core';

// Sonar searches the web: each page it reads arrives as a `source` part.
aparteGlobalConfig.registerAIProvider(createAiSdkProvider({
    id: 'perplexity',
    name: 'Perplexity',
    models: [{ id: 'sonar', name: 'Sonar' }],
    languageModel: (modelId, auth) =>
        createPerplexity({ apiKey: typeof auth === 'string' ? auth : auth?.['apiKey'] })(modelId),
}));
```

- A `url` source becomes `{ id, url, title }`; a `document` source `{ id, title }` (its filename
  when it has no title) and no link. The same URL reported twice is one source.
- From `ai` 7.0.138 a `text-end` part may carry `citations`: each names a source and, when the
  vendor says so, the passage it supports, with offsets relative to that text part. The bridge
  rebases them onto the whole reply, so the chip lands after the right sentence. A citation with
  no offsets supports its whole text part; a vendor's `citedText` becomes the source's snippet.
  On an older `ai` the field is simply absent and only the list of sources is shown.
- A non-streamed request (`stream: false`) that cites sources returns the stream
  `[text, sources, done]` instead of a bare string; one that cites nothing still returns the string.

**Works on the server too.** This bridge touches no DOM, and core resolves its DOM-free entry
under Node's export condition — so it runs in a backend, an Electron main process or an SSR
pass as well as in the browser.

> Part of the [aparté](https://github.com/apartejs/aparte) monorepo. ESM-only.
> See the **Providers** guide in the docs for the full usage.
