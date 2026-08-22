/**
 * Every public export is either NAMED in the documentation, or exempt on purpose.
 *
 * The rule this enforces was learned three times over: a capability that ships and
 * is mentioned nowhere is a capability nobody finds. `registerDefaultRenderers`,
 * `filesToAttachments()` and the composer toolbar were each rediscovered the hard
 * way — an external consumer built a workaround for something that already existed.
 * `check-element-examples.mjs` closed that for the 18 custom elements; this closes
 * it for the function and type surface.
 *
 * TWO TIERS, because the surface is not one thing.
 *
 * Tier 1 — core's VALUE exports: must be zero. That is the guarantee this guard
 * already made and it is not weakened here. Anything callable that core publishes
 * is on a page or in EXEMPT with a reason.
 *
 * Tier 2 — everything else, on a RATCHET: core's type-only exports, plus every
 * export of `@aparte/engine` and the four wrappers. Those were invisible to this
 * guard until now, for a mechanical reason: it read the names off a runtime
 * `import()` of the built JS, and TypeScript erases types at runtime. The wrappers
 * were not read at all. Reading the built `.d.ts` barrels sees both.
 *
 * Why a ratchet and not zero. The measurement when this landed was 41 unmentioned
 * across the five satellite barrels — including `AparteChatProps`, `AparteChatStore`
 * and `AparteSendEventDetail` (the first types a layout author opens), and the four
 * segment interfaces `AparteTextSegment` / `AparteCodeSegment` /
 * `AparteThinkingSegment` / `AparteTerminalSegment`, which are named on NO page at
 * all even though writing a custom renderer requires them. Demanding zero would be
 * a documentation lot wearing a guard's clothes, and it would be satisfied with
 * filler. What a ratchet buys is the thing that matters right now: the number is
 * visible, and a NEW component cannot add to it.
 *
 * The ratchet is two-sided, like the coverage floors: it fails when the count goes
 * UP, and it fails when the count drops well below its recorded maximum without the
 * maximum being lowered. A ceiling nobody lowers is a comment.
 *
 * Run by `pnpm gate`.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DOCS = 'apps/docs/src/content/docs';

/** Published barrels, by package. `types` is the declaration entry each one ships. */
const BARRELS = [
    { pkg: '@aparte/core', types: 'packages/core/dist/index.d.ts', readme: 'packages/core/README.md' },
    { pkg: '@aparte/engine', types: 'packages/engine/dist/index.d.ts', readme: 'packages/engine/README.md' },
    { pkg: '@aparte/react', types: 'packages/wrappers/react/dist/index.d.ts', readme: 'packages/wrappers/react/README.md' },
    { pkg: '@aparte/vue', types: 'packages/wrappers/vue/dist/index.d.ts', readme: 'packages/wrappers/vue/README.md' },
    { pkg: '@aparte/svelte', types: 'packages/wrappers/svelte/dist/index.d.ts', readme: 'packages/wrappers/svelte/README.md' },
    { pkg: '@aparte/angular', types: 'packages/wrappers/angular/dist/index.d.ts', readme: 'packages/wrappers/angular/README.md' },
];

/** Core's runtime barrel — the only way to tell a value export from a type export. */
const CORE_VALUES = pathToFileURL('packages/core/dist/index.node.js').href;

/**
 * Exports that are deliberately NOT part of the documented surface.
 *
 * Two kinds only: interop a wrapper needs and an app never calls, and registry
 * plumbing whose public face is a different function that IS documented. Anything
 * else belongs on a page.
 */
const EXEMPT = new Map([
    ['APARTE_HOST_ATTR', 'wrapper interop: the attribute the wrappers stamp to bind a host; an app never writes it'],
    ['APARTE_DEFAULT_SKELETON_FALLBACKS', 'internal default table, reachable through the documented setSkeleton* API'],
    ['resolveConfig', 'per-instance config plumbing for component authors; the documented surface is the `config` prop'],
    ['detachConfig', 'the counterpart of attachConfig, same reason'],
    ['runWithConfig', 'used by render hooks to resolve the right instance; not called from app code'],
    ['contextConfig', 'the ambient read of the above, same reason'],
    ['collectRendererStyles', 'called by the components to inject renderer CSS; not an app entry point'],
    ['getSegmentRenderer', 'the read side of the documented registerSegmentRenderer'],
    ['unregisterSegmentRenderer', 'the remove side of the documented registerSegmentRenderer'],
    ['defaultSanitizer', 'the default value of the documented setHtmlSanitizer'],
    ['APARTE_DEFAULT_UI_EVENTS', 'wrapper interop: the DOM events every AparteUi forwards; an app never enumerates them'],
    ['applyElementProps', 'wrapper interop: the prop/attribute/event application every AparteUi shares; its four callers are the wrappers, an app never calls it'],
    ['AparteMessageRepository', 'the message store the viewport keeps internally; an app uses appendMessage/getMessages, never the store'],
]);

/**
 * Tier-2 ceiling per package: how many exports may be named nowhere.
 *
 * These are MEASUREMENTS, not targets. Lower them as pages get written; never raise
 * one to make a build pass — a new export that nobody documented is exactly what
 * this is here to stop.
 */
const MAX_UNMENTIONED = new Map([
    ['@aparte/core', 100],      // of 171 type-only exports
    ['@aparte/engine', 0],      // of 4 — the only barrel already at zero
    ['@aparte/react', 12],      // of 20, incl. AparteChatProps and the three use* hook types
    ['@aparte/vue', 8],         // of 16
    ['@aparte/svelte', 9],      // of 17, incl. AparteChatStore
    ['@aparte/angular', 12],    // of 20, incl. APARTE_CONFIG_TOKEN and ProvideAparteOptions
]);

