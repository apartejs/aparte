/*
 * Generates the component catalogue from the Custom Elements Manifest — one page per
 * COMPONENT, not one per tag.
 *
 * Why generated: a page per component is enumerable, and this repo's rule is that what is
 * enumerable is generated. Ship an element and its page exists, with its description, its
 * example and its tables, without anyone remembering. The prose lives in the class JSDoc, where
 * it also feeds a consumer's editor autocomplete, so there is one source and nothing to drift.
 *
 * The SHAPE comes from reading six documentation sites (Nebular, Web Awesome, Ark UI, Radix,
 * shadcn/ui, Material Web), and three of their conventions are unanimous or near enough:
 *
 * - **Human names.** 6/6 title a page "Select", never `wa-select` or `SelectRoot`. The tag stays
 *   visible on the page and in the tables, where it is the thing you actually type.
 * - **A component made of parts is ONE page.** 5/6 — Ark UI puts 17 parts on the Select page,
 *   Radix 16, Material Web folds `md-menu-item` into Menus. Web Awesome is the lone splitter,
 *   and Material Web proves that is a choice rather than a constraint of web components.
 * - **Grouped by purpose.** Nebular: Navigation / Forms / Modals. Web Awesome: Actions / Forms
 *   / Feedback. This first read as "never group by source tree", and the two real primitives
 *   were folded into a "Utility" bucket that said nothing about them. That was wrong, and the
 *   correction sharpens the convention rather than breaking it: **reusable-anywhere IS a
 *   purpose**, and it is the one a reader most needs, so `Primitives` is a group — read off
 *   `packages/core/src/primitives/`, because there the tree and the purpose agree.
 *
 * Sections are STACKED, not tabbed. Nebular tabs Overview | API | Theme and Material Web stacks
 * exactly those same sections, so the split is validated six times and only its presentation is
 * contested — and tabs lose that argument on a measurable point: Starlight builds its table of
 * contents from the markdown, so a heading inside a closed tab becomes a link that scrolls to a
 * hidden element. Five of six links on every page did nothing. It is not a Starlight bug —
 * Docusaurus documents the same behaviour — it is what tabs do to a document outline. Stacked,
 * the outline IS the page's navigation.
 *
 * Output (git-ignored, always regenerated):
 *   src/content/docs/components/<group>/<tag>.mdx
 *   src/content/docs/components/index.mdx
 *   src/generated/element-api/<tag>.mdx   — partials for elements a PLUGIN ships
 */
import { readFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { writeIfChanged } from './write-if-changed.mjs';
import { mdxSafe } from './mdx-safe.mjs';
import { exampleInFrameworks } from './example-frameworks.mjs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CEM = resolve(here, '../../../packages/core/dist/custom-elements.json');
const CONTENT = resolve(here, '../src/content/docs/components');
const PLUGIN_DIR = resolve(here, '../../../packages/plugins');
const PARTIALS = resolve(here, '../src/generated/element-api');

if (!existsSync(CEM)) {
  console.error(
    `[gen-element-pages] no manifest at ${CEM}\n` +
      `  Build @aparte/core first: pnpm build (or npx nx build @aparte/core).\n` +
      `  A missing input is a stop, not a set of empty pages.`,
  );
  process.exit(1);
}

/**
 * Which elements are PARTS of another, and therefore sections on its page rather than pages.
 *
 * A judgement, deliberately not derived from the tag prefix. By prefix `aparte-chat-bubble`
 * would be a part of `aparte-chat`, and the bubble carries 50 CSS variables and 7 events —
 * burying it inside another page would be worse than the flat list this replaces. The test that
 * actually applies: can you use it on its own? A `<aparte-composer-send>` outside a composer
 * does nothing, and `<aparte-option>` outside a select is inert — Paul's own reading, *"c'est
 * utilisé que dans cette primitive, donc pour moi c'est un enfant de primitive"*.
 */
const PARTS = {
  'aparte-composer': [
    'aparte-composer-input',
    'aparte-composer-send',
    'aparte-composer-cancel',
    'aparte-composer-action',
    'aparte-composer-add-attachment',
    'aparte-composer-attachments',
    'aparte-composer-toolbar',
  ],
  'aparte-select': ['aparte-option', 'aparte-optgroup'],
};

/**
 * Sidebar groups, by what a reader is looking for.
 *
 * **`primitives` is a group, and it is derived from the source tree rather than listed here.**
 * That reverses this file's first version, which grouped purely by purpose and folded the two
 * real primitives into a "Utility" bucket that said nothing about them. Paul's correction:
 * *"les primitives doivent être à part, car ce sont des éléments qui sont réutilisés"* — and
 * reusable-anywhere IS the purpose that distinguishes them. An element under
 * `packages/core/src/primitives/` works outside the chat entirely; everything in
 * `components/` finds its parent with `closest()` and is inert without one.
 *
 * Deriving it from the module path also means it cannot drift: move a file into `primitives/`
 * and its page moves with it, which a hand-kept map would not do.
 *
 * The rest stays a judgement, because "conversation" and "input" are not in the tree. An
 * element missing from the map still gets a page, under `other`, and says so on the console —
 * a silent default would let a new element land somewhere arbitrary and unnoticed.
 */
const GROUP = {
  'aparte-chat': 'conversation',
  'aparte-chat-viewport': 'conversation',
  'aparte-chat-bubble': 'conversation',
  'aparte-chat-status': 'conversation',
  'aparte-conversation-list': 'conversation',
  'aparte-composer': 'input',
  'aparte-elicitation': 'input',
};

/** `primitives/` in the tree means a primitive on the site. Path wins over the map above. */
const groupOf = (tag, modulePath) =>
  (modulePath || '').includes('/primitives/') ? 'primitives' : (GROUP[tag] ?? 'other');

/** Reading order inside a group, most load-bearing first; anything else follows alphabetically. */
const LEAD = ['aparte-chat', 'aparte-chat-viewport', 'aparte-chat-bubble', 'aparte-composer', 'aparte-select'];

const GROUP_LABEL = {
  conversation: 'The conversation',
  input: 'Input',
  primitives: 'Primitives',
  other: 'Other',
};

/** One line per group on the catalogue index — what the group IS, not what it contains. */
const GROUP_BLURB = {
  conversation: 'The transcript and everything that renders inside it.',
  input: 'Where the person writes, and where the model asks something back.',
  primitives:
    'Reusable anywhere, including outside a chat. They know nothing about a conversation, '
    + 'take no host, and are the pieces to build your own surfaces from.',
  other: '',
};

/** `aparte-composer-add-attachment` → `Composer add attachment`. Derived, so a new tag needs no map. */
function humanName(tag) {
  const words = tag.replace(/^aparte-/, '').split('-');
  return words.join(' ').replace(/^./, (c) => c.toUpperCase());
}

// mdxSafe here and not only on the prose: a table cell carries descriptions too, and a bare
// `<aparte-composer>` in one of them fails the MDX parse exactly the same way.
const esc = (s) => mdxSafe(String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim());
const typeText = (t) => (t && t.text ? t.text : '');
const isPublic = (m) => m.privacy !== 'private' && m.privacy !== 'protected' && !m.name.startsWith('_');

function methodSig(m) {
  const params = (m.parameters ?? [])
    .map((p) => `${p.name}${p.optional ? '?' : ''}: ${typeText(p.type) || 'any'}`)
    .join(', ');
  return `${m.name}(${params}): ${typeText(m.return && m.return.type) || 'void'}`;
}

/** First sentence, for the frontmatter description — that is the meta-description slot. */
function firstSentence(text) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const cut = flat.match(/^(.{20,240}?[.!?])(\s|$)/);
  return (cut ? cut[1] : flat.slice(0, 200)).trim();
}

