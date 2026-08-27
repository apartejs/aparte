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
`ask-user` plugin — there, the *kind* of question was baked into a dedicated tool;
here it is carried by a schema, so one call covers all of them.

The shape follows [MCP elicitation](https://modelcontextprotocol.io/) (a message plus a
requested schema, answered with accept or decline), but the mechanism is
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

### Several questions are asked one at a time

A form of two or more questions is presented **one question at a time**, with a chip
per question above it. The chips are also how you go back: an answer you have already
given is the thing you most want to revisit, and hunting for a "Back" button to do it
is the frustrating half of every stepped form.

Give each question a short `header` — two or three words — because that is what the
chip holds. Without one the chip falls back to the question's position, which is
honest and never truncates a sentence into nonsense.

```ts
import { requestUserInput } from '@aparte/core';

const answer = await requestUserInput({
  message: '',                       // each question carries its own title
  schema: {
    type: 'object',
    properties: {
      engine: { type: 'enum', header: 'Engine', title: 'Which engine?', options: [{ value: 'chromium' }, { value: 'webkit' }] },
      theme: { type: 'enum', header: 'Theme', title: 'Which theme?', options: [{ value: 'light' }, { value: 'dark' }] },
    },
  },
});
void answer;
```

The protocol does not change: the answer is still one object with every key, and the
composer's send button still means *submit*, enabled only once every required question
has an answer. Advancing between questions is the panel's own affordance.

If what you actually want is a **form** — several fields filled in one go, which is
what structured data collection looks like — ask for it:

```ts
aparteGlobalConfig.setElicitationOptions({ layout: 'stacked' });
```

That was the only shape until now, inherited from MCP elicitation without being
examined. MCP describes a form for collecting structured data; asking a person two
different questions in the middle of a conversation is not that, and no product does
it by stacking them in one box. The form case is real, so it stays — it was just never
the right default.

## Two answers, and a rejection

```ts
import { requestUserInput, AparteElicitationAbortError } from '@aparte/core';

try {
  const answer = await requestUserInput({ message: 'Delete the branch?', schema: { type: 'boolean' } });
  if (answer.action === 'accept') {
    // The user answered — `answer.content` is the value.
  } else {
    // `decline`: the user said no to being asked at all.
  }
} catch (err) {
  if (err instanceof AparteElicitationAbortError) {
    // No answer: the turn was stopped, a signal fired, the question was taken away,
    // or nothing was mounted to ask it. `err.reason` is 'aborted' or 'no-presenter'.
  }
}
```

Declining is an answer. Ending without one is not, and that is why it **rejects**
rather than resolving a third `action`. It used to resolve `{ action: 'cancel' }`, and a
value is easy to handle as though it were an answer — which is exactly what happened
one level up: the tool-approval gate read that `cancel` as a refusal and told the model
the user had rejected a tool they had merely stopped. A rejection cannot be mistaken
for a decision by a caller that forgot a branch.

`name` is `'AbortError'`, so a handler that already tests `err.name === 'AbortError'`
needs no change.

One consequence worth knowing: a request you start and never `await` will surface an
**unhandled rejection** when it ends without an answer, because that is what an ignored
failed promise is. Attach a `.catch()` if you genuinely do not care about the outcome —
the noise is the point, and it is the price of an ending that cannot be mistaken for a
decision.

## Asking for a decision instead of a value

A `kind: 'approval'` request asks the user to pick one of the options **you** supply,
and resolves with which one — plus anything they typed instead. It is the same
mechanism, the same panel slot and the same queue; only what is on screen differs,
because a decision is not a value and a schema there would be a form with nothing in it.

```ts
import { requestUserInput } from '@aparte/core';

const answer = await requestUserInput({
  kind: 'approval',
  message: 'Run delete_files?',
  options: [
    { value: 'allow', label: 'Approve', tone: 'affirm' },
    // Two options may share a `value` and differ only in reach: this is what
    // "Yes" and "Yes, and always" are. YOU write the label, because only you can
    // honour it — core has nowhere to remember a grant.
    { value: 'allow', label: 'Approve, and always for this tool', tone: 'affirm' },
    { value: 'deny', label: 'Reject', tone: 'deny' },
  ],
});

if (answer.action === 'accept') {
  const { option, instruction } = answer.content as { option?: string; instruction?: string };
  // `instruction` is the free-text arm — "no, do this instead". It is a refusal that
  // carries words, which is only useful because a refusal hands the model a turn.
  void [option, instruction];
}
```

An option is answered by its own click — approving is the most frequent act in the
feature, and spending two gestures on it to reuse the composer's send button would be
the tail wagging the dog. Written text goes through that button instead, which is
exactly the act it already means.

The built-in tool-approval gate is one caller of this, with two options and a question
built from the tool's name. Anything richer — a scope option, a third choice — is the
host's to supply, and `buildApprovalPanel` is exported for a presenter of your own.

## Wiring it to a tool's lifetime

Two options matter when the request comes from a tool handler:

