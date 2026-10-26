---
"@aparte/core": minor
---

Tool rows are quiet by default: the label shimmers while a call runs and nothing says "Done" once it ends. For the old row with a spinner, "Running" and "Done", call `aparteGlobalConfig.registerToolDisplay('*', { quiet: false })`.

A wait for approval, a refusal, a failure and a stop still show their word and their note, and a screen reader still hears "Running" and "Done". `quiet` keeps its meaning: it was opt-in for a chat read by people, and it is now what a chat gets unless a display says `quiet: false`.

A display is used whole, so `quiet: false` on `'*'` reaches only the tools without an entry of their own. A tool that has one — a label, an icon, a summary from `registerToolSummary`, a formatter from `registerToolInputFormatter`, any field — says `quiet: false` in that entry to keep the agent's row. Under reduced motion and in forced colours, where the shimmer cannot say a call is running, a quiet row shows "Running".
