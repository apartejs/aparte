/**
 * Self-hosted Umami — the two values every page needs, in one place.
 *
 * The site has TWO heads: `/` is a standalone Astro page carrying its own
 * (src/pages/index.astro), and every other page takes Starlight's, overridden in
 * src/components/Head.astro. A tag written into one of them measures half the site,
 * so both import from here.
 *
 * No env var. Both values ship in the HTML of every page and are read by anyone who
 * views source, so hiding them behind the build buys nothing and adds one more way
 * for a deploy to go quiet.
 *
 * The host below is named a SECOND time, in `nginx.docs.conf`: the CSP there allows
 * no external origin, so the browser refuses this script unless the host appears in
 * both `script-src` and `connect-src` (the beacon POSTs to /api/send). Moving the
 * instance means editing both files, and the symptom of editing only this one is
 * silent — it shows in the visitor's console and nowhere else.
 */
export const UMAMI_SRC = 'https://analytics.paulrichez.fr/script.js';

/** The `apartejs.dev` website in Umami. Public: it ships in the page. */
export const UMAMI_WEBSITE_ID = 'd95776e4-9093-4a26-9a27-4dbc4ecf0bc1';
