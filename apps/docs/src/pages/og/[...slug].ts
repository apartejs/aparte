/*
 * One Open Graph card per docs page, generated at build time.
 *
 * Why generated rather than one static image: a card is only useful when it says which
 * page was shared. A site-wide picture makes every link look identical — present, and
 * telling you nothing, which is the same failure as a name with no example. This reads the
 * title and description Starlight already requires in every page's frontmatter, so a new
 * page gets a correct card with no extra step and none to forget.
 *
 * Colours are the validated identity (`src/styles/palette.css`): brass on a dark stage.
 * Written as literals because this runs in Node at build time — no DOM, no custom
 * properties to resolve.
 */
import { getCollection } from 'astro:content';
import { TEMPLATES } from '../../templates/registry';
import { OGImageRoute } from 'astro-og-canvas';
import { ogSlug } from '../../lib/og-slug';

import { LANDING_CARD_TITLE, LANDING_CARD_BODY } from '../../data/landing-meta';

const docs = await getCollection('docs');

/** `{ 'guides/getting-started': { title, description } }`, keyed as the card filename. */
const pages = Object.fromEntries([
    // The landing is an Astro page, not a docs entry, so it is not in the collection —
    // and it is the URL people actually share. Named here rather than left out.
    // The landing's title and description live in ONE place now
    // (src/data/landing-meta.ts) and are imported by both this file and
    // index.astro. They were two hand-kept copies before, and they drifted twice
    // in one afternoon — the second time silently, because this string is baked
    // into the PNG as pixels, so the shared card said less than the meta tags
    // next to it. The title is the CLAIM rather than the wordmark: the logo in the
    // corner already carries the name, so spending 62px of type on it again left
    // the card's largest slot saying nothing.
    ['index', { title: LANDING_CARD_TITLE, description: LANDING_CARD_BODY }],
    // Same reason as the line above, for the same class of page: /roadmap/ is an Astro
    // page on the shared frame, not a docs entry, so the collection below cannot see it.
    // Its og:image:alt (ROADMAP_IMAGE_ALT, in roadmap.astro) is written FROM this entry,
    // because astro-og-canvas bakes these two strings into the PNG as pixels — change
    // one and change the other.
    ['roadmap', { title: 'One road, no dates', description: 'What npm serves, where the current branch stands, and the conditions the beta and 1.0 each have to meet.' }],
    // /models/ and each model's page are Astro pages on the same frame. Their
    // og:image:alt strings (in each page) are written FROM these entries.
    ['models', { title: 'Small models, one task each', description: 'The models aparté publishes: built for one job in a chat, light enough to run in the browser, with no API call.' }],
    ['models/titler', { title: 'A title for every conversation, as you type', description: 'aparte-titler picks 3 to 6 words out of the first message. 133 KB for 17 languages, a few milliseconds per title, nothing leaves the page.' }],
    ['models/privacy', { title: 'Personal data, masked before it is sent', description: 'aparte-privacy finds names, addresses, emails, phone numbers and account numbers in a message. 201 KB, a few milliseconds, nothing leaves the page.' }],
    ['models/secrets', { title: 'A password in a message, caught before it is sent', description: 'aparte-secrets reads the context around a value, so it finds the passwords and keys a pattern scanner misses. 200 KB, nothing leaves the page.' }],
    // /templates/ and each template's page are Astro pages too; a template's card is read from
    // its own meta.ts, so a template that joins the grid gets its card with nothing to add here.
    ['templates', { title: 'Templates', description: 'Whole apps built with aparté, running live. Open one, use it, copy its code.' }],
    ...TEMPLATES.map((t) => [`templates/${t.slug}`, { title: t.title, description: t.description }]),
    ...docs.map(({ id, data }) => [ogSlug(id), { title: data.title, description: data.description }]),
]);

// `OGImageRoute` is async in 0.13, and it derives the route param from this file's name.
export const { getStaticPaths, GET } = await OGImageRoute({
    pages,
    getImageOptions: (_path, page: { title: string; description?: string }) => ({
        title: page.title,
        description: page.description ?? '',
        logo: { path: './public/apple-touch-icon.png', size: [72] },
        bgGradient: [
            [23, 20, 28],   // --brand-ground
            [33, 27, 40],   // --brand-surface
        ],
        // A single brass edge rather than a frame: the identity is a spotlight, not a box.
        border: { color: [217, 162, 75], width: 12, side: 'inline-start' },
        padding: 72,
        font: {
            title: { size: 62, color: [242, 238, 231] },                    // --brand-text
            description: { size: 30, lineHeight: 1.4, color: [168, 155, 182] }, // --brand-dim
        },
    }),
});
