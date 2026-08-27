/*
 * Custom Elements Manifest plugin: lift `@example` blocks into the manifest.
 *
 * The analyzer's class-jsdoc pass handles `@attr`/`@fires`/`@slot`/`@csspart`/`@cssprop` and
 * stops there, and the CEM schema has no `examples` field to put them in. So without this,
 * every worked example sitting in a class docblock stays invisible to tooling and to the
 * generated docs — which could then only teach by enumeration: every name listed, not one
 * usage shown. That is the exact shape of ratified decision #4, applied to the whole element
 * surface at once.
 *
 * `examples: string[]` is a field of our own on top of the spec. Manifest consumers ignore
 * fields they do not know, and the consumers that matter here are our own generators.
 *
 * SHARED by three configs — core and both element-defining plugins. It used to live inline in
 * core's config, so `<aparte-model-selector>` and `<aparte-ask-user>` had no examples in their
 * manifests and their generated pages would have had none either. One implementation rather
 * than the same twenty lines pasted twice.
 */
export function apartExamples() {
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

            // Most of our examples are written on a MEMBER, not on the class — the composer's is
            // on the change event, the viewport's on the injection API. Capturing only the class
            // level published two elements out of eighteen.
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
