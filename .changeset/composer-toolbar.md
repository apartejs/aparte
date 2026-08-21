---
"@aparte/core": minor
"@aparte/react": minor
"@aparte/vue": minor
"@aparte/svelte": minor
"@aparte/angular": minor
---

**Breaking:** the composer's three positional footer slots become one `toolbar`.

`footerLeft` / `footerCenter` / `footerRight` (and their `footer-left` / `footer-center` /
`footer-right` slot equivalents) are removed. Pass one `toolbar` instead and order your
controls yourself:

```tsx
// before
<AparteChat footerLeft={<ModePicker />} footerRight={<ModelSelector />} />

// after
<AparteChat toolbar={<>
  <ModePicker />
  <ModelSelector style={{ marginInlineStart: 'auto' }} />
</>} />
```

Placement inside the row is the DOM order; `margin-inline-start: auto` pushes a control —
and everything after it — to the end. It is a *logical* property, so a control that used to
be in the right-hand slot now follows the reading direction instead of contradicting it in a
right-to-left locale.

Vue uses `<template #toolbar>`, Svelte `<svelte:fragment slot="toolbar">` (a fragment
projects several nodes with no wrapper element), Angular `slot="toolbar"` on each projected
node.

**New in core:** `<aparte-composer-toolbar>`, the element the row actually is. It works in
plain HTML with no wrapper, which the row never did before — vanilla consumers had to write
`<div class="aparte-composer-footer">` by hand. It hides itself while empty, and it is not
part of the default `<aparte-chat>` shell: nothing is drawn until you put something in it.

**Also in core:** `<aparte-composer>` now mirrors the locale's reading direction onto
itself. `dir` was applied by the viewport alone, so an RTL locale flipped the transcript and
left the composer left-to-right — which also made any logical margin inside it behave like a
physical one.
