---
"@aparte/core": patch
"@aparte/engine": patch
"@aparte/plugin-cards": patch
"@aparte/react": patch
"@aparte/vue": patch
"@aparte/svelte": patch
"@aparte/angular": patch
---

npm descriptions, keywords and READMEs now say what the packages do: your backend, tool calls, interactive cards. No code change; the Svelte deprecation notes no longer promise a move to `@aparte/svelte/legacy`.

- `@aparte/core` — a new description and six more keywords (`generative-ui`, `tool-ui`, `agent-ui`, `chat-widget`, `openai-compatible`, `assistant`). Its README opens with the picture of a reply and lists the launcher, citations, maths, diagrams, charts and suggestions. It also ships a short `llms.txt` that points to the full text on apartejs.dev.
- `@aparte/react`, `@aparte/vue`, `@aparte/svelte`, `@aparte/angular` — the description now starts with the category ("React AI chat component…") instead of "wrapper for aparté".
- `@aparte/plugin-cards` — the description names all eleven kinds of card; lists (`items`) was missing.
- `@aparte/engine` — the README keeps what the package does for a user and drops the history of how the loop moved.

The monorepo README gets the same opening and the picture, lists `@aparte/plugin-storage-idb`, the six templates and the agent runners, and links the guides on apartejs.dev.
