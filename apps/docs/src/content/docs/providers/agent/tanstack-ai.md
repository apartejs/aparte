---
title: TanStack AI chat UI components
description: Give a TanStack AI chat route a UI. aparté draws its stream, its tool calls and its approvals, in React, Vue, Svelte, Angular or plain HTML.
sidebar:
  order: 2
  label: TanStack AI
---

[TanStack AI](https://tanstack.com/ai) is headless: it runs the model, the tools and the
approval flow, and leaves the interface to you. Its chat route streams **AG-UI**, so
[`@aparte/runner-ag-ui`](/providers/agent/ag-ui/) draws it as it is: text, reasoning, tool
rows, the approval panel. Your route stays a TanStack AI route.

## The route: pass the run's AG-UI fields

Read the request with `chatParamsFromRequest` and hand `chat()` the run's fields, not only the
messages:

<!-- doc-check: skip excerpt — TanStack AI and its adapter are your packages -->
```ts
// app/api/chat/route.ts
import { chat, chatParamsFromRequest, mergeAgentTools, toServerSentEventsResponse } from '@tanstack/ai';
import { openaiText } from '@tanstack/ai-openai';
import { serverTools } from './tools';

export async function POST(request: Request) {
    const params = await chatParamsFromRequest(request);
    return toServerSentEventsResponse(chat({
        adapter: openaiText('gpt-5.5'),
        messages: params.messages,
        threadId: params.threadId,
        runId: params.runId,
        parentRunId: params.parentRunId,
        resume: params.resume,
        tools: mergeAgentTools(serverTools, params.tools),
    }));
}
```

`resume`, `threadId`, `runId` and `parentRunId` are what let a paused run continue. A route that
passes only `messages` streams fine, but an approval or a tool the page ran never comes back:
the run starts over instead. `mergeAgentTools` adds the tools the page declares to yours.

## The page

```ts
import { AparteClient } from '@aparte/core';
import { createAgUiRunner } from '@aparte/runner-ag-ui';

const client = new AparteClient({
    streamRunner: createAgUiRunner({ endpoint: '/api/chat' }),
});
client.start();
```

## Approvals and tools in the page

- **`needsApproval: true`** on a server tool pauses the run. The page asks with its
  [approval panel](/guides/tools/#require-approval-human-in-the-loop), and its
  [approval policy](/components/approval-mode/) can answer first. **Approve** runs the tool on your
  server. **Reject** sends the refusal, the model answers it, and the row stays refused. The
  refusal goes as `{ approved: false }`: the reason the user typed does not reach the model.
- **A tool that needs the page.** Register it in the page with `registerTool`, the way
  [`@aparte/plugin-ask-user`](/components/question/) does. It goes to your route as a declared tool,
  and `mergeAgentTools` adds it. TanStack AI pauses on it, the page runs it, and the result
  resumes the run. You don't need TanStack's `.client()` implementation: the page's handler is
  the implementation.

Every round trip above runs in the package's tests against TanStack AI's own server
(`@tanstack/ai` 0.68, `chat()` over its scripted `fakeText` model). TanStack AI is still on `0.x`,
so its wire can change between minors; that suite is where a change would show first.
