---
title: ask_user tool
description: The built-in ask_user tool for aparté — the AI asks the user a structured choice, presented via the core elicitation panel.
sidebar:
  order: 6
  label: ask-user
---

The built-in `ask_user` tool: it lets the AI ask the user a structured question (title + optional
description), as single (radio) or multiple (checkbox) choice. The handler is a thin adapter over core's
**elicitation** primitive — it maps the tool input to an elicitation schema and awaits `requestUserInput`,
presented by `<aparte-elicitation>`.

```bash
npm install @aparte/plugin-ask-user @aparte/core
```

`@aparte/core` is the only **peer dependency**.

```ts
import { setupAskUser } from '@aparte/plugin-ask-user';

setupAskUser(); // registers the tool + hides its bubble segment
```

Then mount `<aparte-elicitation>` (or the semantic `<aparte-ask-user>` alias, registered by importing
the package) in your chat to present the panel.

## Shapes

- **One question** → an `enum` field.
- **Several questions** → an `object` form, each field carrying `multiple`, `allowOther`, and a default.

`accept` returns the chosen answer to the model, `decline` returns a model-usable note, and `cancel`
aborts the tool call. Options improvised by smaller models (bare strings, or `label`/`value`/`text` keys
instead of `title`) are normalised so the panel always renders real choices.

## What the conversation keeps

The panel lives in the composer, so once it is answered it is gone. `setupAskUser()`
therefore registers a tool renderer that leaves a **receipt** in the thread: one
`question → answer` row per question asked. Without it, scrolling back showed nothing —
no question, no answer, no sign the assistant had asked anything, which is not what a
conversation is for.

It is rendered as DOM rather than as an HTML string, because every value in it is
model-chosen or user-typed.

To render the record yourself — a different card, a framework component — take the
pairing and skip the markup:

```ts
import { aparteGlobalConfig } from '@aparte/core';
import { receiptRows } from '@aparte/plugin-ask-user';

aparteGlobalConfig.registerToolRenderer('ask_user', {
  render: (segment) => {
    const rows = receiptRows({ input: segment.toolCall.input, result: segment.result });
    const el = document.createElement('div');
    for (const row of rows) {
      const line = document.createElement('p');
      line.textContent = `${row.question} — ${row.answer}`;   // textContent, not innerHTML
      el.appendChild(line);
    }
    return el;
  },
});
```

`receiptRows` takes the questions from the tool INPUT rather than from the formatted
result, because the input is authoritative: an answer a user typed can contain anything,
including an arrow. It returns `[]` while the call is still pending, which is why the
default renderer shows nothing until it settles — the live UI is the panel, and two
places to read the same open question is one too many. `buildReceipt` is the default
card if you want it verbatim.

## Wiring it by hand

Instead of `setupAskUser()`:

```ts
import { aparteGlobalConfig, registerSegmentRenderer } from '@aparte/core';
import { askUserTool, askUserHandler, buildReceipt, questionReceiptRenderer } from '@aparte/plugin-ask-user';

aparteGlobalConfig.registerTool(askUserTool, askUserHandler);
registerSegmentRenderer(questionReceiptRenderer);   // the receipt card's styles
aparteGlobalConfig.registerToolRenderer('ask_user', {
  render: (segment) => buildReceipt({ input: segment.toolCall.input, result: segment.result }),
});
```

Passing `{ render: () => '' }` instead is what this plugin used to do, and it is what
left the transcript empty.
