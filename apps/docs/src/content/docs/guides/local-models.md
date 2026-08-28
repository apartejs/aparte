---
title: Chat UI for a local LLM (Ollama, LM Studio, llama.cpp)
description: Put a chat UI on a model running on your machine — Ollama, LM Studio or llama.cpp through their OpenAI-compatible endpoint, browser-direct, no key and no backend.
sidebar:
  order: 15
  label: Local models
---

A model on your own machine has an HTTP endpoint; aparté is the chat in front of it. This
page is the shortest path for the three servers people run: **Ollama**, **LM Studio** and
**llama.cpp**. All three speak the OpenAI `/chat/completions` format, so one adapter —
[`@aparte/provider-openai-compat`](/providers/ai/openai-compat/) — covers them, and the
browser calls the server directly: there is no key to hold and no backend to write.

```bash
npm install @aparte/core @aparte/provider-openai-compat
```

## A first reply, with Ollama

Start Ollama with the browser allowed as an origin (the one setup step people miss — see
[CORS on local BYOK](/guides/troubleshooting/#cors-on-local-byok-lm-studio--ollama)), pull a
model, and wire the chat:

```bash
OLLAMA_ORIGINS=* ollama serve
ollama pull llama3.2
```

```ts
import { aparteGlobalConfig, AparteClient, AparteDirectTransport, registerDefaultRenderers } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import '@aparte/core/styles.css';

registerDefaultRenderers();
aparteGlobalConfig.registerAIProvider(createOpenAICompatProvider(presets.OLLAMA)); // http://localhost:11434/v1
aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));        // the browser calls it, no key
aparteGlobalConfig.setModelConfig({ defaultProvider: 'ollama', defaultModel: 'llama3.2' });
new AparteClient().start();

document.body.innerHTML = '<aparte-chat style="height: 600px"></aparte-chat>';
```

That is the whole setup. `presets.OLLAMA` is Ollama's OpenAI-compatible `/v1` endpoint with
`isLocal: true`, which relaxes the key requirement; `{ byok: true }` on the transport says
the key — there is none here — is the user's own, so the browser-key warning stays quiet.
Streaming, markdown and code blocks (with the [plugins](/plugins/)), retry and edit,
[branching](/guides/conversations-branching/): all of it works the same as against a cloud
vendor, because the server speaks the same format.

## Pick the model from what the server has

A local server knows which models it holds — `GET /v1/models` lists them, and the local
presets fetch that list without a key. Rather than hardcoding `defaultModel`, let the user
pick from the list with the [model selector](/plugins/model-selector/), and gate the
composer until a model is chosen:

```ts
import { aparteGlobalConfig } from '@aparte/core';
import '@aparte/plugin-model-selector';

aparteGlobalConfig.setRequireModelSelection(true); // the composer waits for a pick
```

```html
<aparte-composer-toolbar>
  <aparte-model-selector auto-select persist style="margin-inline-start: auto"></aparte-model-selector>
</aparte-composer-toolbar>
```

`auto-select` takes the first model when nothing is persisted; `persist` remembers the choice
across reloads. Where the toolbar goes is in
[the plugin's page](/plugins/model-selector/#where-to-put-it).

## LM Studio

Same code, other preset — `presets.LMSTUDIO` points at `http://localhost:1234/v1`. Turn on
**Enable CORS** in LM Studio's server settings (Developer tab) first, or the browser will refuse
the reply even though the server logs show it answered.

```ts
import { aparteGlobalConfig, AparteDirectTransport } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';

aparteGlobalConfig.registerAIProvider(createOpenAICompatProvider(presets.LMSTUDIO));
aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));
```

## llama.cpp

`llama-server` exposes the same `/v1` surface, on port 8080 by default. There is no preset —
an id and a base URL are all a preset is — so declare it inline:

```ts
import { aparteGlobalConfig, AparteDirectTransport } from '@aparte/core';
import { createOpenAICompatProvider } from '@aparte/provider-openai-compat';

aparteGlobalConfig.registerAIProvider(createOpenAICompatProvider({
  id: 'llamacpp',
  name: 'llama.cpp',
  baseURL: 'http://localhost:8080/v1',
  isLocal: true,
}));
aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));
```

`isLocal` makes the keyless `/v1/models` fetch run, and `llama-server` lists the model it was
started with — so the selector above works here too. A server that cannot list its models
takes a static list instead: `models: [{ id: 'default', name: 'Loaded model' }]` in the same
options, and the id is what goes into the request's `model` field.

## Two things a local model changes

**Tools are the model's call.** aparté sends the tools you register with every request,
because the wire format carries them; whether the model *uses* them depends on the model.
The [tool guide](/guides/tools/) — approval gate included — works unchanged with a model that
supports function calling, and does nothing visible with one that does not.

**The context window is yours to declare.** A cloud vendor's model list carries the context
length; a local server's usually does not. Give the model a `contextWindow` in a static list
and the [context gauge](/components/conversation/aparte-context/) can show how full the
conversation is:

```ts
import { aparteGlobalConfig } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';

aparteGlobalConfig.registerAIProvider(createOpenAICompatProvider({
  ...presets.OLLAMA,
  models: [{ id: 'llama3.2', name: 'Llama 3.2', contextWindow: 8192 }],
}));
```

## Other shapes of "local"

- **The key stays on a server you own** — a model behind your own `/api/chat`, local or not:
  [the backend transport](/guides/backend-transport/). Same UI, other transport.
- **No server at all** — the model runs *inside the page*, through Transformers.js:
  [the transformers provider](/providers/ai/transformers/).
- **A prefix cache** (llama.cpp slots, vLLM) that needs turn N+1 to extend turn N byte for
  byte: the engine's [`onHistoryAppend`](/guides/engine/) lets the caller own the history.
