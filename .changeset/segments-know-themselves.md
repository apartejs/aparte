---
"@aparte/core": minor
---

**A segment now knows where it sits and when it happened.** `AparteSegmentBase`
gains five optional fields — `messageId`, `index`, `startedAt`, `endedAt`, `meta` —
so a consumer can build the chrome the market has taught users to expect (a
collapsed reasoning line with its duration, a tool pill with how long the call
took) without replacing a renderer. All optional, so nothing existing changes
shape.

**Core renders none of it.** It measures the span, because it owns the stream, and
leaves the display to you: the line reads "Thought for 8s" in one product and
"8.2s · 1.2k tokens" in another. `meta` is your channel — core never writes there;
fill it with the `updateSegment(id, { meta })` that already exists. The
customization guide carries the runnable recipe, and the vanilla example runs it.

Stamped in one place (`utils/segments.ts`), called by the two owners of a message's
segment array — the viewport and the framework host. Not by the parser: `tool_call`
and `pipeline-waiting` segments never pass through it, and its per-turn counter
would have restarted mid-message on a tool round-trip. `pnpm check:segment-stamp`
keeps a third writer from appearing.

`endedAt` is **when content last arrived** — it advances while a segment streams and
freezes when it settles, so the difference is a live duration during a turn and a
final one after it. The two simpler rules are both wrong and were both measured:
closing at the end of the turn makes a reasoning block span the answer that
followed it (2s of thinking before a 20s reply reads "22s"), and closing when the
next segment opens counts a ten-second gap as thinking. Only payload counts —
collapsing a block is presentation, not activity.

**A segment is now marked finished when the stream says so, not when the turn ends.**
The parser knew the exact end of every delimited segment — the closing token IS the
end — and dropped it, so the only signal left downstream was the end of the turn: a
reader watched "Thinking" for as long as the answer took to stream, and the Markdown
flush and the highlight-on-settle waited just as long. The parser now marks what it
closes, at all six sites, and both loops forward that mark instead of content alone.
Reasoning arriving on its own `reasoning_content` channel has no delimiter, so its
end in band is the first answer token — both loops say so there too. A duration line
is therefore readable *while* the answer streams, which is the whole point of having
one.

All five are optional, because they describe a lifecycle rather than a shape: a
segment built by hand or freshly emitted by the parser has not been inserted yet and
has no start, and an open segment has no end. `segmentDuration(segment)` reads the
span so a consumer never subtracts the two fields — the hand-written guard is three
conditions long and wrong at epoch 0, where a valid timestamp is falsy.

`isSegmentSettled` is exported alongside them: a tool call settles by its `status`,
never by `isStreaming`, so a hand-rolled check measures nothing on the segment type
where a duration matters most.

Three defects the feature exposed, each fixed:

- **Nothing ever declared a segment finished.** `completeMessage()` had no callers,
  and the path both agent loops actually take — `updateMessage({ status })` — never
  touched segments. So `isStreaming` was never set to false for a thinking, text or
  code segment anywhere in the model. Both owners now close a finished turn's
  segments through `updateSegment`, which stamps the model *and* repaints the
  bubble; `error` and `aborted` count as finished, because a stopped stream still
  produced what it produced.
- **`registerDefaultRenderers()` overwrote a renderer the app had registered**,
  while the lazy `installDefaultRenderersOnce()` documented itself as never
  replacing one. Since `new AparteClient()` calls the eager path, registering a
  custom renderer *before* constructing your client — the order anyone writes — put
  the built-in silently back. Both paths are now additive.
- **A code block's copy button copied an empty string** once one more update
  arrived in the turn: it read the segment captured when `setup` ran, and the bubble
  replaces that object on every update. It now reads the rendered source.

`aparte-terminal-run` gains `messageId`, and its `segmentId` is no longer nullable —
both come off the segment instead of a DOM attribute, so the event is finally
resolvable to a turn.
