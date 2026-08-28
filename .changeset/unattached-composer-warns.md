---
"@aparte/core": patch
---

On a page with several chats, an `<aparte-composer>` that belongs to none — no `target`, no chat host with an id above it — logs one warning saying how to attach it. Nothing else changes.

Such a composer answers to every chat's lifecycle events, so one chat's Stop evicted another's open question, and the symptom sat nowhere near its cause. A signal at the console, not a guard.
