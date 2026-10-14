/**
 * Old URL → new URL, for every page that moved.
 *
 * Each entry builds a small page at the old address (src/pages/[...moved].astro) that sends the
 * reader on, KEEPING the `#anchor`: published links carry anchors (an npm README points at
 * `/models/titler/#demo`, JSDoc shipped in .d.ts files at `/guides/tools/#custom-tool-renderer`),
 * and a plain meta refresh drops them. The meta refresh stays as the fallback without script.
 *
 * Internal links never point at an old address: they are rewritten to the new one, because a
 * link with an anchor into a redirect page cannot resolve (check-doc-links reads built pages).
 * This map is for the outside world.
 *
 * Every URL the site ever published is listed in `legacy-urls.json`;
 * `scripts/check-legacy-urls.mjs` fails when one of them leads nowhere.
 *
 * Keys and values are absolute paths with a trailing slash.
 *
 * @type {Record<string, string>}
 */
export const REDIRECTS = {
    // The first release notes page; /changelog/ is the guessable URL that replaced it.
    '/reference/release-notes/': '/changelog/',
    // One 752-line page listing every element became one page per component.
    '/reference/api/': '/components/',
};
