---
'@aparte/core': patch
---

`AparteTool.systemPrompt` is now actually sent to the model.

The field is documented on the type as "System prompt injected automatically when this
tool is registered — tells the AI when and why to use it", and the tools guide repeats
it. Nothing anywhere read it: a grep across core, engine and every provider finds only
the conversation-level `_systemPromptTemplate`, which is a different field.

The failure was silent in the worst way. The tool still worked — the model receives its
name and JSON schema either way — so all that went missing was the sentence explaining
WHEN to reach for it, which is the whole reason the field exists.
`@aparte/plugin-ask-user` sets one, so a shipped plugin was losing its instructions and
no test could see it.

`AparteConfig.resolveToolSystemPrompts()` joins the prompts of every registered tool, in
registration order, and the client sends them as a system message of their own — after
the app's template, which stays separate because one is about the app and the other about
the tools. A tool that sets none contributes nothing, and with no tool setting one there
is no extra message at all.

The three turn entry points (send, retry, edit) were each writing the same two lines of
system-message assembly, so they now share one `_systemMessages()` helper — the shape
that would otherwise have got the tool half in two of the three.

Found by a documentation audit. Four tests pin it; reverting the wiring fails three.
