---
'@aparte/engine': minor
'@aparte/core': minor
---

A tool can now open a sub-agent: call `runSubAgent(context.run, { name, request }, signal)` from its handler, in the page or on the server.

```ts
import { runSubAgent, type AparteToolHandler } from '@aparte/core';

const research: AparteToolHandler = async (call, signal, context) => {
  const answer = await runSubAgent(context!.run!, {
    name: 'Researcher',
    request: { modelId: 'gpt-4.1-mini', messages: [{ role: 'user', content: String(call.input['question']) }] },
  }, signal);
  return { toolCallId: call.id, content: answer.text };
};
```

- **The run a tool is called in.** A handler now gets the run as a third argument (`StreamToolRun` in `@aparte/engine`, `context.run`, typed `AparteToolRun`, in `@aparte/core`). A handler written with two parameters is unchanged. A browser tool answering a paused server run has none.
- **`runSubAgent`.** Runs a loop of its own on the conversation you give it, with the run's model connection, tools and limits unless you pass others, and resolves `{ status, text, error? }`: `done`, `failed` or `stopped`, and what the sub-agent wrote last. It never rejects for a sub-agent that failed, so the tool decides what the model reads. `detached: true` gives one of several sub-agents opened by the same tool a line of its own. `run.startAgent()` announces a sub-agent by hand and returns a `StreamAgentHandle` (`emit`, `end`).
- **New run events.** `agent-start` (`agentId`, `name`, `description`, `toolCallId`, `parentAgentId`) and `agent-end` (`agentId`, `status`, `result`, `error`), and an optional `agentId` on every event that is not one of the four `run-*`: the event is that sub-agent's. A Stop or the call's timeout ends a sub-agent as `stopped` before its call is aborted.
- **Approvals.** A sub-agent's call that needs a decision is asked through the run's resolver, with `call.agent` naming the sub-agent. In a run that pauses instead of waiting (`deferral`, the server loop), it cannot ask: the call is aborted with the cause `no-resolver`.
- **Hearing a run.** `config.observeRunEvents(observer)` (`AparteRunEventObserver`, `AparteRunEventContext`) hears every event of a reply's run, its sub-agents' included, before the reply handles it, and returns the function that removes it.
