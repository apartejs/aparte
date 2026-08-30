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
const GENERATED = resolve(here, '../src/generated');

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

/**
 * The `@example` tag's text — a literal of the segment, which the page prints as code AND
 * the live preview renders. One string for both, so a demo cannot drift from the shape it
 * is meant to illustrate.
 *
 * Read from the tags rather than the free text, so it never leaks into `docOf`'s
 * description: the analyser splits a JSDoc block at its first tag and this relies on it.
 */
function exampleOf(node) {
  for (const block of node.jsDoc ?? []) {
    for (const tag of block.tags ?? []) {
      if (tag.tagName?.text !== 'example') continue;
      const text =
        typeof tag.comment === 'string' ? tag.comment : (tag.comment ?? []).map((c) => c.text ?? '').join('');
      if (text.trim()) return text.trim();
    }
  }
  return '';
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
  // A segment kind is snake_case (`tool_call`) and its file is kebab (`tool-call.ts`), so
  // matching the kind verbatim found every renderer EXCEPT the one whose name has two
  // words. The page then printed "Nothing in core draws this one" directly above a live
  // preview showing core drawing it — the contradiction was on screen and still took an
  // audit to notice, because the sentence only appears when the lookup fails.
  const names = [`${kind}.ts`, kind, `${kind.replace(/_/g, '-')}.ts`, kind.replace(/_/g, '-')];
  const hit = rendererFiles.find((f) => names.includes(f));
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

// The page <title> is what a search result shows, and the bare tag ('custom',
// 'tool_call') carries none of the words anyone types. These titles put the
// category phrase on the one URL that matches it; the sidebar keeps the bare
// tag via an explicit label, so the nav stays a list of types.
const SEO_TITLES = {
  text: 'The text segment — streamed message text',
  thinking: 'The thinking segment — a collapsible AI reasoning block',
  code: 'The code segment — code blocks in an AI chat, highlighted',
  error: 'The error segment — a failure, rendered in the conversation',
  tool_call: 'The tool_call segment — a human-in-the-loop tool call UI',
  custom: 'The custom segment — your own message content (generative UI)',
};

function page({ name, kind, decl }) {
  const doc = docOf(decl);
  const own = fieldsOf(decl).filter((f) => f.name !== 'type');
  const renderer = rendererFor(kind);
  const example = exampleOf(decl);

  let md = `---
title: ${yaml(SEO_TITLES[kind] || `The ${kind} segment`)}
sidebar:
  label: ${yaml(kind)}
description: ${yaml(firstSentence(doc) || `The \`${kind}\` segment: ${name}.`)}
---

import SegmentPreview from '../../../components/SegmentPreview.astro';

`;

  if (doc) md += `${mdxSafe(doc)}\n\n`;

  md += `A segment is data, not an element — it has no tag and dispatches nothing. This one is
