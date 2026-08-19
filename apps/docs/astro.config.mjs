import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Dev only: read @aparte/core from source (see the `vite` block below). Production
// builds keep consuming the published `dist`, so deploys are unchanged.
const isDev = process.env.npm_lifecycle_event === 'dev';

// https://astro.build/config
export default defineConfig({
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
      customCss: ['./src/styles/palette.css', './src/styles/aparte-theme.css'],
      sidebar: [
        { label: 'Why aparté', link: '/why/' },
        { label: 'Guides', autogenerate: { directory: 'guides' } },
        {
          label: 'Providers',
          items: [
            { label: 'Overview', link: '/providers/' },
            { label: 'AI', autogenerate: { directory: 'providers/ai' } },
          ],
        },
        { label: 'Frameworks', autogenerate: { directory: 'frameworks' } },
        { label: 'Plugins', autogenerate: { directory: 'plugins' } },
        { label: 'Reference', autogenerate: { directory: 'reference' } },
        // Top level, and labelled with the word people scan for. It lived under
        // Reference for a few hours and nobody found it — including an AI asked to
        // check it, which went straight to /changelog.
        { label: 'Changelog', link: '/changelog/' },
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
