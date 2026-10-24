# @aparte/runner-ag-ui

Render an agent served over **[AG-UI](https://docs.ag-ui.com)** in aparté. The agent runs on
its own server, with its own tools: Agno, LangGraph, Mastra, CrewAI, Pydantic AI, CopilotKit's
runtime, or **TanStack AI**, whose chat route streams AG-UI. aparté draws its text, its reasoning,
its tool calls and its approvals, exactly as it draws a loop it runs itself.

```bash
npm install @aparte/runner-ag-ui @aparte/core
```

```ts
import { AparteClient } from '@aparte/core';
import { createAgUiRunner } from '@aparte/runner-ag-ui';

const client = new AparteClient({
    streamRunner: createAgUiRunner({ endpoint: '/agui' }),
});
client.start();
```

- **Tools that need the page** (an `ask_user` you register with `registerTool`) go to the agent
  as AG-UI frontend tools. When it calls one, the page runs it and the run resumes with the
  result.
- **Approvals.** When the agent pauses on a call that needs a person (an AG-UI interrupt, such
  as TanStack AI's `needsApproval`), the page asks through its usual approval panel, and the
  answer resumes the run on the agent's server.
- **Its state** (`STATE_SNAPSHOT`, `STATE_DELTA`) is kept for the thread and sent back as the
  next run's `state`. `CUSTOM`, activities and sub-agents are checked, not drawn, in this version.
- **AG-UI 1.0, held to its own corpus.** The runner declares `protocolVersion: "1.0"`, rejects
  the streams 1.0 tells a client to reject, drops what 1.0 does not describe (reported to
  `onWarning`), and passes the protocol's 68 conformance streams on every build.
- **TanStack AI** frames its runs its own way — a `RUN_FINISHED` per model step — so its routes
  take `createAgUiRunner({ endpoint: '/api/chat', relaxedRunFraming: true })`.

No AG-UI SDK is pulled in: the wire is plain JSON over Server-Sent Events, parsed here, with
`@aparte/core` as the only peer dependency.

> Part of the [aparté](https://github.com/apartejs/aparte) monorepo. ESM-only.
> See **Providers → AG-UI agents** and **TanStack AI** in the docs.
