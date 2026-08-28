/**
 * Generates `reference/icons.md` from `packages/core/src/icons/*.ts`.
 *
 * GENERATED, because an icon page is the one page that cannot be written by hand and
 * stay true: it has to show the glyph, and a glyph copied into prose is a second copy
 * of a drawing — which is the exact failure this icon set was built to end (there were
 * three ✕ in this library before it existed).
 *
 * The page shows each glyph AT its export name, so a reader picks by eye and copies a
 * name that is guaranteed to resolve.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { referenceOrder } from './reference-order.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CORE = resolve(here, '../../../packages/core/src/icons');
const OUT = resolve(here, '../src/content/docs/reference/icons.md');

/** A floor, not decoration: a corpus that silently shrinks is the failure worth catching. */
const BASE_FLOOR = 20;
const EXTENDED_FLOOR = 30;

/** @returns {Array<{name, doc, svg, aliasOf}>} */
function read(file) {
    const src = readFileSync(resolve(CORE, file), 'utf8');
    const out = [];
    // The doc block spans lines — an alias carries a paragraph explaining itself, and a
    // single-line matcher silently dropped it. That is the failure this page is about:
    // a set that looks complete because what it missed left no trace.
    // `(?:[^*]|\*(?!\/))*` cannot cross a `*/`, which a lazy `[\s\S]*?` could and did:
    // it swallowed the file's own module block and printed it as the first glyph's
    // meaning. A doc comment must be THE one immediately above the export.
    const re = /\/\*\*((?:[^*]|\*(?!\/))*)\*\/\s*\nexport const (\w+)Icon = (?:`(<svg[\s\S]*?<\/svg>)`|(\w+Icon));/g;
    for (const m of src.matchAll(re)) {
        const doc = m[1]
            .split('\n')
            .map((l) => l.replace(/^\s*\*?\s?/, '').trim())
            .join(' ')
            .trim();
        out.push({ name: m[2], doc, svg: m[3] ?? null, aliasOf: m[4] ?? null });
    }
    // Assert we read ALL of them, not merely enough: a floor catches a corpus that
    // collapses, this catches one glyph quietly falling out of the page.
    const declared = (src.match(/^export const \w+Icon = /gm) ?? []).length;
    if (out.length !== declared) {
        throw new Error(
            `[gen-icons] ${file} declares ${declared} glyphs but the matcher read ${out.length}. ` +
                `One of them is shaped differently than the rest — fix the source or the matcher, ` +
                `but do not publish a set that is missing a glyph without saying so.`,
        );
    }
    return out;
}

const base = read('glyphs.ts');
const extended = read('extended.ts');
if (base.length < BASE_FLOOR || extended.length < EXTENDED_FLOOR) {
    throw new Error(
        `[gen-icons] read ${base.length} base and ${extended.length} extended glyphs, ` +
            `floors are ${BASE_FLOOR}/${EXTENDED_FLOOR}. The matcher broke or the files moved — ` +
            `either way this page would ship a fraction of the set with nothing to say so.`,
    );
}

/** Resolve an alias to the drawing it points at, so every cell can show one. */
const byName = new Map([...base, ...extended].map((g) => [g.name, g]));
const drawingOf = (g) => (g.svg ? g.svg : byName.get(g.aliasOf?.replace(/Icon$/, ''))?.svg);

/** For the page only: a fixed size, since the docs site does not load core's stylesheet. */
const shown = (svg) => svg.replace('<svg ', '<svg width="22" height="22" style="vertical-align:middle" ');

const grid = (list) =>
    [
        '<div style="display:flex;flex-wrap:wrap;gap:0.75rem">',
        ...list.map((g) => {
            const d = drawingOf(g);
            return (
                '<figure style="width:7.5rem;margin:0;text-align:center">' +
                `<div style="height:2rem;display:flex;align-items:center;justify-content:center">${shown(d)}</div>` +
                `<figcaption style="font-size:0.72rem;word-break:break-all"><code>${g.name}Icon</code></figcaption>` +
                '</figure>'
            );
        }),
        '</div>',
    ].join('\n');

const table = (list) =>
    [
        '| | Export | Provider key | Meaning |',
        '| --- | --- | --- | --- |',
        ...list.map((g) => `| ${shown(drawingOf(g))} | \`${g.name}Icon\` | \`${g.name}\` | ${g.doc} |`),
    ].join('\n');

const page = `---
title: Icons
description: Every glyph aparté draws, plus an extended set behind its own entry point.
sidebar:
  order: ${referenceOrder("icons.md")}
---

<!-- AUTO-GENERATED from packages/core/src/icons/*.ts by apps/docs/scripts/gen-icons.mjs — do not edit by hand. Run \`pnpm --filter @aparte-workspace/docs gen:icons\` to refresh. -->

Every glyph is a **string of SVG**. No runtime, no component, no framework — assign it
and you are done.

\`\`\`ts
import { searchIcon } from '@aparte/core/icons';

const button = document.createElement('button');
button.innerHTML = searchIcon;
\`\`\`

Each one carries \`class="aparte-icon"\`, so \`--aparte-icon-size\` sizes it wherever it
lands. Set that variable on any ancestor and every glyph below follows:

\`\`\`css
.my-toolbar { --aparte-icon-size: 18px; }
\`\`\`

## The built-in set — ${base.length} glyphs

These are the ones aparté draws itself, so each is also a **provider key**: give
\`setIconProvider\` a function under that name and yours is used instead.

\`\`\`ts
import { aparteGlobalConfig } from '@aparte/core';
import { historyIcon } from '@aparte/core/icons';

aparteGlobalConfig.setIconProvider({ retry: () => historyIcon });
\`\`\`

${table(base)}

## The extended set — ${extended.length} glyphs

Glyphs aparté never draws, for the toolbar, drawer or settings panel around your chat.

**They live behind their own entry point on purpose.** The built-in set above is read by
a computed key, so a bundler has to keep all of it; anything added there would ship to
every consumer, used or not. These are individual exports instead — import three, pay
for three, and pay nothing at all if you never open the module.

${grid(extended)}

## Bringing your own

Nothing here is required. An icon provider takes any HTML string, so a font-icon set or
another library works just as well:

\`\`\`ts
import { aparteGlobalConfig } from '@aparte/core';

aparteGlobalConfig.setIconProvider({
    copy: () => '<i class="fas fa-copy"></i>',
    check: () => '✓',
});
\`\`\`

Every key is optional — anything you leave out falls back to the built-in drawing.

The shapes are drawn on the grid most icon sets share (24×24, \`currentColor\`, round
caps, a 2-unit stroke), and the names are the plain words for what each one shows —
so swapping in a set of your own changes the import and nothing else. Nothing is
imported from anywhere: \`@aparte/core\` has zero third-party dependencies, and the
drawings are its own.
`;

const changed = !existsSync(OUT) || readFileSync(OUT, 'utf8') !== page;
writeFileSync(OUT, page);
console.log(
    `[gen-icons] ${changed ? 'wrote' : 'unchanged'} ${base.length} built-in + ${extended.length} extended → ${OUT}`,
);
