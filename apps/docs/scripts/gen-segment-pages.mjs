/*
 * Generates ONE PAGE PER SEGMENT TYPE, from the TypeScript source.
 *
 * A segment is not an element: it has no tag, no attributes and dispatches nothing. It is a
 * DATA shape that somebody renders — so its page cannot come from the custom-elements
 * manifest, and it is read straight from `packages/core/src/types/segments.ts` instead.
 *
 * Read with the TypeScript compiler rather than regular expressions. The JSDoc on these
 * interfaces is the whole value of the page — some fields carry several paragraphs explaining
 * why a default flipped — and a regex over comment blocks would drop or truncate exactly that.
 *
 * The union `AparteSegment` is the authority for WHICH segments exist. Add a member and its
 * page appears; the union shrank from 14 members to 8 across two releases, and the pages must
 * shrink with it rather than document types nobody can emit.
 *
 * Output (git-ignored, always regenerated):
 *   src/content/docs/segments/<kind>.mdx
 */
import { readFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { writeIfChanged } from './write-if-changed.mjs';
import { mdxSafe } from './mdx-safe.mjs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const CORE = resolve(here, '../../../packages/core');
const SRC = join(CORE, 'src/types/segments.ts');
const RENDERERS = join(CORE, 'src/renderers/segments');
const OUT = resolve(here, '../src/content/docs/segments');

if (!existsSync(SRC)) {
  console.error(`[gen-segment-pages] no source at ${SRC}`);
  process.exit(1);
}

const sourceFile = ts.createSourceFile(SRC, readFileSync(SRC, 'utf8'), ts.ScriptTarget.Latest, true);

/** JSDoc text of a node, paragraphs preserved. `comment` is a string or a node array. */
function docOf(node) {
  const blocks = node.jsDoc ?? [];
  const parts = blocks.map((b) =>
    typeof b.comment === 'string' ? b.comment : (b.comment ?? []).map((c) => c.text ?? '').join(''),
  );
  return parts.join('\n\n').trim();
}

const interfaces = new Map();
let unionMembers = null;

sourceFile.forEachChild((node) => {
  if (ts.isInterfaceDeclaration(node)) {
    interfaces.set(node.name.text, node);
    return;
  }
  // `export type AparteSegment = A | B | …` — the list of segments that actually exist.
  if (ts.isTypeAliasDeclaration(node) && node.name.text === 'AparteSegment') {
    unionMembers = ts.isUnionTypeNode(node.type)
      ? node.type.types.filter(ts.isTypeReferenceNode).map((t) => t.typeName.getText())
      : [];
  }
});

if (!unionMembers?.length) {
  console.error('[gen-segment-pages] could not read the AparteSegment union — nothing generated');
  process.exit(1);
}

/** The discriminant literal, which is the segment's real name on the wire. */
function kindOf(decl) {
  for (const m of decl.members) {
    if (!ts.isPropertySignature(m) || m.name.getText() !== 'type' || !m.type) continue;
    if (ts.isLiteralTypeNode(m.type) && ts.isStringLiteral(m.type.literal)) return m.type.literal.text;
  }
  return null;
}

function fieldsOf(decl) {
  return decl.members.filter(ts.isPropertySignature).map((m) => ({
    name: m.name.getText(),
    optional: Boolean(m.questionToken),
    type: m.type ? m.type.getText().replace(/\s+/g, ' ') : 'unknown',
    doc: docOf(m),
  }));
}

/** Inherited members — listed once per page rather than linked away, since they are short. */
const inherited = (() => {
  const base = interfaces.get('AparteSegmentBase');
  return base ? fieldsOf(base) : [];
})();

const rendererFiles = existsSync(RENDERERS) ? readdirSync(RENDERERS) : [];
function rendererFor(kind) {
  const hit = rendererFiles.find((f) => f === `${kind}.ts` || f === kind);
  return hit ? `packages/core/src/renderers/segments/${hit}` : null;
}

// mdxSafe here too: a field's description can name a tag, and a bare one fails the MDX parse.
const esc = (s) => mdxSafe(String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim());
const yaml = (s) => `'${String(s).replace(/'/g, "''")}'`;

function firstSentence(text) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const cut = flat.match(/^(.{20,240}?[.!?])(\s|$)/);
  return (cut ? cut[1] : flat.slice(0, 200)).trim();
}

/**
 * A table cell flattens newlines, so a field whose JSDoc runs to several paragraphs — and some
 * of these explain why a default was inverted — came out as one unreadable mega-cell. Anything
 * long keeps its first sentence in the table and its full prose below, as prose.
 */
const LONG_DOC = 220;

