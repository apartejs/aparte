---
"@aparte/provider-scenario": patch
---

`createScenarioProvider` now warns about a tool with no `after` route even when you pass a `match` of your own. Nothing to change in your code — when a `match` is present the warning ends with *this line is the one to ignore*, because a `match` that routes the tool result by value (the documented branching shape) does not loop.

The warning exists because a `when` scenario that calls a tool, with nothing answering the result, loops: the default rule sends the tool result back through the same `when`, round after identical round, until the client's `maxTurns` stops it.

Passing `match` used to switch that warning off, on the premise that a custom rule replaces the default one. It does not replace it, it precedes it — the pick reads `match(request, scenarios) ?? defaultMatch(request, scenarios)` — so a `match` that returns `undefined` for a tool result, which is exactly what the documented and in-repo examples write, lands right back on the rule the warning protects. The exemption was silencing the shape most likely to need it.
