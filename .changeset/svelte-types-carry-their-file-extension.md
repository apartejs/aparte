---
"@aparte/svelte": patch
---

The emitted `AparteChat.svelte.d.ts` imports `./types.js` with its extension, so the package's types compile for a consumer on `moduleResolution: nodenext` with `skipLibCheck: false`.

`svelte-package` copies the component's `<script>` imports into the declaration it emits, and that one import was written without an extension while every sibling `.ts` file in the package already carried `.js`. Under `nodenext` TypeScript reported `TS2835` on the shipped file. The realistic Svelte consumer (`bundler` resolution, `skipLibCheck: true`) never saw it; the fix is the import in the component, not a post-process on `dist/`.
