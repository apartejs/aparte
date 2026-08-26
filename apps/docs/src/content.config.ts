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
      // list paginated to /changelog/2/, and a topic's sidebar replaces the one Starlight
      // derives its pagination from — so that second page became a route nothing linked
      // to. check-doc-links caught it; neither plugin did.
      { provider: 'changeset', base: 'changelog', changelog: '../../CHANGELOG.md', pageSize: 50 },
    ]),
  }),
};
