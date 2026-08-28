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
import { dirname, resolve } from 'node:path';

/**
 * Every bare specifier reachable from `entry`, following relative imports into the
 * chunks they point at.
 *
 * A bundler splits one entry across several files, so "what does this entry pull"
 * cannot be answered by reading the entry alone. Cycles and repeats are guarded by
 * `seen`; a relative import that does not resolve to a file on disk is reported,
 * because a chunk this guard cannot open is a chunk it cannot vouch for.
 */
function bareSpecifiersTransitively(entry) {
    const seen = new Set();
    const bare = new Set();
    const queue = [entry];
    while (queue.length) {
        const file = queue.shift();
        if (seen.has(file)) continue;
        seen.add(file);
        for (const spec of specifiers(file)) {
            if (!spec.startsWith('.')) { bare.add(spec); continue; }
            const next = resolve(dirname(file), spec);
            if (existsSync(next)) queue.push(next);
            else bare.add(`${spec} (unresolved from ${file})`);
        }
    }
    return [...bare];
}

/** entry file → the bare specifiers it may import, and why that matters. */
const CONTRACTS = [
    {
        file: 'packages/core/dist/index.js',
        bareOnly: true,
        allowed: ['@aparte/engine'],
        why: 'the zero-THIRD-PARTY-dependency promise: @aparte/engine is the one dependency, first-party '
            + '(audit 2026-08-28, D1 — the agent loop is engine\'s and ships once); the README, the docs '
            + 'and the badge all say core pulls nothing else, '
            + 'and nine `check:*` scripts existed without one of them asserting it. `package.json` '
            + 'having no `dependencies` is not the same claim — a bundled import would satisfy that '
            + 'and break the promise. This reads the built bytes: not one bare specifier',
    },
    {
        file: 'packages/core/dist/index.node.js',
        bareOnly: true,
        allowed: ['@aparte/engine'],
        why: 'the SSR entry makes the same promise and is built separately, so it can drift alone. '
            + 'It is a 1.8 KB re-export shim, so this only means anything now that the check follows '
            + 'the chunks it points at',
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
    // `bareOnly` contracts do not FORBID relative specifiers — they FOLLOW them.
    //
    // Vite emits a content-hashed shared chunk no contract can name, and skipping
    // it made this guard read a 166 KB re-export shim while 269 KB of core sat in
    // the unopened chunk. Since Vite puts a new dependency's import into whichever
    // output the importing module lands in, and most of core lands in the chunk, a
    // build that imported `marked` and `dompurify` passed cleanly. The SSR entry
    // was worse: 1.8 KB of shim, and the comment below it called that "built
    // separately, so it can drift alone".
    //
    // An internal chunk is still not a dependency, so relative specifiers are not
    // reported — they are walked, and the bare specifiers found inside them are.
    // Contracts that name a relative entry on purpose (shiki's `./core.js`) leave
    // the flag off, so their listing stays exact.
    const extra = (bareOnly ? bareSpecifiersTransitively(file) : specifiers(file))
        .filter(s => !allowed.includes(s));
    if (extra.length) {
        problems.push(
            `${file} imports ${extra.map(s => `\`${s}\``).join(', ')}, which is not in its contract.\n`
            + `    allowed: ${allowed.join(', ')}\n`
            + `    why    : ${why}`,
        );
    }
}

/**
 * The other half of the zero-dependency promise: nothing DECLARED either.
 *
 * The specifier scan above can only catch a dependency the bundler leaves external,
 * and `packages/core/vite.config.ts` declares no `external`, so Rollup INLINES a
 * third-party import and the scan sees nothing at all. The realistic way this
 * promise breaks is a line added to `dependencies` — the README, the docs and the
 * badge all say there are none, and until now nothing asserted it.
 *
 * `devDependencies` are none of this check's business: they do not ship.
 *
 * One exception, by decision (audit 2026-08-28, D1): `@aparte/engine` in `dependencies`.
 * The agent loop is engine's and core drives it, so core installs engine — first-party,
 * versioned with it, zero third-party code. Anything else stays forbidden.
 */
const ZERO_DEP_PACKAGES = ['packages/core/package.json'];
const FIRST_PARTY_ALLOWED = new Set(['@aparte/engine']);
for (const manifest of ZERO_DEP_PACKAGES) {
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
        const names = Object.keys(pkg[field] ?? {}).filter((n) => !(field === 'dependencies' && FIRST_PARTY_ALLOWED.has(n)));
        if (!names.length) continue;
        problems.push(
            `${manifest} declares ${field}: ${names.join(', ')}.\n`
            + '    why    : the zero-dependency promise. Core is the one package that must install\n'
            + '             nothing alongside itself — a markdown renderer, a highlighter or a\n'
            + '             sanitizer belongs in a providers/* or plugins/* the consumer opts into.',
        );
    }
}

if (problems.length) {
    console.error(`\n[bundle-entries] ${problems.length} problem(s):\n`);
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
