---
'@aparte/angular': patch
---

In Angular, an unset binding of an input that is on by default (`[elicitation]`, `[submitOnEnter]`, a launcher's `[header]`, a file picker's `[multiple]`) now keeps it on, as in React, Vue and Svelte.

Angular's `booleanAttribute(undefined)` is false, so binding a field that is not always set turned the default off: no question presenter (every call needing approval aborted with nothing to click), Enter inserted a newline instead of sending, the launcher lost its header, and the picker took one file. `undefined` and `null` now leave the element on its own default.
