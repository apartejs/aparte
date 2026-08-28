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
 * - **Grouped by purpose, not by source tree.** Nebular: Navigation / Forms / Modals. Web
 *   Awesome: Actions / Forms / Feedback. Nobody groups by where the files live, which is what
 *   "primitives vs components" was.
 *
 * Tabs are Nebular's idea (Overview | API | Theme) and the minority position — but Material Web
 * stacks exactly the same sections, so the split is validated six times and only its
 * presentation is contested. Ours are client-side so a component keeps ONE indexable URL, where
 * Nebular routes each tab to its own.
 *
 * Output (git-ignored, always regenerated):
 *   src/content/docs/components/<group>/<tag>.mdx
 *   src/content/docs/components/index.mdx
 *   src/generated/element-api/<tag>.mdx   — partials for elements a PLUGIN ships
 */
import { readFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { writeIfChanged } from './write-if-changed.mjs';
import { mdxSafe } from './mdx-safe.mjs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CEM = resolve(here, '../../../packages/core/dist/custom-elements.json');
const CONTENT = resolve(here, '../src/content/docs/components');
const PLUGIN_DIR = resolve(here, '../../../packages/plugins');
const PARTIALS = resolve(here, '../src/generated/element-api');
const GENERATED = resolve(here, '../src/generated');

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
 * Sidebar groups, by what a reader is looking for. Every surveyed site groups this way and none
 * groups by source tree, which is what "primitives vs components" was — the same critique that
 * retired the package-family sidebar earlier.
 *
 * An element missing from this map still gets a page, under `other`, and says so on the console.
 * A silent default would let a new element land somewhere arbitrary and unnoticed.
 */
const GROUP = {
  'aparte-chat': 'conversation',
  'aparte-chat-viewport': 'conversation',
  'aparte-chat-bubble': 'conversation',
  'aparte-chat-status': 'conversation',
  'aparte-conversation-list': 'conversation',
  'aparte-context': 'conversation',
  'aparte-composer': 'input',
  'aparte-elicitation': 'input',
  'aparte-suggestions': 'input',
  'aparte-select': 'utility',
  'aparte-progress-spinner': 'utility',
  'aparte-icon': 'utility',
};

/** Reading order inside a group, most load-bearing first; anything else follows alphabetically. */
const LEAD = ['aparte-chat', 'aparte-chat-viewport', 'aparte-chat-bubble', 'aparte-composer', 'aparte-select'];

const GROUP_LABEL = {
  conversation: 'The conversation',
  input: 'Input',
  utility: 'Utility',
  other: 'Other',
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
const camel = (s) => s.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
const outputName = (event) => camel(event.replace(/^aparte-/, ''));

/**
 * `tag -> the class `@aparte/angular` actually exports for it`.
 *
 * Read from the wrapper rather than derived from the tag, because the derivation was
 * WRONG and shipped: the Angular tab imported `Aparte${Pascal}Directive` for every
 * element, and `<aparte-chat>` — the first page anyone opens — has a hand-written
 * `AparteChatComponent`, not a directive. `AparteChatDirective` has never existed. The
 * documentation site's own snippet check found it the day it could see MDX pages.
 *
 * A selector plus the class under it, intersected with the barrel: a class that exists but
 * is not re-exported is an import that fails just the same.
 */
function angularSymbols() {
  const root = resolve(here, '../../../packages/wrappers/angular/src');
  const barrel = readFileSync(join(root, 'index.ts'), 'utf8');
  const files = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__') continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.name.endsWith('.ts')) files.push(path);
    }
  }
  const byTag = new Map();
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const [, selector, symbol] of src.matchAll(/selector:\s*'([^']+)'[\s\S]*?export class (\w+)/g)) {
      if (!selector.startsWith('aparte-') || byTag.has(selector)) continue;
      if (!new RegExp(`\\b${symbol}\\b`).test(barrel)) continue;
      byTag.set(selector, symbol);
    }
  }
  return byTag;
}

const ANGULAR = angularSymbols();

