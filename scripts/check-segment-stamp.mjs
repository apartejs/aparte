/**
 * A segment's identity and measurement are written in ONE place.
 *
 * `messageId`, `index`, `startedAt` and `endedAt` are stamped by
 * `packages/core/src/utils/segments.ts`, called by the two owners of a message's
 * segment array: `<aparte-chat-viewport>` (native) and `AparteChatHost`
 * (framework-managed). Nothing else may write them.
 *
 * Why a gate rather than a comment. Two owners of one invariant is the exact shape
 * of the bug this repo has now found five times — `displayName` escaped and
 * `data-role` raw two lines above it, the `artifact` branch restoring its segment
 * and `code`/`thinking` six lines up not, four `window` listeners filtering on
 * `targetId` and `compact` with no guard at all. Every time, someone fixed the path
 * they were looking at. A third owner of a segment array is the next instance, and
 * it will look perfectly reasonable in review.
 *
 * Two rules, because they fail differently:
 *
 *   1. `startedAt` / `endedAt` may only be WRITTEN in the helper. Distinctive
 *      names, so this is near-zero-noise and near-total: at the time of writing
 *      they appear in exactly one non-test file.
 *   2. a `segments` array may only be appended to / spliced in the known files.
 *      `index` and `messageId` are too common to match on directly (`segments[index]`
 *      is everywhere), so this catches the structural version instead: a new place
 *      that grows a segment list.
 *
 * A floor on the number of sites inspected comes from `check-attr-escaping`, which
 * learned it the hard way: zero offenders plus a collapsed count is the signature of
 * a matcher that stopped matching, and nothing else detects it.
 *
 * Run by `pnpm gate`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOTS = ['packages'];

/** The only file allowed to write the timestamps. */
const STAMP_HOME = 'packages/core/src/utils/segments.ts';

/**
 * Files allowed to grow or shrink a segment array.
 *
 * The two OWNERS stamp on the way in. The bubble holds a rendered VIEW of a list it
 * is handed already stamped, and the parser builds its own result array that has not
 * reached a message yet — neither is a place a segment enters a transcript. Adding a
 * name here is a decision: it means claiming that a segment arriving through that
 * file is already stamped, or does not belong to a message.
 */
const ARRAY_WRITERS = new Set([
    STAMP_HOME,
    'packages/core/src/components/viewport/aparte-chat-viewport.ts',
    'packages/core/src/host/aparte-chat-host.ts',
    'packages/core/src/components/bubble/aparte-chat-bubble.ts',
    'packages/core/src/parsers/aparte-stream-parser.ts',
]);

/** Sites the two rules are expected to inspect. Raise when the surface grows. */
const SEEN_FLOOR = 8;

const TIMESTAMP_WRITE = /\b(startedAt|endedAt)\s*[:=][^=]/;
const ARRAY_WRITE =
    /segments\.(push|splice|unshift)\(|\.segments\s*=\s|\[\s*\.\.\.\(?[A-Za-z_$][A-Za-z0-9_$]*\??\.segments/;

function* walk(dir) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
            if (['node_modules', 'dist', '.svelte-kit', '__tests__'].includes(name)) continue;
            yield* walk(path);
        } else if (/\.(ts|tsx|svelte|vue)$/.test(path) && !/\.(test|spec)\.ts$/.test(path)) {
            yield path;
        }
    }
}

const offenders = [];
let seen = 0;

for (const root of ROOTS) {
    for (const file of walk(root)) {
        const rel = relative(process.cwd(), file).split(sep).join('/');
        const lines = readFileSync(file, 'utf8').split('\n');

        lines.forEach((line, i) => {
            // Comments may legitimately name any of this — this repo's JSDoc explains
            // the rules it enforces, and a guard that reads its own documentation as
            // code is a guard that has already been broken once here.
            const t = line.trim();
            if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;

            const where = `${rel}:${i + 1}  ${t.slice(0, 88)}`;

            if (TIMESTAMP_WRITE.test(line)) {
                seen++;
                if (rel !== STAMP_HOME) {
                    offenders.push(`[timestamp] ${where}`);
                }
            }

            if (ARRAY_WRITE.test(line)) {
                seen++;
                if (!ARRAY_WRITERS.has(rel)) {
                    offenders.push(`[array] ${where}`);
                }
            }
        });
    }
}

if (offenders.length) {
    console.error(`\n[segment-stamp] ${offenders.length} site(s) outside the stamping seam:\n`);
    for (const o of offenders) console.error('  ' + o);
    console.error(
        '\nA segment\'s messageId / index / startedAt / endedAt are stamped in one place,'
        + `\n  ${STAMP_HOME}`
        + '\ncalled by the two owners of a message\'s segment array (aparte-chat-viewport,'
        + '\naparte-chat-host). A third writer means some segments carry the fields and'
        + '\nsome do not — and nothing renders them, so the gap is silent.'
        + '\n\nIf the new site really is a legitimate owner: stamp through the helper and add'
        + '\nthe file to ARRAY_WRITERS in this script, with the reason.\n',
    );
    process.exit(1);
}

if (seen < SEEN_FLOOR) {
    console.error(
        `\n[segment-stamp] only ${seen} site(s) inspected, expected at least ${SEEN_FLOOR}.`
        + '\nZero offenders with a collapsed count is what a broken matcher looks like,'
        + '\nnot what a clean tree looks like. Check the regexes before trusting this pass.\n',
    );
    process.exit(1);
}

console.log(`[segment-stamp] OK: ${seen} sites inspected, all inside the stamping seam.`);
