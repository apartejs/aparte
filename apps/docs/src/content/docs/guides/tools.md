---
title: Tools & human-in-the-loop
description: Register a tool the model can call, render its status, and gate it behind a built-in approve/reject step.
sidebar:
  order: 9
---

A **tool** is a function the model can ask to run — read a file, hit an API, delete
something. Register a definition plus a handler and `AparteClient` does the rest: it
offers the tool to the model, runs your handler when it's called, feeds the result back,
and renders the call as a row you can open. For anything sensitive, one flag makes the model
wait for a human to click **Approve** before your handler ever runs.

## Define and register a tool

A tool is a plain `AparteTool` object plus an `AparteToolHandler`, registered together
with `aparteGlobalConfig.registerTool`:

```ts
import { aparteGlobalConfig } from '@aparte/core';
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

aparteGlobalConfig.registerTool(getTimeTool, getTimeHandler);
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

`AparteClient` sends every registered tool with the request. The one case where it does
not is a model that declares its `capabilities` and leaves `function_calling` out — a
statement the client respects. A model that says nothing (which is what a
`GET /models` listing usually amounts to) gets the tools: registering one is an explicit
act, and dropping it silently because a listing is terse would turn your registration
into a no-op with nothing to read anywhere. When the model calls one:

1. A **[`tool_call`](/segments/tool-call/)** segment is added (`status: 'pending'`) — the built-in renderer shows
   a row with the tool name and a spinner.
2. The client resolves the handler via `aparteGlobalConfig.getToolHandler(name)`, runs it, and
   on resolve flips the segment to `status: 'resolved'`.
3. The `tool_call` and its result are appended to history and the provider is re-called
   automatically, so the model sees the outcome and continues.
4. If `maxTurns` (per-tool or global) is hit first, the segment becomes `'aborted'`.

`AparteToolCallSegment.status` is one of
`'pending' | 'resolved' | 'aborted' | 'awaiting-approval' | 'rejected'` — the last two
only apply to approval-gated tools.

### What the row shows

One line per call: the tool's name, a spinner while it runs, and the state as a word at
the far end — `Running`, `Done`, `Rejected`, `Stopped`. When the call has arguments or a
result, that line becomes a disclosure, and opening it shows both — the arguments the
model chose under **Input**, pretty-printed, and whatever your handler returned under
**Output**. A registered [highlight provider](/plugins/shiki/) colours them; without one
they are escaped text, because a tool's arguments are model-authored and are never
injected as HTML.

It opens on a click and never on its own, including while a decision is pending. The
reasoning block stays closed while it is being produced, which is the most live moment
there is, so a tool call has no stronger claim to unroll itself.

Every word is a locale key:

```ts
import { aparteGlobalConfig } from '@aparte/core';

aparteGlobalConfig.extendLocale({
  toolInput: 'Arguments',
  toolOutput: 'Result',
  toolRunning: 'Working…',
  toolCompleted: 'Done',
  toolRejected: 'Refused',
  toolStopped: 'Stopped',
});
```

And every part is a class, so restyling needs no renderer:

| Class | The part |
| --- | --- |
| `.aparte-tool-summary` | the clickable line |
| `.aparte-tool-toggle` | the chevron |
| `.aparte-tool-label` | the call's identity — holds `.aparte-tool-icon` and `.aparte-tool-name` |
| `.aparte-tool-spinner` | shown only while `pending` |
| `.aparte-tool-state` | the state word, pushed to the far end |
| `.aparte-tool-detail` | the opened body |
| `.aparte-tool-part` | one of Input / Output — holds `.aparte-tool-part-label` and `.aparte-tool-part-body` |

```css
:root { --aparte-tool-row-radius: 0; } /* the row's corner */

.aparte-tool-summary:hover { background: none; }
.aparte-tool-state { font-variant: small-caps; }
```

Replacing the markup outright is [a custom tool renderer](#custom-tool-renderer) instead.

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

aparteGlobalConfig.registerTool(deleteFilesTool, async (call) => {
  // ... actually delete call.input.path ...
  return { toolCallId: call.id, content: `Deleted ${call.input.path}` };
});
```

Before running the handler, `AparteClient` flips the segment to
`status: 'awaiting-approval'` and **asks at the composer** — the same place every other
request for the user is answered, through the same `requestUserInput` a tool handler
calls. The panel offers the choices and a free-text field; the row in the transcript is
the **anchor**, saying which tool is waiting, and holds nothing clickable.

