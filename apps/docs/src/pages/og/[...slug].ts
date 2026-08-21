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
import { OGImageRoute } from 'astro-og-canvas';
import { ogSlug } from '../../lib/og-slug';

const docs = await getCollection('docs');

/** `{ 'guides/getting-started': { title, description } }`, keyed as the card filename. */
const pages = Object.fromEntries([
    // The landing is an Astro page, not a docs entry, so it is not in the collection —
    // and it is the URL people actually share. Named here rather than left out.
    ['index', {
        title: 'aparté',
        description: 'A framework-agnostic AI-chat library — vanilla web components, zero '
            + 'runtime dependencies.',
    }],
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
