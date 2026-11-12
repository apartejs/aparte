---
'@aparte/provider-scenario': minor
---

A scripted turn can now delegate to scripted sub-agents: add a `{ subagents: [...] }` step, and register the tool that runs them with `scenarioSubagentTool(provider)`.

```ts
import { aparteGlobalConfig } from '@aparte/core';
import { createScenarioProvider, scenarioSubagentTool } from '@aparte/provider-scenario';

const provider = createScenarioProvider({
  turns: [
    [{ subagents: [{ name: 'Reader', task: 'Read the parser', turns: ['It splits on commas.'] }] }],
    'The parser splits on commas.',
  ],
});
aparteGlobalConfig.registerAIProvider(provider);
const { tool, handler } = scenarioSubagentTool(provider);
aparteGlobalConfig.registerTool(tool, handler);
```

The step makes the model call one ordinary tool, `delegate`, with `{ agents: [{ name, task }] }`, as a real model would. Each `ScenarioSubagent` has a `name`, a `task` and the `turns` its own model plays; the handler runs each one through the real agent loop as a sub-agent, so its `{ tool }` steps run your registered handlers, and several in one step run side by side. The model reads back each sub-agent's last text; one that fails is said in a sentence and does not fail the call. `toolName` on the step and `scenarioSubagentTool(provider, { name })` rename the tool; with `scenarios`, route the answer with `after: 'delegate'`. Add `@aparte/plugin-subagents` to see one line per sub-agent.

A sub-agent's turn can also be a function of the request its loop sends, `(request) => turn`, so a script can answer what its tool returned: a build runner that says so when its command was refused.
