/**
 * The two barrels of a package export the same TYPES, in both directions.
 *
 * `index-node-parity.test.ts` guards the RUNTIME half and says so in its own
 * header: "types are erased and can't break an import at runtime". True at
 * runtime — and irrelevant to the failure that actually happens. TypeScript
 * resolves `types` under the `node` condition too, so a type exported from
 * `index.ts` and not from `index.node.ts` is a hard COMPILE error for every SSR
 * consumer (Next, Nuxt, SvelteKit, Angular Universal). Nothing covered that.
 *
 * This reads the two BUILT declaration files — what a consumer's compiler actually
 * sees — and diffs their exported names, both ways.
 *
 * ## Three things this used to miss, all found the same night
 *
 * **It read one package.** `@aparte/core` was hardcoded, and core is the package that
 * had already been given an elaborate DOM-free entry and a contract test. The four
 * PLUGINS with a `node` condition were outside it, and `@aparte/plugin-artifacts`'s
 * node barrel was missing `buildSafePreviewDocument` and `PREVIEW_CSP` — both pure,
 * both usable on a server, and both a hard `SyntaxError: does not provide an export
 * named …` for anyone who imported them there. The corpus is now every package whose
 * exports map declares a `node` condition, so a fifth one is covered the day it is
 * created rather than the day somebody remembers this file.
 *
 * **It diffed one way.** `[...browser].filter(n => !node.has(n))` and nothing
 * symmetric. An export added to the SSR barrel and forgotten in the browser one is
 * the same slip in the other direction, and it breaks the MAJORITY case — every
 * browser consumer's compile. There is no node-only-by-design category the way
 * element classes are browser-only, so the reverse filter excludes nothing.
 *
 * **It read `dist/` and said nothing about it.** Run against a stale build it reports
 * OK on a mistake it is designed to catch — proven by a deliberate sabotage that this
 * guard missed in source and caught the moment the file was rebuilt. In `pnpm gate`
 * that is fine (`pnpm build` is step 7); run standalone after an edit, the green means
 * nothing. So it now asks `scripts/dist-freshness.mjs` — the same comparison the
 * repo-wide `check:dist-freshness` step makes, hash fallback and all, rather than a
 * second and cruder copy of it — about the packages it is about to read.
 *
 * Run by `pnpm gate`.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { distFreshness } from './dist-freshness.mjs';

/** Below this, the walk broke and this guard is vouching for a fraction of the repo. */
const PACKAGE_FLOOR = 5;
/** Same reasoning, on the surface itself: two empty sets diff to nothing. */
const NAME_FLOOR = 300;

/**
 * Browser-only exports that are NOT element classes.
 *
 * Element classes are detected rather than listed (see `elementClassNames`), because a
 * list of name prefixes mis-flagged `AparteOption` the first time this was written. What
 * cannot be detected is a value that merely NEEDS a DOM: a renderer that builds elements,
 * a builder that returns one. Each entry states what it touches, so "browser-only" stays
 * a decision somebody made.
 */
const BROWSER_ONLY = new Map([
    ['artifactRenderer', 'builds the artifact card: elements, and a stylesheet read'],
    ['AparteArtifactSegment', 'the segment type the card renderer declares, declared in card.ts beside it'],
    ['questionReceiptRenderer', 'builds the receipt card in the transcript'],
    ['buildReceipt', 'returns an HTMLElement; `receiptRows`, the data half, IS on the node barrel'],
]);

/** Names a `.d.ts` re-exports, from every `export { … }` / `export type { … }` list. */
function exportedNames(file) {
    const src = readFileSync(file, 'utf8');
    const names = new Set();
    for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
        for (const part of m[1].split(',')) {
            const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim();
            if (name) names.add(name);
        }
    }
    // `export declare const X` / `export declare function X` / bare declarations.
    for (const m of src.matchAll(/export\s+declare\s+(?:const|function|class|abstract\s+class)\s+([A-Za-z_$][\w$]*)/g)) {
        names.add(m[1]);
    }
    for (const m of src.matchAll(/export\s+(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) {
        names.add(m[1]);
    }
    return names;
}

/** Every `.ts` under a directory, tests excluded. */
function sourceFiles(root, out = []) {
    if (!existsSync(root)) return out;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        const path = join(root, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== '__tests__' && entry.name !== 'node_modules') sourceFiles(path, out);
        } else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) {
            out.push(path);
        }
    }
    return out;
}