/** YAML-safe single-quoted scalar. Tags carry `<`/`>`, descriptions carry apostrophes. */
const yaml = (s) => `'${String(s).replace(/'/g, "''")}'`;

const cem = JSON.parse(readFileSync(CEM, 'utf8'));

const byTag = new Map();
for (const mod of cem.modules ?? []) {
  for (const d of mod.declarations ?? []) {
    if (d.customElement && d.tagName) byTag.set(d.tagName, { decl: d, path: mod.path ?? '' });
  }
}

const isPart = new Set(Object.values(PARTS).flat());

// ── section builders ─────────────────────────────────────────────────────────
// `h` is the heading level so the same builders serve a page (##) and a part inside the API
// tab (####). One implementation of an API table, whatever it is nested in.

function examplesOf(decl) {
  return [...(decl.examples ?? []), ...(decl.members ?? []).flatMap((m) => m.examples ?? [])];
}

function exampleBlocks(decl) {
  return examplesOf(decl)
    .map((ex) => `\n\`\`\`${ex.trimStart().startsWith('<') ? 'html' : 'ts'}\n${ex.trim()}\n\`\`\`\n`)
    .join('');
}

/**
 * The Usage block for one element: the rendered thing, with its source behind a disclosure.
 *
 * HTML examples go through the five framework tabs; a JS/TS example does not, because it is
 * already framework-agnostic — showing the same snippet five times would teach that they
 * differ. An element with no example still gets the frame: the preview is the point.
 */
function previewBlock(decl) {
  const examples = examplesOf(decl).map((e) => e.trim());
  const html = examples.filter((e) => e.startsWith('<'));
  const script = examples.filter((e) => !e.startsWith('<'));
  if (!html.length && !script.length) return `\n<ElementPreview tag="${decl.tagName}" />\n`;
  const byFramework = exampleInFrameworks(html, script);
  const slots = Object.entries(byFramework)
    .map(([f, code]) => `<Fragment slot="code-${f}">\n${code}</Fragment>\n`)
    .join('');
  return `\n<ElementPreview tag="${decl.tagName}">\n${slots}</ElementPreview>\n`;
}

/**
 * The description, split where a reader's need splits.
 *
 * The first paragraph says what the element IS and belongs at the top. The rest is
 * reference prose — up to eight paragraphs of it — and stacking all of it between the tag
 * and the page put a wall in front of the one thing the page is for. It now sits under its
 * own heading, which the table of contents can address.
 *
 * Markdown headings written in the JSDoc pass through untouched, so an element with a long
 * description can section itself at the source rather than here.
 */
function splitDescription(decl) {
  const desc = String(decl.description ?? '').trim();
  if (!desc) return { lead: '', body: '' };
  const paras = desc.split(/\n\s*\n/);
  return { lead: paras[0].trim(), body: paras.slice(1).join('\n\n').trim() };
}

function apiTables(decl, h) {
  const H = '#'.repeat(h);
  const members = (decl.members ?? []).filter(isPublic);
  const props = members.filter((m) => m.kind === 'field');
  const methods = members.filter((m) => m.kind === 'method');
  const attrs = decl.attributes ?? [];
  const events = decl.events ?? [];
  let md = '';

  if (attrs.length) {
    md += `\n${H} Attributes\n\n| Attribute | Description |\n| --- | --- |\n`;
    for (const a of attrs) md += `| \`${esc(a.name)}\` | ${esc(a.description)} |\n`;
  }
  if (props.length) {
    md += `\n${H} Properties\n\n| Property | Type | Description |\n| --- | --- | --- |\n`;
    for (const p of props) {
      md += `| \`${esc(p.name)}\`${p.readonly ? ' _(readonly)_' : ''} | \`${esc(typeText(p.type))}\` | ${esc(p.description)} |\n`;
    }
  }
  if (methods.length) {
    md += `\n${H} Methods\n\n| Method | Description |\n| --- | --- |\n`;
    for (const m of methods) md += `| \`${esc(methodSig(m))}\` | ${esc(m.description)} |\n`;
  }
  if (events.length) {
    // The Type column is what tells a consumer the shape of `e.detail`, and what a typed wrapper
    // derives its output from. An event with no detail renders as a bare `CustomEvent` — that
    // absence is information too.
    md += `\n${H} Events\n\n| Event | Type | Description |\n| --- | --- | --- |\n`;
    for (const ev of events) {
      md += `| \`${esc(ev.name)}\` | \`${esc(typeText(ev.type))}\` | ${esc(ev.description)} |\n`;
    }
  }
  return md;
}

