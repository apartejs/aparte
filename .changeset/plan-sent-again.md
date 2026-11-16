---
'@aparte/plugin-cards': patch
---

A plan card sent again folds the earlier card of the same plan to its header, and a plan's "in progress" ring stops turning once the reply is over. No code to change.

An agent that calls its plan tool at each step drew a card per call, and the earlier ones stayed whole: their step "in progress" kept turning above the card that said the plan was done. In a chat, the latest card of a plan (cards of one plan share its title) is now the plan; an earlier one keeps its title, its "2 of 4 done" and its bar, what it said then, and gives up its steps and its motion (`data-plan-superseded`). Codex and Claude Code keep the earlier versions of a plan in the transcript too, still. A reload or a redraw lands on the same answer, read from the page in the conversation's order.
