---
"@aparte/core": patch
---

`@aparte/core` now declares `sideEffects` (it was the only one of the 14 packages
without it, so bundlers had to treat every module as side-effectful and could not
tree-shake it). The browser entry and the CSS are listed as effectful — they define
the custom elements — and everything else, including the DOM-free Node entry, is
pure.

The README gains a **Node / SSR** section: the `node` export condition, what the
server entry keeps (client, host, transports, `createAparteChatHandler`, runtime,
types) and what it drops (the custom elements, with `registerAllComponents()` a safe
no-op). The capability already existed and was invisible — reading `src/index.ts`
shows the *browser* entry, which is how a consumer concludes the opposite.
