---
"@aparte/react": patch
"@aparte/vue": patch
"@aparte/svelte": patch
"@aparte/angular": patch
---

A list you assign back to the chat — a reopened conversation, an undo — is now drawn, even when the chat reported it to you earlier.

Under a two-way binding every list the chat reports comes back through your prop, sometimes late — an earlier report after its next change — and applying that echo would roll back what the chat did since without reporting. To tell an echo from your own word, the wrappers remembered every list the chat had ever reported, so a list you kept and assigned back later was taken for an echo and ignored: the chat went on showing the other conversation, and its next report wrote that conversation's messages into the one you had reopened. Only the reports you have not handed back yet count now; any list the chat did not report clears them. React, Vue, Svelte (both entries) and Angular apply the same rule.
