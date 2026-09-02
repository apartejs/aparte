---
"@aparte/core": patch
---

`AparteConversationManager.setTitleProvider(fn)` replaces how a new conversation is titled from its first user message.

A conversation's title was decided in one private place, `_autoTitle`, and it was the message as typed. A consumer with a titler — a model in the browser, a request to a backend, a heuristic — had no way in short of racing `updateTitle` behind every send, and losing the race on the sidebar. The seam is on the manager, which owns that one place: `setTitleProvider(provider)` / `getTitleProvider()`, plus a `titleProvider` constructor option. The provider receives the message's text and the message, may be async, and is consulted once per conversation; an empty answer or a throw leaves the default, so a titler that fails never loses the message from the list. `updateTitle` is untouched. `@aparte/plugin-titler` binds an aparte-titler model to it.
