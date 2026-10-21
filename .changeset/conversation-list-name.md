---
'@aparte/core': patch
'@aparte/locale-fr': patch
---

The conversation list now has an accessible name, "Conversations" by default, taken from the new `conversationList` locale key.

`<aparte-conversation-list>` is a navigation landmark, and a page with a second one (a site's own nav) had two unnamed landmarks (axe landmark-unique). The name follows the locale; an `aria-label` or `aria-labelledby` the app sets keeps priority. French: « Conversations ».
