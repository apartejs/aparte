import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { unified } from '@astrojs/markdown-remark';
import starlightChangelogs, { makeChangelogsSidebarLinks } from 'starlight-changelogs';

// Dev only: read @aparte/core from source (see the `vite` block below). Production
// builds keep consuming the published `dist`, so deploys are unchanged.
const isDev = process.env.npm_lifecycle_event === 'dev';

/**
 * External links leave the site, so they open in their own tab.
 *
 * There are 250 of them across the guides and the changelog (243 to github.com
 * alone) and they are written as ordinary markdown, so none carried `target` or
 * `rel`. Fixing them one by one is 250 edits and a rule nobody will remember on
 * the 251st; this is one place.
 *
 * Hand-rolled rather than `rehype-external-links` + `unist-util-visit`: it is a
 * dozen lines over a tree we already have in memory, and it keeps a dependency
 * out of the docs app for something this small.
 *
 * `rel` is `noopener` and deliberately NOT `noreferrer` — the opener reference is
 * the security concern, while the Referer header is how GitHub and npm attribute
 * their traffic back to this site.
 */
const SITE_HOST = 'apartejs.dev';
function rehypeExternalLinksInOwnTab() {
    return (tree) => {
        const walk = (node) => {
            if (node.type === 'element' && node.tagName === 'a') {
                const href = node.properties?.href;
                if (typeof href === 'string' && /^https?:\/\//i.test(href) && !href.includes(SITE_HOST)) {
                    node.properties.target = '_blank';
                    node.properties.rel = ['noopener'];
                }
            }
            for (const child of node.children ?? []) walk(child);
        };
        walk(tree);
    };
}

// https://astro.build/config
export default defineConfig({
  // Astro 7 deprecated `markdown.remarkPlugins` / `rehypePlugins` / `remarkRehype` in
  // favour of naming the processor: the pipeline is now an object you build, not a set of
  // loose keys Astro assembles. Warned only at build time, not by `astro check`.
  markdown: { processor: unified({ rehypePlugins: [rehypeExternalLinksInOwnTab] }) },
  // The canonical site URL — enables the sitemap + correct canonical/OG links.
  // Change this one string if the docs move to another domain.
  site: 'https://apartejs.dev',
  // /changelog is the guessable URL; the first release of this page used
  // /reference/release-notes/, which is already in the sitemap. Keep it alive.
  redirects: { '/reference/release-notes': '/changelog/' },
  integrations: [
    starlight({
      title: 'aparté',
      description: 'Framework-agnostic AI-chat library — vanilla web components, zero dependencies.',
      // The mascot: `( '.' )` — the wordmark's brass parentheses, with a face.
      // SVG for browsers; the raster set below is for search engines and older
      // clients (both generated from the SVG by scripts/gen-favicon.mjs).
      favicon: '/favicon.svg',
      head: [
        { tag: 'link', attrs: { rel: 'icon', href: '/favicon.ico', sizes: '48x48 32x32 16x16' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' } },
      ],
      // Renders the release notes as a paginated version LIST at /changelog/ plus one
      // page per version at /changelog/version/<v>/. The 14 versions used to be one
      // 3087-line page — 26% of the whole docs corpus, with two releases alone (0.10.0
      // and 0.8.0) accounting for 46% of it. The input is the root CHANGELOG.md that
      // `pnpm version-packages` already generates, so nothing new has to be maintained.
      plugins: [starlightChangelogs()],
      // Adds the `og:image` Starlight's own `twitter:card: summary_large_image`
      // already asks for and never provided (see the component for why an override
      // rather than a `head` entry).
      components: { Head: './src/components/Head.astro' },
      customCss: ['./src/styles/palette.css', './src/styles/aparte-theme.css'],
      // A labelled group and its `autogenerate` are two nested objects since Starlight
      // 0.39: `{ label, autogenerate }` on one object was removed. The order inside each
      // group is unaffected — it still comes from each page's `sidebar.order` frontmatter,
      // which is what keeps theming second in Guides.
      sidebar: [
        { label: 'Why aparté', link: '/why/' },
        { label: 'Guides', items: [{ autogenerate: { directory: 'guides' } }] },
        {
          label: 'Providers',
          items: [
            { label: 'Overview', link: '/providers/' },
            { label: 'AI', items: [{ autogenerate: { directory: 'providers/ai' } }] },
          ],
        },
        { label: 'Frameworks', items: [{ autogenerate: { directory: 'frameworks' } }] },
        { label: 'Plugins', items: [{ autogenerate: { directory: 'plugins' } }] },
        { label: 'Reference', items: [{ autogenerate: { directory: 'reference' } }] },
        // Top level, and labelled with the word people scan for. It lived under
        // Reference for a few hours and nobody found it — including an AI asked to
        // check it, which went straight to /changelog. `type: 'all'` keeps exactly that
        // one link, aimed at the version list; the per-version pages hang off it instead
        // of crowding the sidebar, and the URL people already have still resolves.
        ...makeChangelogsSidebarLinks([{ type: 'all', base: 'changelog', label: 'Changelog' }]),
      ],
    }),
  ],
  // Dev only: resolve @aparte/core (and its /styles.css) to TS/CSS source instead of
  // the built dist, so editing packages/core/src hot-reloads in the docs with NO
  // rebuild and NO server restart. Mirrors tsconfig.base.json's customConditions, so
  // Vite and the TS/IDE resolver agree. Only @aparte/core defines this export condition
  // — every other dependency resolves normally. SSR is left untouched: its condition set
  // has no `@aparte-workspace/source`, so it keeps resolving the Node-safe build via the
  // `node` condition (the browser entry touches HTMLElement). Production build (npm
  // lifecycle != "dev") omits this entirely and consumes the published dist as before.
  ...(isDev
    ? {
        vite: {
          resolve: {
            conditions: ['@aparte-workspace/source', 'module', 'browser', 'development|production'],
          },
        },
      }
    : {}),
});
