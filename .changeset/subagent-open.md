---
'@aparte/core': minor
'@aparte/plugin-subagents': minor
---

A sub-agent's line can open its conversation beside the chat: `setupSubagents({ open: 'event' })` and `connectSubagentView({ chat, view, split })`. Without the option, nothing changes.

```ts
import { connectSubagentView, setupSubagents } from '@aparte/plugin-subagents';

setupSubagents({ open: 'event' });
connectSubagentView({
  chat: document.getElementById('chat')!,
  view: document.querySelector('aparte-subagent-view')!,
  split: document.querySelector('aparte-split')!,
});
```

- `@aparte/plugin-subagents`: `open: 'event'` puts an Open button (core's button recipe, named "Open Researcher" in the chat's ten languages) at the end of each sub-agent's line. Pressing it — click, Enter or Space — dispatches `aparte-subagent-open` (`AparteSubagentOpenEventDetail`: `targetId?`, `messageId`, `agentId`, `name?`, `toolCallId?`), bubbling and composed. A line with nothing behind it also opens on a click anywhere on it; with `details` too, the line keeps toggling its detail and only the button opens elsewhere, so one click never means two things. `connectSubagentView` points an `<aparte-subagent-view>` at the sub-agent, opens the split's second pane (on a phone the split shows the view, then the chat again), marks the open line (`data-current` on the row, `aria-current="true"` on its button) and returns a function that undoes it all. Without a split, `onOpen` and `onClose` hand the layout to the app. A sub-agent's own sub-agents, drawn as lines in the view, open in the same view.
- `<aparte-subagent-view closable>`: the sub-agent's name and a Close button above its conversation; Close, or Escape inside the view, dispatches `aparte-subagent-view-close` (the view does not hide itself). `connectSubagentView` sets it, folds the pane on it and puts the focus back on the line's button. `focusTitle()` puts the focus on the name. A view opened while its sub-agent works now reads it from the plugin's last write when the chat does not hold it yet (a framework that mirrors the messages a step behind).
- `@aparte/core`: `AparteToolLine.open` (`AparteToolLineOpen`: `label`, `onOpen(row)`, `current?`) — a tool-line provider can say a call can be shown elsewhere. Core draws the button at the end of the line, calls `onOpen` with the row, and keeps the button's name and the `current` marks in step on update and relabel. On a row with a detail the button stays out of the `<summary>` (a control inside it is no control of its own): the row is then a `div` wrapping its `<details class="aparte-tool-disclosure">`, the button in an `.aparte-tool-open-slot` beside it, at the same place on the line. Without `open`, the row is unchanged.
