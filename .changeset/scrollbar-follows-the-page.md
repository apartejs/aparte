---
"@aparte/core": minor
---

Two new tokens let a host match the chat's scrollbar to its own page: `--aparte-scrollbar-thumb` (derived from `--aparte-neutral`) and `--aparte-scrollbar-track` (transparent), beside the existing `--aparte-scrollbar-width`. A host page with a styled scrollbar of its own sets them on `aparte-chat` so the chat's does not read as a second, foreign scrollbar — the docs site does this now. Defaults are unchanged; a stylesheet that overrode `scrollbar-color` on `.aparte-viewport-container` keeps working.
