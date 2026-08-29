---
"@aparte/core": patch
---

The transcript reserves its scrollbar gutter on both edges (`scrollbar-gutter: stable both-edges`), so the centred column no longer shifts by half a scrollbar the moment the first reply overflows. Applies to the vanilla scroll container and to the framework-managed viewport alike; a host that wants the old behaviour sets `scrollbar-gutter: auto` on `.aparte-viewport-container`.
