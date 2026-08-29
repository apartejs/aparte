---
"@aparte/plugin-compaction": patch
---

A compaction keeps the images and files on the turns it re-appends, and releases the object URLs of the summarised-away turns only.

A compaction empties the transcript and puts the kept turns straight back. But `<aparte-chat-viewport>.clearAll()` releases the `blob:` object URL of every attachment it drops — a deliberate leak fix — so the very messages being re-appended would come back with dead URLs: every image and file chip on a surviving turn, and on anything that arrived while the summary was being written.

The plugin clears with `{ revokeAttachments: false }` and releases the URLs itself, afterwards, for the summarised-away turns alone. `CompactionTarget.clearAll` accordingly takes an optional `{ revokeAttachments?: boolean }`; a target of your own may ignore it and keeps working.

This holds on all four paths: `<aparte-chat>`, `<aparte-chat-viewport>`, and — under React, Vue, Svelte and Angular — the wrapper's own root element, whose `clearAll` bridge carries the option through to the viewport (a `@aparte/core` change, shipped in the same commit).

The plugin's own suite could not see this: its target is a plain array whose `clearAll` only empties it. The test that catches it drives a real `<aparte-chat-viewport>`.
