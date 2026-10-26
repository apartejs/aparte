---
'@aparte/core': minor
---

A message that carries a checkpoint (`contextSummary`) now shows a separator above it: "12 messages summarised for the model · Show summary · Restore". The messages above it stay on screen and in storage. Restore takes the checkpoints off and the model reads the original messages again.

What you may have to change:

- **A message written by an older compaction (`compaction: true`) is no longer drawn as a muted bubble.** The bubble draws the separator in its place ("Earlier messages were summarised", with Show summary, and no count or Restore), and its own row does not paint. If your CSS targeted `aparte-chat-bubble[data-kind="compaction"]` for the old dashed notice, those rules no longer match anything visible; the `data-kind` attribute is still written.
- **A custom bubble renders its own separator.** The separator belongs to `<aparte-chat-bubble>`; a `renderBubble` (React), `bubble` slot (Vue, Svelte) or `bubbleTemplate` (Angular) that draws its own markup must read `message.contextSummary` itself.

What is new, all additive:

- `<aparte-chat-bubble>.setContextSummary(summary | null, { legacy? })`, and `SyncableBubble.setContextSummary`, which `populateBubbleFromMessage` calls for every message (with none, too, so a reused bubble loses its separator). The separator sits outside `.aparte-message`, inside the bubble, so a frame redraw or a custom shell keeps it.
- States, driven by the compaction events: while a summary is written the separator says "Summarising the context…" (the shimmer recipe); if it fails it says "Couldn't summarise the context" with Retry, which asks the chat's registered compactor (`force`, reason `'retry'`) and falls back to dispatching `aparte-compact` when none is registered. The viewport (and, under a wrapper, the framework host) reads `aparte-compact-start`, `-done` and `-error`, acts only on those that name its own chat and a message of its own transcript (an untargeted event, which every chat receives, is checked against the message), and sets `data-checkpoint="pending"` or `"failed"` on the bubble whose id is `detail.messageId`. A `-done` for that message clears it; a skipped `-done`, another message's id and another chat's events are ignored; the next `-start` and a conversation switch clear it. The new `data-checkpoint` attribute is read-only for you.
- Restore asks "Send the original messages to the model again?" first. It then removes `contextSummary` from every message of the active path (through the chat's own `updateMessage`, so a framework's list and your storage see it) and dispatches `aparte-compact-done` with `restored: true`.
- Event details gain optional fields: `aparte-compact-start` `{ messageId }`, `aparte-compact-done` `{ messageId, count, restored }`, `aparte-compact-error` `{ messageId }`. `@aparte/plugin-compaction` dispatches them.
- The conversation is saved when a compaction finishes, once the message named by `messageId` carries its checkpoint, and again after a Restore. A host that still writes a `compaction: true` message keeps the old behaviour.
- Ten optional locale keys: `checkpointCount` (`{n}`), `checkpointCountOne`, `checkpointLegacy`, `checkpointGroup`, `checkpointShow`, `checkpointHide`, `checkpointRestore`, `checkpointRestoreConfirm`, `checkpointPending`, `checkpointFailed`. Retry and Cancel reuse the existing `retry` and `cancel`. A locale without them falls back to the built-in English.
- A new sheet, `styles/components/checkpoint.css` (`aparte-checkpoint…` classes), wearing the divider, ghost button and shimmer recipes.

Why. The compaction plugin used to replace the summarised turns with a summary message, so the turns left the screen. With a checkpoint over a kept history the reader sees everything they wrote and one line saying what the model no longer reads; Restore is the way back.

Detail for the curious. `--aparte-message-content-text-user` and `-assistant` were declared only by the old notice's rule; they are now declared as `initial` on the root, which reads as unset exactly as before. The viewport's `renderable` list gained `contextSummary` and `compaction`; the framework host's `updateMessage` now reaches the bubble of a message that is not the last for `content`, `segments`, `attachments`, `usage`, `finishReason`, `contextSummary` and `compaction`, where it used to stay in the list until the next full sync.

Also in the separator. Confirming Restore removes the separator while its button holds the keyboard; the focus moves to the message the checkpoint sat on rather than falling to the page. A second failure with a different reason redraws the separator with the new reason. The summary panel wears the prose rules (`aparte-segment-content`), so lists, quotes, links and code in a Markdown summary are drawn like the rest of the transcript.