function cssTable(decl, h) {
  const cssProps = decl.cssProperties ?? [];
  if (!cssProps.length) return '';
  const H = '#'.repeat(h);
  // ONE table. Some of these are the element's own knob and some are a site-wide token that
  // merely styles it, and the difference matters — but it is not DERIVABLE. Two tests were
  // measured and both are wrong: ":root-declared" catches every knob, since aparté gives all of
  // them a root default; "declared by more than one element" catches shared regional knobs like
  // `--aparte-thumb-*` while missing `--aparte-primary`, which one element declares. Asserting
  // it would be the confident-but-wrong kind of sentence this lot exists to remove.
  let md = `\n${H} \`<${decl.tagName}>\`\n\n| Variable | Default | Description |\n| --- | --- | --- |\n`;
  for (const p of cssProps) {
    md += `| \`${esc(p.name)}\` | ${p.default ? `\`${esc(p.default)}\`` : '—'} | ${esc(p.description)} |\n`;
  }
  return md;
}

/**
 * The same element written five ways.
 *
 * The docs used to be vanilla-only with a link out, which made a reader in React translate every
 * snippet in their head. Nothing here is invented: the syntax comes from the four hand-written
 * framework pages, and the Angular Output name from the rule `scripts/gen-element-bindings.mjs`
 * already applies — `camel(event.replace(/^aparte-/, ''))`, `aparte-select-change` →
 * `selectChange`. If that rule changes, this follows it.
 *
 * `syncKey="framework"` is Starlight's own: the reader picks once and the choice follows them
 * across every page of the site, which is the "choose your framework at the top" behaviour
 * without a control of our own to maintain.
 *
 * The tag is IDENTICAL in all five — that is the library's thesis, and showing it five times is
 * what makes the claim checkable rather than asserted.
 */
const pascal = (s) => s.replace(/^aparte-/, '').replace(/(^|-)([a-z])/g, (_m, _d, c) => c.toUpperCase());
const camel = (s) => s.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
const outputName = (event) => camel(event.replace(/^aparte-/, ''));

/**
 * How the SAME element is bound in each framework — as a table, deliberately.
 *
 * This section used to be a second `<Tabs syncKey="framework">` group, which put a second
 * framework selector on a page that already has one in the preview card, driven by a
 * different mechanism. Two selectors that can disagree is worse than none.
 *
 * A table is also the better shape for what this section is FOR. The card answers "show me
 * mine"; this answers "how do these differ", and a comparison you have to click through
 * five times is not a comparison. The tag column repeating itself is the finding.
 */
function frameworkTable(decl) {
  const tag = decl.tagName;
  const attrs = decl.attributes ?? [];
  // A presence attribute is the one worth showing: it is where the frameworks differ most,
  // and where every one of them has the same trap.
  const bool = attrs.find((a) => /boolean/i.test(a.type?.text ?? ''));
  const attr = bool ?? attrs[0];
  // An event that CARRIES a detail teaches more than one that does not, and it avoids
  // showing a handler with an unused parameter. Falls back to the first event otherwise.
  const events = decl.events ?? [];
  const ev = events.find((e) => /^CustomEvent<.+>$/.test(e.type?.text ?? '')) ?? events[0];
  const hasDetail = ev && /^CustomEvent<.+>$/.test(ev.type?.text ?? '');
  const handler = hasDetail ? 'use($event)' : 'onIt()';

  let md = `\n## In a framework\n\nThe element is the same object everywhere — **the tag does not change**, which is why the preview above needs only one. What changes is how you write an attribute and how an event reaches you.\n\n`;

  if (!attr && !ev) {
    md += `\`<${tag}>\` takes no attribute and fires no event, so there is nothing to bind: write the tag.\n`;
  } else {
    md += `| | Attribute | Event |\n| --- | --- | --- |\n`;
    const row = (name, a, e) => `| ${name} | ${a} | ${e} |\n`;
    const na = '—';
    const plainAttr = attr ? `\`${attr.name}${bool ? '=""' : '="…"'}\`` : na;
    md += row('Vanilla', plainAttr, ev ? `\`el.addEventListener('${ev.name}', …)\`` : na);
    md += row('React', plainAttr, ev ? 'by ref, typed through the DOM' : na);
    md += row('Vue', plainAttr, ev ? `\`@${ev.name}="…"\`` : na);
    md += row('Svelte', plainAttr, ev ? `\`on:${ev.name}={…}\`` : na);
    md += row(
      'Angular',
      attr ? `\`${bool ? `[${camel(attr.name)}]="true"` : `${attr.name}="…"`}\`` : na,
      ev ? `\`(${outputName(ev.name)})="${handler}"\`` : na,
    );
    md += `\n`;
    if (bool) {
      md += `The presence attribute is the shared trap: it is set with \`''\` and removed with \`null\`, never \`false\`. Every framework here stringifies \`false\` into \`${attr.name}="false"\`, which \`hasAttribute\` reads as ON. Angular's directive is the exception — \`[${camel(attr.name)}]\` takes a real boolean, because a directive is running.\n\n`;
    }
    if (ev) {
      md += `Angular's \`(${outputName(ev.name)})\` comes from \`Aparte${pascal(tag)}Directive\`, a standalone directive whose selector IS the tag — so the real element sits in the template, and \`@if\`, \`@for\` and content projection all reach it with no \`CUSTOM_ELEMENTS_SCHEMA\`.\n\n`;
    }
  }

  md += `Installation and the framework-specific traps: [React](/frameworks/react/) · [Vue](/frameworks/vue/) · [Svelte](/frameworks/svelte/) · [Angular](/frameworks/angular/).\n`;
  return md;
}

