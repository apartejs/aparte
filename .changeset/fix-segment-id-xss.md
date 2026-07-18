---
"@aparte/core": patch
"@aparte/plugin-ask-question": patch
---

Escape `data-segment-id` in every segment renderer. A segment id can embed an untrusted
tool-call id (`tool-${toolCallId}`, taken verbatim from the endpoint's SSE `tool_calls[].id`),
so the tool-call renderer — and, defense-in-depth, all other renderers plus the ask-question
receipt — now HTML-escape it before it reaches `innerHTML`. Closes a DOM-XSS reachable from a
hostile OpenAI-compatible endpoint (the same class as the code-fence `language` fix, in a
sibling sink). Regression test added.
