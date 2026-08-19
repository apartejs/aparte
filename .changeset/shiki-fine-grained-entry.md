---
"@aparte/plugin-shiki": minor
---

**New entry point `@aparte/plugin-shiki/core`, for control over what you ship.**

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
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import ts from '@shikijs/langs/typescript';
import githubDark from '@shikijs/themes/github-dark';
import { setupShikiProviderFromHighlighter } from '@aparte/plugin-shiki/core';

setupShikiProviderFromHighlighter(
  await createHighlighterCore({
    themes: [githubDark],
    langs: [ts],
    engine: createJavaScriptRegexEngine(),
  }),
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
*runtime*, never of *distribution*.
