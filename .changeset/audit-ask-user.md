---
"@aparte/plugin-ask-user": patch
---

The receipt in the transcript now actually receives `structuredResult` — the shipped renderer passed only the prose, so the structured path the receipt reads first was never taken on the default wiring.
