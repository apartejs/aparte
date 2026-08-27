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
 *   1. The `:root` blocks — they carry the group comments and the per-token notes,
 *      which is structure no sweep could reconstruct. Note the plural: the palette
 *      used to be one block, and the derived layer was split out of it so it could
 *      be re-declared at every themed anchor. A generator that stopped at the FIRST
 *      block silently dropped the ten tokens declared in the second one and read
 *      with no fallback default — `--aparte-radius-bubble` among them — so they fell
 *      through both passes and vanished from this page entirely.
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
 * DECLARED in `:root` that nothing in core reads. There are twenty — it was eighteen
 * until the derived layer was split into its own block, whose tokens this pass could
 * not see at all while it read only the first block. Some are
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
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { writeIfChanged, wroteOrNot } from './write-if-changed.mjs';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coreStylesheets } from '../../../scripts/core-stylesheets.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CORE_SRC = resolve(here, '../../../packages/core/src');
/**
 * BOTH theme sheets, in the order `src/index.ts` imports them. Reading one was enough
 * until the tokens moved to `theme.css`: the generator kept pointing at `aparte.css`
 * and reported 6 declared tokens instead of 286 — a corpus picked by path, silently
 * shrinking, exactly the failure this file's own header describes.
 */
const CSS_SHEETS = coreStylesheets();
const OUT = resolve(here, '../src/content/docs/reference/css-variables.md');

const css = CSS_SHEETS.map((p) => readFileSync(p, 'utf8')).join(String.fromCharCode(10));
/** A floor, not decoration: if the corpus collapses again, this says so instead of
 *  quietly publishing a shorter page. */
const DECLARED_FLOOR = 250;
const lines = css.split(/\r?\n/);

// Every top-level block whose selector list opens with `:root` — the literal palette
// AND the derived layer split out of it. The dark block is correctly skipped: it holds
// overrides, not the token list. Reading only the first block is what dropped ten
// tokens off this page; see the header.
const body = [];
for (let i = 0; i < lines.length; i++) {
  if (!/^\s*:root\b/.test(lines[i])) continue;
  let j = i;
  while (j < lines.length && !lines[j].includes('{')) j++;
  j++; // step past the opening `{`
  for (; j < lines.length && !/^\}/.test(lines[j]); j++) body.push(lines[j]);
  i = j;
}

const TOKEN = /^\s*(--aparte-[\w-]+)\s*:\s*(.+?);\s*(?:\/\*\s*(.*?)\s*\*\/)?\s*$/;

/**
 * ## How a comment finds the variable it is about
 *
 * A comment introduces the declarations that FOLLOW it, up to the next comment. That
 * is not a convention this file invents — it is how `theme.css` is already written,
 * everywhere, and it is how anyone writes CSS. The generator used to read the
 * opposite ("a comment right after a token annotates that token") and the page paid
 * for it three ways, all measured before this was rewritten:
 *
 *   - seven notes landed on the variable ABOVE the one they described, so
 *     `--aparte-on-primary` published "Outline width for keyboard focus + drag-over
 *     indicators" and `--aparte-focus-outline-width` published the scrollbar's;
 *   - ten of thirty-five section headings were a sentence about a single variable
 *     ("Not a step of the radius scale: a pill is a shape, not a size."), which then
 *     went into the page's table of contents;
 *   - thirty-one MULTI-LINE comments — 125 lines, the prose that says why bubbles are
 *     opt-in and why the tool-call corner is declared here — matched neither pattern
 *     and were dropped without a trace.
 *
 * Deliberately NOT the alternative fix: a marker in the CSS (`@group`) telling the
 * generator which comments are headings. That is a convention every future
 * contributor has to know about a file that is otherwise plain CSS, and the one who
 * does not know it gets the silent failure back.
 *
 * So heading-or-note is decided by what the comment INTRODUCES, which the source
 * already says:
 *
 *   - exactly one declaration  → the comment is that variable's note;
 *   - none, or several         → it opens a section (first sentence as the heading,
 *                                the rest as the section's prose).
 *
 * A trailing comment on the declaration's own line still wins, since it can only mean
 * one thing. Nothing in core uses that form today (0 of 391) — it stays because it
 * costs a capture group and it is the other way people write a note.
 *
 * Known cost, stated rather than hidden: a comment that is a group LABEL over a
 * single declaration ("Typography", over `--aparte-font-family`) becomes that
 * variable's note and the variable stays in the preceding section. Two of 391 land
 * that way. Both read correctly — a heading demoted to a label is not a false
 * statement, which is what all three old failures were.
 */

