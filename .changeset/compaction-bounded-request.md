---
'@aparte/plugin-compaction': minor
---

The summary request is now bounded: streamed, capped by `maxTokens`, refused without a known window, trimmed to fit, and a summary that is cut off, failed or no shorter than what it replaces is refused.

What you may have to change:

- **A model with no `contextWindow` no longer compacts by default.** `setupCompaction()` reports `{ skipped: true, reason: 'no-window' }` (new `CompactionSkipReason`) instead of sending everything but the last four messages in one request. Declare the window on the model, or size the request yourself: passing `keepWithoutWindow` (the opt-in; it keeps today's behaviour), your own `selector` or your own `summarize` is enough.
- **A `summarize` of yours now receives `stream: true` and `maxTokens`** on the request, where it used to receive `stream: false` and no limit. If it forwards the request to a model as is, it now gets a stream back; if it expects a string, set `stream: false` on the request you forward.

What changed, and why. A live test against a local model with a 4096-token window showed the summary request was bounded by nothing:

- The request is streamed and drained strictly. An `error` event fails the compaction with its message instead of applying the text received before it, and a `done` whose `finishReason` is `'length'` fails with "The summary was cut off at the model's length limit". A plain string answer is still the whole summary.
- `request.maxTokens` keeps the answer inside the window: a quarter of the window, at most `reservedGeneration` (2000, the room every request keeps for a reply) and never under the room the window walk holds back for the summary; `reservedGeneration` when there is no window. It is deliberately looser than that reservation (about 118 tokens on a 4096-token model), which a reasoning model spends thinking before it writes a word.
- With a known window and the default summariser, the instruction plus the transcript of the dropped turns must fit the window less `maxTokens`, the reserved thinking and the safety margin. When they do not, the oldest turns that fit are summarised and the rest stay verbatim for the next compaction. If not even the oldest turn fits, the compaction fails with an error instead of sending it.
- A summary whose estimate is not smaller than the turns it replaces fails with "The summary is no shorter than the turns it replaces", and the transcript is left untouched. This one applies to a host's `summarize` too.
