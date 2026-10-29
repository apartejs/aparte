# @aparte/plugin-compaction

## 0.28.2

### Patch Changes

- 2d108c1: The npm page of each of these packages now links to its docs page; nine of them pointed at `/plugins/…` addresses that only redirect since the docs moved, and `docs-mcp` pointed at the site's home.

## 0.28.1

## 0.28.0

## 0.27.4

## 0.27.3

## 0.27.2

## 0.27.1

## 0.27.0

## 0.26.0

### Minor Changes

- d68ace6: The summary request is now bounded: streamed, capped by `maxTokens`, refused without a known window, trimmed to fit, and a summary that is cut off, failed or no shorter than what it replaces is refused.

  What you may have to change:

  - **A model with no `contextWindow` no longer compacts by default.** `setupCompaction()` reports `{ skipped: true, reason: 'no-window' }` (new `CompactionSkipReason`) instead of sending everything but the last four messages in one request. Declare the window on the model, or size the request yourself: passing `keepWithoutWindow` (the opt-in; it keeps today's behaviour), your own `selector` or your own `summarize` is enough.
  - **A `summarize` of yours now receives `stream: true` and `maxTokens`** on the request, where it used to receive `stream: false` and no limit. If it forwards the request to a model as is, it now gets a stream back; if it expects a string, set `stream: false` on the request you forward.

  What changed, and why. A live test against a local model with a 4096-token window showed the summary request was bounded by nothing:

  - The request is streamed and drained strictly. An `error` event fails the compaction with its message instead of applying the text received before it, and a `done` whose `finishReason` is `'length'` fails with "The summary was cut off at the model's length limit". A plain string answer is still the whole summary.
  - `request.maxTokens` keeps the answer inside the window: a quarter of the window, at most `reservedGeneration` (2000, the room every request keeps for a reply) and never under the room the window walk holds back for the summary; `reservedGeneration` when there is no window. It is deliberately looser than that reservation (about 118 tokens on a 4096-token model), which a reasoning model spends thinking before it writes a word.
  - With a known window and the default summariser, the instruction plus the transcript of the dropped turns must fit the window less `maxTokens`, the reserved thinking and the safety margin. When they do not, the oldest turns that fit are summarised and the rest stay verbatim for the next compaction. If not even the oldest turn fits, the compaction fails with an error instead of sending it.
  - A summary whose estimate is not smaller than the turns it replaces fails with "The summary is no shorter than the turns it replaces", and the transcript is left untouched. This one applies to a host's `summarize` too.

- 62c70d4: **Compaction no longer deletes messages, and it is automatic once set up.** A compaction now writes a checkpoint (`contextSummary`) on the first message it keeps, and the history the client sends resumes from it; the messages above stay on the screen and in storage. `setupCompaction()` also compacts by itself: after a turn that ends at 80 % of the window, before a send whose request would not fit, and when the model refuses a request as over its window (the turn is sent once more). Pass `auto: false` to keep it manual only (the gauge's Compact now, a separator's Retry, `compact()`, `aparte-compact`): none of the three automatic attempts is made, the overflow retry included.

  What you may have to change:

  - **A page that only wanted the manual compaction passes `auto: false`.** `auto` defaults to `true`, and is forced to `false` with `listen: false`. `auto: false` means manual only: `compact()` answers an `'auto'` or `'overflow'` request with a skip (`'nothing-to-drop'`), so the model's overflow error stands as it did before the plugin. It acts only when a summariser can run (a provider registered for the current model, or your `summarize`), and only when a window is known: the model's, or the new `contextWindow` option.
  - **A `CompactionTarget` of your own needs `updateMessage(id, updates)`.** It is the one write a compaction makes. Without it the compaction fails with an error that says so, before the model is paid; there is no fallback that rewrites the transcript. `clearAll` and `appendMessage` are no longer called (they stay optional on the type). `<aparte-chat-viewport>` already has `updateMessage`.
  - **`DEFAULT_COMPACTION_PROMPT` has a new value** (the name is unchanged). It asks for fixed sections (the goal and constraints, the decisions and why, the open tasks, the facts and tool results still needed, the next step) in the language of the conversation, and keeps the clause that stops the model from answering the transcript. If you pass your own `prompt`, nothing changes for you.
  - **`summary` in the outcome and in `aparte-compact-done` is what is stored**: the model's summary, then, on the first compaction of a conversation, the first user message verbatim (clipped at 1 500 characters) under a fixed English line. The conversation's first request survives every compaction.
  - **A `selector` you pass receives the model's view** (the messages from the latest checkpoint on, less the turn being prepared), and the cut is moved so the first message kept is a user message: it may keep more than your selector asked for, or skip with `'nothing-to-drop'` when no user message can carry the checkpoint.
  - The "notice" message is gone from new compactions: no `compaction: true` message is written, and the `compactionSummaryTitle` locale key is no longer read (old stored conversations keep the title inside their summary message, and are drawn as a separator).

  What is new:

  - Options `auto`, `threshold` (default `0.8`) and `contextWindow` (a number, or a function, for a server that does not declare its window). `threshold` is also what a compaction aims below: with the default selector it leaves the history the model reads at about `threshold − 0.2` of the window, less the fixed costs (system prompt, tools, the reply's room, the summary's slot), so one compaction buys several turns. That holds for a person's request and an overflow retry too, and a `selector` of your own is left alone. The `window` a context gauge sends with its `aparte-compact` request is read as a last resort for one more release.
  - The controller is registered as the config's compactor (`config.setCompactor`) and unregistered by `dispose()`, so the gauge's Compact now, a separator's Retry, the client's pre-flight and its overflow retry all call it. `compact()` takes the compactor request (`{ target, targetId, force, exclude, reason }`) as well as a chat id or nothing, resolves the chat from the element it is given (a chat in a shadow root is found), and a scoped setup refuses a chat outside its scope. New `settled()`, `beforeSend()` and `preview()`.
  - A second compaction updates the first: the request carries "Summary so far:" and only the messages since, and asks for an updated summary. The no-gain refusal compares against what is replaced: the earlier summary plus the newly summarised messages.
  - Two failures in a row for a chat stop the automatic attempts until something succeeds, a person asks (`reason: 'manual'` or `'retry'`, or a request without `auto`), or the conversation is switched; with automatic compaction on, an overflow is still compacted and resent. After a compaction that still leaves the context at the threshold, the after-turn trigger waits until a turn ends below it (a request that would not fit is still compacted before it goes out), and never the same range twice. A Restore suspends the automatic attempts for that chat until a person asks again.
  - `createCompactionSelector` takes an optional `estimate(message)`. The selector `setupCompaction` builds uses core's `estimateWireTokens`, so it prices what the wire sends (a reply's hidden thinking costs nothing). The selector it returns takes an optional second argument, `CompactionLimits` (`scale`, `reserve`, `landAt`, `ceiling`), which the default selector is called with on each compaction: the heuristic's undercount as the context measure calibrates it (the selection, the summary request's size and the pre-send comparison all use it), room for the turn being prepared, the share of the window to land at, and, after an overflow, a ceiling below what failed.
  - Chats compact independently: a summary being written for one chat no longer skips another's pre-send compaction or overflow retry. `settled()`, `beforeSend()` and an overflow wait for their own chat's summary only; `running` and `abort()` cover every chat of the setup.
  - A Restore cancels a summary still being written for that chat, and a summary is refused when the checkpoint it updates was taken off meanwhile, so a Restore is not undone seconds later.
  - The compactor request's `signal` (and `beforeSend`'s) cancels the chat's summary: a Stop, or a programmatic `stop()`, no longer pays for a summary whose turn is gone, whether or not the setup listens on `window`. It is not counted as a failure.
  - The summary request alternates roles: adjacent turns of one role are merged and the ask joins a trailing user turn, so a strict chat template (Mistral, Gemma on llama.cpp or LM Studio) no longer refuses it. An inline `<think>…</think>` block (or one left open, or a closing tag alone) is stripped from the summary before it is stored.
  - `CompactionOutcome` is core's `AparteCompactorOutcome`; `CompactionController` extends core's `AparteCompactor`. Both gain `messageId` and `count`. The `aparte-compact-start`, `-done` and `-error` events carry the `messageId` the checkpoint sits on.

  The checkpoint is the plugin's half of core's `contextSummary`, `historyFromCheckpoint` and `setCompactor`; the separator that draws it, and the history that resumes from it, are core's.

