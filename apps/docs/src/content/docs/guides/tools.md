---
title: Tools & human-in-the-loop
description: Register a tool the model can call, render its status, and gate it behind a built-in approve/reject step.
sidebar:
  order: 9
---

A **tool** is a function the model can ask to run — read a file, hit an API, delete
something. Register a definition plus a handler and `AparteClient` does the rest: it
offers the tool to the model, runs your handler when it's called, feeds the result back,
and renders the call as a status pill. For anything sensitive, one flag makes the model
wait for a human to click **Approve** before your handler ever runs.

## Define and register a tool

A tool is a plain `AparteTool` object plus an `AparteToolHandler`, registered together
with `AparteConfig.registerTool`:

```ts
import { AparteConfig } from '@aparte/core';
import type { AparteTool, AparteToolHandler } from '@aparte/core';

const getTimeTool: AparteTool = {
  name: 'get_time',
  description: 'Return the current time in a given IANA timezone.',
  inputSchema: {
    type: 'object',
    properties: { timezone: { type: 'string' } },
    required: ['timezone'],
  },
};

const getTimeHandler: AparteToolHandler = async (call) => ({
  toolCallId: call.id,
  content: new Date().toLocaleString('en-US', { timeZone: call.input.timezone as string }),
});

AparteConfig.registerTool(getTimeTool, getTimeHandler);
```

- **`inputSchema`** is a plain JSON Schema object, sent to the model as-is.
- The handler receives an `AparteToolCall` (`{ id, name, input }`) and an `AbortSignal`
  (fires on a timeout or a stream abort), and must resolve an `AparteToolResult`
  (`{ toolCallId, content }`).
- **`systemPrompt?`** on the tool is injected automatically once registered — tell the
  model *when* to use it without touching your main prompt. **`maxTurns?`** overrides the
  client's global `maxTurns` for this tool only.

## The model → tool_call → result loop

Register the tool, register the default renderers, and start a client:

```ts
import { registerDefaultRenderers, AparteClient } from '@aparte/core';

registerDefaultRenderers();
new AparteClient().start();
```

`AparteClient` sends every registered tool with the request — but only when the selected
model's `capabilities` include `function_calling`. When the model calls one:

1. A **`tool_call`** segment is added (`status: 'pending'`) — the built-in renderer shows
   a pill with the tool name + a spinner.
2. The client resolves the handler via `AparteConfig.getToolHandler(name)`, runs it, and
   on resolve flips the segment to `status: 'resolved'`.
3. The `tool_call` and its result are appended to history and the provider is re-called
   automatically, so the model sees the outcome and continues.
4. If `maxTurns` (per-tool or global) is hit first, the segment becomes `'aborted'`.

`AparteToolCallSegment.status` is one of
`'pending' | 'resolved' | 'aborted' | 'awaiting-approval' | 'rejected'` — the last two
only apply to approval-gated tools.

## Require approval (human-in-the-loop)

Set `needsApproval: true` on the tool:

```ts
const deleteFilesTool: AparteTool = {
  name: 'delete_files',
  description: 'Delete a file from the workspace. Destructive — always ask first.',
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path'],
  },
  needsApproval: true,
};

AparteConfig.registerTool(deleteFilesTool, async (call) => {
  // ... actually delete call.input.path ...
  return { toolCallId: call.id, content: `Deleted ${call.input.path}` };
});
```

