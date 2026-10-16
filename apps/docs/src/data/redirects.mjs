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
 */

/** Moves made by hand. @type {Record<string, string>} */
export const MOVED = {
    // The first release notes page; /changelog/ is the guessable URL that replaced it.
    '/reference/release-notes/': '/changelog/',
    // One 752-line page listing every element became one page per component.
    '/reference/api/': '/components/',
    // The hand-written core API page became the generated core API reference, one page per area.
    '/reference/config/': '/reference/core/config/',
    // The three Markdown and code plugins became one guide.
    '/plugins/marked/': '/guides/markdown/',
    '/plugins/streaming-markdown/': '/guides/markdown/',
    '/plugins/shiki/': '/guides/markdown/',
    // The app-shell guide folded into Layouts (its last section, the whole page).
    '/guides/app-shell/': '/guides/layout/',
    // The compaction and titler plugin pages became the guides of what they do.
    '/plugins/compaction/': '/guides/long-conversations/',
    '/plugins/titler/': '/guides/titles/',
};

/**
 * Moves made by the catalogue: a published element, segment, kit or plugin page whose subject a
 * catalogue page now claims goes to that page. Derived, never written, so a claim cannot forget
 * its redirect. Pure — the pages are passed in, because the two callers read them differently
 * (Node from the files, the redirect route from Astro's collection).
 *
 * @param {{ slug: string, claims: { elements?: string[], segments?: string[], classes?: string[], plugin?: string } }[]} pages
 * @param {string[]} urls every URL the site ever published (legacy-urls.json)
 * @returns {Record<string, string>}
 */
export function catalogueRedirects(pages, urls) {
    const claimant = (test) => pages.find((p) => test(p.claims));
    /** @type {Record<string, string>} */
    const out = {};
    for (const url of urls) {
        let m;
        let page;
        if ((m = /^\/components\/[a-z]+\/(aparte-[a-z-]+)\/$/.exec(url))) {
            page = claimant((c) => c.elements?.includes(m[1]));
        } else if ((m = /^\/segments\/([a-z-]+)\/$/.exec(url))) {
            page = claimant((c) => c.segments?.includes(m[1].replace(/-/g, '_')));
        } else if ((m = /^\/kit\/([a-z-]+)\/$/.exec(url))) {
            page = claimant((c) => c.classes?.includes(m[1]));
        } else if ((m = /^\/plugins\/([a-z-]+)\/$/.exec(url))) {
            page = claimant((c) => c.plugin === `@aparte/plugin-${m[1]}`);
        }
        if (page) out[url] = `/components/${page.slug}/`;
    }
    return out;
}
