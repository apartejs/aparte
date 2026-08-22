---
title: Asking the user a typed question
description: Pause a run and ask for typed input — a choice, a yes/no, a free-text answer, or a small form — with requestUserInput and the built-in panel.
sidebar:
  order: 13
---

Sometimes a tool cannot finish without something only the user knows. Which of these
three files did you mean? Should I really delete the branch? What should the commit
message say?

**Elicitation** is the primitive for that: pause the run, render a typed input in the
composer, and resolve with what the user chose. It is a generalisation of the
`ask-question` plugin — there, the *kind* of question was baked into a dedicated tool;
here it is carried by a schema, so one call covers all of them.

The shape follows [MCP elicitation](https://modelcontextprotocol.io/) (a message plus a
requested schema, answered with accept / decline / cancel), but the mechanism is
transport-agnostic: a presenter registered per config instance, never window events.

## Asking for one thing

`requestUserInput` is a plain function — no `AparteClient` needed, no DOM wiring. Call
it from a tool handler and `await` the answer.

```ts
import { requestUserInput } from '@aparte/core';

const answer = await requestUserInput({
  message: 'Which environment should I deploy to?',
  schema: {
    type: 'enum',
    options: [
      { value: 'staging', label: 'Staging', recommended: true },
      { value: 'prod', label: 'Production', description: 'Live traffic' },
    ],
  },
});

if (answer.action === 'accept') {
  const env = answer.content as string; // 'staging' | 'prod' | whatever "Other…" produced
  void env;
}
```

Three fields cover most questions:

| `schema.type` | Rendered as | `content` on accept |
| --- | --- | --- |
| `enum` | radios, or checkboxes with `multiple: true` | `string`, or `string[]` |
| `boolean` | two choices, labelled `trueLabel` / `falseLabel` | `boolean` |
| `string` | one line, or a textarea with `multiline: true` | `string` |

An `enum` also offers a free-text **Other…** entry by default; pass
`allowOther: false` to close it.

## Asking for several things at once

Wrap the fields in an `object` schema and you get a small form — one labelled input per
property, and `content` comes back keyed the same way.

```ts
import { requestUserInput } from '@aparte/core';

const answer = await requestUserInput({
  message: 'Open a pull request?',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', title: 'Title', placeholder: 'Fix the abort path' },
      body: { type: 'string', title: 'Description', multiline: true, required: false },
      draft: { type: 'boolean', title: 'Open as draft', default: true },
    },
    required: ['title'],
  },
});

if (answer.action === 'accept') {
  const { title, body, draft } = answer.content as { title: string; body?: string; draft: boolean };
  void [title, body, draft];
}
```

## Always handle all three answers

```ts
import { requestUserInput } from '@aparte/core';

const answer = await requestUserInput({ message: 'Delete the branch?', schema: { type: 'boolean' } });

switch (answer.action) {
  case 'accept':  /* the user answered — `answer.content` is the value */ break;
  case 'decline': /* the user said no to being asked at all */ break;
  case 'cancel':  /* the panel was torn down: aborted turn, or a signal fired */ break;
}
```

`decline` and `cancel` are different, and a tool that treats them the same will
eventually do the wrong thing: declining is an answer, cancelling is the absence of
one.

## Wiring it to a tool's lifetime

Two options matter when the request comes from a tool handler:

- **`signal`** — pass the handler's own `AbortSignal`. When the turn is stopped or the
  per-tool timeout fires, the panel is torn down and the promise settles `cancel`,
  instead of leaving an orphan form in the composer.
- **`target`** — any element inside the chat that should present the request. It
  resolves *which* instance answers (its config, its composer). Omit it for a
  single-chat page; pass it when several chats share a page.

```ts
import { requestUserInput } from '@aparte/core';
import type { AparteTool, AparteToolHandler } from '@aparte/core';

export const deleteBranchTool: AparteTool = {
  name: 'delete_branch',
  description: 'Delete a git branch after confirming with the user.',
  inputSchema: { type: 'object', properties: { branch: { type: 'string' } } },
};

export const deleteBranchHandler: AparteToolHandler = async (call, signal) => {
  const { branch } = call.input as { branch: string };

  const answer = await requestUserInput({
    message: `Delete \`${branch}\`? This cannot be undone.`,
    schema: { type: 'boolean', trueLabel: 'Delete it', falseLabel: 'Keep it' },
    signal,
  });

  if (answer.action !== 'accept' || answer.content !== true) {
    return { toolCallId: call.id, content: 'The user did not confirm; nothing was deleted.' };
  }
  return { toolCallId: call.id, content: `Deleted ${branch}.` };
};
```

Returning a *result* rather than throwing on a refusal matters: the model needs to read
what happened so it can say so, and a thrown error would surface as a failed turn.

## Who renders it

`<aparte-elicitation>` is the default presenter, and it **has to be in your markup**.
It registers itself the moment it connects — but nothing creates it for you, so put it
inside your `<aparte-chat>`:

```html
<aparte-chat>
  <aparte-chat-viewport></aparte-chat-viewport>
  <aparte-elicitation></aparte-elicitation>
  <aparte-composer>
    <aparte-composer-input></aparte-composer-input>
    <aparte-composer-send></aparte-composer-send>
  </aparte-composer>
</aparte-chat>
```

It then mounts its panel inside the composer of the resolved chat, so the question
appears where the user is already typing.

:::caution[Leave it out and the refusal is invented]
With no presenter registered, `requestUserInput()` resolves `{ action: 'cancel' }` — so
your tool reports a refusal the user was never asked for, and the model answers as
though they had declined. Core warns once on the console when this happens; there is no
way for it to do better, because a question nobody can render cannot be waited on
either.
:::

To render it yourself, register a presenter on the config:

```ts
import { aparteGlobalConfig } from '@aparte/core';
import type { AparteElicitationRequest, AparteElicitationResult } from '@aparte/core';

aparteGlobalConfig.setElicitationPresenter(
  async (request: AparteElicitationRequest): Promise<AparteElicitationResult> => {
    // Your modal, your form, your framework. Resolve with what the user did.
    void request;
    return { action: 'decline' };
  },
);
```

`buildElicitationPanel` is also exported if you want the built-in panel's DOM without
its placement — it returns the element plus a promise for the answer, which is what the
default presenter itself is built from.

## Elicitation or the ask-question plugin?

`@aparte/plugin-ask-question` is still there and still useful: it gives the *model* a
tool it can call to ask a question, with a rendered receipt of what was asked and
answered. Reach for it when the model should decide to ask.

Reach for elicitation when **your code** decides to ask — a confirmation, a
disambiguation, a missing parameter — which is most of the time.
