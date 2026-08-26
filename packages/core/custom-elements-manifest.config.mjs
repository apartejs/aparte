import { apartExamples } from '../../scripts/cem-plugin-examples.mjs';

// Custom Elements Manifest — describes every <aparte-*> element (attributes,
// properties, events, slots) for IDE autocomplete + docs tooling.
// Generated into dist/ at build time (like the .d.ts), shipped via `files: ["dist"]`
// and pointed to by package.json `customElements`. The <aparte-*> classes carry the
// jsdoc (@element/@attr/@fires/@slot) the analyzer reads.

/**
 * Collapse overloaded methods onto the signatures that are actually API.
 *
 * A TypeScript overload is N declarations plus one IMPLEMENTATION signature, and the
 * analyzer emits all of them as separate members. `addSegment` therefore shipped three
 * entries: the documented overload, the second overload with an empty description, and
 * `addSegment(messageIdOrSegment: string | AparteSegment, maybeSegment?: AparteSegment)`
 * — a signature no consumer may call, since its whole job is to accept both of the
 * others. That is not a docs-page problem: `package.json` points `customElements` at
 * this file and `files` ships `dist`, so the noise reaches every consumer's editor
 * autocomplete, where an implementation signature reads as a third way to call it.
 *
 * Two corrections, both derived from the AST rather than guessed:
 * - the implementation (the only declaration of the group carrying a body) is dropped;
 * - the JSDoc, which TypeScript accepts only on the overload declarations, is copied
 *   onto the siblings that have none. Our overload docblocks describe every calling
 *   convention in one block — read the ones on the viewport — so the copy says exactly
 *   what the author wrote once, instead of leaving a blank cell next to a real form.
 */
function apartOverloads() {
    return {
        name: 'aparte-collapse-overloads',
        analyzePhase({ ts, node, moduleDoc }) {
            if (!ts.isClassDeclaration(node) || !node.name) return;

            const declaration = moduleDoc.declarations?.find((d) => d.name === node.name.getText());
            if (!declaration?.members?.length) return;

            // Parameter NAMES identify a signature within its group: the analyzer keeps
            // them verbatim, and an implementation's names are the ones that had to be
            // widened (`messageIdOrSegment`, `a`, `b`) precisely because it accepts both.
            const key = (names) => names.join(',');

            const groups = new Map();
            for (const member of node.members ?? []) {
                if (!ts.isMethodDeclaration(member)) continue;
                const name = member.name?.getText?.();
                if (!name) continue;
                const group = groups.get(name) ?? { count: 0, impl: null };
                group.count += 1;
                if (member.body) group.impl = key(member.parameters.map((p) => p.name.getText()));
                groups.set(name, group);
            }

            for (const [name, { count, impl }] of groups) {
                // A plain method is one declaration WITH a body: nothing to collapse.
                if (count < 2 || impl === null) continue;

                const siblings = declaration.members.filter((m) => m.kind === 'method' && m.name === name);
                if (siblings.length < 2) continue;

                const documented = siblings.find((m) => m.description);
                if (documented) {
                    for (const m of siblings) {
                        if (!m.description) m.description = documented.description;
                    }
                }

                const implementation = siblings.find((m) => key((m.parameters ?? []).map((p) => p.name)) === impl);
                // No match means the analyzer did not emit it — nothing to remove, and
                // guessing which entry to drop would be worse than leaving all three.
                if (implementation) {
                    declaration.members.splice(declaration.members.indexOf(implementation), 1);
                }
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
    plugins: [apartExamples(), apartOverloads()],
};
