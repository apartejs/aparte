---
title: Transformers.js (local)
description: Run LLMs 100% in the browser via Transformers.js (WebGPU/WASM) — no API, no key, no server. Streams off the main thread in a Web Worker.
sidebar:
  order: 4
  label: transformers
---

Run models **100% in the browser** via [Transformers.js](https://huggingface.co/docs/transformers.js)
(WebGPU, with a WASM fallback) — no API, no key, no server. Inference runs off the main thread in a
Web Worker; weights download once and persist in the Cache API.

```bash
npm install @aparte/provider-transformers @aparte/core @huggingface/transformers
```

`@huggingface/transformers` is a **peer dependency** — it's heavy and ships its own onnxruntime, so
you bring the version you want.

:::caution[This provider needs a bundler]
It is the one `@aparte/*` package the [CDN path](/guides/getting-started/#install)
cannot serve, for two reasons that stack. The provider spawns its worker from a URL relative
to its own module, which from a CDN is cross-origin — and `new Worker()` refuses a
cross-origin script. Even served from your own origin, the worker imports
`@huggingface/transformers` by bare specifier, and **an import map in the document does not
apply to a worker**, so there is nothing to resolve it with.

Every other provider works with no build at all. This one is being fixed
([#41](https://github.com/apartejs/aparte/issues/41)); until then, use Vite, webpack,
Parcel or any bundler that processes `new Worker(new URL(…))`.
:::

```ts
import { aparteGlobalConfig, AparteDirectTransport } from '@aparte/core';
import { TransformersProvider, registerModel } from '@aparte/provider-transformers';

registerModel({
  id: 'onnx-community/Qwen2.5-0.5B-Instruct',
  name: 'Qwen2.5 0.5B',
  task: 'text-generation',
  capabilities: ['streaming'],
  dtype: 'q4',
});
aparteGlobalConfig.registerAIProvider(TransformersProvider);
aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));
```

The provider owns its I/O (it runs inference locally), so `AparteDirectTransport` just delegates to it.

## Managing downloads & cache

Downloading and status are **methods on the provider** you registered:

- `TransformersProvider.prepareModel(modelId, onProgress)` — download + load a model, reporting progress.
- `TransformersProvider.getModelStatus(modelId)` — `'ready'` \| `'cached'` \| `'not-downloaded'`.

Cache and hardware are **standalone helpers** — import them from `@aparte/provider-transformers`:

- `listCachedModels()` / `deleteCachedModel(modelId)` — inspect and clear the on-disk cache.
- `setMaxCachedModels(n)` — cap how many models are kept (oldest evicted; `0` = unlimited).
- `detectHardware()` / `setComputeDevice('auto' | 'webgpu' | 'wasm')` — pick a device / default model by tier.
  Call `setHardwareTierModels({ low, mid?, high })` first — otherwise `detectHardware()`'s
  `recommendedModelId` is always `''`.

:::note
**Scope (v1):** generic text-generation streaming. Tool-calling for local models is model-specific
(each family has its own format) and is out of scope for now. A conversation that already contains
`tool_call` / `tool_result` turns still runs — those turns are **dropped** from what the model sees,
with one `console.warn` per session so the omission isn't silent.
:::