Before running the handler, `AparteClient` flips the segment to
`status: 'awaiting-approval'` — the built-in renderer swaps the pill for **Approve** /
**Reject** buttons (shown even when a custom renderer is registered for the tool: approval
always precedes the tool's own UI). It also dispatches **`aparte-tool-approval-request`**
on the target element (`detail: { toolCallId, toolName, input }`) — listen here to show a
richer surface (a modal, a diff) — then awaits a decision. Clicking Approve/Reject
dispatches **`aparte-tool-decision`** (`detail: { toolCallId, approved, payload? }`), the
event the client waits on.

- On **reject**, a synthetic *"rejected by user"* result is fed back and the turn stops —
  the handler never runs.
- On **approve**, the handler runs with the original input, unless the decision carries a
  plain-object `payload`, which is merged onto the input first — so a custom approval
  surface can edit the arguments (fix a path, tighten a query) before the tool runs. The
  built-in buttons send no payload.

By default the client listens on `document` for `aparte-tool-decision`. To run several
isolated clients on one page, or to drive approval from something with no DOM (a CLI, a
webhook), pass an `approvalResolver` in `AparteClientOptions`:

```ts
new AparteClient({
  approvalResolver: async (toolCallId, signal) => ({
    approved: await confirmWithOpsTeam(toolCallId, signal),
  }),
}).start();
```

## Custom tool renderer

Replace the generic pill for a specific tool name with `registerToolRenderer`. `render`
returns the segment's HTML (`''` renders nothing — e.g. a UI-only tool); `setup` runs once
after injection for listeners; `getStyles` is injected into `document.head` once per tool.
For a `needsApproval` tool this only takes over *after* approval:

```ts
import type { AparteToolRenderer } from '@aparte/core';

const webSearchRenderer: AparteToolRenderer = {
  render: (segment) => `<div class="tool-pill">Searching the web…</div>`,
  setup: (element, segment) => { /* wire listeners after injection, if any */ },
};

AparteConfig.registerToolRenderer('web_search', webSearchRenderer);
```

## Complete example: approve/reject with no backend

This runs with no model and no API key — it drives the viewport the same way
`AparteClient` would, so you can see the whole mechanic. Adapted from
`apps/playgrounds/demo-vanilla`:

```ts
import '@aparte/core';
import '@aparte/core/styles.css';
import { registerDefaultRenderers } from '@aparte/core';

registerDefaultRenderers();

const chat = document.querySelector('aparte-chat')!;
const vp = () => (chat as any).viewport;

let n = 0;
let pending: { messageId: string; segId: string } | null = null;

function reply(text: string) {
  vp().appendMessage({ id: `a-${++n}`, role: 'assistant', content: text, timestamp: Date.now() });
}

// Human-in-the-loop: inject a tool_call segment awaiting approval. The default
// renderer shows Approve/Reject and dispatches `aparte-tool-decision`.
function askApproval() {
  const id = `a-${++n}`;
  const segId = `seg-${n}`;
  vp().appendMessage({ id, role: 'assistant', content: '', timestamp: Date.now() });
  vp().addSegment(id, {
    id: segId,
    type: 'tool_call',
    status: 'awaiting-approval',
    toolCall: { id: `tc-${n}`, name: 'delete_files', input: { path: '~/notes/todo.md' } },
  });
  pending = { messageId: id, segId };
}

document.addEventListener('aparte-tool-decision', (e) => {
  if (!pending) return;
  const { approved } = (e as CustomEvent).detail;
  vp().updateSegment(pending.messageId, pending.segId, { status: approved ? 'resolved' : 'rejected' });
  pending = null;
  reply(approved ? 'Approved — the file would be deleted here.' : 'Rejected — nothing happened.');
});

chat.addEventListener('aparte-send', (e) => {
  const text = (e as CustomEvent).detail.content as string;
  vp().appendMessage({ id: `u-${++n}`, role: 'user', content: text, timestamp: Date.now() });
  if (text.trim().toLowerCase().includes('delete')) askApproval();
  else reply(`You said: "${text}". Type "delete" to see a human-in-the-loop tool approval.`);
});
```

Type a message containing "delete" and the bubble shows the Approve/Reject pill; either
button dispatches the same `aparte-tool-decision` event `AparteClient` listens for. Swap
the manual `addSegment` call for a registered `delete_files` tool (`needsApproval: true`)
plus a started `AparteClient`, and a real model drives the exact same segment and events.

## Next steps

- **[Customization](/guides/customization)** — render hooks and the action registry for
  everything outside tool segments.
- **[The agent engine](/guides/engine)** — the headless `runStreamAgent` loop, for running
  this same tool + approval flow off the main thread or on a server.
