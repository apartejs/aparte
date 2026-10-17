/*
 * Generates the @aparte/core API reference (src/content/docs/reference/core/) from the package's
 * TypeScript source + JSDoc, the way gen-engine-api.mjs does for the engine: TypeDoc
 * (typedoc-plugin-markdown) writes one file, and this splits it into one page per area of the
 * library, because the whole surface in one page is some 80,000 words.
 *
 * Two things are left out, each with a place of its own:
 * - the custom elements' classes, documented on their catalogue pages from the element
 *   manifest (gen-element-pages.mjs). A link to one goes to that page.
 * - members whose name starts with an underscore: public to TypeScript, internal by the
 *   library's convention.
 *
 * TypeDoc links within its one file (`#aparteconfig`). Once split, a link may point at another
 * page, and an anchor may change, since two headings with the same text are numbered per page,
 * so every link is resolved to the heading it meant and rewritten. Runs before `astro dev` /
 * `astro build` like the other gen scripts. Never edit the output by hand.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCatalogue } from './lib/catalogue.mjs';
import { referenceOrder } from './reference-order.mjs';
import { writeIfChanged, wroteOrNot } from './write-if-changed.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const docsRoot = resolve(here, '..');
const TYPEDOC_OUT = resolve(docsRoot, '.typedoc/core');
const PAGES = resolve(docsRoot, 'src/content/docs/reference/core');
const CEM = resolve(docsRoot, '../../packages/core/dist/custom-elements.json');
const BASE = '/reference/core';

/** One page per area, in sidebar order. `folders` are the folders of packages/core/src it reads. */
const AREAS = [
    { slug: 'config', label: 'Configuration', folders: ['config'],
      line: '`aparteGlobalConfig`, the class behind it, and the provider, renderer and locale types it takes.' },
    { slug: 'client', label: 'Client', folders: ['client', 'host'],
      line: 'The client that runs a conversation, the host every framework wrapper binds to, and the stream runners.' },
    { slug: 'transports', label: 'Transports', folders: ['transport'],
      line: 'How a request reaches a model, straight from the browser or through your endpoint, and the handlers that endpoint can use.' },
    { slug: 'messages', label: 'Messages and segments', folders: ['types', 'parsers', 'renderers'],
      line: 'A message and the segments it is made of, the parser that builds them from a stream, the renderers that draw them, and the errors.' },
    { slug: 'conversations', label: 'Conversations', folders: ['conversations', 'runtime'],
      line: 'Conversations and their storage, and the history of one conversation with its branches.' },
    { slug: 'elicitation', label: 'Questions and approvals', folders: ['elicitation'],
      line: 'Asking the person a question, or for an approval, in the middle of a turn.' },
    { slug: 'elements', label: 'Element types', folders: ['components', 'primitives', 'generated'],
      line: 'The data and event types the elements take and send. The elements themselves are on their catalogue pages.' },
    { slug: 'utilities', label: 'Utilities', folders: ['utils', 'interop', 'index.ts'],
      line: 'Small helpers: escaping, ids, copying, attachments from files, segment timing, and what the framework wrappers share.' },
];

/** TypeDoc's groups, in the order a page shows them. */
const KINDS = ['Classes', 'Functions', 'Variables', 'Interfaces', 'Type Aliases', 'Enumerations', 'Events'];
const KIND_LABEL = { Events: 'Event details' };

/**
 * github-slugger, which Astro uses for heading ids, for the ASCII text TypeDoc headings carry:
 * lower case, anything but letters, digits, `_`, `-` and spaces removed, spaces turned into
 * hyphens, and a repeat numbered. Anything else is refused rather than guessed at.
 */
function slugger() {
    const seen = new Map();
    return (text) => {
        if (/[^\x20-\x7e]/.test(text)) throw new Error(`[gen-core-api] a heading with non-ASCII text: ${JSON.stringify(text)}`);
        const base = text.toLowerCase().replace(/[^a-z0-9 _-]/g, '').replace(/ /g, '-');
        let id = base;
        if (seen.has(base)) {
            let n = seen.get(base);
            do id = `${base}-${n++}`;
            while (seen.has(id));
            seen.set(base, n);
        } else seen.set(base, 1);
        seen.set(id, seen.get(id) ?? 1);
        return id;
    };
}

