/*
 * The chat surface: every event a listener on the chat's root hears — read from ONE place.
 *
 * `<aparte-chat>`'s `@fires` are that list, and they are the source the wrapper bindings
 * are generated from. A list a generator trusts has to be kept true by something other than
 * care, so this module reads what really reaches the root and `check-event-map` (rule 5)
 * holds the `@fires` equal to it, in both directions.
 *
 * What reaches the root, read from the source:
 *
 *   • the PARTS — every `<aparte-*>` the five wrapper chat components render
 *     (`SOURCES` in `wrapper-surface.mjs`) and `<aparte-chat>`'s own default composition,
 *     then every tag those elements create in turn (the viewport makes the bubbles), plus
 *     the composer's whole family (`<aparte-composer>` and every `<aparte-composer-*>`): a
 *     composer primitive finds its root with `closest('aparte-composer')`, so it works only
 *     inside one, wherever it sits. `<aparte-composer-action>` is the case: decision #3
 *     makes it THE composer button, an element the app writes into the toolbar slot, so no
 *     wrapper renders it — and the chat hears its `aparte-action-click` all the same.
 *     A part's dispatch counts when it can reach the root: not on `window` or `document`,
 *     and bubbling (or an init the matcher cannot read, which might).
 *   • the HOST — what is dispatched on the chat itself rather than by a part:
 *     `dispatchLifecycleEvent` (the turn, from `AparteClient`, the stream adapter and the
 *     framework host), and a dispatch on a `host` (the conversation controller's
 *     `binding.host`, which sends `aparte-conversation-loaded`).
 *
 * Minus {@link CHAT_EXEMPT}: events that do reach the root and are deliberately not the
 * chat's surface, each with its reason. What is NOT read, on purpose: a dispatch a part
 * makes through a helper in another file (no import graph is followed — an import is not a
 * call), and what an app or a plugin places inside the chat. Those are the generic path.
 *
 * Consumed by `scripts/check-event-map.mjs` (rule 5), and by the generators and tests of
 * the wrapper bindings through {@link readChatEvents}.
 */
import { CORE_CEM, dispatchesIn, elementsOf, readCoreTree, repoPath, stripComments } from './dispatch-sites.mjs';
import { SOURCES } from './wrapper-surface.mjs';
import { readFileSync } from 'node:fs';

/** The element whose `@fires` are the chat's surface. */
export const CHAT_TAG = 'aparte-chat';

/** A collapsed reading is a broken matcher, not a small surface. Measured at 23. */
export const CHAT_EVENT_FLOOR = 20;
/** The same, for the parts: measured at 13 (the rendered ones, the composer's family). */
export const CHAT_PART_FLOOR = 10;

/**
 * Events that reach the chat's root and are not the chat's surface — a decision each, with
 * its reason, rather than an omission. An exempt name must not be declared on the chat, and
 * an exemption whose event core no longer sends on any element is refused as stale.
 *
 * The reasons are facts about the library, written so they can be shown to a reader.
 */
export const CHAT_EXEMPT = new Map([
    ['aparte-branch-navigate',
        'the `‹1/2›` picker\'s request to the viewport, which handles it and stops it there; the viewport '
        + 'answers with `aparte-path-changed`, the event an app hears.'],
    ['aparte-composer-submit',
        'a standalone `<aparte-composer-input>`\'s Enter. In a chat only the bubble\'s inline editor sends it '
        + '(an input inside the composer calls `submit()` instead), so it reaches the root only during an '
        + 'edit, which the bubble turns into `aparte-edit`, the event an app hears.'],
    // Sent through `enhanceTabs` (`utils/tabs.ts`), a helper the panel calls, so the reading
    // above never sees it: listed because it does reach the root, during a stepped form.
    ['aparte-tab-change',
        'the elicitation panel moving between the questions of a stepped form (its step chips, driven by '
        + '`enhanceTabs`): the panel\'s own navigation, which it listens to itself.'],
]);

/** Window-level receivers: an event dispatched on one of these reaches no element listener. */
const PAGE = new Set(['window', 'document', 'globalThis', 'self']);

