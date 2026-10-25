---
'@aparte/core': patch
---

Under a wrapper, a message the parent replaces with a new object is drawn again, whether or not it is the last one. A list you hand in (a controlled `messages` prop, a `v-model`, `bind:messages`, an Angular input) that changes an earlier message, for example a store-backed compaction target writing a checkpoint onto the first kept message, now reaches that message's bubble.

Nothing to change in your code. An update that keeps the same message object is still skipped, so a list you rebuild with the same objects costs nothing more than before; a list that copies every message on every render makes every bubble redraw on every render.

Why. `AparteChatHost.syncBubbles` drew every message once and then only the last one on each render, so a change written through the parent's list to an earlier message stayed in the list and never reached the screen. It was invisible with the host's own `updateMessage`, which pokes the bubble itself, and it left the separator of a compaction missing on every framework-rendered transcript whose list was the app's. The host now remembers the object each bubble was drawn from and compares it by reference, which an immutable update always changes. The same one change serves React, Vue, Svelte and Angular, since they share the host.
