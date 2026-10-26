# @aparte/plugin-compaction

Conversation **compaction** for [aparté](https://github.com/apartejs/aparte): when a conversation
outgrows the model's window, summarise the older turns for the model and keep the recent ones
verbatim — without deleting anything. Nothing in core compacts by itself — no UI kit does, and
every agent SDK ships it as an opt-in module — so this is where it lives.

```bash
npm install @aparte/plugin-compaction @aparte/core
```

```ts
import { setupCompaction } from '@aparte/plugin-compaction';

const compaction = setupCompaction();   // the global config, the current model's window
```

That is the whole wiring. The plugin registers itself as the config's compactor and decides on
its own: after a turn that leaves the conversation past 80 % of the window (`threshold`), and
before a send whose request would not fit (the turn waits, Stop cancels both), and when the
model refuses a request as over its window (it compacts and sends the turn once more).

A compaction aims **below** the threshold, not at it: the history the model reads afterwards
lands at about `threshold − 0.2` of the window, less the fixed costs (system prompt, tools, the
room for the reply, the summary's slot), so one summary buys several turns instead of being asked
for again after the next. The selection is made in the model's own tokens (the character
heuristic's undercount is calibrated from the last reply, as the context gauge does) and leaves
room for the turn being prepared, so a long paste is made room for. A `selector` of your own is
called with the messages alone and is left as it is. Each chat compacts on its own: a summary
being written for one does not hold up another. A Restore cancels a summary still being written
for that chat (with `listen: false`, which hears no window event, the summary is refused when it
comes back instead), and Stop cancels it in every case.

A compaction **writes a checkpoint, it deletes nothing**. The summary goes on the first turn it
keeps — `contextSummary: { summary, count, createdAt }`, saved with the conversation — and the
history the model receives starts there, the summary first. Every message stays on screen and
in storage; the bubble draws a separator above that turn ("12 messages summarised for the
model", Show summary, Restore), and Restore sends the original messages to the model again.

```ts
await compaction.compact('main-chat');   // on demand; returns the outcome, never throws
compaction.abort();                      // the summary in flight; the conversation is untouched
compaction.running;                      // true meanwhile
compaction.dispose();                    // remove the listeners and the compactor
```

**The summary** is asked of the current model through the config's transport: streamed, with a
`maxTokens` that keeps the answer inside the window and `_meta: { compaction: true }`, so a
backend can route it to a cheaper model. The default prompt asks for fixed sections in the
conversation's language; a second compaction updates the summary rather than summarising a
summary; the first request is kept word for word. A summary cut off at the length limit, ending
in an error, or no shorter than what it replaces is refused and the conversation stays as it
was. With **no** window on the model (and no `contextWindow` option) nothing says what fits, so
the default skips with `'no-window'`.

**Options** — `auto` (default `true`; `false` is **manual only**: only a person's request compacts —
Compact now, Retry, `compact()`, `aparte-compact` — and neither the after-turn, the before-send nor
the overflow attempt is made, so a model's overflow error stands as it did before the plugin; so
does `listen: false`), `threshold` (default `0.8`), `contextWindow` (the window when the model declares none),
`selector` (your own `(messages) => { keep, drop }`; `createCompactionSelector` builds the
budget-aware one), `prompt`, `keyResolver`, `summarize` (replace the model call: your endpoint, a
cheaper model), `resolveTarget` (a transcript in a store: `{ getMessages, updateMessage }`),
`scopeToTargetId` (one setup per chat on a multi-chat page), `keepWithoutWindow`, `listen`. The
config comes last, like every `setup*`: `setupCompaction(options, config)`.

**Events**, on `window`, each naming the chat and the message the checkpoint sits on:
`aparte-compact-start`, `aparte-compact-done` (`{ summary, kept, dropped, count }`, `{ skipped:
true, reason }` — `empty`, `nothing-to-drop`, `running`, `streaming`, `no-window` — or `{ restored:
true }`), `aparte-compact-error` (`{ error }`).

**The budget**, exported for a host that wants the numbers: `computeHistoryBudget`,
`splitHistoryBudget`, `estimateTokens`, `estimateTokensJson`, `DEFAULT_COMPACTION_CONFIG`; and
`transcriptForSummary` / `messageText` / `DEFAULT_COMPACTION_PROMPT` for a `summarize` of your
own that wants the same transcript.

`@aparte/core` is the only **peer dependency**. No element, no DOM at import: the same entry
serves the browser and Node.

> ESM-only. Part of the aparté monorepo.
