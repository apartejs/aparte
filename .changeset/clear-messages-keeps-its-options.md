---
"@aparte/react": patch
"@aparte/vue": patch
"@aparte/svelte": patch
"@aparte/angular": patch
---

`clearMessages({ revokeAttachments: false })` now reaches the host on all four wrappers, so the attachments in the transcript keep their object URLs. The helpers (`useAparteChat`, `createAparteChat`) forward the option too, and React's exported `UseAparteChat` type declares it.

The bridge was `clearMessages: () => host?.clearMessages()` at seven sites, so an explicit "don't revoke" arrived as `undefined` and the viewport revoked by default — the exact inversion of what the caller asked for, and every image and file chip still on screen came back broken. TypeScript could not see it: a zero-parameter function is assignable to a one-optional-parameter signature, so `satisfies`, `implements` and Svelte's `_assertImperativeParity` all passed. Each wrapper's suite now asserts it against a spied `URL.revokeObjectURL` — the option kept, and the default (revoke) kept too.
