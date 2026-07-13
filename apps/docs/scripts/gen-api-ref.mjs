/*
 * Generates the "Elements" API reference from the Custom Elements Manifest
 * (packages/core/dist/custom-elements.json, produced by `cem analyze` during the
 * core build). Runs before `astro dev` / `astro build` (see package.json), so the
 * component API reference tracks the code — add an @element/@attr/@fires and it
 * shows up here.
 *
 * Output (git-ignored, always regenerated):
 *   src/content/docs/reference/api.md
 *
 * If the manifest is missing (core not built yet), a placeholder is written and a
 * warning logged, so `astro dev` never crashes on a fresh checkout.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CEM = resolve(here, '../../../packages/core/dist/custom-elements.json');
const OUT = resolve(here, '../src/content/docs/reference/api.md');

const FRONTMATTER = `---
title: Elements
description: The generated API of every <aparte-*> custom element — attributes, properties, methods, events and slots.
sidebar:
  order: 1
---

<!-- AUTO-GENERATED from packages/core/dist/custom-elements.json (cem analyze) by apps/docs/scripts/gen-api-ref.mjs — do not edit by hand. Run \`pnpm --filter @aparte-workspace/docs gen:api\` to refresh. -->
`;

function write(body) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, FRONTMATTER + body, 'utf8');
}

if (!existsSync(CEM)) {
  console.warn(`[gen-api-ref] ${CEM} not found — build @aparte/core first. Wrote a placeholder.`);
  write(`\nThe element reference is generated from the custom-elements manifest, which is produced when \`@aparte/core\` is built. Run a full build to populate it.\n`);
  process.exit(0);
}

const cem = JSON.parse(readFileSync(CEM, 'utf8'));

/** @type {any[]} */
const elements = [];
for (const m of cem.modules ?? []) {
  for (const d of m.declarations ?? []) {
    if (d.customElement && d.tagName) elements.push(d);
  }
}

// Primary elements first, in reading order; everything else follows, alphabetically.
const ORDER = [
  'aparte-chat', 'aparte-chat-viewport', 'aparte-composer', 'aparte-chat-bubble',
  'aparte-chat-status', 'aparte-conversation-list', 'aparte-elicitation',
];
elements.sort((a, b) => {
  const ia = ORDER.indexOf(a.tagName), ib = ORDER.indexOf(b.tagName);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  return a.tagName.localeCompare(b.tagName);
});

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
const typeText = (t) => (t && t.text ? t.text : '');

const isPublic = (mem) => mem.privacy !== 'private' && mem.privacy !== 'protected' && !mem.name.startsWith('_');

function methodSig(m) {
  const params = (m.parameters ?? []).map((p) => `${p.name}${p.optional ? '?' : ''}: ${typeText(p.type) || 'any'}`).join(', ');
  const ret = typeText(m.return && m.return.type) || 'void';
  return `${m.name}(${params}): ${ret}`;
}

let md = '\nEvery `<aparte-*>` custom element, generated from the source. Attributes, events\nand descriptions come from the components’ JSDoc; this page can’t drift from the code.\n';

for (const el of elements) {
  md += `\n## \`<${el.tagName}>\`\n`;
  if (el.description) md += `\n${el.description.trim()}\n`;

  const attrs = el.attributes ?? [];
  if (attrs.length) {
    md += `\n### Attributes\n\n| Attribute | Description |\n| --- | --- |\n`;
    for (const a of attrs) {
      md += `| \`${esc(a.name)}\` | ${esc(a.description)} |\n`;
    }
  }

  const members = (el.members ?? []).filter(isPublic);
  const props = members.filter((m) => m.kind === 'field');
  const methods = members.filter((m) => m.kind === 'method');

  if (props.length) {
    md += `\n### Properties\n\n| Property | Type | Description |\n| --- | --- | --- |\n`;
    for (const p of props) {
      const ro = p.readonly ? ' _(readonly)_' : '';
      md += `| \`${esc(p.name)}\`${ro} | \`${esc(typeText(p.type))}\` | ${esc(p.description)} |\n`;
    }
  }

  if (methods.length) {
    md += `\n### Methods\n\n| Method | Description |\n| --- | --- |\n`;
    for (const m of methods) {
      md += `| \`${esc(methodSig(m))}\` | ${esc(m.description)} |\n`;
    }
  }

  const events = el.events ?? [];
  if (events.length) {
    md += `\n### Events\n\n| Event | Description |\n| --- | --- |\n`;
    for (const ev of events) {
      md += `| \`${esc(ev.name)}\` | ${esc(ev.description)} |\n`;
    }
  }

  const slots = el.slots ?? [];
  if (slots.length) {
    md += `\n### Slots\n\n| Slot | Description |\n| --- | --- |\n`;
    for (const s of slots) {
      md += `| ${s.name ? `\`${esc(s.name)}\`` : '_(default)_'} | ${esc(s.description)} |\n`;
    }
  }
}

write(md);
console.log(`[gen-api-ref] wrote ${elements.length} elements → ${OUT}`);
