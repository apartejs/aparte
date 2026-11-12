---
'@aparte/core': minor
---

A tool row can now say what its call is doing, on a line under its name, and add a note after its state: give the config a `setToolLineProvider`. On a narrow line the row's parts now give way in a new order — the target first, then the note, the name last.

```ts
import { aparteGlobalConfig } from '@aparte/core';

aparteGlobalConfig.setToolLineProvider((segment) =>
  segment.toolCall.name === 'delegate' ? { activity: 'Reading parser.ts', note: '3 tools · 12s' } : undefined);
```

- **The provider** returns an `AparteToolLine`: `label` and `target`, used when your `registerToolDisplay` gives none; `activity`, shown while the call runs or waits; `note`, in every state; `details`, used when your display has no `details` key. Your display always wins, field by field. It is called at every draw, so its words follow a language switch. One per config; a chat with a config of its own reads the page's when it has none. A row with no provider is drawn as before.
- **If you styled the row.** What the call is doing is a new element, `.aparte-tool-activity`, placed last in the row's line and on a line of its own: the row's line now wraps for it, and for nothing else. Inside core's row, `.aparte-tool-label` is `display: contents`, so the name and the target are laid out as parts of the line: a background, a border or a padding set on `.aparte-tool-label` there no longer draws — set it on `.aparte-tool-name` or `.aparte-tool-target`. The name, the target and the note now size with `flex: <n> 1 0` and `max-width: max-content`; a `flex-shrink` of yours on them no longer decides who is cut first. A target the provider gives is words, `.aparte-tool-target--words`, in the chat's own font.
- **For a plugin.** `createSegmentList` holds a conversation that is not the reply — a stream adapter writes into it as into a chat, and each segment gets its index and timing (`AparteSegmentList`: `segments`, `onChange`). Feeding it events an observer handed you (a sub-agent's)? Make that adapter with `createStreamAdapter({ …, observe: false })`, so the observers do not hear them a second time, unattributed. `pluralize` and `formatDuration` are exported, the plural and the duration a turn's fold uses.
- **Fixed.** A row's details already in place are no longer rebuilt on every update of the call.
