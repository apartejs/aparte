---
"@aparte/plugin-ask-user": minor
---

`createAskUserTool({ systemPrompt: false })` (and `setupAskUser` with the same option) registers the tool with **no system message at all**. Until now the prompt could be replaced but not removed: `''` still put a field on the tool, and since 0.13 that field is really sent as a system message. A product whose model is trained on a fixed contract, and must not read any added prose, had to strip the field off the returned object by hand.
