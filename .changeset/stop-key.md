---
'@aparte/core': minor
'@aparte/react': minor
'@aparte/vue': minor
'@aparte/svelte': minor
'@aparte/angular': minor
'@aparte/plugin-cards': patch
---

New `stop-key` on the chat and the composer, `stopKey` on the framework components: a key that stops the reply being written, as Stop does. `stop-key="Escape"`; none by default.

Nothing to change in your code. The key counts while the focus is in the composer, pressed alone, and once nothing inside took it: the `/` menu, a select, a question or an approval in the composer keep their own keys. In a launcher, the first Escape stops the reply and the next one closes the chat.

Every element of aparté that takes Escape now cancels the keydown, and the accessibility guide says in which order they answer, so a handler of yours reads `event.defaultPrevented`. Two did not: the Restore question of a compaction stopped the key without cancelling it, and a stock chart's cursor did neither, so Escape on a chart in a launcher also closed the card. The chart now takes Escape only while its cursor is shown.