/** A heading's text as the page renders it: escapes resolved, strikethrough and code ticks gone. */
const headingText = (md) => md.replace(/~~/g, '').replace(/`/g, '').replace(/\\(.)/g, '$1').trim();

// 1. TypeDoc writes one file.
rmSync(TYPEDOC_OUT, { recursive: true, force: true });
try {
    execSync('npx --no-install typedoc --options typedoc.core.json', { cwd: docsRoot, stdio: 'pipe' });
} catch (err) {
    process.stderr.write(err.stdout?.toString?.() ?? '');
    process.stderr.write(err.stderr?.toString?.() ?? '');
    throw err;
}
const generated = resolve(TYPEDOC_OUT, 'README.md');
if (!existsSync(generated)) throw new Error(`[gen-core-api] TypeDoc produced no README.md in ${TYPEDOC_OUT}`);
const source = readFileSync(generated, 'utf8').split('\n');
rmSync(TYPEDOC_OUT, { recursive: true, force: true });

// 2. The elements, and the catalogue page each one is on.
const catalogue = readCatalogue();
const elementPage = new Map();
for (const mod of JSON.parse(readFileSync(CEM, 'utf8')).modules) {
    for (const d of mod.declarations ?? []) {
        if (!d.customElement || !d.tagName) continue;
        const page = catalogue.find((p) => p.claims.elements.includes(d.tagName));
        if (!page) throw new Error(`[gen-core-api] no catalogue page claims <${d.tagName}> (class ${d.name})`);
        elementPage.set(d.name, `/components/${page.slug}/`);
    }
}

// 3. Members, and every heading with the id TypeDoc's links use.
const members = [];
/** id in TypeDoc's file → { member, line } */
const headings = new Map();
const globalId = slugger();
let kind = null;
let member = null;
let fence = false;
for (const line of source) {
    if (line.startsWith('```')) fence = !fence;
    const h = !fence && /^(#{1,6}) (.*)$/.exec(line);
    if (h && h[1].length <= 2) {
        globalId(headingText(h[2]));
        if (h[1].length === 2) kind = headingText(h[2]);
        member = null;
        continue;
    }
    if (h && h[1].length === 3) {
        member = { kind, name: headingText(h[2]), lines: [], src: null };
        members.push(member);
    }
    if (!member) continue;
    if (h) headings.set(globalId(headingText(h[2])), { member, line: member.lines.length });
    member.lines.push(line);
    if (!member.src) {
        const at = /packages\/core\/src\/([^:#)\]\s]+)/.exec(line);
        if (at) member.src = at[1];
    }
}
if (members.length < 200) throw new Error(`[gen-core-api] read ${members.length} members — TypeDoc's output changed shape`);

for (const m of members) {
    if (!KINDS.includes(m.kind)) throw new Error(`[gen-core-api] unknown TypeDoc group "${m.kind}" (${m.name})`);
    if (!m.src) throw new Error(`[gen-core-api] ${m.name} has no "Defined in" line`);
    m.element = m.kind === 'Classes' && elementPage.has(m.name);
    const folder = m.src.includes('/') ? m.src.split('/')[0] : m.src;
    m.area = AREAS.find((a) => a.folders.includes(folder));
    if (!m.area) throw new Error(`[gen-core-api] ${m.name} is in packages/core/src/${folder}, which no page reads — add the folder to AREAS`);
}

/** A member's lines without the sub-members whose name starts with an underscore. */
function publicLines(m) {
    const out = [];
    let skip = 0;
    m.lines.forEach((line, i) => {
        const h = /^(#{4,6}) (.*)$/.exec(line);
        if (h && skip && h[1].length <= skip) skip = 0;
        if (h && !skip && headingText(h[2]).startsWith('_')) skip = h[1].length;
        if (!skip) out.push({ line, from: i });
    });
    return out;
}

// 4. The pages: their lines, and where each kept heading of TypeDoc's file landed.
/** TypeDoc's id → { page, id } */
const landed = new Map();
const pages = AREAS.map((area, index) => {
    const own = members.filter((m) => m.area === area && !m.element);
    const pageId = slugger();
    const lines = [];
    for (const k of KINDS) {
        const ofKind = own.filter((m) => m.kind === k);
        if (!ofKind.length) continue;
        lines.push(`## ${KIND_LABEL[k] ?? k}`, '');
        pageId(KIND_LABEL[k] ?? k);
        for (const m of ofKind) {
            for (const { line, from } of publicLines(m)) {
                const h = /^(#{3,6}) (.*)$/.exec(line);
                if (h) {
                    const id = pageId(headingText(h[2]));
                    for (const [tid, at] of headings) if (at.member === m && at.line === from) landed.set(tid, { page: area.slug, id });
                }
                lines.push(line);
            }
        }
    }
    return { area, index, members: own, lines };
});

// 5. Every link resolved to the heading it meant.
const unlinked = new Set();
function relink(lines, page) {
    let inFence = false;
    return lines.map((line) => {
        if (line.startsWith('```')) inFence = !inFence;
        if (inFence) return line;
        return line.replace(/\[([^\]]*)\]\(#([^)\s]+)\)/g, (_match, text, linked) => {
            // TypeDoc numbers an anchor for a second symbol of the same name even when it
            // writes one heading for both (`#apartemodelpreferenceprovider-1`); a heading that
            // really repeats has its numbered id here, so the base is the only one left to mean.
            const tid = headings.has(linked) ? linked : linked.replace(/-\d+$/, '');
            const at = landed.get(tid);
            if (at) return `[${text}](${at.page === page ? '' : `${BASE}/${at.page}/`}#${at.id})`;
            const owner = headings.get(tid)?.member;
            if (owner?.element) return `[${text}](${elementPage.get(owner.name)})`;
            unlinked.add(linked);
            return text;
        });
    });
}

// A JSDoc comment is Markdown, so a tag it writes outside a code span is HTML on the page: an
// unclosed `<pre><code>` turned the rest of the configuration page into one code block, and an
// `<aparte-composer>` in a sentence would put a live element in it. Refused, with the member named.
const rawHtml = [];
for (const { members: own } of pages) {
    for (const m of own) {
        let inFence = false;
        for (const line of m.lines) {
            if (line.startsWith('```')) inFence = !inFence;
            if (inFence) continue;
            const tag = line.replace(/`[^`]*`/g, '').replace(/\\</g, '').match(/<\/?[a-zA-Z][\w-]*(\s[^>]*)?>/);
            if (tag) rawHtml.push(`${m.name} (packages/core/src/${m.src}): ${tag[0]}`);
        }
    }
}
if (rawHtml.length) {
    throw new Error(`[gen-core-api] JSDoc writes raw HTML, which the page would render — put it in backticks:\n  ${rawHtml.join('\n  ')}`);
}

// 6. Write: one page per area, and an index that names every member.
const written = new Set();
const order = referenceOrder('core/');
const write = (file, body) => {
    written.add(file);
    console.log(`[gen-core-api] ${wroteOrNot(writeIfChanged(join(PAGES, file), body))} reference/core/${file}`);
};
const banner = '<!-- AUTO-GENERATED from packages/core/src (TypeDoc) by apps/docs/scripts/gen-core-api.mjs — do not edit by hand. -->';

for (const { area, index, lines } of pages) {
    write(`${area.slug}.md`, `---
title: "${area.label} — core API"
description: "Generated reference for @aparte/core. ${area.line.replace(/`/g, '').replace(/"/g, '\\"')}"
sidebar:
  label: ${area.label}
  order: ${order + (index + 1) / 10}
---

${banner}

${relink(lines, area.slug).join('\n').trim()}
`);
}

const link = (m) => {
    const id = [...landed].find(([tid]) => headings.get(tid)?.member === m && headings.get(tid)?.line === 0)?.[1];
    return id ? `[\`${m.name}\`](${BASE}/${id.page}/#${id.id})` : `\`${m.name}\``;
};
const elements = members.filter((m) => m.element);
write('index.md', `---
title: Core API
description: "Generated reference for @aparte/core: every export, by area — configuration, client, transports, messages, conversations, questions, element types and utilities."
sidebar:
  label: Overview
  order: ${order}
---

${banner}

The custom elements are on their catalogue pages, with their attributes, properties, methods,
events, slots and CSS variables. Everything else \`@aparte/core\` exports is here, generated from
its source and JSDoc.

| Page | What it documents |
| --- | --- |
${pages.map(({ area }) => `| [${area.label}](${BASE}/${area.slug}/) | ${area.line} |`).join('\n')}

## Every export, by page

${pages.map(({ area, members: own }) => `### ${area.label}

${own.map(link).join(', ')}
`).join('\n')}
### Elements

${elements.map((m) => `[\`${m.name}\`](${elementPage.get(m.name)})`).join(', ')}
`);

// Only this script writes in reference/core/: anything it did not write this run is stale.
for (const file of readdirSync(PAGES)) {
    if (!written.has(file)) {
        unlinkSync(join(PAGES, file));
        console.log(`[gen-core-api] removed stale reference/core/${file}`);
    }
}
const kept = pages.reduce((n, p) => n + p.members.length, 0);
console.log(`[gen-core-api] ${kept} members on ${pages.length} pages, ${elements.length} element classes linked to the catalogue`);
// A link to a heading that was left out (an underscore member) or that TypeDoc never wrote.
if (unlinked.size) console.log(`[gen-core-api] left as text, no heading to point at: ${[...unlinked].map((id) => `#${id}`).join(', ')}`);
