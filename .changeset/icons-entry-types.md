---
'@aparte/core': patch
---

Fixed: `@aparte/core/icons` shipped without types for consumers whose TypeScript
resolves the classic way.

`tsc` mirrors the source tree, so a nested entry emitted `dist/icons/index.d.ts` while
Vite emitted `dist/icons.js` beside it. The package's `exports` pointed `types` at the
nested path and both `publint` and `attw` passed on that — but a resolver that looks for
a declaration file NEXT TO the JavaScript found none and fell back to `any`. The entry
is flat now, so `dist/icons.js` and `dist/icons.d.ts` are siblings and every resolution
mode agrees.

Caught by the docs' own snippet check, which typechecks every code fence: it is such a
consumer.