/** Every tag a source renders or creates: `<aparte-x` in a template, `createElement('aparte-x')`. */
function tagsIn(src) {
    const out = new Set();
    for (const m of stripComments(src).matchAll(/<(aparte-[a-z0-9-]+)\b|createElement\(\s*['"](aparte-[a-z0-9-]+)['"]/g)) {
        out.add(m[1] ?? m[2]);
    }
    return out;
}

/**
 * The tree rule 5 reads: core's (`readCoreTree`) plus the five wrapper chat sources, under
 * their repo-relative paths in the same `files` map.
 */
export function readChatTree({ cemFile = CORE_CEM } = {}) {
    const tree = readCoreTree({ cemFile });
    for (const abs of Object.values(SOURCES)) tree.files.set(repoPath(abs), readFileSync(abs, 'utf8'));
    return tree;
}

/**
 * The chat's parts: tags, and the sources the tags were first read from (the wrappers and
 * the chat's own composition), so a test can blank them and watch the floor catch it.
 */
export function readChatParts(tree) {
    const elements = elementsOf(tree.cem);
    const chat = elements.get(CHAT_TAG);
    const sources = [...Object.values(SOURCES).map(repoPath), ...(chat ? [chat.path] : [])];
    const parts = new Set(chat ? [CHAT_TAG] : []);
    const queue = [];
    const add = (tag) => {
        if (parts.has(tag) || !elements.has(tag)) return;
        parts.add(tag);
        queue.push(tag);
    };
    for (const path of sources) for (const tag of tagsIn(tree.files.get(path) ?? '')) add(tag);
    for (const tag of elements.keys()) if (/^aparte-composer(?:-|$)/.test(tag)) add(tag);
    // What a part creates is a part: the viewport draws the bubbles, the bubble its editor.
    while (queue.length) {
        const tag = queue.shift();
        for (const inner of tagsIn(tree.files.get(elements.get(tag).path) ?? '')) add(inner);
    }
    return { parts: [...parts].sort(), sources };
}

/**
 * name → `{ from: Set<tag | 'host'>, cancelable: Set<boolean> }` — every event that reaches
 * the chat's root, before the exemptions.
 */
function heardAtRoot(tree, parts) {
    const elements = elementsOf(tree.cem);
    const elementPaths = new Set([...elements.values()].map((e) => e.path));
    const heard = new Map();
    const hear = (name, from, cancelable) => {
        if (!heard.has(name)) heard.set(name, { from: new Set(), cancelable: new Set() });
        heard.get(name).from.add(from);
        heard.get(name).cancelable.add(cancelable);
    };
    let partsRead = 0;
    for (const tag of parts) {
        const src = tree.files.get(elements.get(tag).path);
        if (src === undefined) continue;
        if (src.trim()) partsRead++;
        for (const site of dispatchesIn(stripComments(src))) {
            if (site.onWindow || PAGE.has(site.receiver) || site.bubbles === false) continue;
            hear(site.name, tag, site.cancelable);
        }
    }
    for (const [path, text] of tree.files) {
        if (!path.startsWith('packages/core/src/') || elementPaths.has(path)) continue;
        for (const site of dispatchesIn(stripComments(text))) {
            if (site.onWindow || PAGE.has(site.receiver)) continue;
            if (site.viaHelper || /(?:^|\.)host$/.test(site.receiver ?? '')) hear(site.name, 'host', site.cancelable);
        }
    }
    return { heard, partsRead };
}

/** The type argument of `CustomEvent<X>`, or `null` for a bare `CustomEvent`. */
const detailOf = (type) => /^CustomEvent<(.+)>$/.exec(type ?? '')?.[1] ?? null;

/**
 * Rule 5 — the chat's `@fires` equal what reaches its root, minus the exemptions.
 *
 * Also: each declared type is the event map's (a bare `CustomEvent` for the detail-less
 * events), so a binding generated from it is typed right; every site of one event agrees on
 * `cancelable`; and the description says "cancelable" exactly when the event is — the
 * Angular generator keys its `preventDefault()` note on that word.
 */
export function checkChatSurface(tree, { exempt = CHAT_EXEMPT } = {}) {
    const problems = [];
    const chat = elementsOf(tree.cem).get(CHAT_TAG);
    if (!chat) {
        return { problems: [`the manifest has no <${CHAT_TAG}> — the chat surface cannot be read at all.`], surface: [], parts: [], partsRead: 0 };
    }
    const { parts } = readChatParts(tree);
    const { heard, partsRead } = heardAtRoot(tree, parts);
    const declared = new Map((chat.decl.events ?? []).map((e) => [e.name, e]));
    const where = (name) => [...heard.get(name).from].sort()
        .map((f) => (f === 'host' ? 'the chat\'s host' : `<${f}>`)).join(', ');

    for (const name of [...heard.keys()].sort()) {
        if (declared.has(name) || exempt.has(name)) continue;
        problems.push(
            `"${name}" reaches the chat root — sent, bubbling, by ${where(name)} — and <${CHAT_TAG}> does\n`
            + `      not declare it, so no wrapper binding is generated for it. Add\n`
            + `      \`@fires {${tree.mapTypes.get(name) ?? 'CustomEvent'}} ${name} - …\` to ${chat.path}, written\n`
            + '      for a listener on the chat; or, if the chat keeps it to itself, add it to CHAT_EXEMPT in\n'
            + '      scripts/chat-surface.mjs with the reason.',
        );
    }

    for (const [name, ev] of declared) {
        if (exempt.has(name)) {
            problems.push(
                `<${CHAT_TAG}> declares "${name}", which CHAT_EXEMPT keeps off the chat's surface: ${exempt.get(name)}\n`
                + '      Remove the @fires, or remove the exemption if the chat now owns the event.',
            );
            continue;
        }
        if (!heard.has(name)) {
            problems.push(
                `<${CHAT_TAG}> declares "${name}", and nothing in the chat dispatches it on an element the root\n`
                + '      hears — no part bubbles it, the host does not send it. A binding for it could never fire.\n'
                + `      Remove the @fires from ${chat.path}.`,
            );
            continue;
        }
        const expected = tree.mapTypes.get(name) ?? 'CustomEvent';
        const actual = ev.type?.text ?? '(no type)';
        if (actual !== expected) {
            problems.push(
                `<${CHAT_TAG}> declares "${name}" as \`${actual}\`, and the event map types it \`${expected}\`.\n`
                + `      A binding generated from the chat would carry the wrong detail: write \`@fires {${expected}} ${name}\`.`,
            );
        }
        const flags = heard.get(name).cancelable;
        if (flags.size > 1) {
            problems.push(
                `"${name}" is cancelable at one dispatch site and not at another (${where(name)}), so a listener\n`
                + '      on the chat cannot know whether `preventDefault()` does anything. Make the sites agree.',
            );
            continue;
        }
        const cancelable = flags.has(true);
        const says = /cancelable/i.test(ev.description ?? '');
        if (cancelable !== says) {
            problems.push(
                cancelable
                    ? `"${name}" is cancelable where it is dispatched, and the chat's description does not say so —\n`
                        + '      write "Cancelable:" and what `preventDefault()` does.'
                    : `"${name}" is not cancelable where it is dispatched, and the chat's description says it is.`,
            );
        }
    }

    // An exemption names an event core really sends on an element, or it has outlived it.
    const sentOnElement = new Set();
    for (const [path, text] of tree.files) {
        if (!path.startsWith('packages/core/src/')) continue;
        for (const site of dispatchesIn(stripComments(text))) if (!site.onWindow && !PAGE.has(site.receiver)) sentOnElement.add(site.name);
    }
    for (const name of exempt.keys()) {
        if (sentOnElement.has(name)) continue;
        problems.push(`CHAT_EXEMPT lists "${name}", which core no longer dispatches on any element — remove the entry.`);
    }

    const surface = [...declared.keys()].filter((n) => heard.has(n) && !exempt.has(n));
    if (surface.length < CHAT_EVENT_FLOOR) {
        problems.push(
            `only ${surface.length} chat event(s) both declared and heard, floor is ${CHAT_EVENT_FLOOR}. A collapsed\n`
            + '      reading is what a broken matcher looks like — or a manifest whose chat lost its docblock.',
        );
    }
    if (partsRead < CHAT_PART_FLOOR) {
        problems.push(
            `only ${partsRead} chat part(s) read, floor is ${CHAT_PART_FLOOR}: the tags the wrappers render were not\n`
            + `      found (${Object.values(SOURCES).map(repoPath).join(', ')}).`,
        );
    }
    return { problems, surface, parts, partsRead, heard: heard.size };
}

/**
 * The chat's events, as a generator or a test needs them: in the order `<aparte-chat>`
 * declares them, each with its manifest type, its detail type (`null` for none), the
 * chat's own description, whether it is cancelable — read from the dispatch site, which is
 * the truth — and who sends it (`'host'` for the chat's host, else a part's tag).
 *
 * The exempt names are never in it. Trust it only on a tree rule 5 passes on: a declared
 * event nothing sends comes back `cancelable: false, from: []`.
 */
export function readChatEvents(tree = readChatTree()) {
    const chat = elementsOf(tree.cem).get(CHAT_TAG);
    if (!chat) throw new Error(`the manifest has no <${CHAT_TAG}>.`);
    const { heard } = heardAtRoot(tree, readChatParts(tree).parts);
    return (chat.decl.events ?? [])
        .filter((ev) => !CHAT_EXEMPT.has(ev.name))
        .map((ev) => ({
            name: ev.name,
            type: ev.type?.text ?? 'CustomEvent',
            detail: detailOf(ev.type?.text),
            description: (ev.description ?? '').trim(),
            cancelable: heard.get(ev.name)?.cancelable.has(true) ?? false,
            from: [...(heard.get(ev.name)?.from ?? [])].sort(),
        }));
}
