---
title: The agent engine
description: "@aparte/engine is the headless, zero-dependency agent loop — runStreamAgent, the loop core drives via the streamRunner seam, plus the agnostic conversation compactor."
sidebar:
  order: 5
---

`@aparte/core` already runs a full **agent loop**: when you drive a chat with `AparteClient`,
it streams the model, splits the reply into segments (text, thinking, tool calls, artifacts),
runs the tool-calling loop, and reports usage — all inline. **Core works without this package.**

`@aparte/engine` is that loop as a **headless, framework-agnostic** package: zero runtime
dependencies, no DOM, runs in the browser or Node. Its headline export, **`runStreamAgent`**, is
the exact loop core embeds inline — extracted so a backend can run it server-side with *provably*
identical behaviour.

It is deliberately **just the loop core drives, plus the agnostic conversation compactor**.
Opt-in *tools* (ask-user, RAG, skills, code execution) belong in `plugins/*`; product
behaviour (memory, intent orchestration) and the not-yet-wired text agent loop live elsewhere.
None of that ships here.

## Install

```bash
npm install @aparte/engine
```

`@aparte/core` is an **optional peer**: `runStreamAgent` and the parsers need nothing from it, so
you can install `@aparte/engine` alone. If you wire it into core's client (below) you already have
`@aparte/core`; otherwise `npm install @aparte/core @aparte/engine`. ESM-only (like the rest of
`@aparte/*`); CJS consumers use `await import()`.

## What's in it

| Area | Exports | Status |
|------|---------|--------|
| **Structured-stream loop** | `runStreamAgent`, `StreamRunEvent`, the artifact-XML parser | Ready — the seam below |
| **Context compaction** | `compactConversation` + token-budget / sliding-window helpers | Ready |

Everything is a plain function or class — no globals, no side effects (`sideEffects: false`), fully
tree-shakeable, so you pull in only what you use.

## Keep the context under budget: the gauge and the selector

Two pieces, one on each side of the seam. In core, `<aparte-context>` is a gauge of the model's
window: it reads the usage each turn reports and the window the current model declares (a
provider's `/models` fetch fills it in, or set the `window` attribute), turns `warn` and `danger`
at 75 % and 90 % (the `warn` / `danger` attributes), fires `aparte-context-threshold` when the
level changes — and with `auto-compact` dispatches `aparte-compact` for its chat on reaching
danger, once, until the level drops. Before the first turn, or without a window, it shows nothing.

In the engine, `createCompactionSelector` is the budget-aware `compactionSelector` for
`AparteClient.compact()`: the newest turns that still fit the history budget stay verbatim, the
older ones are summarised. Without it `compact()` summarises the whole history — the built-in
behaviour, which is a fine default for a small model and a wasteful one for a long conversation.

```ts
import { AparteClient, aparteGlobalConfig } from '@aparte/core';
import { createCompactionSelector } from '@aparte/engine';

new AparteClient({
  compactionSelector: createCompactionSelector({
    contextWindow: () => aparteGlobalConfig.getCurrentModel()?.contextWindow,
    systemPrompt: () => aparteGlobalConfig.resolveSystemPrompt(),
  }),
}).start();
```

```html
<aparte-composer-toolbar>
  <aparte-context auto-compact style="flex: 1"></aparte-context>
</aparte-composer-toolbar>
```

The gauge, the selector and the model speak the same numbers: the window is the model's, the
budget is the compactor's, and the reading is what the provider reported — nothing is estimated
twice.

## The primary use: the `streamRunner` seam

Core stays the zero-dependency leaf: it **never imports `@aparte/engine`**. Instead, `AparteClient`
exposes an injection point, `streamRunner`. Give it `runStreamAgent` and the client delegates its
loop to the engine, rendering the engine's events through core's `createStreamAdapter`:

```ts
import { AparteClient } from '@aparte/core';
import { runStreamAgent } from '@aparte/engine';

const client = new AparteClient({
  // …your transport / config…
  streamRunner: runStreamAgent,   // delegate the loop to the engine
});
```

With no `streamRunner`, the inline loop runs (the default). With one, the engine runs the loop and
core renders it — same messages, same events, same DOM output.

## Owning the history yourself (prefix-cache hosts)

By default the loop holds the message list and re-sends it each turn, enriched with the
`tool_call` / `tool_result` turns it produced. That is what a stateless message API wants, and the
opposite of what a **prefix cache** wants — llama.cpp slots, vLLM — where turn N+1 has to *extend*
turn N byte for byte or the cache is thrown away.

Such a host owns its own transcript. Half of that already worked: `transportCall` receives the
request the loop built and may ignore its `messages` entirely. The other half is
**`onHistoryAppend`** — it reports each turn the loop appends, in order, before the call that would
carry it, so you don't reimplement the loop's tool bookkeeping:

```ts
const log = new PromptLog();                       // your append-only transcript

await runStreamAgent({
  // …messageId, emitter, signal, toolLookup
  baseRequest: { messages: [], modelId: 'my-model' }, // your transport may ignore both
  onHistoryAppend: (turn) => log.append(turn),     // tool_call · tool_result · phase reply
  transportCall: () => myCompletion(log.render()), // your own bytes, extended not rebuilt
});
```

Through the `streamRunner` seam it needs no change in core — augment the options at injection:

```ts
new AparteClient({ streamRunner: (opts) => runStreamAgent({ ...opts, onHistoryAppend }) });
```

Serializing a tool inventory, its calls and their results into a raw prompt is still yours to
write: the providers that do it target message-based APIs.

## Proven parity

The two paths aren't "meant" to match — it's tested. The engine's **`stream-parity`** suite drives
core's real inline loop and `runStreamAgent` (through the real `createStreamAdapter`) against the
same scripted transport and asserts an identical call sequence and usage across 26 scenarios in
nine groups — the happy paths (plain text, thinking, human-in-the-loop approve and reject,
streamed and one-shot artifacts, multi-phase pipelines, forced tool calls), and then the ones
that matter more: the paths that STOP (a provider error, a tool with no handler, both turn
ceilings, a tool that never resolves), walking away from a live stream mid-token, a withheld
prefix never reaching `content`, events and tags neither loop used to handle, a non-streaming
response, and three artifact-framing edge cases. So the seam is a drop-in, not an approximation.
