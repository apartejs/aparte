---
'@aparte/plugin-ask-user': minor
'@aparte/core': patch
---

`@aparte/plugin-ask-question` is now `@aparte/plugin-ask-user`, and the tool is `ask_user`

A rename, decided by looking at what the ecosystem actually calls this rather than at
what we had called it.

There are two naming levels and they answer differently. The **protocol** level has a
standard — MCP calls it *elicitation* (`elicitation/create`), and ours already matched:
`requestUserInput`, `AparteElicitation*`, `<aparte-elicitation>`. The **tool** level has
no formal standard but a clear convention, and it is `ask_user`: Claude Code's
`AskUserQuestion`, `datasette-agent`'s `ask_user()`, `pi-ask-user`,
`ask-user-questions-mcp`. `ask_question` was ours alone.

**What changed**

- the package: `@aparte/plugin-ask-question` → `@aparte/plugin-ask-user`
- the tool the model is offered: `ask_question` → `ask_user`
- the element alias: `<aparte-ask-question>` → `<aparte-ask-user>`, class
  `AparteAskQuestion` → `AparteAskUser`
- the exports: `askQuestionTool`/`askQuestionHandler`/`setupAskQuestion` →
  `askUserTool`/`askUserHandler`/`setupAskUser`, and
  `AskQuestionOption`/`Item`/`Detail` → `AskUser*`

**What did NOT change, deliberately.** The receipt keeps its names —
`questionReceiptRenderer`, `QuestionReceiptSegment`, and the `'question-receipt'`
segment type. They name the ARTIFACT (a question and the answer it got, kept in the
transcript), not the tool that produced it, and that segment type is a public string an
app can emit on its own. Renaming it would break those apps for no gain.

**Migration.** Change the dependency name, and the four identifiers above. No alias and
no shim: this library is pre-1.0 and breaks cleanly rather than accumulating two names
for one thing. The old package name stays on npm at its last published version and will
receive nothing further — nothing is unpublished, so an existing install keeps working
until it is updated.

A model that keeps calling `ask_question` gets no tool by that name, which surfaces as
an unknown-tool error rather than silence.
