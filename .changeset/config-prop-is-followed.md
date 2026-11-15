---
'@aparte/core': minor
'@aparte/react': minor
'@aparte/vue': minor
'@aparte/svelte': minor
'@aparte/angular': minor
---

A new `config` given to `<AparteChat>` is now applied; it was read once, when the chat mounted, and a later one was ignored without a word.

Pass a config that keeps its identity across renders (created once, or memoized): each new object is applied as a new config, and every element inside re-resolves it. The same config handed again changes nothing.

When the prop changes, every element inside moves to the new config, and the chat's two locale strings (the loading line, the waiting line) follow the new language. The messages on screen stay. If the new config registers another conversation manager, the open conversation is opened again from it when it holds that conversation; when it does not, or the new config has no manager, the chat keeps saving that conversation to the manager it had, and the next conversation it opens comes from the new config. A config given while a reply is streaming waits for that turn to end, so a reply is never half-drawn with one configuration's renderers and finished with another's; the last one given wins.

The wrappers call the new `AparteChatHost.setConfig(config)`, which does the same for a binding of your own.
