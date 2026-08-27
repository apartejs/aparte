/*
 * Generates the events reference — every `aparte-*` event, in one table.
 *
 * WHY THIS PAGE EXISTS. The 42 events were documented across five pages and no page had
 * them all, so the only way to answer "what can I listen for" was to read the whole site.
 * Worse, the one question a reader actually has — *where do I attach the listener* — was
 * nowhere: some events go out on the element, some on the chat host, some on `window`, and
 * a listener on the wrong node simply never fires.
 *
 * WHY IT NEEDS THREE SOURCES. No single one is complete, measured:
 *
 *   - `types/event-map.ts` types 35 of the 42. It cannot describe them: the detail-less
 *     ones are deliberately absent, by its own documented rule.
 *   - the custom-elements manifests describe 26. They cannot see the other 16, because
 *     those are dispatched by `AparteClient` and `AparteConfig`, which are not elements.
 *   - `@event` tags on the detail interfaces describe 29, including every lifecycle event
 *     the manifest is blind to.
 *
 * Together they cover 42 of 42, and the generator FAILS on the first one they do not —
 * which is how the last three gaps were found and closed rather than published as blanks.
 *
 * WHERE, from the source itself: `dispatchLifecycleEvent()` means the chat host with a
 * `targetId` stamp, `window.dispatchEvent` means the page, everything else means the
 * element. That is read, not assumed, because it is the fact a listener depends on.
 *
 * Output (git-ignored, always regenerated):
 *   src/content/docs/reference/events.md
 */
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { writeIfChanged, wroteOrNot } from './write-if-changed.mjs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CORE = resolve(here, '../../../packages/core');
const PLUGINS = resolve(here, '../../../packages/plugins');
const OUT = resolve(here, '../src/content/docs/reference/events.md');

/** A floor: a join that stops joining would publish a short page with nothing to say so. */
const EVENT_FLOOR = 35;

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist' || name === '__tests__') continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path, out);
        else out.push(path);
    }
    return out;
}

const sources = walk(join(CORE, 'src')).filter((f) => f.endsWith('.ts'));

// ── 1. the typed map: name -> detail type ────────────────────────────────────
const mapSrc = readFileSync(join(CORE, 'src/types/event-map.ts'), 'utf8');
const detailOf = new Map(
    [...mapSrc.matchAll(/^\s*'(aparte-[\w-]+)':\s*CustomEvent<([^>]*)>/gm)].map((m) => [m[1], m[2]]),
);

