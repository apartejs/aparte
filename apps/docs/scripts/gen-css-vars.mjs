/*
 * Generates the "CSS variables" reference page from the single source of truth,
 * packages/core/src/styles/aparte.css. Runs before `astro dev` / `astro build`
 * (see package.json), so the reference can never drift from the stylesheet —
 * add a token to aparte.css and it shows up here automatically.
 *
 * Output (git-ignored, always regenerated):
 *   src/content/docs/reference/css-variables.md
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
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

const esc = (s) => s.replace(/\|/g, '\\|');

let md = `---
title: CSS variables
description: The complete, generated reference of every --aparte-* theme variable.
---

<!-- AUTO-GENERATED from packages/core/src/styles/aparte.css by apps/docs/scripts/gen-css-vars.mjs — do not edit by hand. Run \`pnpm --filter @aparte-workspace/docs gen:css-vars\` to refresh. -->

Every \`--aparte-*\` theme variable, straight from the stylesheet — **${total}** in
total. Override any of them as shown in [Theming](/guides/theming). This page is
generated from the source, so it can never drift from the code.
`;

for (const g of groups) {
  if (!g.tokens.length) continue;
  md += `\n## ${g.title}\n\n| Variable | Default | Notes |\n| --- | --- | --- |\n`;
  for (const t of g.tokens) {
    md += `| \`${esc(t.name)}\` | \`${esc(t.value)}\` | ${esc(t.note)} |\n`;
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, md, 'utf8');
console.log(`[gen-css-vars] wrote ${total} variables → ${OUT}`);
