// Custom Elements Manifest — describes every <aparte-*> element (attributes,
// properties, events, slots) for IDE autocomplete + docs tooling.
// Generated into dist/ at build time (like the .d.ts), shipped via `files: ["dist"]`
// and pointed to by package.json `customElements`. The <aparte-*> classes carry the
// jsdoc (@element/@attr/@fires/@slot) the analyzer reads.
export default {
    globs: ['src/**/*.ts'],
    exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/__tests__/**',
    ],
    outdir: 'dist',
    // Vanilla web components — no framework flavour plugins.
    litelement: false,
    fast: false,
    stencil: false,
    catalyst: false,
};
