/**
 * The card filename for a docs page, from its content id.
 *
 * Shared on purpose between the route that GENERATES the cards
 * (`src/pages/og/[...slug].ts`) and the head that LINKS them
 * (`src/components/Head.astro`). Two copies of this rule would disagree on the first odd
 * id — and the failure would be an `og:image` pointing at a 404, i.e. a card that looks
 * declared and renders blank, which is the exact failure this whole feature fixes.
 *
 * `astro-og-canvas` collapses `foo/index.png` to `foo.png` itself, so a directory index
 * needs no special case here beyond the site root, whose id is the empty string.
 */
export const ogSlug = (id: string): string => (id === '' ? 'index' : id);
