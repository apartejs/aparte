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
import { dirname, join, resolve } from 'node:path';
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
    // The plugins, providers and locales, which were not measured at all — so
    // Tier 1's "a value export must be named somewhere" applied to core alone.
    { pkg: '@aparte/plugin-marked', types: 'packages/plugins/marked/dist/index.d.ts', readme: 'packages/plugins/marked/README.md' },
    { pkg: '@aparte/plugin-shiki', types: 'packages/plugins/shiki/dist/index.d.ts', readme: 'packages/plugins/shiki/README.md' },
    { pkg: '@aparte/plugin-streaming-markdown', types: 'packages/plugins/streaming-markdown/dist/index.d.ts', readme: 'packages/plugins/streaming-markdown/README.md' },
    { pkg: '@aparte/plugin-model-selector', types: 'packages/plugins/model-selector/dist/index.d.ts', readme: 'packages/plugins/model-selector/README.md' },
    { pkg: '@aparte/plugin-ask-user', types: 'packages/plugins/ask-user/dist/index.d.ts', readme: 'packages/plugins/ask-user/README.md' },
    { pkg: '@aparte/provider-openai-compat', types: 'packages/providers/ai/openai-compat/dist/index.d.ts', readme: 'packages/providers/ai/openai-compat/README.md' },
    { pkg: '@aparte/provider-ai-sdk', types: 'packages/providers/ai/ai-sdk/dist/index.d.ts', readme: 'packages/providers/ai/ai-sdk/README.md' },
    { pkg: '@aparte/provider-transformers', types: 'packages/providers/ai/transformers/dist/index.d.ts', readme: 'packages/providers/ai/transformers/README.md' },
    { pkg: '@aparte/locale-fr', types: 'packages/locales/fr/dist/index.d.ts', readme: 'packages/locales/fr/README.md' },
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
    // The five below dropped when every element's events gained a TYPED detail and the
    // generated api reference gained a Type column to print it in. The detail
    // interfaces were exported all along; nothing named them anywhere a reader looks.
    // Core lost 17, and each wrapper exactly 4 — the four conversation/optgroup/select
    // detail types they re-export from core.
    // Ratcheted 80 → 76 when the guard was taught to read `.mdx`. It walked `.md`
    // only, so the whole component catalogue — the pages that name every element class,
    // every event-detail type and every segment interface — was invisible to it from
    // the day those pages stopped being `reference/api.md`. The exports were documented;
    // the guard could not see the documentation. Each wrapper drops for the same reason.
    // Ratcheted 76 → 66 by the generated events reference. It names every event-detail
    // interface in one place, which is ten types that were exported, typed in the event
    // map, and named on no page a reader opens.
    ['@aparte/core', 66],      // of 200 exports checked
    ['@aparte/react', 6],
    ['@aparte/vue', 2],
    ['@aparte/svelte', 3],
    ['@aparte/angular', 6],
    ['@aparte/engine', 0],      // of 39 — credited by the generated reference; see below
    // First measurement of these nine. They are VALUE exports a consumer calls —
    // `setupShikiProvider`, `askUserTool`, `createAiSdkProvider` — so they matter
    // more than a type, and the ratchet is only the first step: it makes the number
    // visible and stops it growing. Writing the pages is a lot of its own.
    ['@aparte/plugin-marked', 0],
    ['@aparte/plugin-shiki', 3],
    ['@aparte/plugin-streaming-markdown', 0],
    ['@aparte/plugin-model-selector', 2],
    ['@aparte/plugin-ask-user', 6],
    ['@aparte/provider-openai-compat', 2],
    ['@aparte/provider-ai-sdk', 5],
    ['@aparte/provider-transformers', 9],
    ['@aparte/locale-fr', 0],
]);

/*
 * A NOTE ON WHAT COUNTS, because the fourth audit and this guard disagree, and the
 * disagreement is legitimate.
 *
 * `reference/engine.md` is a TypeDoc dump, and the corpus includes it — so all 39
 * engine exports read as documented. The audit's stricter view is that a generated
 * dump is not teaching: outside it only `runStreamAgent` appears in a code fence.
 * Both are defensible; the corpus keeps the generated references because they are
 * what a reader actually consults, and only the CHANGELOG is excluded (a release
 * note says a name existed, which is not the same as explaining it).
 *
 * Recording the disagreement rather than silently picking a side: if a future round
 * decides a TypeDoc dump does not count, this ceiling jumps by 36 and the fix is 36
 * pages, not a number.
 */