/**
 * Custom-element classes: browser-only by design (they extend HTMLElement), so
 * their absence from the SSR barrel is the point, not a gap.
 *
 * Found by reading which classes actually extend HTMLElement, not by matching a
 * list of name prefixes — the first version of this did the latter and immediately
 * mis-flagged `AparteOption`, which is an element whose name did not fit the
 * pattern. A heuristic that has to be maintained is a heuristic that will lie.
 *
 * Now TRANSITIVE, and for a measured reason: `@aparte/plugin-ask-user` exports
 * `AparteAskUser extends AparteElicitation`, which is an element two links from
 * `HTMLElement`, so the direct test read it as an ordinary class and the guard demanded
 * it on the SSR barrel — where it cannot go. The seed set spans packages (core declares
 * the base, the plugin extends it), so it is computed once over every source root.
 */
function elementClassNames(roots) {
    const parent = new Map();
    for (const root of roots) {
        for (const file of sourceFiles(root)) {
            const src = readFileSync(file, 'utf8');
            for (const m of src.matchAll(/export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)\s+extends\s+([A-Za-z_$][\w$]*)/g)) {
                parent.set(m[1], m[2]);
            }
        }
    }
    const names = new Set();
    for (const start of parent.keys()) {
        let cursor = start;
        for (let hops = 0; hops < 12 && cursor; hops++) {
            const next = parent.get(cursor);
            if (next === 'HTMLElement') { names.add(start); break; }
            cursor = next;
        }
    }
    return names;
}

/** Every package whose exports map declares a `node` condition on its main entry. */
function packagesWithNodeCondition(base = 'packages') {
    const found = [];
    const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'src') continue;
            const child = join(dir, entry.name);
            const manifest = join(child, 'package.json');
            if (existsSync(manifest)) {
                const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
                const main = pkg.exports?.['.'];
                if (main && typeof main === 'object' && main.node) found.push({ name: pkg.name, dir: child, main });
            }
            walk(child);
        }
    };
    walk(base);
    return found;
}

const problems = [];
const packages = packagesWithNodeCondition();

if (packages.length < PACKAGE_FLOOR) {
    console.error(
        `\n[node-barrel-types] found only ${packages.length} package(s) with a \`node\` export`
        + ` condition, floor is ${PACKAGE_FLOOR}. The walk broke; this guard is vouching for nothing.\n`,
    );
    process.exit(1);
}

// Freshness FIRST: a declaration file older than the source it was emitted from turns
// every diff below into a judgement of the previous build. Same comparison as the
// repo-wide `pnpm check:dist-freshness`, scoped to the packages this guard reads, so a
// standalone run cannot hand back a green that means nothing.
for (const line of distFreshness({ dirs: packages.map((p) => p.dir) }).stale) {
    problems.push(
        `${line}.\n`
        + '    The barrel diff below would be judging a previous build. Rebuild with\n'
        + '    `npx nx run <project>:build --skip-nx-cache`.',
    );
}

const elements = elementClassNames(packages.map((p) => join(p.dir, 'src')));
let checkedNames = 0;