### Patch Changes

- 37b82d9: `estimateTokens` now comes from `@aparte/core`. The plugin re-exports it under the same name, so nothing changes for you.

  The gauge and the plugin used to keep their own copy of the character heuristic; core's `measureContext` reads one, and the plugin's budget now reads that one too. The function and its result are the same: `ceil(characters / 3.8)`.

## 0.25.0

## 0.24.0

## 0.23.0

## 0.22.0

## 0.21.0

## 0.20.0

### Patch Changes

- 86bf359: With a global compaction setup and a chat's own setup on one page, each chat is now summarised once, by the setup on its own configuration; an instance setup no longer answers a chat on the global configuration when a global setup exists.

  An unscoped setup on a configuration of its own answered every chat that resolved the global configuration too, so a global chat got two summaries, one from the wrong model. A chat is now answered by its own configuration's setup, and only when that configuration has none by another.

  Two cases follow the same rule: a chat a setup is scoped to (`scopeToTargetId`) is answered by that setup alone, and a chat that is not on the page (a transcript in a store) is answered by the setup whose own `resolveTarget` knows it. A request for a chat that no setup knows is still answered by one, which reports the chat it could not find. With no setup on the global configuration, a chat on it is answered by the first setup that answers for a whole configuration, no longer by each of them.

