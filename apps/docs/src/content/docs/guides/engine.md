---
title: The agent engine
description: "@aparte/engine is the headless, zero-dependency agent loop — runStreamAgent, the loop AparteClient runs, plus the agnostic conversation compactor and the budget-aware compaction selector."
sidebar:
  order: 5
---

`@aparte/core` runs a full **agent loop** when you drive a chat with `AparteClient`: it streams
the model, splits the reply into segments (text, thinking, tool calls, artifacts), runs the
tool-calling loop, and reports usage. **That loop is this package's** — core depends on it.

`@aparte/engine` is that loop as a **headless, framework-agnostic** package: zero runtime
dependencies, no DOM, runs in the browser or Node. Its headline export, **`runStreamAgent`**, is
the loop `AparteClient` runs — and the same function a backend runs server-side, so the two
behave identically by construction rather than by parity.

It is deliberately **just the loop core drives, plus the agnostic conversation compactor**.
Opt-in *tools* (ask-user, RAG, skills, code execution) belong in `plugins/*`; product
behaviour (memory, intent orchestration) and the not-yet-wired text agent loop live elsewhere.
None of that ships here.

## Install

```bash
npm install @aparte/engine
```

`@aparte/core` is **not a dependency** of the engine — it is the other way round, core depends on it — and `runStreamAgent` and the parsers need nothing from it, so
you can install `@aparte/engine` alone. If you wire it into core's client (below) you already have
`@aparte/core`; otherwise `npm install @aparte/core @aparte/engine`. ESM-only (like the rest of
`@aparte/*`); CJS consumers use `await import()`.

## What's in it

| Area | Exports | Status |
|------|---------|--------|
| **Structured-stream loop** | `runStreamAgent`, `StreamRunEvent`, `deriveArtifactKind` | Ready — the seam below |
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

## The `streamRunner` seam

`AparteClient` runs `runStreamAgent` by itself — there is nothing to inject to get the engine's
loop. `streamRunner` is the seam for the two things that go beyond that: wrapping the loop's
options (the prefix-cache case below) or replacing the loop with one of your own that emits the
same events, which core renders exactly the same way — same messages, same events, same DOM output:

```ts
import { AparteClient } from '@aparte/core';
import { runStreamAgent } from '@aparte/engine';

const client = new AparteClient({
  // …your transport / config…
  streamRunner: (opts) => runStreamAgent({ ...opts, maxTurns: 4 }),   // the engine's loop, your options
});
```

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

## Pinned call sequences

The loop's behaviour isn't "meant" to be stable — it's recorded. Core's **`stream-parity`** suite
was born in this package as a parity test between core's former inline loop and `runStreamAgent`
through the real `createStreamAdapter`. Its 26 scenarios in nine groups — the happy paths (plain
text, thinking, human-in-the-loop approve and reject, streamed and one-shot artifacts, forced tool calls), and then the ones that matter more: the paths that STOP (a provider
error, a tool with no handler, both turn ceilings, a tool that never resolves), walking away from a
live stream mid-token, a withheld prefix never reaching `content`, events and tags neither loop
used to handle, a non-streaming response, and three artifact-framing edge cases — were snapshotted
while both loops ran and were equal, so the snapshots are the inline loop's behaviour, pinned.
The suite now lives in core, where it also holds `AparteClient`'s own wiring to a direct engine
run; a change that alters a sequence fails there, with the diff.
