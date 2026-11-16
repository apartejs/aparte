---
'@aparte/core': patch
---

A change of the config no longer closes a conversation list's open row menu or a title being renamed, and the list redraws only when its words or its glyphs change. No code to change (#251).

`<aparte-conversation-list>` redrew itself on every `aparte-config-change`, which goes out for every change of the config (a provider registered, a model selected, a tool display), and it did so unheld: a menu open under the pointer was detached, and a rename lost what was typed, when an app registered its models a second after launch or again when a model loaded. It now redraws for a new locale or a new icon set only, and waits, as `conversations` already does, for an open menu, a rename or a press to end.