## 0.19.3

## 0.19.2

## 0.19.1

## 0.19.0

## 0.18.0

### Minor Changes

- 3776dfc: The model now remembers what its tools returned: each turn's history carries the tool calls and their results, not only the text. **If you serialize the history yourself** — a backend of your own that does not go through an aparté provider or `toModelMessages` — it now contains assistant messages with `toolCalls` and `role: 'tool'` messages, the shapes a tool round trip already used inside one turn: map them, or drop both. Through an aparté provider there is nothing to do. Requests grow on tool-heavy conversations; `@aparte/plugin-compaction` now counts those calls when it measures a conversation, and summarises long ones as before.

  Until now `AparteClient` sent user and assistant text alone, so a `read_file` result was on screen and gone from the model's context one turn later — "what did the file say?" had no answer. A reply is now sent in the order it was shown: the text before some calls and those calls as an assistant message, each call's result as a `tool` message, the text after them as the next assistant message. Every call is answered, because providers reject a call left without one: a refused call sends its reason, a failed one its error line, a stopped one "The tool call was stopped before it ran." Send, retry and edit build the history through the same function, so they cannot disagree. The compactor's selector used to count a tool call as free (it has no `content`); it now costs what its arguments and result send the model.

## 0.17.3

## 0.17.2

## 0.17.1

## 0.17.0

## 0.16.11

## 0.16.10

## 0.16.9

### Patch Changes

- a78320a: `summaryMaxTokens` reserves room in the window budget; it never truncated the summary and no longer claims to.

  Its JSDoc read "Hard cap for summary tokens" and `summaryRatio`'s read "Ratio of history budget allocated to the summary block", so both described a bound on the text a summariser returns. `splitHistoryBudget` uses them for one thing: `summary = min(summaryMaxTokens, budget × summaryRatio)`, and that number is subtracted from the verbatim window. Nothing measures a summary against it and nothing clips one — a summariser that overruns simply costs the turn more than the split assumed, silently, which is the failure mode a reader trusting the word "cap" would never look for.

  Words only: `splitHistoryBudget`, the defaults and the numbers are untouched. If you need a real bound, clip inside your own `summarize`.

## 0.16.8

## 0.16.7

### Patch Changes

- 9df0877: Every package names its documentation page (`homepage`) — nothing in the code changes.

  npm shows the link first on each package page; none of the twenty had one. Each now
  points at its own docs page, verified live before it was written.

## 0.16.6

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
