---
'@aparte/core': minor
'@aparte/react': minor
'@aparte/vue': minor
'@aparte/svelte': minor
'@aparte/angular': minor
---

A new `config` given to `<AparteChat>` is now applied; it was read once, when the chat mounted, and a later one was ignored without a word.

Nothing to change in your code. When the prop changes, the chat moves to the new config — every element inside re-resolves it, the messages and the open conversation stay — and its two locale strings (the loading line, the waiting line) follow the new language. A config given while a reply is streaming waits for that turn to end, so a reply is never half-drawn with one configuration's renderers and finished with another's; the last one given wins.

The wrappers call the new `AparteChatHost.setConfig(config)`, which does the same for a binding of your own.
