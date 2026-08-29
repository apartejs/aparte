---
"@aparte/plugin-compaction": patch
---

The summarisation instruction now travels in the ask itself instead of a `system` message, so a provider that imposes its own system prompt can no longer drop it.

A provider serving a local model under a fixed training contract replaces the request's `system` message with its own — legitimately. When it did, the instruction never reached the model, nothing errored, and the model answered a bare "Please summarize this conversation." after somebody else's persona. Measured by a consumer on three transcripts: one reply refused for want of internet access, one said "noted, I'll do it", and one invented figures for a client that appears nowhere in the transcript — which the plugin then wrote back as the summary notice, making the invention the premise of every turn that followed.

The instruction is not a persona: it is the task of that one request, and it now sits where every provider must look. Nothing changes for a provider that honoured the system message, `prompt` and `DEFAULT_COMPACTION_PROMPT` are unchanged, and `summarize` still bypasses the transport entirely.
