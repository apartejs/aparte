# @aparte/plugin-subagents

Sub-agents for [aparté](https://github.com/apartejs/aparte): one line per sub-agent — its name, its task,
what it is doing now, and how far it got ("3 tools · 12 s") — with its conversation kept out of the reply
and out of what the model reads.

```bash
npm install @aparte/plugin-subagents @aparte/core
```

```ts
import { aparteGlobalConfig } from '@aparte/core';
import { setupSubagents } from '@aparte/plugin-subagents';

setupSubagents();  // the line alone, on the global config

// Or tuned (the config last, like every setup*; the global one by default):
const stop = setupSubagents({ activity: true, counts: false }, aparteGlobalConfig);
stop();            // takes it off again
```

**Where the line comes from.** A sub-agent opened by a tool call takes that call's row: everything you
declare for the tool with `registerToolDisplay` (`label`, `icon`, `quiet`, `hidden`, `details`) still
applies, and wins over what the plugin says. A sub-agent no call opened — or a second one opened by the
same call — gets a `subagent` segment (`SUBAGENT_SEGMENT_TYPE`, typed `AparteSubagentSegment`) drawn as the
same row, named by the agent: `registerToolDisplay('<agent name>', …)` reaches it.

**Options** (`SubagentsOptions`): `activity` shows its latest running tool call while it works (default
`true`); `counts` shows its tool calls and how long it worked (default `true`); `details` is what is behind
the line — `false` by default (no disclosure), or a function that returns what to show under it.

**Reading it back.** The sub-agent (`AparteSubagent`: `id`, `name`, `description`, `status`, `result`,
`error`, `parentId`, `segments`) is saved on the segment that stands for it. `subagentOf(segment)` returns
it; `subagentStatus(segment)` returns its state (`AparteSubagentStatus`: `running`, `waiting`, `done`,
`failed`, `stopped`), and reads `stopped` for a sub-agent a reload or a Stop left unfinished.

**Events.** The chat element hears `aparte-subagent-start` (`AparteSubagentStartEventDetail`: `messageId`,
`agentId`, `name`, `description`, `toolCallId`, `parentId`) and `aparte-subagent-end`
(`AparteSubagentEndEventDetail`: `messageId`, `agentId`, `status`), so an app can list the sub-agents of a
reply wherever it likes.

Without the plugin, a sub-agent's text and tool calls are still kept out of the reply: the call that opened
it shows as an ordinary tool row. `@aparte/core` is the only **peer dependency**.

> ESM-only. Part of the aparté monorepo.
