---
"@aparte/plugin-ask-user": minor
---

`createAskUserTool` and `setupAskUser` accept `name`, `description` and `systemPrompt`; `setupAskUser` also takes `receipt: false` to keep the transcript silent. Nothing changes when you pass none of them.

The tool's name was `ask_user` three times over (the tool, the receipt renderer, the Node entry) and its description and system prompt were fixed English — so a backend that already exposed an `ask_user`, or a product that wanted the model to read another policy in another language, had to fork the tool for two strings. The receipt renderer now registers under whatever name is chosen, and declining the receipt no longer means registering an empty renderer after `setupAskUser` and hoping the order holds.
