---
"@aparte/core": minor
---

Make the `<aparte-chat>` shell framework-safe: it no longer injects its default
viewport + composer when the element carries `framework-managed`. A framework
wrapper whose component selector is `aparte-chat` (the Angular one) has its host
upgraded by core, and its children only render *after* `connectedCallback` — so
the existing "author-provided composition wins" check cannot see them, and the
default composition was being injected underneath the wrapper's own. Reuses the
same `framework-managed` signal `<aparte-chat-viewport>` already takes.
