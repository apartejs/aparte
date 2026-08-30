# @aparte/provider-transformers

Run LLMs **100% in the browser** via [Transformers.js](https://huggingface.co/docs/transformers.js)
(WebGPU, with a WASM fallback) — no API, no key, no server. Inference runs off the main thread in
a **Web Worker**, streaming tokens into aparté.

```bash
npm install @aparte/provider-transformers @huggingface/transformers
```

`@huggingface/transformers` is a **peer dependency** — you bring the version you want (it's heavy and
ships its own onnxruntime). `@aparte/core` is a **peer dependency**.

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
Model weights download once and persist in the Cache API; `prepareModel` reports progress, and
`listCachedModels` / `deleteCachedModel` manage the on-disk cache.

## Runners — what loads the model

The worker runs a **runner**: the piece that loads a model and drives it. Two ship with the
package, picked with `task`; a third option is a module of your own.

| `task` | loads | for |
|---|---|---|
| `'text-generation'` (default) | `pipeline('text-generation')` | any chat model — Qwen, SmolLM, Llama, Phi… |
| `'image-text-to-text'` | `AutoProcessor` + `AutoModelForImageTextToText` | vision models — whatever `AutoModelForImageTextToText` resolves (SmolVLM, Qwen2-VL, LFM2-VL, Gemma 3…); measured on SmolVLM |

A vision model reads the image parts of a message (`{ type: 'image', image: dataUrl }`) exactly
as the composer attaches them:

```ts
registerModel({
  id: 'HuggingFaceTB/SmolVLM-256M-Instruct',
  name: 'SmolVLM 256M',
  task: 'image-text-to-text',
  capabilities: ['streaming', 'vision'],
  // Three ONNX parts, three dtypes — the shape the model card recommends for WebGPU.
  dtype: { embed_tokens: 'fp16', vision_encoder: 'q4', decoder_model_merged: 'q4' },
});
```

Measured: SmolVLM-256M on WebGPU (Chromium, AMD Radeon 8060S): first load 7 s (download included), first token 3.7 s cold; Stop interrupts the model, not just the read.

Each runner is its own chunk, loaded only when a model asks for it. Both drop `tool_call` /
`tool_result` turns with one warning (tool syntax is per model family), and the text runner
**says so when it drops an image** — it never answers a photo it could not see as if it had.

### A runner of your own

Point `runner` at an ES module that exports `createRunner`; it wins over `task`. The worker
imports it and hands it the same Transformers.js instance the built-ins use, so a research-grade
model — a custom vision tower, an adapter you swap at runtime — fits without giving up the
provider's worker, queue, progress, cancel and cache:

```ts
registerModel({ id: 'my-org/my-model', name: 'Mine', capabilities: ['streaming'], runner: './runners/mine.js' });
```

```js
// runners/mine.js — served by your app; the worker imports it by URL
export async function createRunner(ctx) {
  // ctx.transformers is the Transformers.js the page installed or mapped — never import your own
  const { AutoTokenizer, AutoModelForCausalLM, TextStreamer } = ctx.transformers;
  const tokenizer = await AutoTokenizer.from_pretrained(ctx.modelId);
  const model = await AutoModelForCausalLM.from_pretrained(ctx.modelId, { dtype: ctx.dtype, device: ctx.device });
  return {
    async generate({ messages, options, emit }) {
      // messages arrive WITH their content parts — render them the way this model wants;
      // this one reads text, so the parts are flattened and tool turns left out
      const turns = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'system')
        .map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content.filter((p) => p.type === 'text').map((p) => p.text).join('') }));
      const inputs = tokenizer.apply_chat_template(turns, { add_generation_prompt: true, return_dict: true });
      const streamer = new TextStreamer(tokenizer, {
        skip_prompt: true, skip_special_tokens: true,
        callback_function: (text) => emit({ type: 'text', delta: text }),
      });
      await model.generate({ ...inputs, max_new_tokens: options.maxTokens ?? 512, streamer });
      // `done` is optional — the provider closes the stream when generate() resolves
    },
    // anything that is not a generation: the provider passes it through, untouched
    async command(name, payload) { if (name === 'adapter') { /* swap a LoRA, warm a cache… */ } },
    dispose() { model.dispose(); },
  };
}
```

`emit` speaks aparté's stream vocabulary (`text`, `thinking`, `tool_use`, `done`, `error`),
`signal` fires on Stop, `ctx.progress` / `ctx.warn` reach the page. The contract is exported:
`TransformersRunner`, `RunnerContext`, `RunnerGenerateInput`, `CreateRunner`.
`runnerCommand(modelId, name, payload)` reaches a runner's `command()` from the page, queued
behind the generates in flight.

## One pipeline per tab

Unlike every other aparté provider, this one's state is **tab-scoped, not chat-scoped**: one
worker, one loaded model, one generate at a time. `setComputeDevice`, `setMaxCachedModels` and
`setHardwareTierModels` set it for the whole page.

That is the resource talking, not a design preference — a local model is 1–2 GB of weights and
one WebGPU pipeline, so a worker per chat would mean N copies resident in one tab. Two chats on
the **same** model is the case this is for: they share the load, for free.

Two chats on **different** models is the case that costs. They serialize on the one pipeline,
and at the default budget of one cached model each turn can evict and reload gigabytes. The
provider warns once when it sees it:

```ts
import { setMaxCachedModels, getMaxCachedModels } from '@aparte/provider-transformers';

setMaxCachedModels(2);            // keep both resident, if the machine has the memory
setMaxCachedModels(0);            // no limit — you are managing memory yourself
getMaxCachedModels();             // the current budget
```

> **Scope:** text and vision models through the built-in runners, anything else through a
> runner of your own; **browser-only** (unlike the other providers — it needs WebGPU/WASM,
> Workers and the Cache API, so it is the one adapter that does not run in Node). Tool-calling
> for local models is model-specific: the built-in runners drop `tool_call` / `tool_result`
> turns with one console warning; a custom runner may render them. Part of the
> [aparté](https://github.com/apartejs/aparte) monorepo. ESM-only.
> See the **Providers** guide in the docs for the full usage.
