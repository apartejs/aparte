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

/**
 * Every entry point by which HISTORY reaches a transcript, and the call each must make.
 *
 * ## Why a named list, when the rest of this file is regexes
 *
 * The two rules above match *syntax*: `segments.push(`, `.segments =`, a spread of a
 * segment array. Every load path moves a whole `AparteMessage` object instead — so the
 * guard was structurally blind to exactly the place the bug lived. Four paths existed,
 * they disagreed, and this script reported OK the whole time: `setMessages` invented a
 * `startedAt` for a three-week-old conversation, `importTree` wrote to the repository
 * raw, `addMessage` did nothing, and `AparteChatHost.appendMessage` — same name as the
 * viewport's method, opposite behaviour — did nothing either.
 *
 * A list of names is cruder than a matcher and it is the only thing that can fail when
 * a FIFTH path is added: a new method that quietly forwards a stored list matches no
 * pattern, but it will not be in here, and its absence is the whole point. The cost is
 * that renaming a method must be paired with an edit here — deliberately.
 */
const ADOPTERS = [
    { file: 'packages/core/src/components/viewport/aparte-chat-viewport.ts', anchor: 'setMessages(messages: AparteMessage[]): void {' },
    { file: 'packages/core/src/components/viewport/aparte-chat-viewport.ts', anchor: 'addMessage(message: AparteMessage): void {' },
    { file: 'packages/core/src/components/viewport/aparte-chat-viewport.ts', anchor: 'importTree(tree: ExportedMessageRepository): void {' },
    { file: 'packages/core/src/host/aparte-chat-host.ts', anchor: 'appendMessage(message: AparteMessage, options?: { historical?: boolean }): void {' },
    { file: 'packages/core/src/host/aparte-chat-host.ts', anchor: 'setMessages: (msgs) => {' },
];

/** How far past the signature to look. A method that needs more is too long anyway. */
const ADOPTER_WINDOW = 40;
/**
 * The verbs that count as adopting — the seam's own, and nothing else.
 *
 * No call parentheses required: `msgs.map(adoptMessageSegments)` passes the verb as a
 * mapper, which is adopting. Demanding a `(` made this rule report a path that was
 * already correct, which is the kind of false positive that gets a guard disabled.
 */
const ADOPTION = /\badopt(Segment|MessageSegments)\b|\{\s*historical:\s*true\s*\}/;

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

// ── the third rule: every load path adopts ────────────────────────────────────
const unadopted = [];
for (const { file, anchor } of ADOPTERS) {
    let lines;
    try {
        lines = readFileSync(file, 'utf8').split('\n');
    } catch {
        unadopted.push(`${file} — file not found; a rename needs an edit in ADOPTERS`);
        continue;
    }
    const at = lines.findIndex((l) => l.includes(anchor));
    if (at === -1) {
        unadopted.push(`${file} — no line matches \`${anchor}\`; renamed or resignatured?`);
        continue;
    }
    const body = lines.slice(at, at + ADOPTER_WINDOW).join('\n');
    if (!ADOPTION.test(body)) {
        unadopted.push(`${file}:${at + 1} — \`${anchor.slice(0, 48)}\` does not adopt`);
    }
}
if (unadopted.length) {
    console.error(`\n[segment-stamp] ${unadopted.length} load path(s) that do not adopt:\n`);
    for (const u of unadopted) console.error('  ' + u);
    console.error(
        '\nHistory is not a segment starting now. A path that hands core a stored list must'
        + '\nrun it through `adoptMessageSegments` (or pass `{ historical: true }`), which'
        + '\nrecomputes `messageId`/`index`, writes no time, and settles what it adopts.'
        + '\nOtherwise the same stored conversation comes back with different numbers'
        + '\ndepending on the mode — which is what this rule exists to have caught once.\n',
    );
    process.exit(1);
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

console.log(
    `[segment-stamp] OK: ${seen} sites inspected, all inside the stamping seam; `
    + `${ADOPTERS.length} load paths all adopt.`,
);
