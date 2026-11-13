---
'@aparte/plugin-subagents': minor
---

New `@aparte/plugin-subagents`: one line per sub-agent in the reply — its name, its task, what it is doing now, and "3 tools · 12s" — with its conversation under the line or in a pane of its own.

```bash
npm install @aparte/plugin-subagents
```

```ts
import { setupSubagents } from '@aparte/plugin-subagents';

setupSubagents();                          // the line alone
setupSubagents({ details: 'transcript' }); // the line opens on the sub-agent's conversation
```

- **The line.** A sub-agent opened by a tool call is drawn on that call's row, so `registerToolDisplay` for that tool still applies and wins (`label`, `icon`, `summary`, `quiet`, `hidden`, `open`, `details`). A sub-agent no call opened, or a second one opened by the same call, gets a line of its own, reached by the agent's name. The line reads one of five states: Running, Waiting, Done, Failed, Stopped.
- **Options** (`SubagentsOptions`): `activity` (a second line from its start to its end: *Starting…*, its latest tool call, then what it did — so the row keeps its height; on by default), `counts` (its tool calls and how long it worked, once it is over; on by default), `details` (`false` by default, `'transcript'`, or a function). `subagentTranscript` is the conversation as a `details` function, for one tool's line.
- **Anywhere else.** `<aparte-subagent-view for="chat" message-id="…" agent-id="…">` shows a sub-agent's conversation in a pane, a canvas or a dialog, live and after a reload. The chat dispatches `aparte-subagent-start` and `aparte-subagent-end`, which carry those ids.
- **Saved with the conversation.** The sub-agent's conversation is kept on the segment that stands for it and never sent to the model. `subagentOf(segment)` and `subagentStatus(segment)` read it back, in Node too; `subagentStatus` reads `stopped` for a sub-agent a reload or a Stop left unfinished.
- The words are translated in the ten languages of `@aparte/locales` (`subagentsTools`, `subagentsUnnamed`, through `extendLocale`). `@aparte/core` is the only peer dependency.

Guide: [Sub-agents](https://apartejs.dev/guides/sub-agents/).
