/*
 * Generates the "CSS variables" reference page. Runs before `astro dev` /
 * `astro build` (see package.json), so the reference cannot drift from the code.
 *
 * ## Two halves, because one of them was missing
 *
 * The page used to be built from the FIRST `:root, :host { … }` block of
 * `aparte.css` alone, and its own text promised "every `--aparte-*` theme
 * variable". It was not. Twenty-four tokens that core actually READS never appear
 * in a `:root` declaration at all — they exist only as `var(--x, default)` reads,
 * and the whole `aparte-select` surface (fourteen), the progress spinner (four),
 * the conversation-archive controls (four), plus `--aparte-composer-control-size`
 * (which the theming guide documents BY NAME), `--aparte-surface-4` and
 * `--aparte-send-disabled-bg` are all in that shape. A guarantee stated that
 * strongly is worse than no guarantee.
 *
 * Worse, one of them was documented and the other thirteen were not:
 * `--aparte-select-min-width` IS declared in `:root`, so a reader saw select
 * tokens in the reference and reasonably concluded the list was complete.
 *
 * So there are two passes now:
 *
 *   1. The `:root` block, as before — it carries the group comments and the
 *      per-token notes, which is structure no sweep could reconstruct.
 *   2. A sweep of every stylesheet and every template-literal style under
 *      `packages/core/src` for `var(--aparte-*, default)` reads, listing the
 *      tokens that have no `:root` declaration under their own heading.
 *
 * Deliberately NOT the alternative fix: declaring those twenty-four in `:root`.
 * That is a runtime change made for a documentation goal, and it would flatten
 * fallbacks that legitimately differ by context — `--aparte-select-bg` falls back
 * to `var(--aparte-surface-1, #fff)` in light and `#1e293b` in dark. Custom
 * properties inherit, so overriding an undeclared token on `:root` already works;
 * what was missing was only ever the documentation.
 *
 * The pass also flags the reverse defect, which nothing could see before: tokens
 * DECLARED in `:root` that nothing in core reads. There are eighteen. Some are
 * palette bases a consuming app applies itself (`--aparte-bg`, and core paints no
 * page background on purpose), some are unused steps of a documented scale, and
 * some are knobs that quietly do nothing. Marking them keeps the page from
 * promising a control that has no effect, without guessing which is which.
 *
 * A token core sets at runtime via `style.setProperty` is excluded: it is an
 * internal channel, not a knob. Exactly one qualifies (`--aparte-fw-spacer`), and
 * it is detected rather than listed.
 *
 * Output (git-ignored, always regenerated):
 *   src/content/docs/reference/css-variables.md
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CORE_SRC = resolve(here, '../../../packages/core/src');
const CSS = resolve(here, '../../../packages/core/src/styles/aparte.css');
const OUT = resolve(here, '../src/content/docs/reference/css-variables.md');

const css = readFileSync(CSS, 'utf8');
const lines = css.split(/\r?\n/);

// Isolate the first `:root, :host { … }` block — the light default carries every
// token (the dark block only holds overrides) together with its group comments.
let i = 0;
while (i < lines.length && !/^\s*:root\b/.test(lines[i])) i++;
while (i < lines.length && !lines[i].includes('{')) i++;
i++; // step past the opening `{`
const body = [];
for (; i < lines.length; i++) {
  if (/^\}/.test(lines[i])) break;
  body.push(lines[i]);
}

const TOKEN = /^\s*(--aparte-[\w-]+)\s*:\s*(.+?);\s*(?:\/\*\s*(.*?)\s*\*\/)?\s*$/;
const COMMENT = /^\s*\/\*\s*(.*?)\s*\*\/\s*$/;

/** @type {{title: string, tokens: {name: string, value: string, note: string}[]}[]} */
const groups = [];
let current = { title: 'General', tokens: [] };
groups.push(current);
let lastWasToken = false;
let total = 0;

for (const line of body) {
  if (/^\s*$/.test(line)) {
    lastWasToken = false;
    continue;
  }
  const tok = line.match(TOKEN);
  if (tok) {
    current.tokens.push({ name: tok[1], value: tok[2].trim(), note: (tok[3] || '').trim() });
    total++;
    lastWasToken = true;
    continue;
  }
  const com = line.match(COMMENT);
  if (com) {
    const text = com[1].trim();
    if (lastWasToken && current.tokens.length) {
      // A comment right after a token annotates that token.
      current.tokens[current.tokens.length - 1].note ||= text;
    } else {
      // Otherwise it opens a new section.
      current = { title: text, tokens: [] };
      groups.push(current);
    }
    lastWasToken = false;
  }
}

// ── Pass 2: what the component styles actually read ─────────────────────────

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '__tests__') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(css|ts)$/.test(p)) yield p;
  }
}

