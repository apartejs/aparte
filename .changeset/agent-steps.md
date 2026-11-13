---
'@aparte/engine': minor
'@aparte/core': minor
'@aparte/runner-ag-ui': minor
'@aparte/plugin-subagents': minor
'@aparte/provider-scenario': minor
---

A step the agent announces now shows while it runs: the waiting indicator says it beside its dots, and a sub-agent's line says its own. AG-UI `STEP_STARTED` / `STEP_FINISHED` are no longer dropped.

```ts
// A sub-agent of your own loop announces one through its handle:
agent.emit({ type: 'step-start', name: 'Reading the files' });
agent.emit({ type: 'step-end', name: 'Reading the files' });
// A scripted model:
createScenarioProvider({ turns: [[{ step: 'Reading the parser' }, { tool: 'read_file' }], [{ endStep: 'Reading the parser' }, { text: 'Done.' }]] });
```

- `@aparte/engine`: two run events, `step-start` and `step-end` (`{ name, agentId? }`), in `StreamRunEvent`, and the same two in a model call's stream (`StreamChatEvent`), which the loop passes on. A sub-agent's handle passes them on with its `agentId`. Steps may nest and overlap; `step-end` ends the latest open step of its name.
- `@aparte/core`: the stream adapter keeps the reply's open steps and tells the chat through a new optional target method, `setStep(messageId, name | null)`, only when the step to show changes, and with `null` when the run ends. The bubble's `setStep(name)` writes it in a `.aparte-waiting-step` span beside the dots while the reply waits (nothing written yet, or a call done and the next not begun), and makes it the screen reader's label in place of "Typing", announced politely as it changes. The viewport and a wrapper's host forward it; the host keeps it for a bubble the framework has not painted yet, so the wrappers need nothing. It is live only: never a segment, never saved, never sent to the model, and gone once the reply has text or ends. `step-start` / `step-end` join `AparteStreamEventMap`, so a provider can stream them.
- `@aparte/runner-ag-ui`: `STEP_STARTED` / `STEP_FINISHED` become `step-start` / `step-end`, a sub-agent's attributed by its `subagentRunId`. A step still open when its sub-agent ends, or when the run ends (finished, failed, refused or stopped), is closed then, so nothing is left lit.
- `@aparte/plugin-subagents`: a sub-agent's step is its line's second line while none of its calls runs; a running call wins, and when the step ends the line says what it said before. Kept apart from the sub-agent's saved conversation.
- `@aparte/provider-scenario`: two script steps, `{ step }` and `{ endStep }`, in the same turn or across turns (a step can last across a tool call); in a scripted sub-agent the step is the sub-agent's.