function frameworkTabs(decl) {
  const tag = decl.tagName;
  const attrs = decl.attributes ?? [];
  // A presence attribute is the one worth showing: it is where the four frameworks differ most,
  // and where every one of them has the same trap.
  const bool = attrs.find((a) => /boolean/i.test(a.type?.text ?? ''));
  const attr = bool ?? attrs[0];
  // An event that CARRIES a detail teaches more than one that does not, and it avoids
  // showing a handler with an unused parameter. Falls back to the first event otherwise.
  const events = decl.events ?? [];
  const ev = events.find((e) => /^CustomEvent<.+>$/.test(e.type?.text ?? '')) ?? events[0];
  const detail = ev && /^CustomEvent<(.+)>$/.exec(ev.type?.text ?? '');

  const openTag = (syntax) => `<${tag}${attr ? ` ${syntax}` : ''}></${tag}>`;
  const plain = attr ? (bool ? `${attr.name}=""` : `${attr.name}="…"`) : '';

  let md = `\n## In a framework\n\nThe element is the same object everywhere — **the tag does not change**. What changes is how an attribute is written and how an event reaches you.\n\n<Tabs syncKey="framework">\n`;

  md += `<TabItem label="Vanilla">\n\n\`\`\`html\n${openTag(plain)}\n\`\`\`\n`;
  if (ev) md += `\n\`\`\`js\nel.addEventListener('${ev.name}', ${detail ? '(e) => use(e.detail)' : '() => onIt()'});\n\`\`\`\n`;
  md += `\n</TabItem>\n`;

  md += `<TabItem label="React">\n\n\`\`\`tsx\n${openTag(plain)}\n\`\`\`\n\nThe \`aparte-*\` tags are typed JSX intrinsics as soon as you import from \`@aparte/react\`.${bool ? ` A presence attribute takes \`''\`, never \`true\` — React stringifies it, and \`${attr.name}={false}\` would render \`${attr.name}="false"\`, which \`hasAttribute\` reads as on.` : ''}${ev ? ' Events reach you by ref, typed through the DOM.' : ''}\n\n</TabItem>\n`;

  md += `<TabItem label="Vue">\n\n\`\`\`vue\n<template>\n  ${openTag(ev ? `${plain}\n    @${ev.name}="${detail ? '(e) => use(e.detail)' : '() => onIt()'}"\n  ` : plain)}\n</template>\n\`\`\`\n\nDeclared through Vue's \`GlobalComponents\`, so \`vue-tsc\` checks the tag in any template.${bool ? ` A presence attribute takes \`''\` to set and \`null\` to remove, never \`false\`.` : ''}\n\n</TabItem>\n`;

  md += `<TabItem label="Svelte">\n\n\`\`\`svelte\n${openTag(ev ? `${plain}\n  on:${ev.name}={${detail ? '(e) => use(e.detail)' : '() => onIt()'}}\n` : plain)}\n\`\`\`\n\nDeclared through \`SvelteHTMLElements\`, so \`svelte-check\` covers the attributes and the \`on:\` handlers.${bool ? ` A presence attribute takes \`''\`, never \`false\`.` : ''}\n\n</TabItem>\n`;

  const ngSymbol = ANGULAR.get(tag);
  const ngKind = ngSymbol?.endsWith('Component') ? 'component' : 'directive';
  md += `<TabItem label="Angular">\n\n${
    ngSymbol
      ? `\`\`\`ts\nimport { ${ngSymbol} } from '@aparte/angular';\n\`\`\`\n\n`
      : `\`@aparte/angular\` declares nothing for this tag, so an Angular template needs \`CUSTOM_ELEMENTS_SCHEMA\` to accept it — and \`[x]="v"\` will write a PROPERTY, which is a silent no-op on a read-only accessor.\n\n`
  }\`\`\`html\n<${tag}${attr ? ` ${bool ? `[${camel(attr.name)}]="true"` : `${attr.name}="…"`}` : ''}${ev ? `\n  (${outputName(ev.name)})="${detail ? 'use($event)' : 'onIt()'}"` : ''}></${tag}>\n\`\`\`\n\n${
    ngSymbol
      ? `A standalone ${ngKind} whose selector IS the tag, so the real element sits in the template — \`@if\`, \`@for\` and content projection all reach it — and no \`CUSTOM_ELEMENTS_SCHEMA\` is needed.`
      : `Written as a plain custom element.`
  }\n\n</TabItem>\n`;

  md += `</Tabs>\n\nInstallation and the framework-specific traps: [React](/frameworks/react/) · [Vue](/frameworks/vue/) · [Svelte](/frameworks/svelte/) · [Angular](/frameworks/angular/).\n`;
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

import { Tabs, TabItem } from '@astrojs/starlight/components';
import ElementPreview from '../../../../components/ElementPreview.astro';

`;

  // The tag before the prose: the page is titled in human words, so the identifier a reader
  // types has to be stated once, plainly, at the top.
  md += `\`<${tag}>\`${parts.length ? ` — with ${parts.length} part${parts.length > 1 ? 's' : ''}: ${parts.map((p) => `\`<${p}>\``).join(', ')}` : ''}\n\n`;

  if (description) md += `${mdxSafe(description)}\n\n`;

  // Sections STACKED, not tabbed. Usage/API/Theming were three `<Tabs>` panels, which put
  // FIVE of every page's six headings inside a closed tab: Starlight builds its table of
  // contents from the markdown, so each of those links scrolled to a hidden element and did
  // nothing. Measured on the built site — 5 dead links per page, across every page.
  //
  // Not a Starlight bug: Docusaurus documents the same behaviour ("headings within Tabs will
  // not be excluded") and carries an open issue with this exact symptom. It is what tabs do
  // to a document outline, in every framework. Stacked, the outline IS the navigation.
  //
  // The FRAMEWORK tabs below stay: they carry no headings, so they cost the outline nothing.
  md += `## Usage\n\n<ElementPreview tag="${tag}" />\n`;

  const ex = exampleBlocks(decl);
  md += ex ? `\n### Example\n${ex}` : '';
  for (const p of parts) {
    const pex = exampleBlocks(byTag.get(p).decl);
    const pdesc = String(byTag.get(p).decl.description ?? '').trim();
    md += `\n### ${humanName(p)}\n\n\`<${p}>\`\n\n`;
    if (pdesc) md += `${mdxSafe(pdesc)}\n`;
    md += pex;
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

  md += frameworkTabs(decl);
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

:::tip[There is a third family: the UI kit]
Buttons, fields, switches, tags, alerts, menus, tabs and avatars ship as **plain classes on
plain elements** — no tag, themed by the same variables as the chat — for the controls your
own page puts around it. They are listed with their HTML in
[the UI kit reference](/reference/classes/); a consumer who started here rewrote his own
before finding them.
:::

`;
  for (const group of ['conversation', 'input', 'utility', 'other']) {
    const list = pagesByGroup[group] ?? [];
    if (!list.length) continue;
    md += `\n## ${GROUP_LABEL[group]}\n\n| Component | What it is |\n| --- | --- |\n`;
    for (const tag of list) {
      const { decl } = byTag.get(tag);
      const parts = (PARTS[tag] ?? []).length;
      md += `| [${humanName(tag)}](/components/${group}/${tag}/)${parts ? ` _(+${parts} parts)_` : ''} | ${esc(firstSentence(decl.description))} |\n`;
    }
  }
  md += `\n{/* Generated by apps/docs/scripts/gen-element-pages.mjs — do not edit by hand. */}\n`;
  return md;
}

