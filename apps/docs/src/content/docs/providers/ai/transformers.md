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
npm install @aparte/provider-transformers @huggingface/transformers
```

`@huggingface/transformers` is a **peer dependency** — it's heavy and ships its own onnxruntime, so
you bring the version you want.

```ts
import { AparteConfig, DirectTransport } from '@aparte/core';
import { TransformersProvider, registerModel } from '@aparte/provider-transformers';

registerModel({
  id: 'onnx-community/Qwen2.5-0.5B-Instruct',
  name: 'Qwen2.5 0.5B',
  task: 'text-generation',
  capabilities: ['streaming'],
  dtype: 'q4',
});
AparteConfig.registerAIProvider(TransformersProvider);
AparteConfig.setTransport(new DirectTransport({ byok: true }));
```

The provider owns its I/O (it runs inference locally), so `DirectTransport` just delegates to it.

## Managing downloads & cache

- `prepareModel(modelId, onProgress)` — download + load a model, reporting progress.
- `getModelStatus(modelId)` — `'ready'` \| `'cached'` \| `'not-downloaded'`.
- `listCachedModels()` / `deleteCachedModel(modelId)` — inspect and clear the on-disk cache.
- `setMaxCachedModels(n)` — cap how many models are kept (oldest evicted; `0` = unlimited).
- `detectHardware()` / `setComputeDevice('auto' | 'webgpu' | 'wasm')` — pick a device / default model by tier.

:::note
**Scope (v1):** generic text-generation streaming. Tool-calling for local models is model-specific
(each family has its own format) and is out of scope for now.
:::
