---
'@aparte/svelte': patch
---

The runes form of an event handler, `onaparte-send={(e) => …}`, now type-checks on every aparté tag, with the event's detail typed, like `on:aparte-send`.

The tags were declared with `on:aparte-*` handlers only, so a Svelte 5 app writing the attribute form on a declared tag got "Object literal may only specify known properties" from svelte-check.
