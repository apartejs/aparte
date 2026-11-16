---
'@aparte/core': minor
---

A chat can say what its Stop button interrupts, for the reply in flight: `composer.stopLabel = 'Stop the sub-agents'` (#249). It goes back to `null`, the locale's `stopButton`, when the reply ends.

It names the accessible name and the tooltip of the composer's send button while it is Stop, and of `<aparte-composer-cancel>`, on this chat only. The one way before was `extendLocale({ stopButton })`, which renamed the Stop of every chat sharing the config, a locale edit standing in for state. The sub-agents guide shows it following the sub-agents that run.
