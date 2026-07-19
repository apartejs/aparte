---
title: ask_question tool
description: The built-in ask_question tool for aparté — the AI asks the user a structured choice, presented via the core elicitation panel.
sidebar:
  order: 6
  label: ask-question
---

The built-in `ask_question` tool: it lets the AI ask the user a structured question (title + optional
description), as single (radio) or multiple (checkbox) choice. The handler is a thin adapter over core's
**elicitation** primitive — it maps the tool input to an elicitation schema and awaits `requestUserInput`,
presented by `<aparte-elicitation>`.

```bash
npm install @aparte/plugin-ask-question @aparte/core
```

`@aparte/core` is the only **peer dependency**.

```ts
import { setupAskQuestion } from '@aparte/plugin-ask-question';

setupAskQuestion(); // registers the tool + hides its bubble segment
```

Then mount `<aparte-elicitation>` (or the semantic `<aparte-ask-question>` alias, registered by importing
the package) in your chat to present the panel.

## Shapes

- **One question** → an `enum` field.
- **Several questions** → an `object` form, each field carrying `multiple`, `allowOther`, and a default.

`accept` returns the chosen answer to the model, `decline` returns a model-usable note, and `cancel`
aborts the tool call. Options improvised by smaller models (bare strings, or `label`/`value`/`text` keys
instead of `title`) are normalised so the panel always renders real choices.

To wire it manually instead of `setupAskQuestion()`:

```ts
import { AparteConfig } from '@aparte/core';
import { askQuestionTool, askQuestionHandler } from '@aparte/plugin-ask-question';

AparteConfig.registerTool(askQuestionTool, askQuestionHandler);
AparteConfig.registerToolRenderer('ask_question', { render: () => '' }); // hide the tool-call pill
```
