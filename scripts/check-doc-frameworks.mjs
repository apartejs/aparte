#!/usr/bin/env node
/*
 * check-doc-frameworks — an example that only the vanilla element can run shows every framework.
 *
 * Why this exists. About sixty examples in the docs listened to an event with
 * `document.querySelector('aparte-chat')?.addEventListener('aparte-send', …)`. Under React,
 * Vue, Svelte or Angular that is a handler that never fires: the framework renders the element
 * after the script ran, so the query finds nothing and says nothing. The wrappers had no way to
 * hear most of the chat's events either (two of them were props), so the pages could not have
 * shown one. Now each wrapper's chat component takes every event `<aparte-chat>` declares, and
 * a generic path for the ones it does not name (`useAparteEvent`, `@aparte-…`, `onaparte-…`,
 * `(aparte-…)`); this guard keeps the pages from going back to vanilla-only examples.
 *
 * A fenced block that hears an `aparte-*` event on an element, or looks up `<aparte-chat>`,
 * `<aparte-composer>` or `<aparte-chat-viewport>`, must be one of:
 *
 *   • in a `<Tabs syncKey="framework">` group (the site's own, from `components/content/tabs`)
 *     of exactly the five tabs Vanilla, React, Vue, Svelte and Angular, each with code, where
 *     each framework tab spells the event the way that framework binds it. The spellings are
 *     the generator's, not a copy of them: `bindingName` for the chat's events, `callbackRow`
 *     for how each framework writes one, and the generated Angular directive outputs for the
 *     standalone elements. So `onLinkClik` fails, and so does `onSend` for `aparte-send`
 *     (the chat publishes it as `messageSent`). An event the chat does not name — a plugin's,
 *     an app's — is spelled by its DOM name, which is the generic path of every wrapper;
 *   • or marked, right before the block, `{/* doc-check: vanilla-only <reason> *\/}` (MDX) or
 *     `<!-- doc-check: vanilla-only <reason> -->` (a `.md` page, which cannot hold tabs). The
 *     reason is what a reader of the page would be told: a custom element you write yourself,
 *     the page about the vanilla element. A marker with no reason, on a block that needs none,
 *     or before nothing, is refused, so a marker cannot outlive what it excused.
 *
 * Not looked at, on purpose: a listener on `window` or `document` (the event bubbles there, so
 * it is heard under every framework), and a page a generator wrote (`AUTO-GENERATED`). Not
 * seen, and said so: an event named by a variable (`el.addEventListener(type, …)`), which no
 * page uses today; and `createElement('aparte-chat')`, which builds an element, not a lookup.
 *
 * Every count is printed, and two limits keep the numbers honest: a FLOOR on the blocks found
 * (a reader that has gone blind finds none, and passes — the lesson of a guard that read zero
 * of the pages it was written for), and a CEILING on the vanilla-only markers, so the way out
 * stays a way out.
 *
 * Reads the built manifest of `@aparte/core`, like the generators: build it first.
 *
 * Usage: node scripts/check-doc-frameworks.mjs [--docs <dir>]
 * Run by `pnpm gate` after the build, beside the docs checks.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import bindings from '../packages/core/element-bindings.config.mjs';
import { CHAT_EVENT_FLOOR, CHAT_TAG, readChatEvents, readChatTree } from './chat-surface.mjs';
import { elementsOf } from './dispatch-sites.mjs';
import { bindingName } from './gen-element-bindings.mjs';
import { callbackRow } from './wrapper-surface.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'apps/docs/src/content/docs');

/** The five tabs of a framework example, in the order the site shows them. */
export const GROUP_LABELS = ['Vanilla', 'React', 'Vue', 'Svelte', 'Angular'];

/**
 * The bounds the totals must stay inside. Measured when the pages were converted: 140 pages
 * read, 35 blocks found, 5 of them marked vanilla-only. The floors sit under those, so a few
 * pages can go; a corpus the reader read almost nothing of cannot. The ceiling sits over them
 * by three: a way out is for the page that is about the vanilla element, not for the example
 * that was long to write — so a sixth marker is a question for whoever adds it.
 */
