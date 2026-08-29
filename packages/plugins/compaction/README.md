# @aparte/plugin-compaction

Conversation **compaction** for [aparté](https://github.com/apartejs/aparte): summarise the turns
that no longer fit the model's window, keep the recent ones verbatim, and answer the context
gauge's `aparte-compact`. Nothing in core compacts by itself — no UI kit does, and every agent
SDK ships it as an opt-in module — so this is where it lives.

```bash
npm install @aparte/plugin-compaction @aparte/core
```

```ts
import { setupCompaction } from '@aparte/plugin-compaction';

const compaction = setupCompaction();   // the global config, the current model's budget
```

```html
<aparte-composer-toolbar>
  <!-- asks for a compaction on reaching 90 % of the window; the plugin answers -->
  <aparte-context auto-compact style="flex: 1"></aparte-context>
</aparte-composer-toolbar>
```

That is the whole wiring. A compaction resolves the chat, selects what to summarise —
by default the budget-aware selector over the current model's `contextWindow`, the system
prompt and the tools, keeping the newest turns that still fit; the last two exchanges when
the model declares no window — summarises it through the config's transport (the request
carries `_meta: { compaction: true }`, so a backend can route it to a cheaper model), then
puts back the summary as a **notice** (`compaction: true` — centred, no avatar, no actions;
sent to the model under a preamble saying what it is) followed by the kept turns verbatim.

```ts
await compaction.compact();          // or from a button; returns the outcome, never throws
compaction.abort();                  // the summarisation in flight; the transcript is untouched
compaction.running;                  // true meanwhile
compaction.dispose();                // remove the listeners
```

**Options** — `selector` (your own `(messages) => { keep, drop }`; `createCompactionSelector`
builds the budget-aware one over a window you choose), `prompt` (the summariser's
instruction), `keyResolver` (the resolver you gave `AparteClient`, when the key is not on the
config), `summarize` (replace the model call entirely: your endpoint, a cheaper model),
`resolveTarget` (a transcript that lives in a store rather than in the DOM),
`scopeToTargetId` (one setup per chat on a multi-chat page), `keepWithoutWindow`, `listen`.
The config comes last, like every `setup*`: `setupCompaction(options, config)`.

**Events**, on `window`, each naming the chat: `aparte-compact-start`, `aparte-compact-done`
(`{ summary, kept, dropped }`, or `{ skipped: true, reason }` — `empty`, `nothing-to-drop`,
`running`, `streaming`), `aparte-compact-error` (`{ error }`).

**The budget**, exported for a host that wants the numbers: `computeHistoryBudget`,
`splitHistoryBudget`, `estimateTokens`, `estimateTokensJson`, `DEFAULT_COMPACTION_CONFIG`;
and `transcriptForSummary` / `messageText` / `DEFAULT_COMPACTION_PROMPT` for a `summarize`
of your own that wants the same transcript.

`@aparte/core` is the only **peer dependency**. No element, no DOM at import: the same entry
serves the browser and Node.

> ESM-only. Part of the aparté monorepo.
