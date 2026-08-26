import { apartExamples } from '../../../scripts/cem-plugin-examples.mjs';

// Custom Elements Manifest for this plugin's one element, `<aparte-ask-user>`.
//
// It was missing, and the consequence was not cosmetic: the package defines a custom element
// with `customElements.define` and shipped no machine-readable description of it. So a
// consumer's editor offered no completion for its attributes, no tooling could discover it,
// and its documentation had no source to be generated from — while the sibling plugin,
// `@aparte/plugin-model-selector`, has had all three since it shipped.
//
// A plugin owns its element, so it owns its element's contract, and this file is what makes
// that contract machine-readable. Nothing in `@aparte/core` or in a wrapper may declare
// `<aparte-ask-user>`: a third-party plugin's author cannot add a line to core, so a wrapper
// typing OUR plugin would give aparté's packages a privilege theirs could never have.
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
