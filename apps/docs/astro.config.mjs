import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Dev only: read @aparte/core from source (see the `vite` block below). Production
// builds keep consuming the published `dist`, so deploys are unchanged.
const isDev = process.env.npm_lifecycle_event === 'dev';

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: 'aparté',
      description: 'Framework-agnostic AI-chat library — vanilla web components, zero dependencies.',
      customCss: ['./src/styles/palette.css', './src/styles/aparte-theme.css'],
      sidebar: [
        { label: 'Guides', autogenerate: { directory: 'guides' } },
        { label: 'Reference', autogenerate: { directory: 'reference' } },
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