- **`signal`** — pass the handler's own `AbortSignal`. When the turn is stopped or the
  per-tool timeout fires, the panel is torn down and the promise rejects with an
  `AbortError`, instead of leaving an orphan form in the composer.
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

[`<aparte-elicitation>`](/components/input/aparte-elicitation/) is the default presenter, and it **has to be in your markup**.
It registers itself the moment it connects — but nothing creates it for you, so put it
inside your [`<aparte-chat>`](/components/conversation/aparte-chat/):

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

:::caution[Leave it out and nothing can ask]
With no presenter registered, `requestUserInput()` rejects with
`AparteElicitationAbortError` and `reason: 'no-presenter'`, and core warns once on the
console. It used to resolve `{ action: 'cancel' }`, which meant your tool reported a
refusal the user was never asked for and the model answered as though they had
declined. A question nobody can render still cannot be waited on — but failing is not
the same as answering, and only one of the two can be told apart from a real refusal.
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
its placement. It returns a `BuiltElicitationPanel` — the element plus everything a
presenter needs to drive it:

| Member | What it is for |
| --- | --- |
| `el` | the panel's root, for you to place |
| `dismiss` | the corner control that declines the **whole** request, not the current question |
| `getContent()` | the current response, shaped to the schema |
| `isComplete()` | every required field has a usable value |
| `focus()` | focus the first input, after you mount it |
| `mode()` | what the composer's one button means here: `'advance'` or `'submit'` |
| `canProceed()` | whether that button is enabled |
| `proceed()` | act on it — advancing shows the next question; submitting is yours |
| `relabel()` | re-apply the locale's strings in place, without rebuilding a half-filled form |

The last four are what make "one question at a time" work: the panel has no Next button
of its own, because the composer's button already changes meaning and gains a fourth.

There is **no promise**: settling is the presenter's job, which is why the built-in one
wires `getContent()` to the composer's send button and `canProceed()` to whether that
button is enabled.

## Replacing one field, not the whole panel

Writing a presenter means owning placement, accept/decline and the rejection, the send-button
gating, focus and the teardown when a turn is stopped. Most of the time what you want
is a different-looking *choice*, so there is a hook for exactly that:

```ts
import { aparteGlobalConfig } from '@aparte/core';

aparteGlobalConfig.setElicitationFieldRenderer((field, ctx) => {
  if (field.type !== 'enum') return null;      // the built-in renders the rest

  const el = document.createElement('div');
  el.className = 'my-chips';
  let picked = '';

  for (const option of field.options) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.textContent = option.label ?? option.value;
    chip.addEventListener('click', () => {
      picked = option.value;
      ctx.notifyChange();                      // re-gates the send button
    });
    el.appendChild(chip);
  }

  return { el, getValue: () => picked, isComplete: () => picked !== '' };
});
```

The types, if you are pulling the callback out into its own function:

```ts
import type {
  AparteElicitationFieldRenderer,
  AparteElicitationFieldContext,
  AparteElicitationFieldControl,
} from '@aparte/core';

const renderChoice: AparteElicitationFieldRenderer = (
  field,
  ctx: AparteElicitationFieldContext,
): AparteElicitationFieldControl | null => {
  if (field.type !== 'enum') return null;
  const el = document.createElement('div');
  let picked = '';
  el.addEventListener('click', () => {
    picked = field.options[0]?.value ?? '';
    ctx.notifyChange();
  });
  return { el, getValue: () => picked, isComplete: () => picked !== '' };
};
```

Returning `null` for a field lets the built-in render it, which is what makes
overriding a single kind practical. `ctx.notifyChange()` is not optional: the panel
re-reads `isComplete()` on every change, so a field that never notifies is a field
whose answer can never be submitted. `ctx.key` is the form key in a multi-question
schema, so one renderer can vary per question.

This hook returns a control rather than `string | HTMLElement` like the render hooks
elsewhere in this library, and deliberately: a field has to hand back a **value**. A
hook that must also read the user's input is a control, not a decoration — the
alternative is the panel scraping your markup for inputs by convention, a contract
that breaks the first time someone styles it differently.

## Who offers "Other…"

A choice offers a free-text escape by default. That is the **host's** decision, not the
model's:

```ts
aparteGlobalConfig.setElicitationOptions({ allowOther: false });
```

`@aparte/plugin-ask-user` used to expose `allow_other` in the schema it hands the
model, which meant the model decided your UX — and a small model fills a field it does
not understand: one sent two questions with `allow_other: true` and no options at all,
so the panel rendered a radio list whose only entry was "Other…". A field of a schema
you build yourself can still set `allowOther`, and it wins: that is your app talking.

## Elicitation or the ask-user plugin?

`@aparte/plugin-ask-user` is still there and still useful: it gives the *model* a
tool it can call to ask a question, with a rendered receipt of what was asked and
answered. Reach for it when the model should decide to ask.

Reach for elicitation when **your code** decides to ask — a confirmation, a
disambiguation, a missing parameter — which is most of the time.
