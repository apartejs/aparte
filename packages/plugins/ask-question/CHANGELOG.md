# @aparte/plugin-ask-question

## 0.2.0-alpha.0

### Patch Changes

- 9568c6b: Escape `data-segment-id` in every segment renderer. A segment id can embed an untrusted
  tool-call id (`tool-${toolCallId}`, taken verbatim from the endpoint's SSE `tool_calls[].id`),
  so the tool-call renderer — and, defense-in-depth, all other renderers plus the ask-question
  receipt — now HTML-escape it before it reaches `innerHTML`. Closes a DOM-XSS reachable from a
  hostile OpenAI-compatible endpoint (the same class as the code-fence `language` fix, in a
  sibling sink). Regression test added.
- 71c9167: Packaging fixes surfaced by wiring `publint` + `are-the-types-wrong` into CI:

  - `@aparte/engine`: its emitted `.d.ts` re-exported submodules without `.js`
    extensions, so `node16` / `nodenext` consumers got unresolved types (bundlers
    hid it). Added the extensions — the types now resolve under every module mode.
  - `@aparte/plugin-ask-question`: declared `"sideEffects": true`. Importing the
    package registers `<aparte-ask-question>` as an import-time side effect, which
    a tree-shaking bundler could otherwise legally drop.

- 056dafd: Raise the monorepo TypeScript strictness floor: `noUncheckedIndexedAccess` and
  `noUnusedParameters` move into `tsconfig.base.json`, so every package inherits them (core /
  engine / providers already opted in locally; plugins / wrappers / locales now do too). The
  new floor surfaced — and this fixes — real unchecked index accesses in `model-selector`
  (auto-select + single-provider option list) and `ask-question` (single-question path):
  each now guards the array element instead of assuming it exists.
- Updated dependencies [6ab5682]
- Updated dependencies [930a108]
- Updated dependencies [4065fd6]
- Updated dependencies [307039b]
- Updated dependencies [4aac26d]
- Updated dependencies [a2ed74b]
- Updated dependencies [a6ed936]
- Updated dependencies [333d301]
- Updated dependencies [14f1f1d]
- Updated dependencies [18d2065]
- Updated dependencies [6d6123e]
- Updated dependencies [97bd6c5]
- Updated dependencies [8417976]
- Updated dependencies [1f6c43e]
- Updated dependencies [7157ad5]
- Updated dependencies [2efef6f]
- Updated dependencies [0aefd9b]
- Updated dependencies [0aefd9b]
- Updated dependencies [9568c6b]
- Updated dependencies [7e5cfb7]
- Updated dependencies [75af64a]
- Updated dependencies [fa5a3f8]
- Updated dependencies [69525ad]
- Updated dependencies [8a3890b]
- Updated dependencies [d31f681]
- Updated dependencies [e69435f]
- Updated dependencies [bfa9901]
- Updated dependencies [49f4d70]
- Updated dependencies [fcff831]
- Updated dependencies [455fc81]
- Updated dependencies [554e4e9]
- Updated dependencies [6a50004]
- Updated dependencies [f8a6dd7]
- Updated dependencies [9ce7978]
- Updated dependencies [e96920a]
- Updated dependencies [d60e2c8]
- Updated dependencies [e8d9b32]
  - @aparte/core@0.2.0-alpha.0
