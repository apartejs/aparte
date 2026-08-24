---
'@aparte/core': minor
---

**A segment's measurements move from its own fields into `meta.aparte`.** Breaking,
pre-1.0, no shim. `startedAt` and `endedAt` are gone from `AparteSegmentBase`.

Why, and it was checked rather than assumed: **no protocol carries a timestamp on a
content block.** Anthropic's blocks have none and neither does the message; OpenAI's
`output_text` part is `{annotations, logprobs, text, type}` with `created_at` on the item
above it; the AI SDK's `UIMessage.parts` have none either. What the AI SDK *does* have is
a metadata bag whose canonical example is literally `{ createdAt, model, totalTokens }` —
at the message level. A per-block **id** has industry precedent; per-block **time** has
none anywhere.

So a span is a local measurement, and the shape now says so:

```ts
segment.meta?.aparte?.startedAt   // was segment.startedAt
segment.meta?.aparte?.endedAt     // was segment.endedAt
```

Still **typed** — `AparteSegmentTiming`, exported. The bag is where it belongs; opacity
was never part of the deal. Namespaced under `aparte` because the rest of `meta` is
yours: a flat `startedAt` there would collide with a key of your own.

**Read it through the helpers and this change costs you nothing.** `segmentDuration()`
and `isSegmentSettled()` keep their signatures, and `segmentTiming(segment)` is new for
the two numbers themselves. All three are exported, and all three are the rules core uses
rather than a copy of them — the vanilla example needed no code change at all.

**The one thing to know if you write `meta` yourself:** `updateSegment(id, { meta })` now
**merges** instead of replacing. That is not a convenience, it is the whole risk of
putting two writers in one bag — a plain spread from either side would erase the other,
and your first `{ meta: { cost } }` would have silently deleted core's measurement. One
helper does the merge and all three update sites go through it.

Also: a `setSegmentDefaults()` default may fill `meta` but **not `meta.aparte`** — those
fields stopped being reserved as fields and became reserved as a sub-object, or a default
could hand an app a span it never measured.

**Migration.** Replace `segment.startedAt` / `segment.endedAt` with
`segmentTiming(segment)?.startedAt` / `?.endedAt`, or better, with `segmentDuration()`.
If you persist segments, your stored `startedAt`/`endedAt` are no longer read: move them
under `meta.aparte` when you load.
