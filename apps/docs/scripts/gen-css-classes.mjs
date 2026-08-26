/*
 * Generates the "CSS classes" reference page — the counterpart to the CSS variables one.
 *
 * ## Why this file exists
 *
 * Core is LIGHT DOM by design: no shadow root, no `::part()`, so every class it writes is
 * already a public theming surface whether anyone documented it or not. An audit measured the
 * consequence: **95 of the 151 classes in `aparte.css` were named nowhere in `apps/docs`** —
 * the whole 28-class artifact-card family among them. The cause was structural rather than
 * anybody's oversight: variables had a generator and classes had none, so the variables page
 * stayed complete while the class surface drifted out of sight.
 *
 * The owner's test for whether this matters: *"demain je monte un nouveau plugin — comment je
 * sais quelle classe je dois mettre à mon bouton s'il n'y a pas une page spéciale bouton ?"*
 * You could not, unless you read core's source.
 *
 * ## What it does NOT do
 *
 * It does not invent a description for each class — a generator cannot know what a class means,
 * and a made-up sentence in a reference is worse than a bare name. What it CAN establish, and
 * what a reader actually needs, is factual: **who writes this class**, **which stylesheet
 * carries its rules**, and **whether supplying it yourself changes core's behaviour**.
 *
 * ## The two lists, and why "unused" is not a section here
 *
 * A class core never writes is NOT dead. From the same conversation: *"c'est pas parce qu'on
 * utilise pas une classe CSS qu'il faut pas la créer si c'est un must-have."* The theming
 * surface is a designed API, so a class core styles but never emits is usually one YOU put on
 * your own markup — `.aparte-composer-row` and `.aparte-composer-shell` are exactly that, and
 * both appear in shipped examples. They get their own list rather than a graveyard.
 *
 * The third list is the honest one: styled by core, written by nobody anywhere in the repo, and
 * named in no page. Those need a human to decide — keep as a documented helper, or remove.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeIfChanged, wroteOrNot } from './write-if-changed.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '../../..');
const OUT = resolve(here, '../src/content/docs/reference/css-classes.md');

const ROOTS = [
  ['core', resolve(REPO, 'packages/core/src')],
  ['plugin-model-selector', resolve(REPO, 'packages/plugins/model-selector/src')],
  ['plugin-ask-user', resolve(REPO, 'packages/plugins/ask-user/src')],
];
const DOCS = resolve(here, '../src/content/docs');
const WRAPPERS = resolve(REPO, 'packages/wrappers');
const EXAMPLES = resolve(REPO, 'apps/examples');

const SKIP_DIR = new Set(['node_modules', 'dist', '.astro', '.angular', '.nx', 'coverage', 'build', '.svelte-kit']);

function* walk(dir, exts) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p, exts);
    else if (exts.some((e) => name.endsWith(e))) yield p;
  }
}

const rel = (f) => f.split(sep).join('/').replace(`${REPO.split(sep).join('/')}/`, '');
/** Comments hold JSDoc `@example` markup — consumer code, not what core writes. */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/^\s*\/\/.*$/gm, '');

// ── 1. declared: every class selector in every stylesheet we ship ────────────
/** @type {Map<string, Set<string>>} class → stylesheets declaring it */
const declared = new Map();
for (const [, root] of ROOTS) {
  for (const f of walk(root, ['.css'])) {
    const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/\.(aparte-[\w-]+)/g)) {
      (declared.get(m[1]) ?? declared.set(m[1], new Set()).get(m[1])).add(rel(f));
    }
  }
}

// ── 2. written: which source file puts each class in the DOM ────────────────
/** @type {Map<string, Set<string>>} class → source files that write it */
const written = new Map();
/** @type {Set<string>} classes whose presence makes core skip its own render */
const contractual = new Set();

const sources = [];
for (const [, root] of ROOTS) {
  for (const f of walk(root, ['.ts'])) {
    if (f.includes('__tests__')) continue;
    sources.push([rel(f), stripComments(readFileSync(f, 'utf8'))]);
  }
}

