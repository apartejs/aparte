---
'@aparte/angular': patch
---

The `<aparte-context>` directive no longer has a `(compact)` output: it never fired. The gauge sends `aparte-compact` on `window`, so listen there.

```ts
window.addEventListener('aparte-compact', (event) => console.log(event.detail.targetId));
```

Do you have to touch your code? Only if a template binds `(compact)` on `<aparte-context>`: that handler never ran, and still compiles (Angular reads it as a DOM listener). Move it to a `window` listener as above.

The generated directives give no Output to an event the element sends on `window`, because a listener on the element can never hear it. The list of those events was kept by hand and had fallen behind the gauge's Retry, which sends `aparte-compact` when no compactor is registered. It is checked against the source now, both ways, so a window-only event cannot become an Output again — and an event the element sends on itself cannot lose one.
