---
"@aparte/plugin-model-selector": patch
"@aparte/plugin-ask-question": patch
---

Raise the monorepo TypeScript strictness floor: `noUncheckedIndexedAccess` and
`noUnusedParameters` move into `tsconfig.base.json`, so every package inherits them (core /
engine / providers already opted in locally; plugins / wrappers / locales now do too). The
new floor surfaced — and this fixes — real unchecked index accesses in `model-selector`
(auto-select + single-provider option list) and `ask-question` (single-question path):
each now guards the array element instead of assuming it exists.
