# @aparte/engine

The **headless agent loop** behind `@aparte/*` — framework-agnostic, zero runtime
dependencies, runs in the browser or Node.

```bash
npm install @aparte/engine @aparte/core
```

`@aparte/core` is **not a dependency** of this package — it is the other way round: core depends on the engine. Install core for the recommended path below.

```ts
import { AparteClient } from '@aparte/core';

// Nothing to inject: the client runs this package's loop and renders its events.
new AparteClient().start();
```

Its core export is **`runStreamAgent`**: a DOM-free structured-stream loop that turns a
transport's token stream into high-level run events (text, thinking, tool calls),
drives the tool-calling loop (with optional human-in-the-loop approval), and reports usage.

`@aparte/core` runs this loop by default — it used to embed a copy of it inline, and the
two were held equal by a parity suite; the copy is gone, and that suite now lives in core
with the loop's call sequences pinned as snapshots. `AparteClientOptions.streamRunner` is
the seam to wrap it (`(opts) => runStreamAgent({ ...opts, onHistoryAppend })` for a host
that owns its transcript) or to replace it with a loop of your own emitting the same events.

`@aparte/core` is not needed here — `runStreamAgent`, the parsers and the compactor import
nothing from it; `createCompactionSelector` is typed structurally, so core's messages fit it
without core being named.

## Owning the history (prefix-cache hosts)

By default the loop keeps the message list and re-sends it every turn, enriched with the
`tool_call` / `tool_result` turns it produced. That is right for a stateless message API, and
wrong for a **prefix cache** — llama.cpp slots, vLLM — where turn N+1 must *extend* turn N
byte for byte or the cache is thrown away.

Such a host owns its own transcript. It already controls the request (`transportCall` receives
the built request and may ignore `request.messages`); `onHistoryAppend` is the other half —
it reports each turn the loop appends, in order, before the call that would carry it, so you
don't reimplement the loop's tool bookkeeping:

```ts
const log = new PromptLog();                       // your append-only transcript

await runStreamAgent({
  // …messageId, emitter, signal, toolLookup
  baseRequest: { messages: [], modelId: 'my-model' }, // your transport may ignore both
  onHistoryAppend: (turn) => log.append(turn),     // tool_call · tool_result · phase reply
  transportCall: () => myCompletion(log.render()), // your own bytes, extended not rebuilt
});
```

Wiring it through core's seam needs no core change — augment the options at injection:

```ts
new AparteClient({ streamRunner: (opts) => runStreamAgent({ ...opts, onHistoryAppend }) });
```

Serializing tool inventories/calls/results into a raw prompt is still yours to write: the
providers that do it target message-based APIs.

> Part of the [aparté](https://github.com/apartejs/aparte) monorepo. ESM-only.
