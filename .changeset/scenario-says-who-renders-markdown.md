---
"@aparte/provider-scenario": patch
---

The `{ text }` docs no longer say core parses markdown — a markdown plugin renders it.

Without `@aparte/plugin-marked` or `@aparte/plugin-streaming-markdown`, scripted text
streams as plain text, `**stars**` included. The docs said "parsed by core", which is
not what ships: core deliberately has no markdown renderer. Wording only.
