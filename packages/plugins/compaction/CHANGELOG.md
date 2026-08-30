# @aparte/plugin-compaction

## 0.16.5

## 0.16.4

## 0.16.3

## 0.16.2

## 0.16.1

### Patch Changes

- 2763490: The summarisation instruction now travels in the ask itself instead of a `system` message, so a provider that imposes its own system prompt can no longer drop it.

  A provider serving a local model under a fixed training contract replaces the request's `system` message with its own — legitimately. When it did, the instruction never reached the model, nothing errored, and the model answered a bare "Please summarize this conversation." after somebody else's persona. Measured by a consumer on three transcripts: one reply refused for want of internet access, one said "noted, I'll do it", and one invented figures for a client that appears nowhere in the transcript — which the plugin then wrote back as the summary notice, making the invention the premise of every turn that followed.

  The instruction is not a persona: it is the task of that one request, and it now sits where every provider must look. Nothing changes for a provider that honoured the system message, `prompt` and `DEFAULT_COMPACTION_PROMPT` are unchanged, and `summarize` still bypasses the transport entirely.

- 77fd6fa: The default summarisation prompt now forbids continuing the conversation. `DEFAULT_COMPACTION_PROMPT` gains one sentence — _"Do not continue the conversation, do not answer a question it contains and do not call a tool: reply with the summary and nothing else."_ Nothing to change unless you pass a `prompt` of your own, in which case add a clause like it.

  Why it matters now: the instruction rides the final `user` turn, which is also where a reply to the conversation would go. A model handed a transcript that ends in a question has two plausible things to do — summarise it, or answer it — and the answer is what gets written back as the summary notice, becoming the premise of every following turn.

  The clause is not invented here. Of sixteen implementations surveyed, every one that puts its instruction in the user turn carries such a clause, and one inserts a fake assistant turn on top of it. Ours ended at "No preamble."

## 0.16.0

### Minor Changes

- 59016b1: New package: `@aparte/plugin-compaction` — conversation compaction. `setupCompaction(options, config)` answers the `aparte-compact` command (`<aparte-context auto-compact>` dispatches it on reaching 90 % of the window; a button of yours dispatches it the same way): it selects what to summarise — by default the budget-aware selector over the current model's `contextWindow`, system prompt and tools, keeping the newest turns that still fit, or the last two exchanges when the model declares no window — summarises it through the config's transport with its tool calls and errors, and replaces the transcript with the summary as a notice (`compaction: true`) followed by the kept turns verbatim. The controller it returns has `compact(targetId?)` (returns the outcome, never throws), `abort()`, `running` and `dispose()`.

  Options: `selector`, `keepWithoutWindow`, `prompt`, `keyResolver` (the one you gave `AparteClient`), `summarize` (replace the model call — your endpoint, a cheaper model), `resolveTarget` (a transcript in a store), `scopeToTargetId`, `listen`. Exports besides: `createCompactionSelector`, `computeHistoryBudget`, `splitHistoryBudget`, `estimateTokens`, `estimateTokensJson`, `DEFAULT_COMPACTION_CONFIG`, `transcriptForSummary`, `messageText`, `DEFAULT_COMPACTION_PROMPT` — the budget and selector that used to be `@aparte/engine`'s, and the summariser that used to be `AparteClient.compact()`.

  What is new against the client's version: one compaction at a time (a second request is reported `skipped`, `reason: 'running'`); a transcript with a turn in flight is left alone (`reason: 'streaming'`); the summarisation has its own abort, reached by `abort()` and by an `aparte-abort` addressed to the chat, and an abort settles the compaction even when the transport ignores the signal; what arrived while the summary was being written is kept; every event names the chat. The placement follows the survey: no UI kit compacts, every agent SDK ships it as an opt-in module — the seams (the gauge, the notice, the preamble, the request flag) stay in core, the behaviour is one call away.

### Patch Changes

- ec4b2a5: A compaction whose summary arrives after the conversation was switched is refused: the summary never lands on the transcript the user moved to.

  A summarisation is a model call, so seconds pass between reading the transcript and replacing it. If the user switched conversation in that window, the plugin emptied whatever was on screen and appended the summary of the conversation they had left, plus the turns it had selected there — over conversation B, reported as `ok: true`, and persisted with B by whatever storage the host had wired. A user-pressed abort was the only thing that stopped it.

  The check is the cheapest one that says "this is not the transcript I read": if not one selected turn is still on the target when the model answers, the whole active path was replaced (a conversation switch, a reset), and the compaction returns `{ ok: false, error: 'The transcript changed while the summary was being written' }` with the matching `aparte-compact-error`. A transcript that merely changed — a turn deleted, turns appended meanwhile — is not affected: one surviving selected turn is enough, and what arrived is still kept, exactly as before. `CompactionSkipReason` is unchanged; this is a failure, not a skip.

- ec4b2a5: A compaction keeps the images and files on the turns it re-appends, and releases the object URLs of the summarised-away turns only.

  A compaction empties the transcript and puts the kept turns straight back. But `<aparte-chat-viewport>.clearAll()` releases the `blob:` object URL of every attachment it drops — a deliberate leak fix — so the very messages being re-appended would come back with dead URLs: every image and file chip on a surviving turn, and on anything that arrived while the summary was being written.

  The plugin clears with `{ revokeAttachments: false }` and releases the URLs itself, afterwards, for the summarised-away turns alone. `CompactionTarget.clearAll` accordingly takes an optional `{ revokeAttachments?: boolean }`; a target of your own may ignore it and keeps working.

  This holds on all four paths: `<aparte-chat>`, `<aparte-chat-viewport>`, and — under React, Vue, Svelte and Angular — the wrapper's own root element, whose `clearAll` bridge carries the option through to the viewport (a `@aparte/core` change, shipped in the same commit).

  The plugin's own suite could not see this: its target is a plain array whose `clearAll` only empties it. The test that catches it drives a real `<aparte-chat-viewport>`.

- ec4b2a5: A compaction summarises every assistant turn it drops, including the turns a host appended with no `status` at all.

  The summarisation request was built from a hand-written clause that demanded `status: 'completed'` on an assistant turn. A host that appends its own messages sets no status at all — the shape the guides teach — so its replies were deleted by the compaction without ever reaching the summariser: the user's questions survived in the summary, every answer to them was gone. The filter is now the `inFlight` predicate `compact()` already guards the whole transcript with, so the two cannot disagree. A reply that ended in an error is carried too: the user read it, and it is about to be deleted.

  Related: a compaction whose dropped turns say nothing at all now fails with `Nothing summarisable in the dropped turns` before the model call, rather than paying for a summary of an empty transcript and replacing the conversation with the answer.
