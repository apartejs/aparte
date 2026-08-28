---
"@aparte/docs-mcp": minor
---

New package: `@aparte/docs-mcp`, the aparté documentation as an MCP server. `npx @aparte/docs-mcp` gives a coding agent four tools — `list_sets`, `search_docs`, `get_page`, `get_set` — over the text the docs site publishes for models (`apartejs.dev/llms.txt` and its per-topic files), so the answer is always the docs of the version that ships. `createDocsMcpServer({ baseUrl })` embeds it; `APARTE_DOCS_URL` points the CLI at a local docs build.

Two consumers' assistants could not find what the docs already had — the approval elicitation, the UI kit of classes, `systemPrompt: false` — and one rebuilt a modal it already had. A model that reads a site cold misses; a model that can ask finds.
