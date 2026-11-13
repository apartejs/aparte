---
'@aparte/engine': minor
'@aparte/core': minor
'@aparte/runner-ag-ui': minor
'@aparte/provider-scenario': minor
---

An agent's activity can now be drawn: register a renderer with `config.registerActivityRenderer(type, renderer)`. AG-UI `ACTIVITY_SNAPSHOT` / `ACTIVITY_DELTA` are no longer dropped.

```ts
const off = aparteGlobalConfig.registerActivityRenderer('search-progress', {
  render: (segment) => {
    const line = document.createElement('p');
    line.textContent = `${(segment.content as { read: number }).read} of 5 sources read`;
    return line;
  },
  update: (line, segment) => { line.textContent = `${(segment.content as { read: number }).read} of 5 sources read`; },
});
```

- `@aparte/engine`: a run event `activity` (`{ id, activityType, content, agentId? }`) in `StreamRunEvent`, and the same in a model call's stream (`StreamChatEvent`), which the loop passes on; a sub-agent's handle passes it on with its `agentId`. `content` is always the activity's WHOLE current value: a consumer never applies a patch.
- `@aparte/core`: a built-in segment type, `AparteActivitySegment` (`{ type: 'activity', activityId, activityType, content }`), placed in the reply where the activity first arrived and updated in place by every later event with the same id — never a second segment, a reply resumed after a pause included: its new run's adapter finds the segment on the reply through the target's `getMessage` (which the viewport and a wrapper's host have) or, for a segment list, its `segments` — two new optional members of `StreamAdapterTarget`. The text it interrupts ends there and what follows is written after it, as around a tool call. It is drawn by the renderer registered for its type (`registerActivityRenderer` returns the function that takes it off; `getActivityRenderer` reads it); the renderer's `update` patches the same element, and without `update` it is drawn again from `render`. With no renderer for its type it is kept on the message and draws nothing — an empty hidden element, no room, no orphan header — and a renderer registered later, or after a reload, draws it. It is saved with the message, never copied with the reply's text, and never sent to the model: the wire history skips it by name. `activity` joins `AparteStreamEventMap`, so a provider can stream it. New types: `AparteActivitySegment`, `AparteActivityRenderer`.
- `@aparte/runner-ag-ui`: `ACTIVITY_SNAPSHOT` becomes an `activity` with its content; `ACTIVITY_DELTA` is applied (RFC 6902, as `STATE_DELTA` is) to the content the runner holds for that message id, and the whole result is passed on. Per AG-UI 1.0, a snapshot with `replace: false` leaves an existing activity as it stands (content and type), and a delta for an activity no snapshot created is skipped with a warning, never failing the run; a patch that cannot apply leaves the activity as it was, with a warning. A sub-agent's activity is attributed by its `subagentRunId`, and its delta stays its own. The conformance lane now asserts the two activity fixtures' messages.
- `@aparte/provider-scenario`: a script step `{ activity: { type, content, id? } }`; the same `id` later updates it, in the same turn or a later one; in a scripted sub-agent it is the sub-agent's.

A sub-agent's activity lands in its own conversation with no change to `@aparte/plugin-subagents`: drawn under its line (`details: 'transcript'`) and in `<aparte-subagent-view>` by the same registered renderers.