/**
 * `var(--x, default)` where the default may itself contain parens and commas —
 * `color-mix(in srgb, var(--aparte-primary, #3b82f6) 12%, transparent)` is real.
 * A regex cannot split that; this walks to the matching `)` and takes the first
 * TOP-LEVEL comma as the separator.
 */
function readsIn(text) {
  const out = [];
  for (let i = text.indexOf('var('); i !== -1; i = text.indexOf('var(', i + 1)) {
    let depth = 1;
    let comma = -1;
    let j = i + 4;
    for (; j < text.length && depth > 0; j++) {
      const c = text[j];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && depth === 1 && comma === -1) comma = j;
    }
    if (depth !== 0) continue;
    const end = j - 1;
    const name = text.slice(i + 4, comma === -1 ? end : comma).trim();
    if (!/^--aparte-[\w-]+$/.test(name)) continue;
    out.push({ name, fallback: comma === -1 ? '' : text.slice(comma + 1, end).trim() });
  }
  return out;
}

/** @type {Map<string, {fallbacks: Set<string>, files: Set<string>}>} */
const reads = new Map();
/** Tokens core writes at runtime — an internal channel, not a public knob. */
const runtimeManaged = new Set();

for (const file of walk(CORE_SRC)) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(CORE_SRC, file).split('\\').join('/');
  for (const m of text.matchAll(/setProperty\(\s*['"](--aparte-[\w-]+)['"]/g)) runtimeManaged.add(m[1]);
  for (const { name, fallback } of readsIn(text)) {
    if (!reads.has(name)) reads.set(name, { fallbacks: new Set(), files: new Set() });
    const entry = reads.get(name);
    if (fallback) entry.fallbacks.add(fallback);
    entry.files.add(rel);
  }
}

const declaredNames = new Set(groups.flatMap((g) => g.tokens.map((t) => t.name)));

/** Read with a built-in default, never declared in `:root` — the missing half. */
const componentTokens = [...reads.keys()]
  .filter((n) => !declaredNames.has(n) && !runtimeManaged.has(n))
  .sort()
  .map((n) => ({ name: n, ...reads.get(n) }));

/** Declared in `:root`, read by nothing in core — the reverse defect. */
const unread = new Set([...declaredNames].filter((n) => !reads.has(n)));

const esc = (s) => s.replace(/\|/g, '\\|');

let md = `---
title: CSS variables
description: The complete, generated reference of every --aparte-* theme variable.
sidebar:
  order: 2
---

<!-- AUTO-GENERATED from packages/core/src/styles/aparte.css by apps/docs/scripts/gen-css-vars.mjs — do not edit by hand. Run \`pnpm --filter @aparte-workspace/docs gen:css-vars\` to refresh. -->

Every \`--aparte-*\` variable aparté declares or reads — **${total + componentTokens.length}**
in total: ${total} declared in the stylesheet's \`:root\` and ${componentTokens.length} read by a
component with a built-in default. Override any of them as shown in
[Theming](/guides/theming). Both halves are swept from the source on every build.

A row marked **palette only** is declared but read by nothing in aparté: it is there
for your own CSS to reference (\`--aparte-bg\` is the page background *your app*
paints — core deliberately leaves the chat transparent), or it is a step of a scale
nothing happens to use yet. Setting one changes nothing on its own.
`;

for (const g of groups) {
  if (!g.tokens.length) continue;
  md += `\n## ${g.title}\n\n| Variable | Default | Notes |\n| --- | --- | --- |\n`;
  for (const t of g.tokens) {
    const note = unread.has(t.name)
      ? [t.note, '**palette only**'].filter(Boolean).join(' — ')
      : t.note;
    md += `| \`${esc(t.name)}\` | \`${esc(t.value)}\` | ${esc(note)} |\n`;
  }
}

if (componentTokens.length) {
  md += `
## Component tokens

Read by a component with a built-in default rather than declared in \`:root\`. Custom
properties inherit, so you set them exactly like the others — on \`:root\`, on a theme
class, or on one \`<aparte-chat>\` to scope them to that chat. The default is what
applies when you do not.

| Variable | Default | Read by |
| --- | --- | --- |
`;
  for (const t of componentTokens) {
    const def = [...t.fallbacks][0] ?? '';
    md += `| \`${esc(t.name)}\` | ${def ? `\`${esc(def)}\`` : '—'} | ${esc([...t.files].sort().join(', '))} |\n`;
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, md, 'utf8');
console.log(
  `[gen-css-vars] wrote ${total + componentTokens.length} variables → ${OUT}`
  + ` (${total} declared, ${componentTokens.length} component-read, ${unread.size} declared-but-unread)`,
);