// ── 2. `@event <name>` prose, wherever it is authored ────────────────────────
const tagged = new Map();
for (const file of sources) {
    for (const block of readFileSync(file, 'utf8').matchAll(/\/\*\*((?:[^*]|\*(?!\/))*)\*\//g)) {
        const body = block[1]
            .split('\n')
            .map((line) => line.replace(/^\s*\*\s?/, ''))
            .join('\n');
        const name = body.match(/^@event\s+(aparte-[\w-]+)/m)?.[1];
        const prose = body.split(/^@/m)[0].replace(/\s+/g, ' ').trim();
        if (name && prose) tagged.set(name, prose);
    }
}

// ── 3. the manifests: description + the tags that declare it ─────────────────
const declared = new Map();
const manifests = [join(CORE, 'dist/custom-elements.json')];
if (existsSync(PLUGINS)) {
    for (const plugin of readdirSync(PLUGINS)) {
        const dir = join(PLUGINS, plugin);
        const file = join(dir, 'dist/custom-elements.json');
        /*
         * `customElements` in package.json is what separates "this plugin ships no
         * element" from "this plugin was not built".
         *
         * Three of the five plugins (marked, shiki, streaming-markdown) define no
         * element and correctly have no manifest, so a bare `existsSync` skip looked
         * right — and it silently swallowed the other case too. When
         * `plugin-model-selector`'s manifest was missing, the only symptom was
         * `aparte-model-change` losing its `@fires` evidence and coming out of the
         * grouping pass as an orphan: `pnpm run docs` died on "1 event(s) match no
         * group", which names neither the package nor the build. The guard below could
         * not help — the old loop only ever pushed files it had just seen exist, so its
         * "build the packages first" branch was unreachable.
         */
        const pkg = join(dir, 'package.json');
        const shipsElements = existsSync(pkg)
            && Object.hasOwn(JSON.parse(readFileSync(pkg, 'utf8')), 'customElements');
        if (shipsElements || existsSync(file)) manifests.push(file);
    }
}
for (const file of manifests) {
    if (!existsSync(file)) {
        console.error(`[gen-events-ref] no manifest at ${file} — build the packages first.`);
        process.exit(1);
    }
    for (const mod of JSON.parse(readFileSync(file, 'utf8')).modules ?? []) {
        for (const decl of mod.declarations ?? []) {
            if (!decl.customElement || !decl.tagName) continue;
            for (const event of decl.events ?? []) {
                const entry = declared.get(event.name) ?? { tags: [], doc: '' };
                entry.tags.push(decl.tagName);
                entry.doc ||= event.description ?? '';
                declared.set(event.name, entry);
            }
        }
    }
}

// ── 4. where it goes out, read from the dispatch itself ──────────────────────
const where = new Map();
/** Names core LISTENS for. Together with "core never dispatches it", this identifies the
 *  events a consumer sends INWARD — a direction the documentation had never named. */
const listened = new Set();
for (const file of sources) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/addEventListener\(\s*'(aparte-[\w-]+)'/g)) listened.add(m[1]);
    /*
     * A SET per name, because an event can legitimately go out from two places and picking
     * one hides half the answer. `aparte-message-aborted` is the case that proved it: the
     * client dispatches it on the chat host and `<aparte-composer>` dispatches it on
     * `window`. Keeping only the first put it under "on the chat host" above its own
     * description saying "Dispatched on `window`".
     */
    const add = (name, target) => where.set(name, (where.get(name) ?? new Set()).add(target));
    // The lifecycle helper: the chat host, bubbling, stamped with `targetId`.
    for (const m of src.matchAll(/dispatchLifecycleEvent\(\s*[\w.]+,\s*'(aparte-[\w-]+)'/g)) add(m[1], 'host');
    for (const m of src.matchAll(/(window|document|this|\w+)\.dispatchEvent\(\s*new CustomEvent[^(]*\(\s*'(aparte-[\w-]+)'/g)) {
        add(m[2], m[1] === 'window' ? 'window' : 'element');
    }
}

/** Where a reader should attach, when an event goes out from more than one node. */
const PRECEDENCE = ['host', 'window', 'element'];
const primary = (name) => PRECEDENCE.find((t) => where.get(name)?.has(t));
/* Short, because it is a table cell in a documentation column: four columns of prose
   wrapped to two lines each and the table stopped being scannable, which is the one thing
   it is for. The sentence version lives in each group's lead. */
const targetsOf = (name) => {
    /*
     * The manifest settles what the scan cannot see: `<aparte-conversation-list>` picks
     * `aparte-archive-conversation` or `-unarchive-` with a ternary, so the literal never
     * sits next to `dispatchEvent`, and `aparte-model-change` comes from a plugin package
     * this scan does not read. Both are declared `@fires` on an element, which is the
     * authority — without this they were labelled "you", the one thing they are not.
     */
    const found = where.get(name) ?? (declared.has(name) ? new Set(['element']) : new Set());
    return [...found]
        .sort((a, b) => PRECEDENCE.indexOf(a) - PRECEDENCE.indexOf(b))
        .map((t) => ({ host: 'chat host', window: '`window`', element: 'element' })[t])
        .join(' + ');
};

const names = [...new Set([...detailOf.keys(), ...declared.keys(), ...tagged.keys(), ...where.keys()])].sort();

if (names.length < EVENT_FLOOR) {
    console.error(
        `[gen-events-ref] only ${names.length} events found, floor is ${EVENT_FLOOR}. ` +
            'One of the three sources stopped matching — this page would publish a fraction of the surface.',
    );
    process.exit(1);
}

/*
 * An event with no description anywhere is the one thing this page must not publish as a
 * blank cell: the reader would learn the name and nothing else, which is the state this
 * page exists to end. Three were in that state when it was written — `@event` tags on the
 * approval-request detail and beside two `window` dispatches closed them.
 */
const undocumented = names.filter((name) => !declared.get(name)?.doc && !tagged.get(name));
if (undocumented.length) {
    console.error(
        `\n[gen-events-ref] ${undocumented.length} event(s) have no description in any source:\n` +
            undocumented.map((n) => `  ${n}`).join('\n') +
            '\n\nAdd `@event <name>` above the detail interface, or above the dispatch when there\n' +
            'is no detail. `@fires` on the element works too when an element dispatches it.\n',
    );
    process.exit(1);
}

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');

/*
 * Every name lands in exactly one group, checked after they are defined. A name in none of
 * them does not fail — it VANISHES, which is the failure this page exists to end, and it
 * already happened once: `aparte-file-gen-ready` and `-error` matched no rule because core
 * only listens for them, and they were silently absent from the first build of this page.
 */
function assertGrouped(groups) {
    const orphans = names.filter((name) => groups.filter((g) => g.of(name)).length !== 1);
    if (!orphans.length) return;
    console.error(
        `\n[gen-events-ref] ${orphans.length} event(s) match no group, or more than one:\n` +
            orphans.map((n) => `  ${n} (dispatch: ${targetsOf(n) || 'not seen in core'})`).join('\n') +
            '\n\nThe groups are the node a listener attaches to. An event in none of them would\n' +
            'be missing from the page rather than wrong on it, which is worse.\n',
    );
    process.exit(1);
}

const GROUPS = [
    {
        id: 'element',
        title: 'On the element',
        lead: 'Dispatched by the element itself and bubbling, so a listener on any ancestor — including `document` — receives them. This is where an intent lives: the user pressed something, and your app decides what it means.',
        of: (name) => primary(name) === 'element' || (!where.has(name) && declared.has(name)),
    },
    {
        id: 'host',
        title: 'On the chat host',
        lead: 'The turn lifecycle, dispatched by `AparteClient` on the `<aparte-chat>` it drives — bubbling and composed, and **stamped with `targetId`** so two chats on one page stay apart. A composer treats an ABSENT `targetId` as "for me", which is what lets a single-chat page work with no wiring at all.',
        of: (name) => primary(name) === 'host',
    },
    {
        id: 'window',
        title: 'On `window`',
        lead: 'Page-level operations, dispatched on `window` because they concern the whole document rather than one chat. A listener on an element will never see these.',
        of: (name) => primary(name) === 'window',
    },
    {
        id: 'inward',
        title: 'The ones you dispatch',
        lead: 'The only two that travel the other way: core **listens** for these and never sends them. They are how your app answers a request it received — you generated the file, so you say when it is ready. Dispatch them on `window`.',
        of: (name) => !where.has(name) && listened.has(name),
    },
];

assertGrouped(GROUPS);

let md = `---
title: Events
description: Every aparte-* event, its detail type and the node it is dispatched on — generated from the event map, the element manifests and the source.
sidebar:
  order: 5
---

<!-- AUTO-GENERATED from packages/core by apps/docs/scripts/gen-events-ref.mjs — do not edit by hand. Run \`pnpm --filter @aparte-workspace/docs gen\` to refresh. -->

Everything aparté does that your app might care about goes out as a DOM event. There are
**${names.length}** of them, and they are grouped below by the node they are dispatched on —
because that is the part a listener gets wrong: attach to the element an event never
reaches and it simply never fires, with no error to say why.

\`@aparte/core\` augments \`HTMLElementEventMap\`, so once the package is in your TypeScript
program \`addEventListener\` types the detail for you, with no cast:

\`\`\`ts
chat.addEventListener('aparte-send', (event) => {
  event.detail.content;      // string — typed, with no cast
});
\`\`\`

The four wrappers surface six of these as callbacks in their own idiom
([Wrapper surface](/reference/wrappers/#callbacks)); everything else is listened for on the
DOM, in every framework alike.
`;

for (const group of GROUPS) {
    const members = names.filter(group.of);
    if (!members.length) continue;
    md += `\n## ${group.title}\n\n${group.lead}\n\n| Event | Detail | Dispatched on | Fired by |\n| --- | --- | --- | --- |\n`;
    for (const name of members) {
        const detail = detailOf.get(name);
        const tags = declared.get(name)?.tags ?? [];
        // Every target, not the primary one: an event that goes out on two nodes is
        // listenable on either, and hiding one is the half-answer this page exists to end.
        // Core never dispatches an inward event, so neither an element nor the client is
        // what fires it — saying `AparteClient` there was the same lie twice in one row.
        const inward = !where.has(name) && !declared.has(name) && listened.has(name);
        const by = inward ? 'your app' : tags.length ? tags.map((t) => `\`<${t}>\``).join(', ') : '`AparteClient`';
        md += `| \`${name}\` | ${detail ? `\`${esc(detail)}\`` : '—'} | ${targetsOf(name) || '`window`'} | ${by} |\n`;
    }
    md += `\n`;
    for (const name of members) {
        md += `\n### \`${name}\`\n\n${esc(declared.get(name)?.doc || tagged.get(name))}\n`;
    }
}

md += `
## A detail-less event is not an oversight

${names.filter((n) => !detailOf.has(n)).map((n) => `\`${n}\``).join(', ')} carry no detail,
and are deliberately absent from \`AparteEventMap\`: a map entry would type \`event.detail\`
as \`null\` and gain nothing. The name is the whole message.
`;

mkdirSync(dirname(OUT), { recursive: true });
const wrote = writeIfChanged(OUT, md);
console.log(
    `[gen-events-ref] ${wroteOrNot(wrote)} ${names.length} events → ${OUT}` +
        ` (${detailOf.size} typed, ${declared.size} on an element, ${tagged.size} with @event prose)`,
);