for (const [file, src] of sources) {
  const note = (c) => {
    if (declared.has(c)) (written.get(c) ?? written.set(c, new Set()).get(c)).add(file);
  };
  /** Resolve `SEND_BUTTON_CLASS` and friends, so a constant reads like the string it holds. */
  const consts = new Map(
    [...src.matchAll(/const\s+([A-Z][A-Z0-9_]*)\s*=\s*'(aparte-[\w-]+)'/g)].map((m) => [m[1], m[2]]),
  );

  // TARGETED forms, not one heuristic over every string literal. The first version tried
  // "any literal containing aparte-, unless it looks like a selector", and its selector test
  // (does the literal contain `.`, `#`, `[`, `:` or `>`) rejects every markup template — so
  // `.aparte-code-copy`, which core writes from inside one, was filed under "you write this".
  // A reference that is wrong about WHO writes a class is worse than no reference.
  for (const m of src.matchAll(/\bclass(?:Name)?\s*=\s*["'`]([^"'`<>]+)["'`]/g)) {
    for (const c of m[1].split(/\s+/)) note(c);
  }
  for (const m of src.matchAll(/classList\.(?:add|toggle)\(([^)]*)\)/g)) {
    for (const q of m[1].matchAll(/['"]([^'"]+)['"]/g)) for (const c of q[1].split(/\s+/)) note(c);
  }
  // The control builder: `part: 'x'`, `modifiers: ['x--y']`, and both via a constant.
  for (const m of src.matchAll(/\bpart:\s*(?:'([\w-]+)'|([A-Z][A-Z0-9_]*))/g)) {
    note(m[1] ?? consts.get(m[2]) ?? '');
  }
  for (const m of src.matchAll(/modifiers:\s*\[([^\]]*)\]/g)) {
    for (const q of m[1].matchAll(/'([\w-]+)'/g)) note(q[1]);
    // ``[`${BUBBLE_ACTION_CLASS}--edit-save`]`` — the modifier is built, not written out.
    for (const q of m[1].matchAll(/`\$\{([A-Z][A-Z0-9_]*)\}(--[\w-]+)`/g)) {
      const base = consts.get(q[1]);
      if (base) note(base + q[2]);
    }
    for (const q of m[1].matchAll(/`\$\{([A-Z][A-Z0-9_]*)\}--\$\{[^}]+\}`/g)) {
      // A modifier whose suffix is a variable: credit the base, and let the concrete
      // modifiers be found by whichever call site spells them out.
      const base = consts.get(q[1]);
      if (base) note(base);
    }
  }
  // The local `el(tag, 'a b')` factories in the elicitation panels.
  for (const m of src.matchAll(/\bel\(\s*['"][\w-]+['"]\s*,\s*['"`]([^'"`]+)['"`]/g)) {
    for (const c of m[1].split(/\s+/)) note(c);
  }
  // A bare constant used as a class anywhere else (`btn.className = X`).
  for (const [name, cls] of consts) {
    if (new RegExp(`(?<![\\w$])${name}(?![\\w$])`).test(src)) note(cls);
  }

  // CATCH-ALL, and it answers the question a reader actually has. The targeted passes above
  // give precise ownership, but they cannot see every construction — `aparte-conv-item` and
  // its `--archived` modifier are assembled from fragments, so they read as "you write this",
  // which is a lie about a class the conversation list renders on every row.
  //
  // The reader's question is not "which expression produced this string", it is "does core own
  // this class, or is it mine to put on my own markup". A selector READ settles that just as
  // well as a write: core would not query for a class it did not own. So any mention in core's
  // source counts, and "yours" is left meaning what it should — a class core never touches.
  for (const c of declared.keys()) {
    if (written.has(c) && written.get(c).has(file)) continue;
    if (new RegExp(`(?<![\\w-])${c}(?![\\w-])`).test(src)) note(c);
  }
  // The guard is written several ways — one line, or split over two. Match the guard.
  // Two spellings, because today's rename moved five of these behind a module constant:
  // `querySelector('.aparte-message')` and ``querySelector(`.${SEND_BUTTON_CLASS}`)``. Reading
  // only the literal form found 3 of the 8 guards and would have published a contract list
  // that quietly shrank the day the code got tidier.
    for (const m of src.matchAll(/querySelector\(\s*[`'"]\.([\w-]+)[`'"]\s*\)[^;{]{0,40}return/g)) {
    contractual.add(m[1]);
  }
  for (const m of src.matchAll(/querySelector\(\s*`\.\$\{([A-Z][A-Z0-9_]*)\}`\s*\)[^;{]{0,40}return/g)) {
    const cls = consts.get(m[1]);
    if (cls) contractual.add(cls);
  }
}

// ── 3. named elsewhere: docs, wrappers, examples — evidence a class is intended ──
const mentions = new Set();
const corpus = [
  ...walk(DOCS, ['.md', '.mdx']),
  ...walk(WRAPPERS, ['.ts', '.tsx', '.vue', '.svelte', '.html']),
  ...walk(EXAMPLES, ['.ts', '.tsx', '.vue', '.svelte', '.html']),
]
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');
for (const c of declared.keys()) {
  if (new RegExp(`(?<![\\w-])${c}(?![\\w-])`).test(corpus)) mentions.add(c);
}

// ── 4. owner: the area that writes a class, for grouping ────────────────────
const OWNER_LABEL = [
  [/^packages\/core\/src\/components\/bubble\//, 'Chat bubble', '/components/conversation/aparte-chat-bubble/'],
  [/^packages\/core\/src\/components\/viewport\//, 'Chat viewport', '/components/conversation/aparte-chat-viewport/'],
  [/^packages\/core\/src\/components\/chat\//, 'Chat', '/components/conversation/aparte-chat/'],
  [/^packages\/core\/src\/components\/status\//, 'Chat status', '/components/conversation/aparte-chat-status/'],
  [/^packages\/core\/src\/components\/conversation-list\//, 'Conversation list', '/components/conversation/aparte-conversation-list/'],
  [/^packages\/core\/src\/components\/composer\//, 'Composer', '/components/input/aparte-composer/'],
  [/^packages\/core\/src\/components\/elicitation\/|^packages\/core\/src\/elicitation\//, 'Elicitation', '/components/input/aparte-elicitation/'],
  [/^packages\/core\/src\/primitives\/select\//, 'Select', '/components/primitives/aparte-select/'],
  [/^packages\/core\/src\/primitives\/progress-spinner\//, 'Progress spinner', '/components/primitives/aparte-progress-spinner/'],
  [/^packages\/core\/src\/renderers\/segments\/artifact\//, 'Artifact renderer', '/segments/artifact/'],
  [/^packages\/core\/src\/renderers\//, 'Segment renderers', '/segments/text/'],
  [/^packages\/core\/src\/config\//, 'Configuration hooks', ''],
  [/^packages\/plugins\/model-selector\//, 'Model selector plugin', '/plugins/model-selector/'],
  [/^packages\/plugins\/ask-user\//, 'Ask-user plugin', '/plugins/ask-user/'],
];
const ownerOf = (files) => {
  for (const [re, label, href] of OWNER_LABEL) {
    if ([...files].some((f) => re.test(f))) return { label, href };
  }
  return { label: 'Core', href: '' };
};

// ── 5. the page ─────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/\|/g, '\\|');

const byOwner = new Map();
for (const [cls, files] of written) {
  const { label, href } = ownerOf(files);
  if (!byOwner.has(label)) byOwner.set(label, { href, classes: [] });
  byOwner.get(label).classes.push(cls);
}
for (const v of byOwner.values()) v.classes.sort();

const yours = [...declared.keys()].filter((c) => !written.has(c) && mentions.has(c)).sort();
const orphans = [...declared.keys()].filter((c) => !written.has(c) && !mentions.has(c)).sort();
const totalWritten = [...written.keys()].length;

let md = `---
title: CSS classes
description: Every class aparté writes, who writes it, and which ones you can supply yourself.
sidebar:
  order: 3
---

<!-- AUTO-GENERATED by apps/docs/scripts/gen-css-classes.mjs — do not edit by hand. -->

Core renders into the **light DOM**: no shadow root, no \`::part()\`. Every class below is
already reachable from your own stylesheet — this page exists so you do not have to read the
source to find out which. **${declared.size}** classes carry rules; core writes **${totalWritten}**
of them itself.

For the values behind them see the [CSS variables reference](/reference/css-variables/); prefer
a variable when one exists, because a class is structure and a variable is intent.

## The naming rule

**For an element \`<aparte-X>\`, its internal parts are \`.aparte-X__part\`.** Derivable from the
tag, so there is nothing to look up when you theme one and nothing to invent when you build one.
Modifiers follow BEM too — \`.aparte-chat-bubble__action--copy\`.

Two names sit outside that rule on purpose:

- \`.aparte-control\` — the shared icon-button look, worn by every borderless icon button core
  renders. Put it on your own button and it matches; it carries the size, the hover tint and the
  coarse-pointer hit area. This is the answer to "which class goes on my button".
- \`language-*\` on a code block — unprefixed because that is the name highlighters look for.

A conventional abbreviation is fine in a variable name (\`btn\`, \`nav\`); an initialism only its
author can expand is not, which is why \`.aparte-cs-button\` became
\`.aparte-composer-send__button\`.

## Classes core writes

A **contract** row means core checks for that class on connect and skips its own render if it
finds it — supply that child yourself and you own it completely, including the wiring core would
have done.
`;

for (const [label, { href, classes }] of [...byOwner.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  md += `\n### ${href ? `[${label}](${href})` : label}\n\n| Class | Stylesheet | |\n| --- | --- | --- |\n`;
  for (const c of classes) {
    const files = [...(declared.get(c) ?? [])].map((f) => f.replace(/^packages\/(core\/src|plugins)\//, '')).join(', ');
    md += `| \`.${esc(c)}\` | ${esc(files)} | ${contractual.has(c) ? '**contract**' : ''} |\n`;
  }
}

md += `\n## Classes you write yourself\n\nCore styles these but never emits them: they are layout helpers for markup you compose. Each is
named in a guide, an example or a wrapper.\n\n`;
md += yours.length
  ? `| Class | Stylesheet |\n| --- | --- |\n${yours
      .map((c) => `| \`.${esc(c)}\` | ${esc([...(declared.get(c) ?? [])].map((f) => f.replace(/^packages\/(core\/src|plugins)\//, '')).join(', '))} |\n`)
      .join('')}`
  : '_None._\n';

md += `\n## Styled, written by nobody, named nowhere\n\nThese carry rules but no code in this repo emits them and no page mentions them. Not a
graveyard and not a promise — a list a human has to rule on: keep as a documented helper you
intend consumers to use, or delete. It is here rather than silent so the decision gets made.\n\n`;
md += orphans.length
  ? orphans.map((c) => `- \`.${esc(c)}\` — ${esc([...(declared.get(c) ?? [])].map((f) => f.replace(/^packages\/(core\/src|plugins)\//, '')).join(', '))}\n`).join('')
  : '_None._\n';

const wrote = writeIfChanged(OUT, md);
console.log(
  `[gen-css-classes] ${wroteOrNot(wrote)} ${declared.size} classes → ${OUT} `
    + `(${totalWritten} written by core across ${byOwner.size} areas, ${contractual.size} contractual, `
    + `${yours.length} yours, ${orphans.length} unattributed)`,
);
