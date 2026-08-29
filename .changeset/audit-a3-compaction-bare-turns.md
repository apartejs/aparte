---
"@aparte/plugin-compaction": patch
---

A compaction summarises every assistant turn it drops, including the turns a host appended with no `status` at all.

The summarisation request was built from a hand-written clause that demanded `status: 'completed'` on an assistant turn. A host that appends its own messages sets no status at all — the shape the guides teach — so its replies were deleted by the compaction without ever reaching the summariser: the user's questions survived in the summary, every answer to them was gone. The filter is now the `inFlight` predicate `compact()` already guards the whole transcript with, so the two cannot disagree. A reply that ended in an error is carried too: the user read it, and it is about to be deleted.

Related: a compaction whose dropped turns say nothing at all now fails with `Nothing summarisable in the dropped turns` before the model call, rather than paying for a summary of an empty transcript and replacing the conversation with the answer.