export const LIMITS = { minPages: 120, minBlocks: 30, maxMarkers: 8 };

/** The one module the site's tabs are imported from: its choice is stored and followed. */
const TABS_MODULE = 'components/content/tabs';

const { createProcessor } = await import(
    pathToFileURL(createRequire(join(ROOT, 'apps/docs/package.json')).resolve('@mdx-js/mdx')).href
);
const processors = { mdx: createProcessor({ format: 'mdx' }), md: createProcessor({ format: 'md' }) };

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ─────────────────────────────────────────────────────────────────────────────
// What a block does
// ─────────────────────────────────────────────────────────────────────────────

/** A listener on one of these hears the event under every framework: the event bubbles to it. */
const PAGE = new Set(['window', 'document', 'globalThis']);

/**
 * `<receiver>.addEventListener('aparte-…'`: the last word before the dot is the receiver's
 * end, so `document.querySelector('x')?.addEventListener` reads `)`, and `window.add…` reads
 * `window`. The optional `?`/`!` and a break after `(` are the shapes the pages use.
 */
const LISTEN = /([\w$)\]'"`]+)\s*[!?]*\.\s*addEventListener\(\s*(['"`])(aparte-[\w-]+)\2/g;

/** A lookup of one of the three elements an app reaches the chat through, by its tag. */
const LOOKUP = /\b(?:querySelector|querySelectorAll|getElementsByTagName|closest)\s*(?:<[^>()]*>)?\(\s*(['"`])((?:(?!\1)[^\\])*)\1/g;
const TAG = /(?<![\w-])aparte-(?:chat-viewport|chat|composer)(?![\w-])/;

/** The events a block listens to on an element, in order, each once. */
function listenedEvents(code) {
    const events = [];
    for (const m of code.matchAll(LISTEN)) {
        if (!PAGE.has(m[1]) && !events.includes(m[3])) events.push(m[3]);
    }
    return events;
}

/** The three elements a block looks up, each once. */
function lookedUp(code) {
    const tags = [];
    for (const m of code.matchAll(LOOKUP)) {
        const tag = TAG.exec(m[2])?.[0];
        if (tag && !tags.includes(tag)) tags.push(tag);
    }
    return tags;
}

/** What the block does that only the vanilla element can, in words; empty when it does neither. */
function whatItDoes(code) {
    const parts = [];
    const events = listenedEvents(code);
    if (events.length) parts.push(`hears ${events.join(', ')} on an element`);
    const tags = lookedUp(code);
    if (tags.length) parts.push(`looks up <${tags.join('>, <')}>`);
    return parts.join(' and ');
}

// ─────────────────────────────────────────────────────────────────────────────
// How each framework spells an event
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What the generators publish, as the guard needs it: `chat` maps each event of
 * `<aparte-chat>` to the name it binds under (`aparte-send` → `messageSent`), `elements` maps
 * a standalone element's event to the Angular output its generated directive gives it. The
 * chat's own are read by `readChatEvents`, the one reader the wrappers are generated from.
 */
export function readSpellings({ tree = readChatTree(), config = bindings } = {}) {
    const chat = new Map(readChatEvents(tree).map((ev) => [ev.name, bindingName(CHAT_TAG, ev.name, config)]));
    // A table that read no chat event asks no framework tab for a binding's name, and every page
    // passes: a collapsed reading is a broken reader, not a small surface.
    if (chat.size < CHAT_EVENT_FLOOR) {
        throw new Error(`read only ${chat.size} chat events from the manifest, the floor is ${CHAT_EVENT_FLOOR}: the names a tab must spell are unknown.`);
    }
    const skipped = new Set(config.angularSkip ?? []);
    const elements = new Map();
    for (const [tag, { decl }] of elementsOf(tree.cem)) {
        if (skipped.has(tag)) continue;
        const windowOnly = new Set(config.windowDispatched?.[tag] ?? []);
        for (const ev of decl.events ?? []) {
            if (windowOnly.has(ev.name)) continue;
            elements.set(ev.name, [...(elements.get(ev.name) ?? []), bindingName(tag, ev.name, config)]);
        }
    }
    return { chat, elements };
}

/** `{ show, re }`: a spelling as the page would write it, and what finds it in the code. */
const form = (show, source) => ({ show, re: new RegExp(source) });

/** The name, whole: not the start of a longer one, which is how `onLinkClik` is not `onLinkClick`. */
const whole = (name) => `(?<![\\w$])${escape(name)}(?![\\w$])`;

/**
 * The spellings that count as hearing `event` in the `label` tab: the framework's own binding
 * when the chat (or, on Angular, the element's directive) names the event, and the generic
 * path every wrapper has, which is the event's DOM name.
 */
function spellingsOf(label, event, { chat, elements }) {
    const E = escape(event);
    const quoted = `['"\`]${E}['"\`]`;
    const listener = form(`addEventListener('${event}', …)`, `addEventListener\\(\\s*${quoted}`);
    const named = [];
    const bound = chat.get(event);
    if (bound) {
        const row = callbackRow({ name: bound });
        if (label === 'React') named.push(form(row.react, whole(row.react)));
        if (label === 'Vue') named.push(form(row.vue, `(?:@|v-on:)${escape(row.vue.slice(1))}(?![\\w-])`));
        if (label === 'Svelte') {
            named.push(form(row.svelteRunes, whole(row.svelteRunes)));
            named.push(form(row.svelte, `(?<![\\w$])${escape(row.svelte)}(?![\\w$])`));
        }
        if (label === 'Angular') named.push(form(row.angular, escape(row.angular)));
    }
    if (label === 'Angular') {
        for (const output of elements.get(event) ?? []) named.push(form(`(${output})`, `\\(${escape(output)}\\)`));
    }
    // A standalone element's own React component (`<AparteSelect onSelectChange>`), generated with
    // the same name as the Angular output, behind `on`.
    if (label === 'React') {
        for (const name of elements.get(event) ?? []) {
            const prop = `on${name[0].toUpperCase()}${name.slice(1)}`;
            named.push(form(prop, whole(prop)));
        }
    }
    const generic = {
        React: [form(`useAparteEvent(ref, '${event}', …)`, `useAparteEvent\\s*\\([\\s\\S]{0,200}?${quoted}`), listener],
        Vue: [form(`@${event}`, `(?:@|v-on:)${E}(?![\\w-])`)],
        Svelte: [form(`on${event}`, `(?<![\\w$])on${E}(?![\\w-])`), form(`on:${event}`, `(?<![\\w$])on:${E}(?![\\w-])`), listener],
        Angular: [form(`(${event})`, `\\(${E}\\)`), form(`@HostListener('${event}')`, `HostListener\\(\\s*${quoted}`), listener],
    }[label] ?? [];
    return [...named, ...generic];
}

// ─────────────────────────────────────────────────────────────────────────────
// The page
// ─────────────────────────────────────────────────────────────────────────────

/** A marker: `{/* doc-check: <kind> <reason> *\/}` in MDX, `<!-- … -->` in Markdown. */
const MARKER = /^\s*(?:\/\*|<!--)\s*doc-check:\s*([\w-]+)([\s\S]*?)\s*(?:\*\/|-->)\s*$/;

function markerOf(node) {
    if (node.type !== 'mdxFlowExpression' && node.type !== 'html') return null;
    const m = MARKER.exec(node.value ?? '');
    return m ? { kind: m[1], reason: m[2].trim(), node } : null;
}

/** An attribute's string value; `null` for an expression or a missing attribute. */
function attribute(node, name) {
    const attr = (node.attributes ?? []).find((a) => a.type === 'mdxJsxAttribute' && a.name === name);
    return typeof attr?.value === 'string' ? attr.value : null;
}

const isElement = (node, name) => node.type === 'mdxJsxFlowElement' && node.name === name;

/** Every fenced block under `node`, with the siblings before it and the elements around it. */
function blocksUnder(root) {
    const out = [];
    const visit = (node, ancestors) => {
        (node.children ?? []).forEach((child, index) => {
            if (child.type === 'code') out.push({ node: child, siblings: node.children, index, ancestors: [...ancestors, node] });
            else visit(child, [...ancestors, node]);
        });
    };
    visit(root, []);
    return out;
}

/** The module a name is imported from in the page, or `null`. */
function importSource(tree, name) {
    for (const node of tree.children) {
        if (node.type !== 'mdxjsEsm') continue;
        for (const stmt of node.data?.estree?.body ?? []) {
            if (stmt.type === 'ImportDeclaration' && stmt.specifiers.some((s) => s.local.name === name)) return stmt.source.value;
        }
    }
    return null;
}

/** The five-tab check of one group, once: the problems it has, each at the group's line. */
function judgeGroup(tabsNode, tree, spellings) {
    const line = tabsNode.position.start.line;
    const problems = [];
    const say = (text) => problems.push(`${line}: ${text}`);

    const source = importSource(tree, 'Tabs');
    if (source !== null && !source.endsWith(TABS_MODULE)) {
        say(`this page's <Tabs> come from "${source}"; the site's own are in …/${TABS_MODULE}, the ones that remember the choice of a framework across pages.`);
    }
    if (attribute(tabsNode, 'syncKey') !== 'framework') {
        say('this tab group needs syncKey="framework", so the framework a reader picks follows them from page to page.');
    }

    const tabs = tabsNode.children.filter((c) => isElement(c, 'TabItem')).map((item) => ({
        label: attribute(item, 'label'),
        code: blocksUnder(item).map((b) => b.node),
    }));
    const labels = tabs.map((t) => t.label);
    const missing = GROUP_LABELS.filter((l) => !labels.includes(l));
    if (missing.length) {
        say(`this tab group is missing the ${missing.join(', ')} tab${missing.length > 1 ? 's' : ''}: a framework example needs all five, or the reader on the missing one gets none.`);
    }
    for (const label of new Set(labels.filter((l) => !GROUP_LABELS.includes(l)))) {
        say(`this tab group has a tab ${label === null ? 'with no literal label' : `named "${label}"`}: the five are ${GROUP_LABELS.join(', ')}.`);
    }
    for (const label of new Set(labels.filter((l, i) => GROUP_LABELS.includes(l) && labels.indexOf(l) !== i))) {
        say(`this tab group has the ${label} tab more than once.`);
    }
    for (const tab of tabs) {
        if (GROUP_LABELS.includes(tab.label) && !tab.code.length) say(`the ${tab.label} tab has no code block: each framework gets a complete example.`);
    }

    // What the Vanilla tab listens to, every framework tab must hear, spelled its own way.
    const vanilla = tabs.find((t) => t.label === 'Vanilla');
    const events = [...new Set((vanilla?.code ?? []).flatMap((c) => listenedEvents(c.value)))];
    for (const event of events) {
        for (const tab of tabs) {
            if (tab.label === 'Vanilla' || !GROUP_LABELS.includes(tab.label) || !tab.code.length) continue;
            const text = tab.code.map((c) => c.value).join('\n');
            const forms = spellingsOf(tab.label, event, spellings);
            if (!forms.some((f) => f.re.test(text))) {
                say(`the ${tab.label} tab never hears ${event} the way ${tab.label} spells it. Expected ${forms.map((f) => f.show).join(' or ')}.`);
            }
        }
    }
    return problems;
}

/**
 * One page: how many blocks need a way out, how many have one, each marker with its reason,
 * and every problem, each as `line: message` at the block's own line (the group's, for a
 * problem of the tabs).
 */
export function checkPage(text, { format = 'mdx', spellings }) {
    const result = { found: 0, inTabs: 0, marked: [], problems: [] };
    // The frontmatter is YAML, which the site strips before MDX sees the page: blanked, not
    // cut, so a line number still points at the line in the file.
    const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/, (fm) => fm.replace(/[^\n]/g, ''));
    let tree;
    try {
        tree = processors[format].parse(body);
    } catch (error) {
        const at = error.place?.start ?? error.place ?? {};
        return { ...result, problems: [`${at.line ?? 1}: does not parse as ${format === 'md' ? 'Markdown' : 'MDX'}: ${error.reason ?? error.message}`] };
    }

    const groups = new Map();
    const consumed = new Set();
    for (const { node, siblings, index, ancestors } of blocksUnder(tree)) {
        const line = node.position.start.line;
        const does = whatItDoes(node.value);

        // The markers right before the block: a `skip` for the snippet compiler may sit beside.
        const markers = [];
        for (let i = index - 1; i >= 0; i--) {
            const marker = markerOf(siblings[i]);
            if (!marker) break;
            markers.push(marker);
        }
        const vanillaOnly = markers.find((m) => m.kind === 'vanilla-only');
        if (vanillaOnly) consumed.add(vanillaOnly.node);

        if (vanillaOnly) {
            if (!does) {
                result.problems.push(`${line}: this block hears no event on an element and looks up no chat, so its vanilla-only marker is stale: remove it.`);
            } else if (!vanillaOnly.reason) {
                result.found++;
                result.problems.push(`${line}: the vanilla-only marker needs a reason, as in {/* doc-check: vanilla-only a custom element of your own */}.`);
            } else {
                result.found++;
                result.marked.push({ line, reason: vanillaOnly.reason });
            }
            continue;
        }
        if (!does) continue;
        result.found++;

        const item = [...ancestors].reverse().find((a) => isElement(a, 'TabItem'));
        const tabsNode = item && ancestors[ancestors.indexOf(item) - 1];
        if (tabsNode && isElement(tabsNode, 'Tabs')) {
            if (!groups.has(tabsNode)) {
                const problems = judgeGroup(tabsNode, tree, spellings);
                groups.set(tabsNode, problems);
                result.problems.push(...problems);
            }
            if (!groups.get(tabsNode).length) result.inTabs++;
            continue;
        }
        const way = format === 'md'
            ? 'Tabs need an .mdx page: rename this one and put the block in a <Tabs syncKey="framework"> group, '
              + 'or write <!-- doc-check: vanilla-only <why> --> right before it.'
            : 'Put it in a <Tabs syncKey="framework"> group with a Vanilla, React, Vue, Svelte and Angular tab, '
              + 'or write {/* doc-check: vanilla-only <why> */} right before it.';
        result.problems.push(`${line}: this block ${does}, which only the vanilla element can run. ${way}`);
    }

    // A marker that excuses no block is a promise nothing keeps.
    const visit = (node) => {
        const marker = markerOf(node);
        if (marker?.kind === 'vanilla-only' && !consumed.has(node)) {
            result.problems.push(`${node.position.start.line}: this vanilla-only marker is not right before a code block, so it excuses nothing.`);
        }
        for (const child of node.children ?? []) visit(child);
    };
    visit(tree);

    result.problems.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    return result;
}

/** A page a generator wrote: its blocks are the generator's, and read as the generator's. */
export function isGenerated(text) {
    return /(?:<!--|\{\/\*)\s*AUTO-GENERATED\b/.test(text);
}

/** The problems with the totals: a reader gone blind, a way out used too often. */
export function judgeTotals({ pages, found, marked }, limits = LIMITS) {
    const problems = [];
    if (pages < limits.minPages) {
        problems.push(`read only ${pages} pages, the floor is ${limits.minPages}: the walk of the docs is not finding the pages.`);
    }
    if (found < limits.minBlocks) {
        problems.push(
            `found only ${found} blocks that hear an event or look up the chat, the floor is ${limits.minBlocks}: `
            + 'a matcher that has gone blind finds none and passes, so a short count fails.',
        );
    }
    if (marked > limits.maxMarkers) {
        problems.push(
            `${marked} vanilla-only markers, the ceiling is ${limits.maxMarkers}: a way out used this often is the rule, `
            + 'not an exception. Give the block its tabs, or say in this script why the ceiling moves.',
        );
    }
    return problems;
}

// ─────────────────────────────────────────────────────────────────────────────
// The corpus
// ─────────────────────────────────────────────────────────────────────────────

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path, out);
        else if (/\.mdx?$/.test(name)) out.push(path);
    }
    return out;
}

