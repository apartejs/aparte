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

:::note[From a CDN, the import map is what tells the worker where to look]
Inference runs in a worker, and a worker is where the no-build path gets interesting. Two
rules of the platform decide it: `new Worker()` refuses a cross-origin script, and an
import map belongs to the *document* — it does not reach a worker. So from a CDN the
provider starts its worker through a same-origin `blob:` that imports the real file by
absolute URL, and the worker asks the main thread where Transformers.js lives; the answer
comes from your page's own import map, which you already write to import `@aparte/core`
by name. Nothing to configure: map `@huggingface/transformers` and it works.

The one page this cannot serve is one whose Content-Security-Policy forbids `blob:` in
`worker-src` (or `script-src`) — a cross-origin worker has no other way in. Serve the
package from your own origin there, and the provider constructs the worker directly.
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