/** Flat sections for a plugin partial — no tabs, since it is embedded in a hand-written page. */
function flatSections(decl) {
  let md = '';
  const ex = exampleBlocks(decl);
  if (ex) md += `\n## Example\n${ex}`;
  md += apiTables(decl, 2);
  const css = decl.cssProperties?.length ? cssTable(decl, 3) : '';
  if (css) md += `\n## CSS variables\n${css}`;
  return md;
}

// ── the page ─────────────────────────────────────────────────────────────────

function page(tag) {
  const { decl, path } = byTag.get(tag);
  const parts = (PARTS[tag] ?? []).filter((p) => byTag.has(p));
  const description = String(decl.description ?? '').trim();
  const order = LEAD.indexOf(tag);
  const all = [decl, ...parts.map((p) => byTag.get(p).decl)];
  const hasCss = all.some((d) => d.cssProperties?.length);

  let md = `---
title: ${yaml(humanName(tag))}
description: ${yaml(firstSentence(description) || `The <${tag}> custom element.`)}
${order === -1 ? '' : `sidebar:\n  order: ${order + 1}\n`}---

import ElementPreview from '../../../../components/ElementPreview.astro';

`;

  // The tag before the prose: the page is titled in human words, so the identifier a reader
  // types has to be stated once, plainly, at the top.
  // The class name is stated, not left to chance. It is what a TypeScript consumer writes
  // (`querySelector<AparteComposerSend>(…)`), and it used to reach the page only when a
  // JSDoc description happened to open with it — so tidying three of those descriptions
  // deleted the only mention `AparteOption`, `AparteOptgroup` and `AparteProgressSpinner`
  // had anywhere on the site. `check:export-mentions` caught it; this makes it structural.
  md += `\`<${tag}>\` · class \`${decl.name}\`${parts.length ? ` · ${parts.length} part${parts.length > 1 ? 's' : ''}: ${parts.map((p) => `\`<${p}>\``).join(', ')}` : ''}\n\n`;

  // Sections STACKED, not tabbed. Usage/API/Theming were three `<Tabs>` panels, which put
  // five of this page's six headings inside a closed tab: Starlight builds its table of
  // contents from the markdown, so every one of those links scrolled to a hidden element
  // and did nothing. It is not a Starlight bug — Docusaurus documents the same behaviour
  // and has carried the issue for years — it is what tabs do to a document outline.
  // Stacked, the outline IS the page's navigation. The FRAMEWORK tabs stay: they carry no
  // headings, so they cost the outline nothing.
  const { lead, body } = splitDescription(decl);
  if (lead) md += `${mdxSafe(lead)}\n\n`;

  md += `## Usage\n${previewBlock(decl)}`;

  if (body) md += `\n## How it works\n\n${mdxSafe(body)}\n`;

  for (const p of parts) {
    const pd = byTag.get(p).decl;
    const split = splitDescription(pd);
    md += `\n## ${humanName(p)}\n\n\`<${p}>\`\n\n`;
    if (split.lead) md += `${mdxSafe(split.lead)}\n`;
    md += previewBlock(pd);
    if (split.body) md += `\n${mdxSafe(split.body)}\n`;
  }

  md += `\n## API\n`;
  md += parts.length ? `\n### \`<${tag}>\`\n${apiTables(decl, 4)}` : apiTables(decl, 3);
  for (const p of parts) {
    md += `\n### \`<${p}>\`\n${apiTables(byTag.get(p).decl, 4)}`;
  }

  if (hasCss) {
    md += `\n## Theming\n\nOverride any of these on \`:root\`, on a subtree, or on one instance — custom properties inherit downward. Some are this element's own; others are site-wide tokens that also style it, and overriding one of those at \`:root\` moves everything that reads it. The full set is in the [CSS variables reference](/reference/css-variables/).\n`;
    for (const d of all) md += cssTable(d, 3);
  }

  md += frameworkTable(decl);
  md += `
{/* Generated from ${path} by apps/docs/scripts/gen-element-pages.mjs — edit the class JSDoc, not this file. */}
`;

  return md;
}

