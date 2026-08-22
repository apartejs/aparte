/**
 * A separate entry point exists to keep weight OUT. Prove that it does.
 *
 * Ratified decision #9(b): runtime laziness is not distribution weight. A static
 * import of shiki's full grammar bundle costs every consumer 302 chunks whatever
 * the options say, which is why `@aparte/plugin-shiki/core` exists — the lever is a
 * separate entry, not a flag.
 *
 * That promise was carried by a COMMENT ("verified by `dist/core.js` importing
 * nothing but `@aparte/core`"), and nothing verified it. One added import in
 * `core.ts` would silently restore the whole regression with every test green,
 * because no test and no bundle-size check exists anywhere in the repo.
 *
 * The rule is one line per entry: which bare specifiers is it allowed to pull?
 *
 * Run by `pnpm gate`.
 */
import { readFileSync, existsSync } from 'node:fs';

/** entry file → the bare specifiers it may import, and why that matters. */
const CONTRACTS = [
    {
        file: 'packages/core/dist/index.js',
        bareOnly: true,
        allowed: [],
        why: 'the zero-dependency promise: the README, the docs and the badge all say core has none, '
            + 'and nine `check:*` scripts existed without one of them asserting it. `package.json` '
            + 'having no `dependencies` is not the same claim — a bundled import would satisfy that '
            + 'and break the promise. This reads the built bytes: not one bare specifier',
    },
    {
        file: 'packages/core/dist/index.node.js',
        bareOnly: true,
        allowed: [],
        why: 'the SSR entry makes the same promise and is built separately, so it can drift alone',
    },
    {
        file: 'packages/plugins/shiki/dist/core.js',
        allowed: ['@aparte/core'],
        why: 'the size-conscious entry: the caller builds the highlighter, so shiki itself must not be pulled in',
    },
    {
        file: 'packages/plugins/shiki/dist/index.js',
        allowed: ['@aparte/core', 'shiki', './core.js'],
        why: 'the batteries-included entry: pulling shiki is the point',
    },
];

/** Bare + relative specifiers a built ESM file imports or re-exports. */
function specifiers(file) {
    const src = readFileSync(file, 'utf8');
    const found = new Set();
    for (const m of src.matchAll(/(?:^|[\s;}])(?:import|export)[^;]*?from\s*["']([^"']+)["']/g)) found.add(m[1]);
    for (const m of src.matchAll(/(?:^|[\s;}])import\s*["']([^"']+)["']/g)) found.add(m[1]);
    for (const m of src.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) found.add(m[1]);
    return [...found];
}

const problems = [];
for (const { file, allowed, why, bareOnly } of CONTRACTS) {
    if (!existsSync(file)) {
        problems.push(`${file} is missing — run \`pnpm build\` first.`);
        continue;
    }
    // `bareOnly` contracts ignore relative specifiers. Vite emits a content-hashed
    // shared chunk (`./index-B_yeCwcF.js`) that no contract can name, and an
    // internal chunk is not a dependency — the claim being guarded is about what
    // a consumer's install pulls. Contracts that name a relative entry on purpose
    // (shiki's `./core.js`) leave the flag off, so their listing stays exact.
    const extra = specifiers(file)
        .filter(s => !(bareOnly && s.startsWith('.')))
        .filter(s => !allowed.includes(s));
    if (extra.length) {
        problems.push(
            `${file} imports ${extra.map(s => `\`${s}\``).join(', ')}, which is not in its contract.\n`
            + `    allowed: ${allowed.join(', ')}\n`
            + `    why    : ${why}`,
        );
    }
}

if (problems.length) {
    console.error(`\n[bundle-entries] ${problems.length} entry point(s) pull more than they promise:\n`);
    for (const p of problems) console.error(`  ${p}\n`);
    console.error(
        'Either move the import to the batteries-included entry, or change the contract\n'
        + 'in this script AND the claim in the docs — the two have to say the same thing.\n',
    );
    process.exit(1);
}

console.log(
    `[bundle-entries] OK: ${CONTRACTS.length} entry points import only what their contract allows.`,
);
