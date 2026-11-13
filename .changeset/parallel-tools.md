---
'@aparte/engine': minor
'@aparte/core': minor
---

The tool calls of one model step now run at the same time; pass `parallelTools: false` to run them one after another.

```ts
runStreamAgent({ ...options, parallelTools: false });
// in a chat:
new AparteClient({ streamRunner: (opts) => runStreamAgent({ ...opts, parallelTools: false }) });
```

Each call starts as soon as the model asks for it, and the rest of the reply keeps streaming while it runs; the model is called again once every call of the step has finished. Two tools that each run a sub-agent now run both sub-agents at once, their events interleaving under their own `agentId`.

What does not depend on which call finishes first:

- The history is in call order: the assistant message lists the calls as the model made them, and their `tool` results follow in that order. `onHistoryAppend` reports them in that order too, each once every call before it has finished.
- A person is asked about one call at a time, in call order, sub-agents' calls included; the calls that need no approval run meanwhile.
- A refusal lets the calls already running finish. A call still waiting for its question is not run and is answered "Not run: an earlier call of the same step was refused." (`by: 'earlier-refusal'`); the rest of the reply is not read, and the model then answers the refusal, as before.
- A Stop, the turn limit, a call with no handler or no resolver, or a crash stops every call still running (`tool-aborted`, cause `'stopped'`), then the run ends as before.
- With `deferral`, a call that pauses does not stop the calls already running: the run is suspended once all of them have finished or paused, and `run-suspended` lists every paused call. A call the model makes after the pause waits, as before. If a call stops the run meanwhile (a timeout, no handler), the run ends as it does one call after another: the paused calls end as `tool-aborted` (`'stopped'`), and nothing is suspended.

`StreamToolRun` gains `parallelTools`, so a sub-agent's loop does as its run does. `@aparte/core` re-exports the option through `AparteStreamRunOptions`.
