import { apartExamples } from '../../../scripts/cem-plugin-examples.mjs';

// Custom Elements Manifest for this plugin's one element.
//
// A plugin owns its element, so it owns its element's contract — and this file is what
// makes that contract machine-readable. Nothing in `@aparte/core` or in a wrapper may
// declare `<aparte-model-selector>`: a third-party plugin's author cannot add a line to
// core, so a wrapper typing OUR plugin would give aparté's packages a privilege theirs
// could never have. The framework bindings under `./react`, `./vue` and `./svelte` are
// generated from this manifest by `scripts/gen-element-bindings.mjs`.
//

export default {
    globs: ['src/**/*.ts'],
    exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/**/__tests__/**'],
    outdir: 'dist',
    litelement: false,
    fast: false,
    stencil: false,
    catalyst: false,
    plugins: [apartExamples()],
};
