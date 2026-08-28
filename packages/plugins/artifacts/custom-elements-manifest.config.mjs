import { apartExamples } from '../../../scripts/cem-plugin-examples.mjs';

// This plugin defines no custom element — it registers a tool, two renderers and a
// block grammar — but the docs generator reads every plugin's manifest, so it ships
// one (empty of declarations) rather than being the plugin the generator trips on.
export default {
    globs: ['src/**/*.ts'],
    exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/**/__tests__/**', 'src/env.d.ts'],
    outdir: 'dist',
    litelement: false,
    fast: false,
    stencil: false,
    catalyst: false,
    plugins: [apartExamples()],
};