for (const { name, dir, main } of packages) {
    const decl = (spec) => join(dir, spec.replace(/^\.\//, '')).replace(/\.js$/, '.d.ts');
    const BROWSER = decl(main.types ?? main.import ?? main.default);
    const NODE = decl(main.node.types ?? main.node.default);

    if (!existsSync(BROWSER) || !existsSync(NODE)) {
        problems.push(
            `${name}: no built declarations (${BROWSER}, ${NODE}).\n`
            + '    This guard reads what a consumer\'s compiler reads. Run `pnpm build` first.',
        );
        continue;
    }

    const browser = exportedNames(BROWSER);
    const node = exportedNames(NODE);
    checkedNames += browser.size + node.size;

    const missingFromNode = [...browser]
        .filter((n) => !node.has(n) && !elements.has(n) && !BROWSER_ONLY.has(n))
        .sort();
    if (missingFromNode.length) {
        problems.push(
            `${name}: ${missingFromNode.length} export(s) in the browser barrel but not the SSR one:\n`
            + missingFromNode.map((n) => `      ${n}`).join('\n')
            + '\n    TypeScript resolves `types` under the `node` condition, so each of these is a'
            + '\n    compile error for an SSR consumer. Re-export them from the node barrel, or — if'
            + '\n    the name really is browser-only — say so in BROWSER_ONLY here, with what it touches.',
        );
    }

    // The other direction, which excludes nothing. An export that exists only on the SSR
    // barrel breaks every BROWSER consumer's compile — the majority case — and the
    // one-way filter this file used to carry could not see it.
    const missingFromBrowser = [...node].filter((n) => !browser.has(n)).sort();
    if (missingFromBrowser.length) {
        problems.push(
            `${name}: ${missingFromBrowser.length} export(s) in the SSR barrel but not the browser one:\n`
            + missingFromBrowser.map((n) => `      ${n}`).join('\n')
            + '\n    Every browser consumer — which is most of them — fails to compile against these.'
            + '\n    There is no node-only-by-design category: add them to the browser barrel too.',
        );
    }
}

if (checkedNames < NAME_FLOOR) {
    problems.push(
        `only ${checkedNames} exported names read across ${packages.length} package(s), floor is ${NAME_FLOOR}.\n`
        + '    Two empty sets diff to nothing, which is what a broken matcher looks like.',
    );
}

/**
 * The GLOBAL AUGMENTATIONS, which a name diff cannot see.
 *
 * `HTMLElementEventMap` and `HTMLElementTagNameMap` are augmented by side-effect
 * modules: `import './types/event-map.js'` declares into an existing global
 * interface and EXPORTS NOTHING. So the check above — a set difference over export
 * names — was structurally blind to them, and both were pulled in by the browser
 * entry only. A consumer on `moduleResolution: node16`/`nodenext` resolves
 * `index.node.d.ts` and silently loses typed `e.detail` on every aparté event and
 * typed `querySelector('aparte-…')`.
 *
 * Checked on the SOURCE entries rather than the `.d.ts`: an augmentation-only
 * import leaves no trace in the emitted declaration beyond the reference itself,
 * and the source is where the omission is fixed.
 *
 * Core only: it is the package that declares them.
 */
const AUGMENTATIONS = ['./types/event-map.js', './types/element-map.js'];
const SRC_BROWSER = 'packages/core/src/index.ts';
const SRC_NODE = 'packages/core/src/index.node.ts';

const browserSrc = readFileSync(SRC_BROWSER, 'utf8');
const nodeSrc = readFileSync(SRC_NODE, 'utf8');
const missingAugmentations = AUGMENTATIONS.filter(
    (m) => browserSrc.includes(`import '${m}'`) && !nodeSrc.includes(`import '${m}'`),
);

if (missingAugmentations.length) {
    problems.push(
        `@aparte/core: ${missingAugmentations.length} global type augmentation(s) reach the`
        + ' browser entry and not the SSR one:\n'
        + missingAugmentations.map((m) => `      import '${m}'`).join('\n')
        + `\n    Add them to ${SRC_NODE}. They are \`import type\` throughout, so nothing is`
        + '\n    emitted and no DOM global is touched — but without them an SSR consumer loses'
        + '\n    every typed event detail and every typed element lookup, with no error to'
        + '\n    explain why.',
    );
}

if (problems.length) {
    console.error(`\n[node-barrel-types] ${problems.length} problem(s):\n`);
    for (const p of problems) console.error(`  - ${p}\n`);
    process.exit(1);
}

console.log(
    `[node-barrel-types] OK: ${packages.length} packages with a \`node\` condition, `
    + `${checkedNames} exported names, both barrels agreeing in both directions; `
    + `${elements.size} element classes and ${BROWSER_ONLY.size} named values are browser-only; `
    + 'both of core\'s global type augmentations reach the SSR entry.',
);
