---
'@aparte/plugin-cards': minor
'@aparte/runner-ag-ui': minor
'@aparte/plugin-subagents': patch
'@aparte/core': minor
---

The plan card can be drawn from an agent's activity: `setupPlanCard({ activity: 'plan' })`. A TanStack AI router's plan now reaches the reply as a `plan` activity.

```ts
import { setupPlanCard } from '@aparte/plugin-cards/plan';

setupPlanCard({ activity: 'plan' });                       // AG-UI ACTIVITY_*, a sub-agent, a scenario
setupPlanCard({ activity: ['plan', 'todos'], tool: 'update_plan' }); // both paths at once
```

- **`@aparte/plugin-cards`**: every card's setup takes `activity` (a type or a list of types), so any
  card can be driven by an activity. The activity's content is read as the card's data (for the plan
  card, every shape `readPlan` reads: Claude Code's `todos`, Codex's `plan`, a Markdown checklist…).
  Each new content patches the same card in place; content that holds nothing to draw yet draws
  nothing, and an update the card cannot read leaves the card it drew.
- **`@aparte/runner-ag-ui`**: TanStack AI 1.0 puts its router's plan on each direct child's
  `SUBAGENT_STARTED` (`metadata.tanstack.subagentPlan`, `{ steps: [{ names, order? }] }`), once. The
  runner now emits it as one `plan` activity of the reply (it is the parent's plan of its
  sub-agents, not a sub-agent's own): a step per agent in the router's order, in progress when the
  agent starts, done, failed or blocked when it ends. Steps the router moved past read as done.
- **`@aparte/plugin-subagents`**: a sub-agent's conversation (under its line, in
  `<aparte-subagent-view>`) now follows activity and tool renderers registered after it was drawn,
  as a bubble does. Before, only a change of segment renderer redrew a row.
- **`@aparte/core`**: `onRenderersChange(listener)` is exported, for a row loop written outside
  the bubble: it hears every segment, tool or activity renderer registered or taken off, once per
  config per microtask.
