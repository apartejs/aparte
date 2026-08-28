---
"@aparte/core": patch
---

`AparteAIProviderMetadata` — the return type of a provider's `getMetadata()` (name, id, icon, colour) — is exported from `@aparte/core`. A provider written outside this repository had to spell it `ReturnType<AparteAIProvider['getMetadata']>`; reported by a consumer in July and again now.
