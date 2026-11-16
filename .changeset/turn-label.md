---
'@aparte/core': minor
'@aparte/plugin-subagents': minor
---

A fold of sub-agents can say where they stand: `setTurnSummary({ label: subagentsTurnLabel })` writes the fold's line as "3 sub-agents · 1 done, 2 running" (#247). `label` takes any function of yours too.

`setTurnSummary` takes a `label` function, called with the fold's steps, `running` and the chat's config each time they change; a string replaces core's line ("Working", "Worked 9 s · 7 tools") and the running step's name, `null` keeps them. A line of the app's is a polite live region; one that throws leaves core's line. `@aparte/plugin-subagents` exports `subagentsTurnLabel`, which counts the fold's sub-agents by state in the chat's language, with six locale keys (`subagentsCount`, `subagentsDone`, `subagentsRunning`, `subagentsWaiting`, `subagentsFailed`, `subagentsStopped`) in the ten languages, and leaves core's line under two sub-agents.

The headline goes on the fold core already draws, moves and keeps up to date, not on a second grouping of rows: with `openWhileRunning` the lines show under it while the sub-agents work. A sub-agent that waits for the person or failed stands out of the fold, where it has to be read.
