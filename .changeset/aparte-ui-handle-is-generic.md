---
'@aparte/vue': patch
'@aparte/svelte': patch
---

`<AparteUi>`'s imperative handle honours `AparteUiHandle` on Vue and Svelte.

Both packages export that interface with a docblock promising "the same
`getElement`/`callMethod` contract on all four wrappers", and both implementations were
non-generic: Vue's `defineExpose` took a bare object literal, Svelte's exported plain
functions. So `getElement<HTMLInputElement>()` typed as `HTMLElement | null` there and
correctly on React and Angular — a consumer following the documented `ref` / `bind:this`
pattern got a type error on two of four wrappers and none on the other two.

Found by a cold audit that compiled it rather than read it: `svelte2tsx` + `tsc` on the real
component produced `TS2322` on the exact pattern the framework pages teach.

Type-only — no runtime behaviour changes. Vue's emitted declaration now carries
`getElement<T extends HTMLElement = HTMLElement>(): T | null`, matching the interface.
