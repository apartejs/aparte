/**
 * Every public export is either NAMED in the documentation, or exempt on purpose.
 *
 * The rule this enforces was learned three times over: a capability that ships and
 * is mentioned nowhere is a capability nobody finds. `registerDefaultRenderers`,
 * `filesToAttachments()` and the composer toolbar were each rediscovered the hard
 * way — an external consumer built a workaround for something that already existed.
 * `check-element-examples.mjs` closed that for the 18 custom elements; the FUNCTION
 * surface had no equivalent, and a sweep found 18 of 49 exports named in no page at
 * all — including `readableToAsyncIterable`, which happens to be the fix for a
 * broken snippet on another page.
 *
 * "Named in the docs" is a deliberately low bar. It is not "has an example": an
 * example gate over 49 exports would either take a rewrite of the site or be
 * satisfied with filler, and filler is worse than a table. What this closes is the
 * silent case — shipped, and mentioned nowhere.
 *
 * The exemption table is the other half. Every entry carries a REASON, so the
 * decision is visible and greppable rather than an absence nobody can see.
 *
 * Run by `pnpm gate`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Resolved from the repo root, not from this script's folder: the import is
// relative to the module, and `pnpm gate` runs from the root either way.
const BARREL = pathToFileURL('packages/core/dist/index.node.js').href;
const DOCS = 'apps/docs/src/content/docs';
const EXTRA = ['README.md'];

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
    ['AparteMessageRepository', 'the message store the viewport keeps internally; an app uses appendMessage/getMessages, never the store'],
]);

function* walk(dir) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) yield* walk(path);
        else if (path.endsWith('.md')) yield path;
    }
}

const corpus = [...walk(DOCS), ...EXTRA].map(f => readFileSync(f, 'utf8')).join('\n');
const names = Object.keys(await import(BARREL)).sort();

const missing = names.filter(n => !EXEMPT.has(n) && !corpus.includes(n));
const staleExemptions = [...EXEMPT.keys()].filter(n => !names.includes(n));

if (missing.length || staleExemptions.length) {
    if (missing.length) {
        console.error(`\n[export-mentions] ${missing.length} public export(s) named in no docs page:\n`);
        for (const n of missing) console.error(`  ${n}`);
        console.error(
            '\nName it on a page (a table row is enough), or add it to EXEMPT in this\n'
            + 'script WITH A REASON. A capability mentioned nowhere is one nobody finds —\n'
            + 'that is how the last three friction reports started.\n',
        );
    }
    if (staleExemptions.length) {
        console.error(
            `[export-mentions] ${staleExemptions.length} exemption(s) for exports that no longer exist:\n`
            + staleExemptions.map(n => `  ${n}`).join('\n')
            + '\n\nRemove them, so the table keeps describing the real surface.\n',
        );
    }
    process.exit(1);
}

console.log(
    `[export-mentions] OK: ${names.length - EXEMPT.size} public exports are named in the docs, `
    + `${EXEMPT.size} exempt with a stated reason.`,
);