function indexPage(pagesByGroup) {
  let md = `---
title: 'Components'
description: 'Every element aparté ships — what each one is for, in one line.'
sidebar:
  order: 0
---

Every element is a plain custom element: no framework, no runtime dependency, and the same
object whatever you mount it with. A component made of parts is documented on one page, with its
parts as sections. [Segments](/segments/text/) are the other family and a different kind of
thing — data somebody renders, with no tag at all.

`;
  for (const group of ['conversation', 'input', 'primitives', 'other']) {
    const list = pagesByGroup[group] ?? [];
    if (!list.length) continue;
    md += `\n## ${GROUP_LABEL[group]}\n\n`;
    if (GROUP_BLURB[group]) md += `${GROUP_BLURB[group]}\n\n`;
    md += `| Component | What it is |\n| --- | --- |\n`;
    for (const tag of list) {
      const { decl } = byTag.get(tag);
      // Parts are NAMED, not counted. "(+7 parts)" told a reader something existed without
      // telling them what, so `aparte-composer-toolbar` was reachable only by opening the page
      // and scrolling — nothing on this index could be scanned, searched or linked for it.
      const parts = (PARTS[tag] ?? []).filter((t) => byTag.has(t));
      md += `| [${humanName(tag)}](/components/${group}/${tag}/) | ${esc(firstSentence(decl.description))} |\n`;
      if (parts.length) {
        const links = parts
          .map((t) => `[${humanName(t)}](/components/${group}/${tag}/#${humanName(t).toLowerCase().replace(/\s+/g, '-')})`)
          .join(' · ');
        md += `| ${links} | _the ${parts.length} parts of ${humanName(tag)}_ |\n`;
      }
    }
  }
  md += `\n{/* Generated by apps/docs/scripts/gen-element-pages.mjs — do not edit by hand. */}\n`;
  return md;
}

