/**
 * `/changelog/version/<v>...latest/`: every release from <v> to the latest, on one page.
 * `starlight-changelogs` builds one per version (65 of them, about 1 MB each) and they
 * repeat the version pages' notes, so they are `noindex` (src/components/Head.astro) and
 * stay out of the sitemap (astro.config.mjs). A reader still reaches them from each
 * version's page.
 */
export const CHANGELOG_COMPARE = /^\/changelog\/version\/[^/]+\.\.\.latest\/$/;
