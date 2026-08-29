---
"@aparte/plugin-ask-user": patch
---

The receipt in the transcript reads its answers from the tool's `structuredResult`: the shipped renderer hands it the structured value alongside the prose.

`structuredResult` is new this release (`AparteToolResult.structuredContent` travelling with the call), and the receipt reads that path first, falling back to parsing the prose. The renderer the plugin ships passed only the prose, so on the default wiring the structured path was never taken and the receipt was reconstructing what it had been handed.
