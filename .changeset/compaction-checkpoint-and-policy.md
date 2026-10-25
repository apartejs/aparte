---
'@aparte/plugin-compaction': minor
---

**Compaction no longer deletes messages, and it is automatic once set up.** A compaction now writes a checkpoint (`contextSummary`) on the first message it keeps, and the history the client sends resumes from it; the messages above stay on the screen and in storage. `setupCompaction()` also compacts by itself: after a turn that ends at 80 % of the window, and before a send whose request would not fit. Pass `auto: false` to keep it manual (the gauge's Compact now, `compact()`, `aparte-compact`).

What you may have to change:

- **A page that only wanted the manual compaction passes `auto: false`.** `auto` defaults to `true`, and is forced to `false` with `listen: false`. It acts only when a summariser can run (a provider registered for the current model, or your `summarize`), and only when a window is known: the model's, or the new `contextWindow` option.
- **A `CompactionTarget` of your own needs `updateMessage(id, updates)`.** It is the one write a compaction makes. Without it the compaction fails with an error that says so, before the model is paid; there is no fallback that rewrites the transcript. `clearAll` and `appendMessage` are no longer called (they stay optional on the type). `<aparte-chat-viewport>` already has `updateMessage`.
- **`DEFAULT_COMPACTION_PROMPT` has a new value** (the name is unchanged). It asks for fixed sections (the goal and constraints, the decisions and why, the open tasks, the facts and tool results still needed, the next step) in the language of the conversation, and keeps the clause that stops the model from answering the transcript. If you pass your own `prompt`, nothing changes for you.
- **`summary` in the outcome and in `aparte-compact-done` is what is stored**: the model's summary, then, on the first compaction of a conversation, the first user message verbatim (clipped at 1 500 characters) under a fixed English line. The conversation's first request survives every compaction.
- **A `selector` you pass receives the model's view** (the messages from the latest checkpoint on, less the turn being prepared), and the cut is moved so the first message kept is a user message: it may keep more than your selector asked for, or skip with `'nothing-to-drop'` when no user message can carry the checkpoint.
- The "notice" message is gone from new compactions: no `compaction: true` message is written, and `compactionSummaryTitle` is no longer used for them (it is still read for old stored conversations).

What is new:

- Options `auto`, `threshold` (default `0.8`) and `contextWindow` (a number, or a function, for a server that does not declare its window). The `window` a context gauge sends with its `aparte-compact` request is read as a last resort for one more release.
- The controller is registered as the config's compactor (`config.setCompactor`) and unregistered by `dispose()`, so the gauge's Compact now, a separator's Retry, the client's pre-flight and its overflow retry all call it. `compact()` takes the compactor request (`{ target, targetId, force, exclude, reason }`) as well as a chat id or nothing, resolves the chat from the element it is given (a chat in a shadow root is found), and a scoped setup refuses a chat outside its scope. New `settled()`, `beforeSend()` and `preview()`.
- A second compaction updates the first: the request carries "Summary so far:" and only the messages since, and asks for an updated summary. The no-gain refusal compares against what is replaced: the earlier summary plus the newly summarised messages.
- Two failures in a row for a chat stop the automatic attempts until something succeeds, a person asks (`reason: 'manual'` or `'retry'`, or a request without `auto`), or the conversation is switched; an overflow always runs. After a compaction that still leaves the context at the threshold, nothing automatic runs until another turn completes, and never the same range twice. A Restore suspends the automatic attempts for that chat until a person asks again.
- `createCompactionSelector` takes an optional `estimate(message)`. The selector `setupCompaction` builds uses core's `estimateWireTokens`, so it prices what the wire sends (a reply's hidden thinking costs nothing).
- `CompactionOutcome` is core's `AparteCompactorOutcome`; `CompactionController` extends core's `AparteCompactor`. Both gain `messageId` and `count`. The `aparte-compact-start`, `-done` and `-error` events carry the `messageId` the checkpoint sits on.

The checkpoint is the plugin's half of core's `contextSummary`, `historyFromCheckpoint` and `setCompactor`; the separator that draws it, and the history that resumes from it, are core's.
