/*
 * Generates the "CSS classes" reference from the stylesheets themselves.
 *
 * WHY THIS PAGE EXISTS. "Restyle everything" is the library's headline, and the layer that
 * delivers it — ready-made classes for a button, a field, a tag, an icon, an alert, a card
 * — was named on no page at all. Measured before writing a line: 316 classes across the 37
 * sheets, 32 of them appearing anywhere under `apps/docs`, and of the six recipe families
 * exactly four classes were mentioned as classes rather than as a substring of a variable
 * name. A reader could learn that `--aparte-kbd-bg` exists and never learn `.aparte-kbd`
 * did.
 *
 * WHY GENERATED. The prose already exists, in the sheets, next to the rules it describes —
 * each family's header explains what it is for and several carry an example. That is the
 * repo's rule applied where it had not been: what is enumerable is generated, what is
 * explanatory is prose, and the prose lives where its author is already writing.
 *
 * Hand-writing it would have made a second copy of every explanation, one file away from
 * the CSS, and the sheets have already proved they cannot survive that: splitting
 * `aparte.css` left ten families holding the NEXT one's header, and nobody noticed for a
 * release, because nothing read them.
 *
 * WHAT IS NOT HERE. Classes core writes for its own components — the bubble, the composer,
 * the segments — are listed but not explained: their explanation is the element's page,
 * where the JSDoc already is. This page is about what YOU can wear.
 *
 * Output (git-ignored, always regenerated):
 *   src/content/docs/reference/classes.mdx
 *   src/generated/class-previews.ts
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { writeIfChanged, wroteOrNot } from './write-if-changed.mjs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coreStylesheets } from '../../../scripts/core-stylesheets.mjs';
import { mdxSafe } from './mdx-safe.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../src/content/docs/reference/classes.mdx');
const GENERATED = resolve(here, '../src/generated');
const SEP = String.fromCharCode(92);

/**
 * A floor, not decoration. This page's whole value is that it is complete; a matcher that
 * stops matching would publish a shorter guarantee with nothing to say so.
 */
const CLASS_FLOOR = 250;

/**
 * The three groups, and the rule that puts a sheet in one.
 *
 * Not derived from the directory, deliberately: `button.css` and `field.css` sit at the
 * top level beside `theme.css`, which is a token file and belongs in neither. The path
 * decides membership, this decides meaning.
 */
const GROUPS = [
    {
        id: 'controls',
        title: 'Controls',
        lead: 'Things a person operates. Each is one base class plus modifiers that compose — an intent says what the control means, a fill says how loudly to say it, and the two axes do not know about each other.',
        match: (rel) => rel === 'styles/button.css' || rel === 'styles/field.css',
    },
    {
        id: 'display',
        title: 'Display',
        lead: '',
        introFrom: 'display/badge.css',
        match: (rel) => rel.startsWith('display/'),
    },
    {
        id: 'surfaces',
        title: 'Surfaces',
        lead: '',
        introFrom: 'surface/tabs.css',
        match: (rel) => rel.startsWith('surface/'),
    },
];

/** A block comment, normalised: no `/*`, no `*`, no rule lines, no common indent. */
function normalise(body) {
    const raw = body
        .split('\n')
        .map((line) => line.replace(/^\s*\*\s?/, ''))
        .filter((line) => !/^[\s=]+$/.test(line) || line.trim() === '');
    const indents = raw.filter((l) => l.trim()).map((l) => (l.match(/^ */) ?? [''])[0].length);
    const base = indents.length ? Math.min(...indents) : 0;
    return raw.map((line) => line.slice(base));
}

/**
 * A FAMILY is a banner, not a file.
 *
 * Reading one header per sheet was wrong on the file that proves the rule: `badge.css`
 * opens with the whole Display group's introduction — including an example that shows a
 * badge, a progress bar and an alert together — and carries its own
 * `aparte-badge — small count or status pill` banner further down. One header per file
 * would publish the group's intro under the heading "Badge" and lose the badge's own.
 *
 * So every block comment is read, and its first line says what it is: `aparté — …` opens a
 * group, `aparte-x — …` opens the family `x`. Both conventions were already in the sheets;
 * neither was added for this.
 */
