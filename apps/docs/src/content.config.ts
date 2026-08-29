import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { changelogsLoader } from 'starlight-changelogs/loader';

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  // The path is relative to THIS Starlight project, so two levels up is the repo root.
  changelogs: defineCollection({
    loader: changelogsLoader([
      // pageSize covers every version, so the list has ONE page. With the default 10 the
      // list paginated to /changelog/2/, a route the sidebar never linked to (found when
      // the sidebar was split by a topics plugin, since removed; kept because a second
      // list page still helps nobody). check-doc-links caught it; neither plugin did.
      { provider: 'changeset', base: 'changelog', changelog: '../../CHANGELOG.md', pageSize: 50 },
    ]),
  }),
};