/** How far below its ceiling a count may sit before the ceiling must be lowered. */
const MAX_SLACK = 3;

/**
 * A floor on the number of exports SEEN, not just on how many are unmentioned.
 *
 * Removing the `export *` follower drops the measured surface from 345 to 309 and
 * fails nothing, because the 36 it stops seeing all happened to be documented. So
 * the guard would quietly vouch for less and less. Two other guards in this repo
 * learned the same lesson the same way (`check-attr-escaping`'s SEEN_FLOOR,
 * `check-cross-refs`'s SCANNED_FLOOR): a collapsed count is the signature of a
 * broken matcher, and nothing else detects it.
 *
 * Measured 345 when this was written; the floor is that minus ~3%.
 */
const SEEN_FLOOR = 335;

/**
 * Names a `.d.ts` re-exports, from every export form TypeScript emits —
 * INCLUDING `export * from './x.js'`, which it follows into the referenced
 * declaration file.
 *
 * Without that, a barrel written entirely as star re-exports reads as almost empty:
 * `@aparte/engine`'s is five `export *` lines plus two explicit ones, so this
 * reported 4 names for a 39-name surface and then certified the package as "already
 * at zero unmentioned". A guard that cannot see a module's exports cannot vouch for
 * their documentation.
 */
function exportedNames(file, seen = new Set()) {
    if (seen.has(file)) return new Set();
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    const names = new Set();

    for (const m of src.matchAll(/export\s+\*\s+from\s+'([^']+)'/g)) {
        const target = resolve(dirname(file), m[1].replace(/\.js$/, '.d.ts'));
        if (!existsSync(target)) continue;
        for (const n of exportedNames(target, seen)) names.add(n);
    }
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
        // `.mdx` as well as `.md`. It was `.md` only, and that silently blinded the
        // guard to the entire component catalogue the day those pages became `.mdx`:
        // every element class, every event-detail type and every segment interface
        // read as undocumented, while the pages naming them sat right there.
        else if (path.endsWith('.md') || path.endsWith('.mdx')) yield path;
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
 * Only the changelog is dropped, not every generated page. The component catalogue
 * under `components/` and `reference/engine.md` are generated too, but from the
 * source's own hand-written JSDoc — they are the reference a reader actually consults.
 */
const NOT_DOCUMENTATION = ['changelog.md'];

const corpus = [...walk(DOCS), 'README.md', ...BARRELS.map(b => b.readme).filter(existsSync)]
    .filter(f => !NOT_DOCUMENTATION.some(n => f.endsWith(n)))
    .map(f => readFileSync(f, 'utf8'))
    .join('\n');

/**
 * WORD-BOUNDARY matching, not `corpus.includes(name)`.
 *
 * A substring test credits a shorter export whenever a longer documented name
 * contains it: `AparteConversationList` was passing on the strength of
 * `AparteConversationListItem`, `AparteElicitation` on
 * `AparteElicitationField`. Four core exports were counted as documented purely
 * that way — the guard's own leniency, not anybody's page.
 */
const mentioned = (name) => new RegExp(`(?<![A-Za-z0-9_$])${name}(?![A-Za-z0-9_$])`).test(corpus);

const problems = [];
const report = [];

// ── tier 1: core's value exports, strict ─────────────────────────────────
const coreValues = Object.keys(await import(CORE_VALUES)).filter(n => n !== 'default');
const missingValues = coreValues.filter(n => !EXEMPT.has(n) && !mentioned(n));
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
    const missing = scope.filter(n => !EXEMPT.has(n) && !mentioned(n));
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
if (tier2 < SEEN_FLOOR) {
    console.error(
        `\n[export-mentions] only ${tier2} exports seen across ${BARRELS.length} barrels `
        + `(floor ${SEEN_FLOOR}).\n`
        + 'A collapsed count means the declaration reader is broken, not that the surface\n'
        + 'shrank. Check that `export *` is still being followed.\n',
    );
    process.exit(1);
}
const unmentioned = report.reduce((s, r) => s + r.missing.length, 0);
console.log(
    `[export-mentions] OK: ${documented} core value exports named in the docs, ${EXEMPT.size} exempt with a reason; `
    + `${tier2} type/wrapper exports across ${BARRELS.length} barrels, ${unmentioned} unmentioned and under their ceilings.`,
);
