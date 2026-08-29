---
"@aparte/core": patch
---

`registerAllComponents()` now references every element class (24, not 4) and names the ones that are missing.

It looked up four tags — chat, viewport, bubble, status — and on a miss logged "Some components may not be registered." Both halves failed the reader the guide sends here. A bundler that dropped `<aparte-split>` or `<aparte-composer-toolbar>` produced a silent green, because those twenty were never checked; and anyone who did see the warning was told nothing about which module to import.

The function now reads one `[tag, class]` array covering all 24, and the warning lists the missing tags by name. The registrations themselves are unaffected either way: the browser build is one module, `dist/index.js`, which `sideEffects` names, so all 24 `customElements.define` calls ship in it whether or not anything references the classes.
