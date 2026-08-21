# @aparte/provider-openai-compat

## 0.7.0

## 0.6.1

## 0.6.0

## 0.5.0-alpha.0

### Patch Changes

- Updated dependencies [cd7adfc]
- Updated dependencies [3edb766]
- Updated dependencies [3b026bb]
  - @aparte/core@0.5.0-alpha.0

## 0.4.0-alpha.0

### Patch Changes

- 8286e3f: Two provider contracts now say what they actually do.

  `createOpenAICompatProvider` returns `AparteAIProvider & AparteFormatAdapter`. The
  factory has always supplied `buildRequest` / `parseStream` / `authHeaders` /
  `defaultEndpoint`, but the declared type left them optional (right for
  `AparteAIProvider` in general, since a provider may own its I/O through `chat()`) —
  so callers driving the adapter themselves had to add `!` or write a check that
  cannot fail.

  `@aparte/provider-transformers` warns once when it drops `tool_call` / `tool_result`
  turns from the prompt. Tool calling is out of scope for v1, but the turns were
  filtered silently: an app with registered tools got a model that never saw the call
  or its result, with nothing to explain it.

- bebc201: Usage is no longer lost on a turn that ends with a tool call. `parseStream` emitted
  `done` and returned as soon as it saw `finish_reason: 'tool_calls'` — but under
  `include_usage` (which `buildRequest` requests) the usage-only chunk arrives _after_
  the finish chunk, so `done.usage` was `undefined` for every tool-call turn. On a chat
  that goes unnoticed; on an agent it is most turns. The parser now emits the
  `tool_use` events and keeps reading, so the single `done` carries the usage (including
  `cacheReadTokens`).
- Updated dependencies [358bc53]
- Updated dependencies [801622a]
- Updated dependencies [0d4945f]
- Updated dependencies [de57a6a]
- Updated dependencies [50d90a8]
- Updated dependencies [cda5f54]
- Updated dependencies [af5ed3d]
- Updated dependencies [e9909c6]
- Updated dependencies [2336bc5]
- Updated dependencies [79b2795]
- Updated dependencies [9f839e4]
- Updated dependencies [80995ea]
- Updated dependencies [118d4fb]
  - @aparte/core@0.4.0-alpha.0

## 0.3.0-alpha.0

### Patch Changes

- Updated dependencies [d4c448b]
- Updated dependencies [0192d63]
- Updated dependencies [7227dee]
- Updated dependencies [622dc78]
- Updated dependencies [7227dee]
  - @aparte/core@0.3.0-alpha.0

## 0.2.0-alpha.0

### Patch Changes

- 0aefd9b: Robustness fixes surfaced by the code audit:

  - **core `AparteConfig`** — `_notify` isolates each subscriber in try/catch (one throwing
    listener no longer aborts the loop and starves the others); `setLocale`/`extendLocale`/
    `setAvatarProvider` now notify subscribers like every other live setter, so a runtime
    locale/avatar swap propagates to already-mounted components; `refreshProviderModels` is
    typed `Promise<AparteAIModel[]>` instead of `Promise<any[]>`.
  - **engine** — a tool handler is no longer invoked when the run's `AbortSignal` was already
    aborted before the call (a past `abort` event never re-fires on the fresh listener).
  - **provider-openai-compat** — malformed tool-call arguments JSON at
    `finish_reason: 'tool_calls'` and unparseable SSE data lines now log a breadcrumb instead
    of being dropped silently.

- f2d75b0: Fix four teardown/cancellation bugs: the model selector could permanently lock itself out
  of re-rendering if its render threw (now `try/finally`); the Angular Observable to
  async-iterator adapter could hang forever if torn down mid-`await` (its `return()` now
  settles the pending read); and the OpenAI-compat and AI-SDK providers now `cancel()` the
  underlying stream on consumer cancel instead of draining the vendor body to the end (AI-SDK
  also can no longer process a second terminal event).
- Updated dependencies [6ab5682]
- Updated dependencies [930a108]
- Updated dependencies [4065fd6]
- Updated dependencies [307039b]
- Updated dependencies [4aac26d]
- Updated dependencies [a2ed74b]
- Updated dependencies [a6ed936]
- Updated dependencies [333d301]
- Updated dependencies [14f1f1d]
- Updated dependencies [18d2065]
- Updated dependencies [6d6123e]
- Updated dependencies [97bd6c5]
- Updated dependencies [8417976]
- Updated dependencies [1f6c43e]
- Updated dependencies [7157ad5]
- Updated dependencies [2efef6f]
- Updated dependencies [0aefd9b]
- Updated dependencies [0aefd9b]
- Updated dependencies [9568c6b]
- Updated dependencies [7e5cfb7]
- Updated dependencies [75af64a]
- Updated dependencies [fa5a3f8]
- Updated dependencies [69525ad]
- Updated dependencies [8a3890b]
- Updated dependencies [d31f681]
- Updated dependencies [e69435f]
- Updated dependencies [bfa9901]
- Updated dependencies [49f4d70]
- Updated dependencies [fcff831]
- Updated dependencies [455fc81]
- Updated dependencies [554e4e9]
- Updated dependencies [6a50004]
- Updated dependencies [f8a6dd7]
- Updated dependencies [9ce7978]
- Updated dependencies [e96920a]
- Updated dependencies [d60e2c8]
- Updated dependencies [e8d9b32]
  - @aparte/core@0.2.0-alpha.0
