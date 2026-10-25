# @aparte/provider-openai-compat

**One** adapter for every OpenAI-compatible `/chat/completions` endpoint — OpenAI, Mistral,
OpenRouter, Z.ai, Groq, Together, LM Studio, Ollama (`/v1`) and friends all speak the same
wire format, so they share a single, **zero-dependency** format adapter. Vendors differ only
by data (base URL, auth header, branding), passed as config or picked from `presets`.

```bash
npm install @aparte/provider-openai-compat @aparte/core
```

`@aparte/core` is the only **peer dependency**; this adapter itself has none.

```ts
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { aparteGlobalConfig } from '@aparte/core';

aparteGlobalConfig.registerAIProvider(createOpenAICompatProvider(presets.OPENROUTER));
// …or any compat endpoint, no preset needed:
aparteGlobalConfig.registerAIProvider(createOpenAICompatProvider({ id: 'groq', baseURL: 'https://api.groq.com/openai/v1' }));
```

`@aparte/core` is a **peer dependency**. For vendors outside the OpenAI-compat family
(Anthropic, Gemini, …) use [`@aparte/provider-ai-sdk`](../ai-sdk) instead.

**Works on the server too.** Nothing here touches the DOM, and core resolves its DOM-free
entry under Node's export condition — so you can reuse this adapter from a backend, an
Electron main process or an SSR pass instead of re-writing one. Pair `buildRequest` /
`parseStream` with your own `fetch` when you already own the request (your `AbortSignal`,
your headers), or hand it to `createAparteChatHandler` from core.

> Part of the [aparté](https://github.com/apartejs/aparte) monorepo. ESM-only.
> See the **Providers** guide in the docs for the full usage.

## Context window

`fetchModels` fills each model's `contextWindow`, which is what the token gauge and
compaction measure against. It reads the first positive integer among `context_length`
(OpenRouter, Together), `max_model_len` (vLLM), `context_window` (Groq) and
`max_context_length` (Mistral) on the `GET /models` entry. A local server also needs to
say which one it is, because most of them do not put the window on `/models`:

```ts
createOpenAICompatProvider({ id: 'my-box', baseURL: 'http://localhost:8080/v1', isLocal: true, server: 'llamacpp' });
```

With `server` set, one extra request goes to the endpoint's origin (the `/v1` path
stripped) and the **effective** window wins over the trained maximum, since that is where
the server truncates:

| Preset | `server` | Reads | Notes |
| --- | --- | --- | --- |
| `LMSTUDIO` | `lmstudio` | `/api/v1/models`: a loaded model's `config.context_length` | an unloaded model gets none |
| `OLLAMA` | `ollama` | `/api/ps`: the loaded runner's `context_length` | a model that is not loaded gets none |
| `LLAMACPP` | `llamacpp` | `/props`: `default_generation_settings.n_ctx` | per slot, one value for the served model |
| `VLLM` | `vllm` | `max_model_len` on `/v1/models` | no extra request |

An unloaded model gets no window rather than its trained maximum: that number is not what
the server will run with. A probe that fails (CORS, an older server, a closed port) leaves
the models without a window and logs one warning; it never fails the model list.

A model you declare in `models` with a `contextWindow` wins over anything read from the
server.

`LLAMACPP` (`http://localhost:8080/v1`) and `VLLM` (`http://localhost:8000/v1`) are presets
like the others: local, key optional.

## Errors and finish reason

A server that answers `200` and then streams `data: {"error": {...}}` (LM Studio on a
context overflow, OpenAI and vLLM mid-stream) ends the turn with an `error` event carrying
its message, not an empty completed reply. The last `finish_reason` of the stream travels
on the `done` event as `finishReason` (`stop`, `length`, `tool-calls`, `content-filter`,
`other`).