That split is deliberate. The panel is capped at half the viewport, so it cannot hold a
diff or a plan, while the transcript is already scrollable, copyable and persisted: the
thing being judged stays in the thread, the decision moves to where the user answers.

It also dispatches **`aparte-tool-approval-request`** on the target element
(`detail: { toolCallId, toolName, input }`) — observation only, for an app that wants to
raise an OS notification when a gate opens.

:::note[`aparte-tool-decision` is gone]
The Approve / Reject buttons used to live in the transcript and dispatch
`aparte-tool-decision`, which the client answered with a `document` listener. Both are
removed. The event existed only because a segment renderer has no reference to the client,
and two seams that can disagree about who answers a decision are one too many. To answer
programmatically, pass an `approvalResolver` (below) or register your own presenter — each
sees the whole request rather than an id on an event.
:::

- On **reject**, the handler never runs. A synthetic *"rejected by user"* result is fed
  back, the turn's **remaining** tool calls are skipped — the model may have asked for
  several, and refusing one cannot license the others — and then the model is given
  another turn, so it actually reads the refusal and can answer it. It could not before:
  the turn simply ended there, and telling the assistant what you wanted instead meant
  retyping it as a new message it then read out of order.
- A **stop** is not a reject. Pressing Stop while a tool waits for approval marks the
  segment `aborted` and appends nothing: there is nothing true to tell the model. The two
  used to be indistinguishable, so a stopped turn was reported as a refusal.
- On **approve**, the handler runs with the original input, unless the decision carries a
  plain-object `payload`, which is merged onto the input first — so a custom approval
  surface can edit the arguments (fix a path, tighten a query) before the tool runs. The
  built-in panel sends no payload.
- **Typing instead of choosing** is a refusal that carries your words: the instruction
  becomes the `tool_result` the model reads on the turn it gets back. That is only useful
  because a refusal hands the model a turn — before, whatever you wrote had nowhere to go.

To drive approval from something with no DOM — a CLI, a webhook, an ops channel — or to
decide without asking at all, pass an `approvalResolver` in `AparteClientOptions`. It
replaces the panel entirely:

```ts
new AparteClient({
  // The whole CALL, not just its id: you cannot ask "run this?" without naming what.
  approvalResolver: async (call, signal) => ({
    approved: await confirmWithOpsTeam(call.name, call.input, signal),
    // Optional, on a refusal: the words the model reads back.
    instruction: 'use the staging bucket instead',
  }),
}).start();
```

An "auto" mode is this and nothing more: a resolver that answers without asking anybody.

:::caution[Approval is UX, not authorization]
`needsApproval` runs **in the browser** — it protects the user from surprising tool runs,
not your system from a malicious client. Anything a tool actually does against your backend
must be re-validated server-side as if the approval never happened: is the caller
authenticated, allowed to use this tool, allowed on *this* resource, and are the arguments
valid? If you proxy through `createAparteChatHandler`, its
[`authorize()` hook](/guides/backend-transport/) is the place for that check.
:::

## Custom tool renderer

Replace the generic row for a specific tool name with `registerToolRenderer`. `render`
returns either an HTML string or a ready DOM element (`''` renders nothing — e.g. a
UI-only tool); `setup` runs once after injection for listeners; `getStyles` is injected
into `document.head` once per tool. For a `needsApproval` tool this only takes over
*after* approval:

```ts
import { aparteGlobalConfig } from '@aparte/core';
import type { AparteToolRenderer } from '@aparte/core';

const webSearchRenderer: AparteToolRenderer = {
  render: (segment) => `<div class="aparte-tool-label">Searching the web…</div>`,
  setup: (element, segment) => { /* wire listeners after injection, if any */ },
};

aparteGlobalConfig.registerToolRenderer('web_search', webSearchRenderer);
```

:::danger[The segment carries model-chosen data]
`segment.toolCall.input` is whatever the **model** decided to pass, and
`segment.toolCall.result` is whatever the tool returned. Both are untrusted. The
obvious first thing to write is the one that breaks:

```ts
// DON'T — a direct model-to-DOM XSS in your page's origin.
render: (segment) => `<div>Searching for ${segment.toolCall?.input?.['query']}</div>`,
```

Two ways out. **Return an element** and there is no `innerHTML` surface at all:

