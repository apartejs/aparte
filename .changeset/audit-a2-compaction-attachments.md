---
"@aparte/plugin-compaction": patch
---

Images and files on the turns a compaction keeps no longer come back broken in `<aparte-chat>` and `<aparte-chat-viewport>`.

A compaction empties the transcript and puts the kept turns straight back. But `<aparte-chat-viewport>.clearAll()` releases the `blob:` object URL of every attachment it drops — a deliberate leak fix — so the very messages being re-appended came back with dead URLs: every image and file chip on a surviving turn, and on anything that arrived while the summary was being written.

The compaction now clears with `{ revokeAttachments: false }` and releases the URLs itself, afterwards, for the summarised-away turns alone. `CompactionTarget.clearAll` accordingly takes an optional `{ revokeAttachments?: boolean }`; a target of your own may ignore it and keeps working.

Under the React, Vue, Svelte and Angular wrappers the transcript the plugin resolves is the wrapper's own root element, whose `clearAll` bridge takes no argument and therefore still revokes what it drops. That half is a `@aparte/core` change and lands separately; until it does, the fix reaches the two element paths above.

The existing suite could not see this: its target is a plain array whose `clearAll` only empties it. The new test drives a real `<aparte-chat-viewport>`.
