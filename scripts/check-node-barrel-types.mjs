/**
 * The SSR barrel exports every TYPE the browser barrel does.
 *
 * `index-node-parity.test.ts` guards the RUNTIME half and says so in its own
 * header: "types are erased and can't break an import at runtime". True at
 * runtime — and irrelevant to the failure that actually happens. TypeScript
 * resolves `types` under the `node` condition too, so a type exported from
 * `index.ts` and not from `index.node.ts` is a hard COMPILE error for every SSR
 * consumer (Next, Nuxt, SvelteKit, Angular Universal). Nothing covered that.
 *
 * This reads the two BUILT declaration files — what a consumer's compiler actually
 * sees — and diffs their exported names. Custom-element classes are browser-only by
 * design and excluded, the same way the runtime test excludes them.
 *
 * Run by `pnpm gate`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BROWSER = 'packages/core/dist/index.d.ts';
const NODE = 'packages/core/dist/index.node.d.ts';

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

/**
 * Custom-element classes: browser-only by design (they extend HTMLElement), so
 * their absence from the SSR barrel is the point, not a gap.
 *
 * Found by reading which classes actually extend HTMLElement, not by matching a
 * list of name prefixes — the first version of this did the latter and immediately
 * mis-flagged `AparteOption`, which is an element whose name did not fit the
 * pattern. A heuristic that has to be maintained is a heuristic that will lie.
 */
function elementClassNames() {
    const names = new Set();
    const stack = ['packages/core/src'];
    while (stack.length) {
        const dir = stack.pop();
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== '__tests__') stack.push(path);
            } else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) {
                const src = readFileSync(path, 'utf8');
                for (const m of src.matchAll(/export\s+class\s+([A-Za-z_$][\w$]*)\s+extends\s+HTMLElement/g)) {
                    names.add(m[1]);
                }
            }
        }
    }
    return names;
}

const browser = exportedNames(BROWSER);
const node = exportedNames(NODE);
const elements = elementClassNames();

const missing = [...browser].filter(n => !node.has(n) && !elements.has(n)).sort();

if (missing.length) {
    console.error(
        `\n[node-barrel-types] ${missing.length} export(s) in the browser barrel but not the SSR one:\n`,
    );
    for (const n of missing) console.error(`  ${n}`);
    console.error(
        '\nTypeScript resolves `types` under the `node` condition, so each of these is a\n'
        + 'compile error for an SSR consumer. Re-export them from src/index.node.ts, or —\n'
        + 'if the name really is browser-only — make that visible by naming it here.\n',
    );
    process.exit(1);
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
    console.error(
        `\n[node-barrel-types] ${missingAugmentations.length} global type augmentation(s) reach the`
        + ' browser entry and not the SSR one:\n',
    );
    for (const m of missingAugmentations) console.error(`  import '${m}'`);
    console.error(
        `\nAdd them to ${SRC_NODE}. They are \`import type\` throughout, so nothing is\n`
        + 'emitted and no DOM global is touched — but without them an SSR consumer loses\n'
        + 'every typed event detail and every typed element lookup, with no error to\n'
        + 'explain why.\n',
    );
    process.exit(1);
}

console.log(
    `[node-barrel-types] OK: the SSR barrel carries all ${browser.size - elements.size} `
    + 'non-element exports of the browser barrel, and both global type augmentations.',
);
