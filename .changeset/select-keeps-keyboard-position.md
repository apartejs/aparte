---
"@aparte/core": patch
---

**Fix: refreshing a live option list no longer throws away the keyboard position.**

`aparte-select` keeps its roving highlight as a `data-active` attribute on an option
ELEMENT, so replacing the options of an open dropdown took it away — while the
component still believed it held a position. Consequences, all silent:

- the visible highlight disappeared mid-navigation;
- `aria-activedescendant` on the trigger kept pointing at an id no longer in the
  document — a broken reference for a screen reader;
- the next arrow key moved from the stale index.

Worse, nothing noticed: a consumer refreshing a list writes into
`.aparte-select-options`, a **descendant**, and the observer watched only its own
children. It now watches the subtree and re-asserts the highlight on the new elements,
clamped to the new length, and only when the dropdown was already open with a position
held — a refresh never invents one, and navigation resumes where the user was rather
than jumping back to the top.

Found via three CI-only e2e flakes (a keyboard-navigation assertion polling ten seconds
for a highlight that a concurrent refresh had erased). `@aparte/plugin-model-selector`
is the in-repo consumer that triggers it, whenever the provider list settles.
