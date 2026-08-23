# @aparte/plugin-ask-user

The built-in `ask_user` tool for [aparté](https://github.com/apartejs/aparte). It lets the AI ask the
user a structured question (title + optional description), as single (radio) or multiple (checkbox) choice.
The handler is a thin adapter over the core **elicitation** primitive — it maps the tool input to an
elicitation schema and awaits `requestUserInput`, presented by `<aparte-elicitation>`.

```bash
npm install @aparte/plugin-ask-user @aparte/core
```

```ts
import { setupAskUser } from '@aparte/plugin-ask-user';

setupAskUser(); // registers the tool + hides its bubble segment
```

Mount `<aparte-elicitation>` (or the semantic `<aparte-ask-user>` alias, registered by importing this
package) in your chat to present the panel. `@aparte/core` is the only **peer dependency**.

**Shapes** — one question → an `enum` field; several → an `object` form, each field carrying `multiple`,
`allowOther`, and a default. `accept` returns the answer, `decline` returns a model-usable note, `cancel`
aborts the tool call. Improvised option shapes from smaller models (bare strings, `label`/`value`/`text`
keys) are normalised so the panel renders real choices.

You can wire it manually instead: `aparteGlobalConfig.registerTool(askUserTool, askUserHandler)` +
`aparteGlobalConfig.registerToolRenderer('ask_user', { render: () => '' })` (the second call hides the
tool-call pill).

> ESM-only. Part of the aparté monorepo.
