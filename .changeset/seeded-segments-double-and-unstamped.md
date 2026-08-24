---
'@aparte/core': patch
---

**Fix: a message appended with its segments already populated wrote every streamed chunk twice, and its segments were never stamped.**

`appendMessage({ …, segments: [...] })` is a real path — a conversation restored from
storage, a prefix an app injects, `setMessages()` — and it went around two earlier
fixes.

**The doubling.** Streaming into such a segment produced
`"ThatThat  deletesdeletes  aa  filefile"`, in the message model and on screen.
`populateBubbleFromMessage` handed the repository's own `segments` array to
`bubble.setSegments()`, which stored it **by reference** while `getSegments()` had
always copied on the way out. One array, two writers: the viewport replaced the slot
with `{...segment, content: old + chunk}`, then the bubble looked the segment up in
what it believed was its own list, found that replacement — chunk already in it — and
appended the chunk again.

This is the same failure as the `appendToSegment` fix in 0.4.0, which resolved it for
`addSegment` (where it cannot happen: the bubble pushes into a list it created itself,
so the viewport's replacement decouples the two immediately). Its regression tests all
drive `addSegment`, so this path stayed broken for exactly the reason that changelog
entry gave for why nothing had caught it the first time — the tests went around it.
`setSegments` now copies the array in, which covers every path through
`populateBubbleFromMessage` from its single production caller.

**The missing stamps.** `messageId`, `index` and `startedAt` — shipped in 0.9.0 — were
written only by `addSegment`, so a segment arriving with its message had none of them.
The same field was present on one path and absent on the other, silently, and anything
reading them had to cope with both. Seeded segments now go through the same
`stampSegmentOnInsert` seam, accumulated into a new array so `index` follows position
and the caller's array is no longer retained. Values already present are never
overwritten, so a conversation reloaded from storage keeps the numbers it stored.

The bubble is also handed the stamped copy rather than the caller's object: it was
rendering segments with no `index` or `startedAt` while the model held stamped ones.

Six regression tests, each seen to fail: reverting the copy reddens the exact-text and
`setMessages` cases, and reverting the stamping reddens the identity, position and
object-sharing cases.

**Known and not changed here:** `AparteChatHost` (the framework-managed owner) stamps
on `addSegment` but not on segments that arrive with a message, because that array
belongs to the framework's own state — copying and stamping it is a decision about
ownership, not a bug fix, and it deserves its own change.
