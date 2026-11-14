/*
 * Where core dispatches its events, read from the source — the one reader of a dispatch site.
 *
 * `check-event-map` grew this matcher for its first four rules, and `chat-surface.mjs`
 * needs the same reading to know what reaches the chat's root. Two copies of a matcher is
 * how a fix lands in one and not the other, so the matcher lives here and both import it.
 *
 * What a site says, beyond its name:
 *
 *   • `onWindow` — `window.dispatchEvent(…)`: a page-wide broadcast no element listener
 *     hears. Unchanged from the first four rules, which read it.
 *   • `receiver` — what `.dispatchEvent` is called on (`this`, `window`,
 *     `this._binding.host`), or the target handed to the lifecycle helper; `null` when the
 *     event is built in one statement and dispatched in another.
 *   • `bubbles` — `true`, `false`, or `null` when the init is not an object literal the
 *     matcher can read. `null` is not "no": a caller that needs to know treats it as "may".
 *   • `cancelable` — whether a listener's `preventDefault()` reaches the dispatcher.
 *
 * `dispatchLifecycleEvent` always dispatches bubbling and composed, never cancelable, with
 * a `targetId`-stamped detail (`packages/core/src/client/lifecycle-events.ts`), so its sites
 * say so without an init to read.
 *
 * Also here, because two rules need the same tree: `readCoreTree()` (the manifest, every
 * core source file, the event map's types) and rule 6 of `check-event-map`,
 * {@link checkWindowDispatched}.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const root = resolve(here, '..');

/** Core's manifest, the default every reader here opens. */
export const CORE_CEM = 'packages/core/dist/custom-elements.json';
const CORE_SRC = 'packages/core/src';
const MAP_FILE = 'packages/core/src/types/event-map.ts';

/** A repo-relative path with forward slashes: the key of every file map here. */
export const repoPath = (abs) => relative(root, abs).split('\\').join('/');

/**
 * Comments out, whitespace kept, so a match's offset still lines up with the file.
 *
 * Block comments first: an `@example` fence in a docblock is full of dispatch-shaped code,
 * and counting it would credit an element with an event it never sends (the context
 * gauge's docblock dispatches `aparte-message-done` on `window` to seed its preview). HTML
 * comments too, for the Vue and Svelte templates `chat-surface.mjs` reads tags from. A `//`
 * after `:` or `/` is a URL, not a comment.
 */
export function stripComments(src) {
    return src
        .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:/])\/\/[^\n]*/g, (m, p) => p + m.slice(p.length).replace(/./g, ' '));
}

/**
 * A call's arguments, split at its top-level commas. Strings are skipped whole, so a comma
 * or a bracket inside a literal does not split or unbalance anything.
 */
function splitArgs(body) {
    const args = [];
    let depth = 0;
    let start = 0;
    let quote = null;
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (quote) {
            if (c === '\\') i++;
            else if (c === quote) quote = null;
            continue;
        }
        if (c === '\'' || c === '"' || c === '`') quote = c;
        else if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        else if (c === ',' && depth === 0) {
            args.push(body.slice(start, i).trim());
            start = i + 1;
        }
    }
    const last = body.slice(start).trim();
    if (last) args.push(last);
    return args;
}

/** `true` / `false` for a flag an object-literal init sets or leaves out; `null` when the init is not one. */
function flagIn(init, flag) {
    if (init === undefined) return false;
    if (!init.startsWith('{')) return null;
    const m = new RegExp(`\\b${flag}\\s*:\\s*(true|false)\\b`).exec(init);
    return m ? m[1] === 'true' : false;
}

/**
 * Walk `new CustomEvent…(` / `dispatchLifecycleEvent(` to its matching paren so a
 * nested object or template literal cannot end the match early, and report what the
 * call says. A regex cannot do this: several dispatch sites nest three levels of braces
 * inside `detail:`.
 */
