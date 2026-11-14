---
'@aparte/core': minor
---

A tool display's `details` function now gets the element its row shows as a second argument: return it to keep it.

```ts
aparteGlobalConfig.registerToolDisplay('edit_file', {
  details: (segment, held) => held ?? drawChange(segment),
});
```

`held` is the element the function returned for that row the last time it was asked, still in place behind the line; it is absent on a row's first drawing. So a detail with state of its own (a fold opened, a comment half written) is kept through the call's updates and a language switch without a cache in the app, and two rows drawing the same call (a reply and a pane beside it) never share one element. A function that ignores the argument behaves as before.
