---
'@aparte/core': patch
---

Text a model writes after a tool call, in the same model call, now appears after the call's row instead of being appended to the text above it.

The adapter hands over the text before a call, as it already did around an activity and as the AG-UI and n8n runners do. Seen with `@aparte/provider-scenario` and with Gemini through the AI SDK.
