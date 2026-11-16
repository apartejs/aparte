---
'@aparte/core': minor
---

A chat can say what its Stop button interrupts: `stop-label` on `<aparte-composer>`, or its `stopLabel` property, names the button "Stop the sub-agents" in place of the locale's `stopButton` (#249). Set it back to `null` when the run it named is over.

It is the accessible name and the tooltip of the composer's send button while it is Stop, and of `<aparte-composer-cancel>`, on this chat only. The one way before was `extendLocale({ stopButton })`, which renamed the Stop of every chat sharing the config, a locale edit standing in for state. An attribute, like the composer's other options, so a framework binding (`[stopLabel]` in Angular, a prop on the generated components) reaches it the way a script does. The sub-agents guide shows it following the sub-agents that run.
