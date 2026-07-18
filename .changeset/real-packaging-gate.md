---
"@aparte/engine": patch
"@aparte/plugin-ask-question": patch
---

Packaging fixes surfaced by wiring `publint` + `are-the-types-wrong` into CI:

- `@aparte/engine`: its emitted `.d.ts` re-exported submodules without `.js`
  extensions, so `node16` / `nodenext` consumers got unresolved types (bundlers
  hid it). Added the extensions — the types now resolve under every module mode.
- `@aparte/plugin-ask-question`: declared `"sideEffects": true`. Importing the
  package registers `<aparte-ask-question>` as an import-time side effect, which
  a tree-shaking bundler could otherwise legally drop.
