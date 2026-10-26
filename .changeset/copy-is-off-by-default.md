---
"@aparte/core": patch
---

The copy button is off by default: a message carries no button until you turn one on. To keep it, call `aparteGlobalConfig.setBubbleActions({ copy: true })`.

`APARTE_DEFAULT_BUBBLE_ACTIONS.copy` is now `false`, so every action is off until an app asks for it. Copy is the one core honours on its own, and it still works the same once on, hidden while a turn has no text to copy. A help widget or a support chat is read rather than quoted, and a button under every answer was noise there; a chat product that wants it adds it in one line. An explicit per-role list (`setBubbleActions({ assistant: ['copy', 'retry'] })`) is unchanged: naming `copy` there turns it on.
