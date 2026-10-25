---
"@aparte/angular": patch
---

`<aparte-ui>` no longer builds its element during a server render, so a hydrated Angular SSR page shows it once.

It built the element in `ngAfterViewInit`, which Angular also runs on a server: the element was serialized into the HTML without its props or listeners, hydration kept it, and the browser appended a configured one beside it — two model selectors, two counters. It is now built in the browser only, the way React, Vue and Svelte build theirs in an effect or `onMount`.