// ── write ────────────────────────────────────────────────────────────────────

const pagesByGroup = {};
for (const tag of byTag.keys()) {
  if (isPart.has(tag)) continue;
  const group = GROUP[tag] ?? 'other';
  if (!GROUP[tag]) console.warn(`[gen-element-pages] <${tag}> is in no purpose group — filed under "other"`);
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
 * The live preview's data, written HERE — beside the page that shows the same example as
 * code — because the frame and the code block have to be the same string.
 *
 * The frame shipped empty for months (`src="about:blank"`) under a caption promising a
 * preview, which is the loudest thing the site got wrong. Filling it from a SECOND source
 * would have swapped that for a quieter version of the same failure: a demo that drifts
 * from the example above it and no way to notice. So the preview renders the element's own
 * `@example`, verbatim — the JSDoc is the single source, and an example that stops working
 * becomes a visibly broken preview instead of prose nobody re-reads.
 *
 * Only the element's OWN examples, not its parts'. A part's example is a fragment shown
 * under its own heading; running all seven of the composer's would stack seven composers
 * in one frame and illustrate nothing.
 *
 * An element with no HTML example gets NO entry, and `ElementPreview` then renders nothing
 * at all rather than an empty box. Absence of a demo is honest; a frame that promises one
 * and shows a void is not.
 */
const previews = Object.values(pagesByGroup)
  .flat()
  .map((tag) => ({
    tag,
    name: humanName(tag),
    html: (byTag.get(tag).decl.examples ?? [])
      .map((ex) => String(ex).trim())
      .filter((ex) => ex.startsWith('<'))
      .join('\n\n'),
  }))
  .filter((p) => p.html);

mkdirSync(GENERATED, { recursive: true });
writeIfChanged(
  join(GENERATED, 'element-previews.ts'),
  `/* Generated from packages/core/dist/custom-elements.json by apps/docs/scripts/gen-element-pages.mjs\n` +
    ` — edit the element's class JSDoc @example, not this file. */\n\n` +
    `export interface ElementPreview {\n` +
    `    /** The custom element's tag, which is also the route segment. */\n` +
    `    tag: string;\n` +
    `    /** Its human name, for the document title. */\n` +
    `    name: string;\n` +
    `    /** The element's own \`@example\`s, verbatim — the same text the page shows as code. */\n` +
    `    html: string;\n` +
    `}\n\n` +
    `export const ELEMENT_PREVIEWS: ElementPreview[] = ${JSON.stringify(previews, null, 4)};\n`,
);

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
