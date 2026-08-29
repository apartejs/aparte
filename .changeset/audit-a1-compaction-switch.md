---
"@aparte/plugin-compaction": patch
---

A compaction that finishes after the conversation was switched is now refused instead of writing the old summary over the new transcript.

A summarisation is a model call, so seconds pass between reading the transcript and replacing it. If the user switched conversation in that window, the plugin emptied whatever was on screen and appended the summary of the conversation they had left, plus the turns it had selected there — over conversation B, reported as `ok: true`, and persisted with B by whatever storage the host had wired. A user-pressed abort was the only thing that stopped it.

The check is the cheapest one that says "this is not the transcript I read": if not one selected turn is still on the target when the model answers, the whole active path was replaced (a conversation switch, a reset), and the compaction returns `{ ok: false, error: 'The transcript changed while the summary was being written' }` with the matching `aparte-compact-error`. A transcript that merely changed — a turn deleted, turns appended meanwhile — is not affected: one surviving selected turn is enough, and what arrived is still kept, exactly as before. `CompactionSkipReason` is unchanged; this is a failure, not a skip.
