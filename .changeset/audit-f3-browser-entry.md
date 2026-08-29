---
"@aparte/core": minor
---

New `@aparte/core/browser` entry point: point your test runner at it so `<aparte-*>` elements upgrade under Vitest + jsdom.

```ts
// vitest.config.ts — the array form matches on a regex, so ONLY the bare specifier is
// rewritten. An object alias is a prefix alias: it would also send `@aparte/core/icons`
// to `@aparte/core/browser/icons`, which is not exported.
test: { environment: 'jsdom', alias: [{ find: /^@aparte\/core$/, replacement: '@aparte/core/browser' }] }
```

Why it is needed. `@aparte/core` resolves the `node` export condition to a DOM-free entry, which is what makes `import '@aparte/core'` safe in Next, Nuxt, SvelteKit and Angular Universal. A test runner is also Node, so it took that entry too — and then jsdom supplied `customElements` while nothing had registered anything. `document.createElement('aparte-chat')` returned a plain `HTMLElement`, every assertion about the element's own properties failed, and no error named the cause. There was no supported specifier to escape to: the four wrappers in this repo all aliased `@aparte/core` at `../../core/src/index.ts`, reaching into another package's source.

`registerAllComponents()` on the DOM-free entry now says so: called with a DOM present, it logs one warning naming this specifier. A warning, not a throw — the environment is legal, only surprising.

`@aparte/core/package.json` is exported as well, so a config can `require.resolve` it instead of hardcoding a path. The main `.` entry is unchanged and still resolves `node` first.