\`${name}\`, and it is the object you push into a bubble; something else draws it.

<SegmentPreview kind="${kind}" />
`;

  // The literal a developer would write, next to the frame that renders exactly it. The
  // shape table below says what the fields ARE; this says what one looks like, which is the
  // question anyone emitting a segment actually has.
  if (example) md += `\n### Example\n\n\`\`\`ts\n${example}\n\`\`\`\n`;

  md += `\n## Shape\n\nDiscriminated by \`type: '${kind}'\`.\n${table(own)}`;

  if (inherited.length) {
    // The interface is named, not just its fields: it is the constraint on the exported
    // `AparteSegmentRenderer<T>`, so anyone writing a renderer for a type of their own has
    // to be able to write it down.
    md += `\n### Shared by every segment\n\nFrom \`AparteSegmentBase\`, which is also what a segment type of your own extends.\n${table(inherited)}`;
  }

  md += fieldNotes([...own, ...inherited]);

  md += `\n## Who emits it\n\nAn app pushes one with \`addSegment()\` on the viewport, or a parser produces it while a
reply streams. Core stamps its identity and timing on insert, so an emitted segment does not
have to carry them.\n`;

  /*
   * ONE snippet, and it takes an OBJECT.
   *
   * Both branches published `registerSegmentRenderer('kind', fn)` — a two-argument form
   * the function has never had; it takes `{ type, render }`. Eight pages, twice each,
   * wrong since they were generated, and invisible because this check could not read
   * `.mdx` at all. That is why it is one template now: the two copies would have had to
   * be fixed twice.
   */
  const snippet = `\`\`\`ts
import { registerSegmentRenderer } from '@aparte/core';
import type { ${name} } from '@aparte/core';

registerSegmentRenderer({
    type: '${kind}',
    render: (segment: ${name}) => {
        const el = document.createElement('div');
        el.textContent = JSON.stringify(segment);
        return el;
    },
});
\`\`\``;

  md += `\n## Who draws it\n\n`;
  md += renderer
    ? `A built-in renderer draws this one, from \`${renderer}\`. It installs itself the first time a
segment of this type needs it, so a chat renders it with no setup.

Replace it with your own for this config only:

${snippet}
`
    : `**Nothing in core draws this one** — it is the escape hatch, and the renderer is yours. Without
one registered, core falls back: it draws the segment's \`fallback\` string when there is one, and
otherwise a \`[Unknown segment type: ${kind}]\` placeholder with a console warning naming the type.

${snippet}
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

/*
 * The live preview's data. A segment has no tag, so it cannot be previewed the way an
 * element is: the frame mounts a viewport and pushes this literal into it, which is the
 * only honest way to show one — a segment is drawn by whatever renders it, never by itself.
 *
 * The pages used to carry `<ElementPreview tag="thinking-segment" />`, one line under a
 * sentence saying a segment "has no tag". That frame was empty, so the contradiction cost
 * nothing; filling it made the tag a lie worth removing.
 *
 * A segment with no `@example` gets no entry and `SegmentPreview` renders nothing.
 */
const previews = segments
  .map((s) => ({ kind: s.kind, name: s.name, example: exampleOf(s.decl) }))
  .filter((p) => p.example);

mkdirSync(GENERATED, { recursive: true });
writeIfChanged(
  join(GENERATED, 'segment-previews.ts'),
  `/* Generated from packages/core/src/types/segments.ts by apps/docs/scripts/gen-segment-pages.mjs\n` +
    ` — edit the interface's JSDoc @example, not this file. */\n\n` +
    `export interface SegmentPreview {\n` +
    `    /** The discriminant, which is also the route segment. */\n` +
    `    kind: string;\n` +
    `    /** The interface's name, for the document title. */\n` +
    `    name: string;\n` +
    `    /** Its \`@example\` literal, verbatim — the same text the page shows as code. */\n` +
    `    example: string;\n` +
    `}\n\n` +
    `export const SEGMENT_PREVIEWS: SegmentPreview[] = ${JSON.stringify(previews, null, 4)};\n`,
);

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

/*
 * The section's front door (#63: the llms preamble cited /segments/ and the route
 * 404'd — the sidebar autogenerates the group without an index). One line per type,
 * and the sentence the section exists to say: a message is not a string, and a type
 * of your own is one registration away.
 */
{
  let md = `---
title: 'Message Content Types (Segments) — and how to add your own'
description: ${yaml(`An assistant turn is a list of typed segments — text, thinking, code, a tool call, an error, or a type you register yourself (generative UI) — each drawn by its own renderer.`)}
sidebar:
  order: 0
  label: Overview
---

A **segment** is data, not an element: the typed pieces an assistant message is made
of, each drawn by its own renderer. One turn can carry several — reasoning, then a
tool call awaiting approval, then code, then prose.

`;
  for (const s of segments) {
    md += `- **[${s.kind}](/segments/${s.kind.replace(/_/g, '-')}/)** — ${mdxSafe(firstSentence(docOf(s.decl)) || s.name)}\n`;
  }
  md += `
Two seams make the list yours: [\`registerSegmentRenderer\`](/guides/customization/#custom-segment-types)
draws a type of your own (a weather card, a domain widget — generative UI), and
[\`registerStreamBlock\`](/guides/customization/#teach-the-parser-a-block) teaches the
streaming parser a tag grammar that produces it.

{/* Generated from packages/core/src/types/segments.ts by apps/docs/scripts/gen-segment-pages.mjs — edit the JSDoc, not this file. */}
`;
  keep.add('index.mdx');
  writeIfChanged(join(OUT, 'index.mdx'), md);
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