/** One comment and the declarations it introduces — the unit the source is written in. */
const entries = [];
let entry = { comment: '', tokens: [] };
entries.push(entry);
let total = 0;

for (let i = 0; i < body.length; i++) {
  const line = body[i];
  const tok = line.match(TOKEN);
  if (tok) {
    entry.tokens.push({ name: tok[1], value: tok[2].trim(), note: (tok[3] || '').trim() });
    total++;
    continue;
  }
  if (!/^\s*\/\*/.test(line)) continue;
  // Single- or multi-line: walk to the closing `*/` and flatten it to one string.
  let end = i;
  while (end < body.length && !body[end].includes('*/')) end++;
  const text = body
    .slice(i, end + 1)
    .map((l) => l.trim().replace(/^\/\*+/, '').replace(/\*+\/\s*$/, '').replace(/^\*+ ?/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  i = end;
  entry = { comment: text, tokens: [] };
  entries.push(entry);
}

/**
 * A comment that opens a group names it and then explains it, and the name ends at the
 * first clause boundary — `Icons — one knob, inherited: a container declares it` is a
 * section called "Icons". Cutting at the first SENTENCE instead was the first attempt
 * and it merged three groups into one, because two of the three names carry a clause.
 *
 * The name is then kept only if it reads as one. Both bounds earn their keep on the
 * corpus rather than in the abstract:
 *   - it has to be capitalised, because a name is: "rem, so the reader's browser font
 *     size is honoured; times the scale, …" opens with a unit, not with a heading;
 *   - under 4 characters it is a word the sentence happened to start with;
 *   - over 72 it is a sentence ("Breathing room UNDER the composer, so it does not sit
 *     flush against the bottom edge of a full-height chat.").
 * Either way the comment stays prose and the open section stays open — which is the
 * safe direction: a paragraph in the body says the same thing as a paragraph under a
 * heading, where a sentence in the sidebar says the page is generated badly.
 */
const TITLE = /^(.*?)(?:[.!?:;]|\s—)(?:\s|$)/;
const TITLE_MIN = 4;
const TITLE_MAX = 72;

/** @type {{title: string, prose: string, tokens: {name: string, value: string, note: string}[]}[]} */
const groups = [];
let current = { title: 'General', prose: '', tokens: [] };
groups.push(current);
/** Sections by heading, so a heading repeated across the two blocks reopens one. */
const byTitle = new Map([[current.title, current]]);

for (const e of entries) {
  const name = e.comment ? (e.comment.match(TITLE)?.[1] ?? e.comment).trim() : '';
  // A name already used as a section is a section, whatever it introduces this time.
  // The two `:root` blocks split several groups down the middle — `/* Viewport */`
  // labels an empty run in the literal block and a single declaration in the derived
  // one — and reading that second occurrence as a note left the section with no rows,
  // so the render skipped it and took its paragraph with it.
  if (e.comment && e.tokens.length === 1 && !byTitle.has(name)) {
    e.tokens[0].note ||= e.comment;
    current.tokens.push(e.tokens[0]);
    continue;
  }
  if (e.comment) {
    const title = name;
    const named = /^[A-Z]/.test(title) && title.length >= TITLE_MIN && title.length <= TITLE_MAX;
    const prose = named ? e.comment.slice(title.length).replace(/^[\s.!?:;—]+/, '').trim() : e.comment;
    if (!named) {
      // Prose, not a name. It annotates the run that follows it, inside whatever
      // section is open — promoting it would put a paragraph in the sidebar.
      current.prose = [current.prose, prose].filter(Boolean).join(' ');
    } else if (byTitle.has(title)) {
      // A heading seen before: the two `:root` blocks repeat the same group comments,
      // because the derived half was split out of the literal one group by group. So
      // "Messages" must REJOIN the Messages section rather than open a second one —
      // the page then reads exactly as it did when the palette was a single block.
      current = byTitle.get(title);
      if (prose && !current.prose.includes(prose)) current.prose = [current.prose, prose].filter(Boolean).join(' ');
    } else {
      current = { title, prose, tokens: [] };
      byTitle.set(title, current);
      groups.push(current);
    }
  }
  current.tokens.push(...e.tokens);
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
if (declaredNames.size < DECLARED_FLOOR) {
  console.error(`[gen-css-vars] only ${declaredNames.size} declared tokens found across ` +
    `${CSS_SHEETS.length} sheet(s), floor is ${DECLARED_FLOOR}. The corpus shrank — a sheet` +
    ' moved or was renamed, and the page would publish short.');
  process.exit(1);
}

/** Read with a built-in default, never declared in `:root` — the missing half. */
const componentTokens = [...reads.keys()]
  .filter((n) => !declaredNames.has(n) && !runtimeManaged.has(n))
  .sort()
  .map((n) => ({ name: n, ...reads.get(n) }));

/** Declared in `:root`, read by nothing in core — the reverse defect. */
const unread = new Set([...declaredNames].filter((n) => !reads.has(n)));

/**
 * `|` ends a table cell, and `<` opens an HTML tag in Markdown — the prose now
 * reaching this page really does contain one (`the panel's CSS used to be a <style>
 * block`), and it would render as an empty element rather than as the sentence.
 */
const esc = (s) => s.replace(/\|/g, '\\|').replace(/</g, '&lt;');

let md = `---
title: CSS variables
description: The complete, generated reference of every --aparte-* theme variable.
sidebar:
  order: 2
---

<!-- AUTO-GENERATED from packages/core/src/styles/ (every sheet src/index.ts imports) by apps/docs/scripts/gen-css-vars.mjs — do not edit by hand. Run \`pnpm --filter @aparte-workspace/docs gen:css-vars\` to refresh. -->

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
  md += `\n## ${esc(g.title)}\n\n`;
  if (g.prose) md += `${esc(g.prose)}\n\n`;
  md += `| Variable | Default | Notes |\n| --- | --- | --- |\n`;
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

// A generator that silently drops its input is worse than no generator: the page
// still looks complete. Splitting the palette into two `:root` blocks cost this page
// ten tokens and NOTHING went red — `check:doc-links` only asks whether links
// resolve, and the one trace was a link count falling from 2818 to 2812, a number
// nobody reads. So the parse now has to account for every token in the stylesheet,
// and it fails here rather than shipping a reference with holes in it. Written as a
// set difference on purpose: it catches the next cause too — a third block, a renamed
// selector, a regex that stops matching — not just the one that happened.
const declaredInCss = new Set(
  [...css.matchAll(/^\s+(--aparte-[\w-]+)\s*:/gm)].map((m) => m[1]),
);
const undocumented = [...declaredInCss].filter((name) => !md.includes(`\`${name}\``));
if (undocumented.length) {
  console.error(
    `\n[gen-css-vars] ${undocumented.length} token(s) declared in aparte.css but absent`
    + ' from the page this script generates:\n'
    + undocumented.map((n) => `  ${n}`).join('\n')
    + '\n\nThe parse missed them — check that every `:root`-anchored block is being read'
    + '\n(the palette is split: literals in one block, the derived layer in another).\n',
  );
  process.exit(1);
}

const wrote = writeIfChanged(OUT, md);
console.log(
  `[gen-css-vars] ${wroteOrNot(wrote)} ${total + componentTokens.length} variables → ${OUT}`
  + ` (${total} declared, ${componentTokens.length} component-read, ${unread.size} declared-but-unread)`,
);