function table(fields) {
  let md = `\n| Field | Type | Required | Description |\n| --- | --- | --- | --- |\n`;
  for (const f of fields) {
    const cell =
      f.doc.length > LONG_DOC ? `${esc(firstSentence(f.doc))} [More](#${f.name.toLowerCase()})` : esc(f.doc);
    md += `| \`${esc(f.name)}\` | \`${esc(f.type)}\` | ${f.optional ? '—' : 'yes'} | ${cell} |\n`;
  }
  return md;
}

function fieldNotes(fields) {
  const long = fields.filter((f) => f.doc.length > LONG_DOC);
  if (!long.length) return '';
  let md = `\n## Notes on individual fields\n`;
  for (const f of long) md += `\n### ${f.name}\n\n${mdxSafe(f.doc)}\n`;
  return md;
}

function page({ name, kind, decl }) {
  const doc = docOf(decl);
  const own = fieldsOf(decl).filter((f) => f.name !== 'type');
  const renderer = rendererFor(kind);

  let md = `---
title: ${yaml(kind)}
description: ${yaml(firstSentence(doc) || `The \`${kind}\` segment: ${name}.`)}
---

import ElementPreview from '../../../components/ElementPreview.astro';

`;

  if (doc) md += `${mdxSafe(doc)}\n\n`;

  md += `A segment is data, not an element — it has no tag and dispatches nothing. This one is
\`${name}\`, and it is the object you push into a bubble; something else draws it.

<ElementPreview tag="${kind}-segment" />
`;

  md += `\n## Shape\n\nDiscriminated by \`type: '${kind}'\`.\n${table(own)}`;

  if (inherited.length) {
    md += `\n### Shared by every segment\n${table(inherited)}`;
  }

  md += fieldNotes([...own, ...inherited]);

  md += `\n## Who emits it\n\nAn app pushes one with \`addSegment()\` on the viewport, or a parser produces it while a
reply streams. Core stamps its identity and timing on insert, so an emitted segment does not
have to carry them.\n`;

  md += `\n## Who draws it\n\n`;
  md += renderer
    ? `A built-in renderer draws this one, from \`${renderer}\`. It installs itself the first time a
segment of this type needs it, so a chat renders it with no setup.

Replace it with your own for this config only:

\`\`\`ts
import { registerSegmentRenderer } from '@aparte/core';

registerSegmentRenderer('${kind}', (segment) => {
    const el = document.createElement('div');
    el.textContent = JSON.stringify(segment);
    return el;
});
\`\`\`
`
    : `**Nothing in core draws this one** — it is the escape hatch, and the renderer is yours. Without
one registered, a segment of this type renders nothing at all:

\`\`\`ts
import { registerSegmentRenderer } from '@aparte/core';

registerSegmentRenderer('${kind}', (segment) => {
    const el = document.createElement('div');
    el.textContent = JSON.stringify(segment);
    return el;
});
\`\`\`
`;

  md += `\nSee [Customization](/guides/customization/) for the whole renderer seam, and
[bring your own loop](/guides/bring-your-own-loop/) for emitting segments yourself.

{/* Generated from packages/core/src/types/segments.ts by apps/docs/scripts/gen-segment-pages.mjs — edit the JSDoc, not this file.  */}
`;

  return md;
}

const segments = [];
for (const name of unionMembers) {
  const decl = interfaces.get(name);
  if (!decl) {
    console.warn(`[gen-segment-pages] ${name} is in the union but has no interface here — skipped`);
    continue;
  }
  const kind = kindOf(decl);
  if (!kind) {
    console.warn(`[gen-segment-pages] ${name} has no string-literal \`type\` — skipped`);
    continue;
  }
  segments.push({ name, kind, decl });
}

mkdirSync(OUT, { recursive: true });
const keep = new Set();
for (const s of segments) {
  // The discriminant is the truth a developer writes (`type: 'tool_call'`) and stays the page
  // title; the URL gets hyphens, because a search engine reads `tool-call` as two words and
  // `tool_call` as one token.
  const file = `${s.kind.replace(/_/g, '-')}.mdx`;
  keep.add(file);
  writeIfChanged(join(OUT, file), page(s));
}

// A removed union member must take its page with it — the union shrank from 14 to 8 across two
// releases, and a page for a type nobody can emit is worse than no page.
let swept = 0;
for (const f of readdirSync(OUT)) {
  if (f.endsWith('.mdx') && !keep.has(f)) {
    rmSync(join(OUT, f));
    swept++;
  }
}

console.log(`[gen-segment-pages] ${segments.length} segments${swept ? `, ${swept} stale page(s) removed` : ''}`);