/** How far below its ceiling a count may sit before the ceiling must be lowered. */
const MAX_SLACK = 3;

/** Names a `.d.ts` re-exports, from every export form TypeScript emits. */
function exportedNames(file) {
    const src = readFileSync(file, 'utf8');
    const names = new Set();
    for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
        for (const part of m[1].split(',')) {
            const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim();
            if (name) names.add(name);
        }
    }
    for (const m of src.matchAll(/export\s+declare\s+(?:const|function|class|abstract\s+class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    for (const m of src.matchAll(/export\s+(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    names.delete('default');
    return names;
}

function* walk(dir) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) yield* walk(path);
        else if (path.endsWith('.md')) yield path;
    }
}

/**
 * The changelog is not documentation, and counting it as such was a hole.
 *
 * A release note says a name EXISTED — past tense, about a version — and it is
 * exactly where an export's name appears when nobody ever wrote a page for it. So
 * an export could ship, be mentioned once in its own release entry, and satisfy
 * this guard forever while a reader had nowhere to learn what it does. Measured:
 * `AparteUiProps` and `AparteUiHandle` appear in the changelog and nowhere else.
 *
 * Only the changelog is dropped, not every generated page. `reference/api.md` and
 * `reference/engine.md` are generated too, but from the source's own hand-written
 * JSDoc — they are the reference a reader actually consults.
 */
const NOT_DOCUMENTATION = ['changelog.md'];

const corpus = [...walk(DOCS), 'README.md', ...BARRELS.map(b => b.readme).filter(existsSync)]
    .filter(f => !NOT_DOCUMENTATION.some(n => f.endsWith(n)))
    .map(f => readFileSync(f, 'utf8'))
    .join('\n');

const problems = [];
const report = [];

// ── tier 1: core's value exports, strict ─────────────────────────────────
const coreValues = Object.keys(await import(CORE_VALUES)).filter(n => n !== 'default');
const missingValues = coreValues.filter(n => !EXEMPT.has(n) && !corpus.includes(n));
if (missingValues.length) {
    problems.push(
        `${missingValues.length} core VALUE export(s) named in no docs page:\n`
        + missingValues.map(n => `      ${n}`).join('\n')
        + '\n    Name it on a page (a table row is enough), or add it to EXEMPT WITH A REASON.',
    );
}
const staleExemptions = [...EXEMPT.keys()].filter(n => !coreValues.includes(n));
if (staleExemptions.length) {
    problems.push(
        `${staleExemptions.length} exemption(s) for exports that no longer exist:\n`
        + staleExemptions.map(n => `      ${n}`).join('\n')
        + '\n    Remove them, so the table keeps describing the real surface.',
    );
}

// ── tier 2: everything the runtime import cannot see ─────────────────────
const valueSet = new Set(coreValues);
for (const b of BARRELS) {
    if (!existsSync(b.types)) {
        problems.push(`${b.pkg}: no declaration barrel at ${b.types} — build the packages before running this guard.`);
        continue;
    }
    const all = [...exportedNames(b.types)].sort();
    // Core's value exports are tier 1; do not count them twice.
    const scope = b.pkg === '@aparte/core' ? all.filter(n => !valueSet.has(n)) : all;
    const missing = scope.filter(n => !EXEMPT.has(n) && !corpus.includes(n));
    const ceiling = MAX_UNMENTIONED.get(b.pkg) ?? 0;
    report.push({ pkg: b.pkg, total: all.length, scoped: scope.length, missing, ceiling });

    if (missing.length > ceiling) {
        problems.push(
            `${b.pkg}: ${missing.length} export(s) named in no docs page, ceiling is ${ceiling}.\n`
            + missing.map(n => `      ${n}`).join('\n')
            + '\n    Name them on a page, or — only if this is a deliberate widening of the\n'
            + '    surface — raise the ceiling in MAX_UNMENTIONED and say why in the commit.',
        );
    } else if (ceiling - missing.length > MAX_SLACK) {
        problems.push(
            `${b.pkg}: ceiling is ${ceiling} but only ${missing.length} are unmentioned — `
            + `${ceiling - missing.length} of slack.\n`
            + `    Lower it to ${missing.length}. A ceiling nobody lowers cannot fail, which is\n`
            + '    how a whole undocumented surface stayed invisible until it was measured.',
        );
    }
}

if (problems.length) {
    console.error(`\n[export-mentions] ${problems.length} problem(s):\n`);
    for (const p of problems) console.error(`  - ${p}\n`);
    console.error('Measured:');
    for (const r of report) console.error(`  ${r.pkg.padEnd(18)} ${String(r.missing.length).padStart(3)} unmentioned of ${r.scoped} checked (ceiling ${r.ceiling})`);
    console.error('');
    process.exit(1);
}

const documented = coreValues.length - EXEMPT.size;
const tier2 = report.reduce((s, r) => s + r.scoped, 0);
const unmentioned = report.reduce((s, r) => s + r.missing.length, 0);
console.log(
    `[export-mentions] OK: ${documented} core value exports named in the docs, ${EXEMPT.size} exempt with a reason; `
    + `${tier2} type/wrapper exports across ${BARRELS.length} barrels, ${unmentioned} unmentioned and under their ceilings.`,
);
