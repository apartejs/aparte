// Custom Elements Manifest — describes every <aparte-*> element (attributes,
// properties, events, slots) for IDE autocomplete + docs tooling.
// Generated into dist/ at build time (like the .d.ts), shipped via `files: ["dist"]`
// and pointed to by package.json `customElements`. The <aparte-*> classes carry the
// jsdoc (@element/@attr/@fires/@slot) the analyzer reads.

/**
 * Lift `@example` blocks into the manifest.
 *
 * 15 of our 17 elements already carry a worked example in their class JSDoc, and NONE
 * of them reached the manifest: the analyzer's class-jsdoc pass handles
 * `@attr`/`@fires`/`@slot`/`@csspart`/`@cssprop` and stops there, and the CEM schema
 * has no `examples` field to put them in. So `reference/api.md` — which CLAUDE.md calls
 * the source of truth for the component API — could only ever teach by enumeration:
 * every name listed, not one usage shown. That is the exact shape of the friction this
 * came from ("a capability cited in passing, with no example, is functionally
 * invisible"), and it applied to the whole element surface at once.
 *
 * `examples: string[]` is a field of our own on top of the spec. Manifest consumers
 * ignore fields they don't know, and the consumer that matters here is our own docs
 * generator.
 */
function apartExamples() {
    return {
        name: 'aparte-examples',
        analyzePhase({ ts, node, moduleDoc }) {
            if (!ts.isClassDeclaration(node) || !node.name) return;

            const text = (comment) =>
                typeof comment === 'string'
                    ? comment
                    : (comment ?? []).map((part) => part.text ?? '').join('');

            const examplesOf = (n) =>
                ts
                    .getJSDocTags(n)
                    .filter((tag) => tag.tagName?.text === 'example')
                    .map((tag) => text(tag.comment).trim())
                    .filter(Boolean);

            const declaration = moduleDoc.declarations?.find((d) => d.name === node.name.getText());
            if (!declaration) return;

            const classExamples = examplesOf(node);
            if (classExamples.length) declaration.examples = classExamples;

            // Most of our examples are written on a MEMBER, not on the class -- the
            // composer's is on the change event, the viewport's on the injection API.
            // Capturing only the class level published two elements out of eighteen.
            for (const member of node.members ?? []) {
                const examples = examplesOf(member);
                if (!examples.length) continue;
                const name = member.name?.getText?.();
                const doc = declaration.members?.find((m) => m.name === name);
                if (doc) doc.examples = examples;
            }
        },
    };
}

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
    plugins: [apartExamples()],
};
