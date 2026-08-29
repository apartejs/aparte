---
"@aparte/core": minor
---

`clearMessages()` takes `{ revokeAttachments?: boolean }` and passes it to the viewport, so a caller that empties the transcript and re-appends some of the same turns keeps their attachments working.

Emptying the transcript releases the `blob:` object URL of every attachment it drops — a deliberate leak fix. A caller that puts some of those turns straight back (a compaction is the case in this repo) therefore re-appended them with dead URLs: every image and file chip on a surviving turn came back broken. Passing `{ revokeAttachments: false }` keeps the URLs alive and leaves the caller to release the ones it really dropped.

The option is on the whole chain, and each link forwards it: `AparteChatImperativeApi.clearMessages(options?)`, `AparteChatBinding.clearMessages(options?)`, the host's `clearMessages(options?)` and the viewport bridge's `clearAll(options?)`. Optional everywhere — an existing call site and a binding of your own are unchanged, and `clearMessages()` with no argument still revokes.

This is the half that makes `@aparte/plugin-compaction` keep those attachments under React, Vue, Svelte and Angular. Under a wrapper the transcript the plugin resolves is the wrapper's own root element, whose `clearAll` bridge dropped the argument on the floor: the plugin asked, core did not carry, and the wrapper suites stayed green because the plugin's own target is a plain array.