// ── write ────────────────────────────────────────────────────────────────────

const pagesByGroup = {};
for (const tag of byTag.keys()) {
  if (isPart.has(tag)) continue;
  const group = groupOf(tag, byTag.get(tag).path);
  if (group === 'other') console.warn(`[gen-element-pages] <${tag}> is in no group — filed under "other"`);
  (pagesByGroup[group] ??= []).push(tag);
}
for (const list of Object.values(pagesByGroup)) {
  list.sort((a, b) => {
    const ia = LEAD.indexOf(a);
    const ib = LEAD.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });
}

const keep = new Map();
let written = 0;
for (const [group, tags] of Object.entries(pagesByGroup)) {
  const dir = join(CONTENT, group);
  mkdirSync(dir, { recursive: true });
  keep.set(group, new Set(tags.map((t) => `${t}.mdx`)));
  for (const tag of tags) {
    writeIfChanged(join(dir, `${tag}.mdx`), page(tag));
    written++;
  }
}
mkdirSync(CONTENT, { recursive: true });
writeIfChanged(join(CONTENT, 'index.mdx'), indexPage(pagesByGroup));

/*
 * A plugin's element gets a PARTIAL rather than a page. Its own page is the plugin's, where the
 * hand-written prose explains what installing the package gets you — so only the tables are
 * generated, and the plugin page imports them.
 */
let partials = 0;
if (existsSync(PLUGIN_DIR)) {
  mkdirSync(PARTIALS, { recursive: true });
  const seen = new Set();
  for (const plugin of readdirSync(PLUGIN_DIR)) {
    const file = join(PLUGIN_DIR, plugin, 'dist', 'custom-elements.json');
    if (!existsSync(file)) continue;
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    for (const mod of manifest.modules ?? []) {
      for (const d of mod.declarations ?? []) {
        if (!d.customElement || !d.tagName) continue;
        seen.add(`${d.tagName}.mdx`);
        writeIfChanged(
          join(PARTIALS, `${d.tagName}.mdx`),
          `{/* Generated from packages/plugins/${plugin} by apps/docs/scripts/gen-element-pages.mjs — edit the class JSDoc, not this file. */}\n` +
            flatSections(d),
        );
        partials++;
      }
    }
  }
  for (const f of readdirSync(PARTIALS)) if (f.endsWith('.mdx') && !seen.has(f)) rmSync(join(PARTIALS, f));
}

/*
 * Sweep. These directories hold nothing but generated pages, so a removed element — or one that
 * became a PART of another — must take its page with it. Without this, folding the composer's
 * seven parts in would have left seven pages documenting elements the catalogue no longer lists.
 */
let swept = 0;
for (const entry of readdirSync(CONTENT, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    const dir = join(CONTENT, entry.name);
    const wanted = keep.get(entry.name);
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.mdx')) continue;
      if (!wanted || !wanted.has(f)) {
        rmSync(join(dir, f));
        swept++;
      }
    }
    if (!wanted) rmSync(dir, { recursive: true });
  } else if (entry.name.endsWith('.mdx') && entry.name !== 'index.mdx') {
    rmSync(join(CONTENT, entry.name));
    swept++;
  }
}

const summary = Object.entries(pagesByGroup)
  .map(([g, t]) => `${t.length} ${g}`)
  .join(', ');
console.log(
  `[gen-element-pages] ${written} pages (${summary})` +
    (partials ? `, ${partials} plugin partial(s)` : '') +
    (swept ? `, ${swept} stale page(s) removed` : ''),
);