```ts
import { aparteGlobalConfig } from '@aparte/core';
import type { AparteToolRenderer } from '@aparte/core';

const searchRenderer: AparteToolRenderer = {
  render: (segment) => {
    const el = document.createElement('div');
    el.className = 'aparte-tool-label';
    // textContent, so the value is text no matter what it contains.
    el.textContent = `Searching for ${String(segment.toolCall?.input?.['query'] ?? '')}`;
    return el;
  },
};

aparteGlobalConfig.registerToolRenderer('web_search', searchRenderer);
```

Or **keep the string and escape every interpolation** — `escapeHtml` in text
position, `escapeAttr` inside an attribute, exactly as in
[Customization](/guides/customization/):

```ts
import { aparteGlobalConfig, escapeHtml, escapeAttr } from '@aparte/core';
import type { AparteToolRenderer } from '@aparte/core';

const searchRenderer: AparteToolRenderer = {
  render: (segment) => {
    const query = String(segment.toolCall?.input?.['query'] ?? '');
    return `<div class="aparte-tool-label" title="${escapeAttr(query)}">Searching for ${escapeHtml(query)}</div>`;
  },
};

aparteGlobalConfig.registerToolRenderer('web_search', searchRenderer);
```
:::

## Complete example: approve/reject with no backend

This runs with no model and no API key — it drives the viewport the same way
`AparteClient` would, so you can see the whole mechanic. Adapted from
`apps/examples/vanilla-dist`:

```ts
import '@aparte/core';
import '@aparte/core/styles.css';
import { registerDefaultRenderers, aparteGlobalConfig } from '@aparte/core';

registerDefaultRenderers();

const chat = document.querySelector('aparte-chat')!;
const vp = () => (chat as any).viewport;

let n = 0;

function reply(text: string) {
  vp().appendMessage({ id: `a-${++n}`, role: 'assistant', content: text, timestamp: Date.now() });
}

// Human-in-the-loop with no client and no loop: the row is the anchor in the
// transcript, and `requestUserInput` asks at the composer. This is the same function
// the built-in gate calls, so a page and a real agent loop ask identically.
async function askApproval() {
  const id = `a-${++n}`;
  const segId = `seg-${n}`;
  vp().appendMessage({ id, role: 'assistant', content: '', timestamp: Date.now() });
  vp().addSegment(id, {
    id: segId,
    type: 'tool_call',
    status: 'awaiting-approval',
    toolCall: { id: `tc-${n}`, name: 'delete_files', input: { path: '~/notes/todo.md' } },
  });

  try {
    const answer = await aparteGlobalConfig.requestUserInput({
      kind: 'approval',
      message: 'Run delete_files?',
      // The options are YOURS. Core cannot write "and always for this tool" or know
      // that your app has somewhere to remember it.
      options: [
        { value: 'allow', label: 'Approve', tone: 'affirm' },
        { value: 'deny', label: 'Reject', tone: 'deny' },
      ],
    });
    const picked = answer.action === 'accept'
      ? (answer.content as { option?: string; instruction?: string })
      : {};
    const approved = !picked.instruction && picked.option === 'allow';
    vp().updateSegment(id, segId, { status: approved ? 'resolved' : 'rejected' });
    reply(approved
      ? 'Approved — the file would be deleted here.'
      : picked.instruction
        ? `Understood: ${picked.instruction}`
        : 'Rejected — nothing happened.');
  } catch {
    // It ended without an answer: a stopped turn, or nothing mounted to ask it.
    vp().updateSegment(id, segId, { status: 'aborted' });
  }
}

chat.addEventListener('aparte-send', (e) => {
  const text = (e as CustomEvent).detail.content as string;
  vp().appendMessage({ id: `u-${++n}`, role: 'user', content: text, timestamp: Date.now() });
  if (text.trim().toLowerCase().includes('delete')) askApproval();
  else reply(`You said: "${text}". Type "delete" to see a human-in-the-loop tool approval.`);
});
```

Type a message containing "delete" and the row appears in the transcript while the
choices appear in the composer — the same panel `AparteClient` raises. Swap
the manual `addSegment` call for a registered `delete_files` tool (`needsApproval: true`)
plus a started `AparteClient`, and a real model drives the exact same segment and events.

## Next steps

- **[Customization](/guides/customization)** — render hooks and the action registry for
  everything outside tool segments.
- **[The agent engine](/guides/engine)** — the headless `runStreamAgent` loop, for running
  this same tool + approval flow off the main thread or on a server.
