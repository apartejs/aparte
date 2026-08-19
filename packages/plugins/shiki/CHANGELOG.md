# @aparte/plugin-shiki

## 0.6.0

### Minor Changes

- 583840f: **New entry point `@aparte/plugin-shiki/core`, for control over what you ship.**

  The convenience entry imports `shiki`, whose bundle maps every known language to a
  dynamic import — so a bundler emits one chunk per grammar. Measured on a build whose
  only import was `setupShikiProvider`: **302 files, 11 MB** (`emacs-lisp` alone is
  780 kB, plus `wasm`, `wolfram`, `vue-vine`… for a chat that will show twenty
  languages). The same build against a highlighter carrying three grammars: **1 file,
  560 kB**.

  No runtime option can fix that — verified rather than assumed: restricting shiki's
  `langs` still emitted all 302 files, because a static import is a static import. So
  the fix is an entry point that never imports the bundle:

  ```ts
  import { createHighlighterCore } from "shiki/core";
  import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
  import ts from "@shikijs/langs/typescript";
  import githubDark from "@shikijs/themes/github-dark";
  import { setupShikiProviderFromHighlighter } from "@aparte/plugin-shiki/core";

  setupShikiProviderFromHighlighter(
    await createHighlighterCore({
      themes: [githubDark],
      langs: [ts],
      engine: createJavaScriptRegexEngine(),
    })
  );
  ```

  `@aparte/plugin-shiki/core` imports nothing from `shiki` at runtime (types only, and
  those are erased). The trade is stated where you make it: your highlighter's grammars
  are fixed, so a language it does not carry renders as plain text — there is no
  on-demand load to fall back on. Everything else matches the convenience entry,
  plaintext aliases and case-insensitive matching included.

  Nothing is removed and no default changes: `setupShikiProvider` behaves exactly as
  before. Its JSDoc — and the plugin's docs page — stop implying that lazy loading also
  means a small package: "you pay only for the languages you render" was true of
  _runtime_, never of _distribution_.

## 0.5.0-alpha.0

### Patch Changes

- Updated dependencies [cd7adfc]
- Updated dependencies [3edb766]
- Updated dependencies [3b026bb]
  - @aparte/core@0.5.0-alpha.0

## 0.4.0-alpha.0

### Patch Changes

- Updated dependencies [358bc53]
- Updated dependencies [801622a]
- Updated dependencies [0d4945f]
- Updated dependencies [de57a6a]
- Updated dependencies [50d90a8]
- Updated dependencies [cda5f54]
- Updated dependencies [af5ed3d]
- Updated dependencies [e9909c6]
- Updated dependencies [2336bc5]
- Updated dependencies [79b2795]
- Updated dependencies [9f839e4]
- Updated dependencies [80995ea]
- Updated dependencies [118d4fb]
  - @aparte/core@0.4.0-alpha.0

## 0.3.0-alpha.0

### Patch Changes

- Updated dependencies [d4c448b]
- Updated dependencies [0192d63]
- Updated dependencies [7227dee]
- Updated dependencies [622dc78]
- Updated dependencies [7227dee]
  - @aparte/core@0.3.0-alpha.0

## 0.2.0-alpha.0

### Patch Changes

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
