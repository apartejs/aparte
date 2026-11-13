---
'@aparte/engine': minor
'@aparte/core': minor
'@aparte/provider-scenario': minor
---

A tool can now start a sub-agent in the background and let the chat go on: call `startSubAgent(context.run, { name, request })` from its handler and return at once.

```ts
import { startSubAgent, type AparteToolHandler } from '@aparte/core';

const research: AparteToolHandler = async (call, _signal, context) => {
  startSubAgent(context!.run!, {
    name: 'Researcher',
    request: { modelId: 'gpt-4.1-mini', messages: [{ role: 'user', content: String(call.input['question']) }] },
  });
  return { toolCallId: call.id, content: 'The researcher is on it; its answer comes back to you.' };
};
```

- **While it works**, the model goes on writing and calling its own tools, and the sub-agent has a line of its own. The reply does not end before it is back: once the model has nothing more to say, the loop waits for the sub-agents still at work, tells the model how each ended in one user message, and asks it again.
- **It stops with the run**: Stop, the turn limit, the tool time limit counted from its start, or a crash.
- **Not in a server loop**: a run that can pause would end at the pause without what it answered, so `startSubAgent` throws there (`run.canBackground` is false); use `runSubAgent`.
- **What the model was told stays in the run**: the next turn's history is drawn from the reply, so it holds the model's answer to the sub-agents, not the message that told it how they ended.
- **`runSubAgent` is unchanged**: it holds its call until the sub-agent is back.
- **In the engine**, `StreamToolRun.startAgent` takes `background`, `StreamToolRun` gains `canBackground`, and `StreamAgentHandle` gains `signal`, what its work answers to.
- **In `@aparte/provider-scenario`**, a `subagents` step takes `background: true`: the next scripted turn plays while they work.