function bannersIn(src) {
    const out = [];
    for (const match of src.matchAll(/\/\*([\s\S]*?)\*\//g)) {
        const lines = normalise(match[1]);
        const headline = lines.find((l) => l.trim()) ?? '';
        const named = headline.match(/^aparte-([a-z0-9-]+)\s*[—-]/);
        const isLead = /^aparté[\s—]/.test(headline);
        if (!named && !isLead) continue;
        out.push({ ...split(lines), kind: isLead ? 'lead' : 'family' });
    }
    return out;
}

/**
 * Prose and example, split apart.
 *
 * An indented line carrying a tag is markup the author wrote to be read as markup — it is
 * how every one of these headers already shows its usage. Everything else is prose.
 */
function split(lines) {
    const prose = [];
    const example = [];
    let inExample = false;
    for (const line of lines) {
        const indented = /^\s{2,}\S/.test(line);
        /*
         * An indented line OPENS an example when it carries a tag, and every indented line
         * after it CONTINUES that example until the indentation stops. Requiring a tag on
         * every line dropped the closing `</div>`s — `<[a-z]` does not match `</` — so the
         * Display group's example reached the page as unclosed markup, and the browser
         * nested the alert inside the progress bar, where it rendered four pixels tall.
         */
        if (indented && (inExample || /<[a-z]/i.test(line))) {
            inExample = true;
            example.push(line.replace(/^\s{2,4}/, ''));
            continue;
        }
        if (!line.trim()) inExample = false;
        if (!example.length || line.trim()) prose.push(line);
    }
    /*
     * The headline is its own paragraph. A banner writes it on the first line and the
     * explanation on the second, with no blank line between — which is one paragraph in
     * Markdown, so "aparte-avatar — sizes, shape, image + initials fallback" ran straight
     * into the sentence after it.
     */
    const text = prose.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const [headline, ...rest] = text.split('\n');
    const body = rest.join('\n');
    return {
        prose: body.trim() && !body.startsWith('\n') ? `${headline}\n\n${body.trim()}` : text,
        example: example.join('\n').trim(),
    };
}

/*
 * ONE FAMILY PER SHEET, which is what the split achieved and therefore the only grouping
 * that needs no inference. Two earlier attempts tried to derive families from banner
 * positions and both produced a page that was wrong in a different place: the first read
 * one header per file and published the Display group's intro under the heading "Badge";
 * the second read every `aparté — …` as a group intro and dropped Button, Field, Icon and
 * Thumbnail off the page. The files are one family each; the generator says so.
 *
 * A sheet's prose is its own `aparte-x — …` banner when it has one, and its leading
 * `aparté — …` header otherwise. `badge.css` is the sheet that needs both: its leading
 * header introduces the whole Display group and its inner banner describes the badge.
 */
const sheets = coreStylesheets().map((path) => {
    const src = readFileSync(path, 'utf8');
    const rel = path.split(SEP).slice(-2).join('/');
    const banners = bannersIn(src);
    const own = banners.find((b) => b.kind === 'family') ?? banners.find((b) => b.kind === 'lead');
    return {
        rel,
        id: rel.split('/').pop().replace(/\.css$/, ''),
        lead: banners.find((b) => b.kind === 'lead') ?? null,
        prose: own?.prose ?? '',
        example: own?.example ?? '',
        classes: [...new Set([...src.matchAll(/\.(aparte-[a-zA-Z0-9_-]+)/g)].map((m) => m[1]))].sort(),
        documented: Boolean(own),
    };
});

const total = new Set(sheets.flatMap((s) => s.classes)).size;
if (total < CLASS_FLOOR) {
    console.error(
        `[gen-css-classes] only ${total} classes found across ${sheets.length} sheet(s), floor is ${CLASS_FLOOR}. ` +
            'The matcher broke or the corpus moved — either way this page would publish a fraction of the surface.',
    );
    process.exit(1);
}

/** `aparte-tag` → `Tag`. The family IS its base class; no map to keep. */
/** One alias, because `btn` is the only class whose name is not the word. */
const ALIASES = { btn: 'Button' };
const familyName = (id) => ALIASES[id] ??
    id
        .replace(/^aparte-/, '')
        .replace(/(^|-)([a-z])/g, (_m, sep, c) => (sep ? ' ' : '') + c.toUpperCase());

const previews = [];
let md = `---
title: CSS classes
description: Every ready-made class aparté ships — buttons, fields, tags, icons, alerts and the rest — generated from the stylesheets that define them.
sidebar:
  order: 4
---

import ClassPreview from '../../../components/ClassPreview.astro';

Core is **light DOM**: it writes ordinary classes onto ordinary elements, and so can you.
The classes below are the ones aparté styles for its own use *and leaves available* — put
\`aparte-btn\` on a button of yours and it looks like the send button, with no component to
mount and no framework involved.

Your own class stays on the element for events and for targeting. It just stops carrying
the look.

Everything here is themed by the [CSS variables](/reference/css-variables/); the recipes
read those tokens, so a rebrand reaches your buttons and aparté's at the same time.
`;

for (const group of GROUPS) {
    const members = sheets.filter((s) => group.match(s.rel) && s.classes.length);
    if (!members.length) continue;

    /*
     * A group's intro is a family's header when that header describes the whole group
     * rather than one family — which is what `display/badge.css` and `surface/tabs.css`
     * carry, because the original single stylesheet had one banner per SECTION and the
     * split handed it to whichever family came first. Using it here is not a workaround:
     * it is the intro, written by the author, in the file the split happened to leave it.
     *
     * Told apart by a convention the sheets already follow rather than a marker added for
     * this: `aparté — …` opens a group, `aparte-tag — …` opens one family. Matching
     * loosely on "apart" picked the avatar's header as the Display intro and then
     * suppressed the avatar's own description as a duplicate of it.
     */
    const intro = group.introFrom ? members.find((m) => m.rel === group.introFrom)?.lead : null;
    md += `\n## ${group.title}\n\n${mdxSafe(group.lead || intro?.prose || '')}\n`;
    if (intro?.example) {
        previews.push({ slug: `${group.id}-overview`, name: group.title, markup: intro.example });
        md += `\n<ClassPreview slug="${group.id}-overview" />\n\n\`\`\`html\n${intro.example}\n\`\`\`\n`;
    }

    for (const family of members) {
        md += `\n### ${familyName(family.id)}\n\n`;
        // The group's own intro is not repeated as a family description.
        const prose = family.prose === intro?.prose ? '' : family.prose;
        if (prose) md += `${mdxSafe(prose)}\n\n`;
        if (family.example && family.example !== intro?.example) {
            previews.push({ slug: family.id, name: familyName(family.id), markup: family.example });
            md += `<ClassPreview slug="${family.id}" />\n\n`;
            md += `\`\`\`html\n${family.example}\n\`\`\`\n\n`;
        }
        md += `${family.classes.map((c) => `\`.${c}\``).join(' · ')}\n`;
    }

    /*
     * A family with no header of its own has nothing to say for itself, and this page would
     * publish its class list under a bare heading. Naming them is the point: the layer's
     * promise is that a reader can wear any of it, and a class with no explanation is one
     * they cannot use with any confidence.
     */
    const bare = members.filter((m) => !m.documented).map((m) => m.rel);
    if (bare.length) {
        md += `\n:::caution[Undocumented]\nThese sheets carry no header, so the families above list their classes without saying what they are for: ${bare
            .map((rel) => `\`${rel}\``)
            .join(', ')}. Their explanation belongs in the stylesheet, beside the rules.\n:::\n`;
    }
}

/*
 * The rest, listed and not explained. A class core writes for its own bubble is documented
 * by that element's page, and repeating it here would create the second copy this file
 * exists to avoid. What the reader needs from this section is only: it exists, core writes
 * it, and here is where its rules live.
 */
const own = sheets.filter((s) => !GROUPS.some((g) => g.match(s.rel)) && s.classes.length);
md += `
## What core writes for itself

These are on the elements aparté renders. They are listed so that nothing it emits is a
surprise in your inspector, and so a theme can target one — but what each region *is* is
explained on its element's page, not here.

| Sheet | Classes |
| --- | --- |
`;
for (const sheet of own) {
    md += `| \`${sheet.rel}\` | ${sheet.classes.map((c) => `\`.${c}\``).join(' ')} |\n`;
}

md += `
{/* Generated from packages/core/src/styles/ by apps/docs/scripts/gen-css-classes.mjs — edit the stylesheet's header comment, not this file. */}
`;

mkdirSync(dirname(OUT), { recursive: true });
mkdirSync(GENERATED, { recursive: true });
writeIfChanged(
    join(GENERATED, 'class-previews.ts'),
    `/* Generated from packages/core/src/styles/ by apps/docs/scripts/gen-css-classes.mjs\n` +
        ` — edit the stylesheet's header comment, not this file. */\n\n` +
        `export interface ClassPreview {\n` +
        `    /** The sheet's slug, which is also the route segment. */\n` +
        `    slug: string;\n` +
        `    /** The family's human name, for the document title. */\n` +
        `    name: string;\n` +
        `    /** The example from the sheet's own header, verbatim. */\n` +
        `    markup: string;\n` +
        `}\n\n` +
        `export const CLASS_PREVIEWS: ClassPreview[] = ${JSON.stringify(previews, null, 4)};\n`,
);
const wrote = writeIfChanged(OUT, md);
console.log(
    `[gen-css-classes] ${wroteOrNot(wrote)} ${total} classes across ${sheets.length} sheets ` +
        `(${previews.length} with a live example) → ${OUT}`,
);
