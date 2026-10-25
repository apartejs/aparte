---
'@aparte/core': minor
---

A message can now carry a checkpoint, `contextSummary`: from it on, the model reads the summary in place of every message before it, and nothing before it is deleted. The client sends the checkpointed history on send, retry, edit and resume. Nothing changes for a conversation with no checkpoint.

What is new, all additive:

- `AparteMessage.contextSummary?: AparteContextSummary` (`{ summary, count, createdAt }`, exported as a type). It sits on the first kept message, which is a `user` message, so the history still alternates its roles.
- `AparteMessage.contextEstimate?: number`, the estimate in tokens of the request that produced a reply. Declared here; the client starts writing it in a later change, and the context measure reads it back to calibrate itself.
- `historyFromCheckpoint(path)` returns `{ summary?, messages }`: the messages from the LAST checkpoint on the path, and its summary. A legacy `compaction: true` message before that checkpoint is dropped with the rest. With no checkpoint the path comes back unchanged. It is exported from both entries, so a server or a `history` function can use it.
- `applyRetention` keeps a checkpoint the trim cuts past: the new first message inherits the latest checkpoint's `contextSummary` (same summary and date, `count` raised by the messages cut after it), in the flat list and in the branch tree. Before, a retained conversation lost both the originals and their summary.

What a host that builds its own history should know. A `history` function still receives the full transcript, checkpoint and everything before it; to honour a checkpoint, run the messages through `historyFromCheckpoint` and send its `summary` first (the client sends it as a `user` message under the same preamble a `compaction: true` message gets). The default `'viewport'` history does this itself.

Why. Compaction used to replace the summarised turns with a summary message, so the turns, their attachments and their branches left the screen and the store. A checkpoint turns compaction into a view over a kept history: only what goes to the model is shortened. This change is the data and the history; the plugin that writes checkpoints and the transcript that shows them follow.

How the tree behaves, so a host is not surprised. A checkpoint is a node shared by every path through it. Editing the checkpoint message edits that node in place and keeps the field. Editing a message above it clears everything after the edited message, the checkpoint included, so the full history is sent again. A retry of a reply above the checkpoint forks before it and sends no summary: it would describe messages the model is also reading.
