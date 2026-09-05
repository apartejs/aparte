---
"@aparte/svelte": patch
---

`AparteChat` and `AparteUi` now ship real, compiler-checked prop, event and slot types — a wrong prop on either component is a `tsc`/`svelte-check` error in your own project, not just a mismatch you'd only catch at runtime.

The package always re-exported `./AparteChat.svelte`, but no `AparteChat.svelte.d.ts` was ever emitted next to it, so every import resolved to an untyped component and the props were documentation only. The cause: `svelte-package`'s own `.d.ts` emission (`svelte2tsx`'s `emitDts`) silently emits nothing under this package's real `tsconfig.json`, which inherits `noEmitOnError: true` from the repo base — that setting blocks emission on diagnostics that are expected noise in svelte2tsx's `dts` transform mode (svelte2tsx's own diagnostic filter already treats those exact codes as non-fatal). A dedicated `tsconfig.dts.json`, passed via `--tsconfig` and used only for this one step, relaxes it; the package's real `tsc -b` build is untouched by it. Verified with a standalone consumer project: importing the built package and assigning a wrong-typed prop to `AparteChat` now fails `tsc --noEmit`.