export function dispatchesIn(text) {
    const out = [];
    const CALL = /(?:new CustomEvent(?:<[^>(]*>)?|dispatchLifecycleEvent|_dispatchLifecycleEvent)\s*\(/g;
    for (const m of text.matchAll(CALL)) {
        let depth = 1;
        let i = m.index + m[0].length;
        for (; i < text.length && depth > 0; i++) {
            const c = text[i];
            if (c === '(') depth++;
            else if (c === ')') depth--;
        }
        const body = text.slice(m.index + m[0].length, i - 1);
        const name = /['"](aparte-[a-z0-9-]+)['"]/.exec(body);
        if (!name) continue;
        // The lifecycle helper always stamps `targetId`, so it always has a detail.
        const viaHelper = m[0].includes('dispatchLifecycleEvent');
        // WHERE it goes. `window.dispatchEvent(new CustomEvent(…))` is a page-wide broadcast
        // no element listener can hear; everything else — `this`, a resolved child, the
        // lifecycle helper (whose callers hand it the chat host or its render target) —
        // bubbles past an `<AparteUi>` wrapper node.
        const before = text.slice(Math.max(0, m.index - 160), m.index);
        const onWindow = !viaHelper && /window\s*\.dispatchEvent\s*\(\s*$/.test(before);
        const args = splitArgs(body);
        const receiver = viaHelper
            ? (args[0] ?? null)
            : (/([\w$]+(?:\s*\.\s*[\w$]+)*)\s*\.\s*dispatchEvent\s*\(\s*$/.exec(before)?.[1].replace(/\s+/g, '') ?? null);
        const init = viaHelper ? undefined : args[1];
        // `detail:` AND `detail` as ES object shorthand. Matching only the colon
        // exempted the TEN most important events in the library — every dispatch
        // that builds its detail as a local first, which is the idiomatic way to
        // write one. Deleting a real map entry then made the event MIGRATE into the
        // guard's own "correctly unmapped" line, so the count stayed plausible.
        const hasDetail = viaHelper || /\bdetail\s*[:,}]/.test(body);
        out.push({
            name: name[1],
            hasDetail,
            onWindow,
            receiver,
            viaHelper,
            bubbles: viaHelper ? true : flagIn(init, 'bubbles'),
            cancelable: viaHelper ? false : flagIn(init, 'cancelable') === true,
        });
    }
    return out;
}

function* walk(dir) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist' || name === '__tests__') continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) yield* walk(p);
        else if (/\.ts$/.test(p) && !/\.(test|spec)\./.test(p)) yield p;
    }
}

/** `'aparte-send' → 'CustomEvent<AparteSendEventDetail>'`, read off core's event map. */
function readMapTypes(src) {
    return new Map([...src.matchAll(/^\s*'(aparte-[a-z0-9-]+)':\s*(CustomEvent<[^;\n]+>)\s*;/gm)].map((m) => [m[1], m[2]]));
}

/**
 * The tree the dispatch rules read: core's manifest, every core source file (tests out),
 * and the event map's types. Read once, then handed around — so a test can doctor one
 * piece of it and run a rule over the result without touching the disk.
 */
export function readCoreTree({ cemFile = CORE_CEM } = {}) {
    const cemPath = resolve(root, cemFile);
    if (!existsSync(cemPath)) {
        throw new Error(`no manifest at ${cemFile} — build @aparte/core first (\`pnpm build\`, or its \`analyze\` script).`);
    }
    const cem = JSON.parse(readFileSync(cemPath, 'utf8'));
    const files = new Map();
    for (const abs of walk(resolve(root, CORE_SRC))) files.set(repoPath(abs), readFileSync(abs, 'utf8'));
    const mapTypes = readMapTypes(files.get(MAP_FILE) ?? '');
    if (!mapTypes.size) throw new Error(`parsed zero entries out of ${MAP_FILE} — the format this reader expects has changed.`);
    return { cem, files, mapTypes };
}

/** Every custom element the manifest declares: tag → its source path and its declaration. */
export function elementsOf(cem) {
    const out = new Map();
    for (const mod of cem.modules ?? []) {
        for (const decl of mod.declarations ?? []) {
            if (!decl.customElement || !decl.tagName) continue;
            out.set(decl.tagName, { path: `packages/core/${String(mod.path).split('\\').join('/').replace(/^\.\//, '')}`, decl });
        }
    }
    return out;
}

/** `aparte-compact-done` → `compactDone`: the Output name the Angular generator would give it. */
const outputName = (event) => event.replace(/^aparte-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/**
 * Rule 6 — `windowDispatched` names exactly the events each element sends only on `window`.
 *
 * The manifest records that an element fires an event; it cannot record that the event goes
 * out on `window`, so the bindings config says it, and the Angular generator gives those no
 * Output: a host listener would never hear them. Written by hand, the list fell behind —
 * `<aparte-context>`'s `aparte-compact` was missing, and the generated directive offered a
 * `(compact)` Output that could never fire.
 *
 * An event counts as window-only when every site that sends it does so on `window`: the
 * element's own sites when its source has any, else every site in core — the bubble declares
 * `aparte-compact-done`, which `context/restore.ts` dispatches for it. Both directions fail:
 * a window-only event the config leaves out, and an entry for one the element sends on an
 * element (that entry would hide a live Output).
 */
export function checkWindowDispatched(tree, windowDispatched = {}) {
    const problems = [];
    const elements = elementsOf(tree.cem);

    /** Every site in core, comments out, by event name — for a declared event sent elsewhere. */
    const sitesByName = new Map();
    for (const [path, text] of tree.files) {
        if (!path.startsWith(`${CORE_SRC}/`)) continue;
        for (const site of dispatchesIn(stripComments(text))) {
            if (!sitesByName.has(site.name)) sitesByName.set(site.name, []);
            sitesByName.get(site.name).push({ ...site, path });
        }
    }

    let listedCount = 0;
    for (const [tag, { path, decl }] of elements) {
        const own = dispatchesIn(stripComments(tree.files.get(path) ?? ''));
        /** name → where the window dispatch was read, for the message. */
        const windowOnly = new Map();
        /** name → true when some site sends it on an element. */
        const onElement = new Set();
        const declared = new Set();
        for (const ev of decl.events ?? []) {
            declared.add(ev.name);
            const ownSites = own.filter((s) => s.name === ev.name);
            const sites = ownSites.length ? ownSites.map((s) => ({ ...s, path })) : (sitesByName.get(ev.name) ?? []);
            if (!sites.length) continue;
            if (sites.every((s) => s.onWindow)) windowOnly.set(ev.name, [...new Set(sites.map((s) => s.path))].join(', '));
            else onElement.add(ev.name);
        }

        const listed = new Set(windowDispatched[tag] ?? []);
        listedCount += listed.size;
        for (const [name, where] of windowOnly) {
            if (listed.has(name)) continue;
            problems.push(
                `<${tag}> dispatches "${name}" only on \`window\` (${where}), and \`windowDispatched\`\n`
                + `      in packages/core/element-bindings.config.mjs does not list it. The generated Angular\n`
                + `      directive then offers a \`(${outputName(name)})\` Output no host listener can ever fire.\n`
                + `      Add "${name}" under '${tag}'.`,
            );
        }
        for (const name of listed) {
            if (windowOnly.has(name)) continue;
            const why = !declared.has(name)
                ? 'which does not declare it: there is no Output to withhold'
                : onElement.has(name)
                    ? 'which dispatches it on an element — the Output would be live, and the entry hides it'
                    : 'and no dispatch of it was found in core — the entry outlived its event';
            problems.push(
                `\`windowDispatched\` lists "${name}" for <${tag}>, ${why}.\n`
                + `      Remove it from packages/core/element-bindings.config.mjs.`,
            );
        }
    }
    for (const tag of Object.keys(windowDispatched)) {
        if (!elements.has(tag)) {
            problems.push(`\`windowDispatched\` names <${tag}>, which the manifest does not declare. Remove the key.`);
        }
    }
    return { problems, events: listedCount, elements: Object.keys(windowDispatched).length };
}
