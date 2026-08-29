import { apartExamples } from '../../../scripts/cem-plugin-examples.mjs';

// Custom Elements Manifest for this plugin's one element, `<aparte-approval-mode>`.
// A plugin owns its element, so it owns its element's contract: the docs partial and a
// consumer's editor completion are generated from this, never from core.
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