/**
 * The pages written by hand: the ones git tracks, and a new one not added yet. The generated
 * pages a previous docs build left on disk (the component pages, the references) are
 * gitignored, and reading them made a local run check a corpus CI never sees. Outside a
 * checkout, the walk of the folder.
 */
export function docPages(dir, root = ROOT) {
    try {
        const listed = execFileSync(
            'git',
            ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', relative(root, dir).split(sep).join('/')],
            { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
        );
        return listed.split('\0').filter((f) => /\.mdx?$/.test(f)).map((f) => join(root, f)).filter((f) => existsSync(f));
    } catch {
        return walk(dir);
    }
}

function main() {
    const at = process.argv.indexOf('--docs');
    const docs = at === -1 ? CONTENT : resolve(process.argv[at + 1] ?? '');
    let spellings;
    try {
        spellings = readSpellings();
    } catch (error) {
        console.error(`[doc-frameworks] cannot read the event names: ${error.message}`);
        process.exit(1);
    }

    const rel = (file) => relative(ROOT, file).split(sep).join('/');
    const totals = { pages: 0, found: 0, inTabs: 0, marked: [], generated: 0 };
    const problems = [];
    for (const file of docPages(docs)) {
        const text = readFileSync(file, 'utf8');
        if (isGenerated(text)) {
            totals.generated++;
            continue;
        }
        totals.pages++;
        const page = checkPage(text, { format: file.endsWith('.md') ? 'md' : 'mdx', spellings });
        totals.found += page.found;
        totals.inTabs += page.inTabs;
        totals.marked.push(...page.marked.map((m) => ({ ...m, file: rel(file) })));
        problems.push(...page.problems.map((p) => `${rel(file)}:${p}`));
    }
    problems.push(...judgeTotals({ pages: totals.pages, found: totals.found, marked: totals.marked.length }));

    if (problems.length) {
        console.error(
            `\n[doc-frameworks] ${problems.length} problem(s), over ${totals.found} blocks in ${totals.pages} pages `
            + `(${totals.inTabs} in a five-framework tab group, ${totals.marked.length} marked vanilla-only):\n`,
        );
        for (const p of problems) console.error(`  ${p}`);
        console.error(
            '\nAn example that hears an event on an element, or looks up the chat, runs only where the page\n'
            + 'put the element by hand. Under React, Vue, Svelte or Angular the same query finds nothing and\n'
            + 'the handler never fires. Show the five frameworks in a <Tabs syncKey="framework"> group, each\n'
            + 'with the binding the wrapper generates (see the Events table of the wrapper reference page),\n'
            + 'or say in a vanilla-only marker why this one cannot.\n',
        );
        process.exit(1);
    }
    console.log(
        `[doc-frameworks] OK: ${totals.found} blocks hear an event on an element or look up the chat in ${totals.pages} pages: `
        + `${totals.inTabs} in a five-framework tab group, ${totals.marked.length} marked vanilla-only `
        + `(${totals.generated} generated pages not read).`,
    );
    for (const m of totals.marked) console.log(`  vanilla-only ${m.file}:${m.line} — ${m.reason}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
