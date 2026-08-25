---
'@aparte/plugin-model-selector': minor
---

**`@aparte/plugin-model-selector` types its own element**, through three new subpath exports: `./react`, `./vue` and `./svelte`.

```ts
import '@aparte/plugin-model-selector/react';
// <aparte-model-selector persist="" searchable="" placeholder="Pick a model" />  ← typed
```

This is the rule from the previous release made real: whoever owns the element owns its contract and its bindings. `@aparte/angular` briefly shipped a directive for this element and core briefly typed it — both were removed, because a third-party plugin's author cannot add a line to either, so doing it for our own plugin gave aparté's packages a privilege theirs could never have.

Putting the bindings in the plugin makes the property you actually want fall out of the module graph: **install the package and the tag is typed; don't and it isn't.** TypeScript enforces that, nobody has to remember it.

Subpaths rather than the main entry because a `declare module 'react'` block only compiles where React's types resolve — in a shared entry it breaks every Vue and Svelte consumer with `TS2664`. `react`, `vue` and `svelte` are **optional** peer dependencies; the three modules carry no runtime at all (0.04 kB each, the augmentation is the whole payload).

The package now also emits its own custom-elements manifest, and its attribute types are generated from it by the same `scripts/gen-element-bindings.mjs` that generates core's — so the types cannot fall behind the element's JSDoc, and a third-party plugin can run the same tool on its own manifest.

No Angular subpath yet: an Angular directive is runtime code, so it needs partial-Ivy compilation in a package that builds with Vite. Until then, the six-line local directive the Angular example demonstrates is the path.
